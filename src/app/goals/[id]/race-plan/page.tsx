import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { NightBand, PageHead, Section } from "@/components/ui/Layout";
import { PrintButton } from "@/components/PrintButton";
import { RacePlanForm } from "@/components/goals/RacePlanForm";
import { RaceSettings } from "@/components/goals/RaceSettings";
import { NutritionSettings } from "@/components/goals/NutritionSettings";
import { DeleteRacePlanButton } from "@/components/goals/DeleteRacePlanButton";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { fmtClock, fmtDuration, fmtPace } from "@/lib/format";
import { parseGpx } from "@/lib/gpx";
import { athleteContext } from "@/lib/plan-store";
import {
  debrief,
  gapFactor,
  heatPenalty,
  kmTable,
  pacingCurve,
  sampleCourse,
  scenarios,
  segmentCourse,
  switchSignal,
  timeAt,
  type Checkpoint,
  type CourseSegment,
  type Sample,
  type Strategy,
} from "@/lib/race-plan";
import { DEFAULT_PRODUCTS, caffeineDose, fuelPlan, preRace, type Product } from "@/lib/nutrition";
import { fitGradeFactor, gradeSamples, personalGradeFactor } from "@/lib/ml";

export const dynamic = "force-dynamic";

type NutritionCfg = { mainId: string; caffeineId: string | null; gutTrained: boolean; sweatRateLh: number | null; salty: boolean };

/**
 * Plan de course — du GPX à la ligne d'arrivée : le parcours découpé en
 * tronçons homogènes, les allures à effort constant, trois scénarios et le
 * signal de bascule, la nutrition calée sur le temps, le bracelet d'allure
 * imprimable, et après la course, le débrief. Tout est calculé côté serveur
 * (lib/race-plan, lib/nutrition).
 */
export default async function RacePlanPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("racePlan");
  const tn = await getTranslations("nutrition");
  const { id } = await params;
  const userId = await requireUserId();
  const goal = await prisma.raceGoal.findFirst({
    where: { id, userId },
    include: {
      racePlan: true,
      activities: {
        where: { type: { in: ["Run", "TrailRun", "VirtualRun"] } },
        orderBy: { distance: "desc" },
        take: 1,
        include: { splits: { orderBy: { index: "asc" }, select: { distance: true, elapsedTime: true } } },
      },
    },
  });
  if (!goal) notFound();
  const plan = goal.racePlan;
  const distanceKm = goal.distance / 1000;

  if (!plan || !plan.gpx) {
    return (
      <div className="space-y-12">
        <PageHead title={t("title")} kicker={goal.name} meta={t("meta")} />
        <section className="rise max-w-[52ch]">
          <div className="eyebrow">{fmtDuration(goal.targetTime ?? 0)} · {distanceKm.toFixed(1)} km</div>
          <h2 className="mt-2 text-[clamp(1.7rem,3.6vw,2.6rem)] font-semibold leading-tight tracking-[-0.03em]">{t("pitch")}</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink2">{t("pitchBody")}</p>
        </section>
        <Section title={t("import")} note={t("importNote")}>
          <RacePlanForm goalId={goal.id} targetSeconds={goal.targetTime} />
        </Section>
      </div>
    );
  }

  const samples = sampleCourse(parseGpx(plan.gpx));
  const courseKm = samples.length ? samples[samples.length - 1].d / 1000 : distanceKm;
  const segments = segmentCourse(samples);
  const gain = segments.reduce((a, s) => a + s.gain, 0);
  const checkpoints: Checkpoint[] = plan.checkpoints ? JSON.parse(plan.checkpoints) : [];
  const weather: { tempC: number | null; dewC: number | null } | null = plan.weather ? JSON.parse(plan.weather) : null;
  const heat = heatPenalty(weather?.tempC ?? null, weather?.dewC ?? null);
  const strategy = (plan.strategy as Strategy) ?? "negative";
  const targetSeconds = plan.targetSeconds ?? goal.targetTime ?? null;

  // Facteur de pente : personnel si mesuré sur tes splits, sinon générique.
  const gradeSplits = await prisma.split.findMany({
    where: { activity: { userId }, distance: { gte: 900 }, averageSpeed: { not: null } },
    select: { distance: true, movingTime: true, elevationDiff: true, averageSpeed: true },
  });
  const gradeFit = fitGradeFactor(gradeSamples(gradeSplits));
  const gradeFn = (g: number) => personalGradeFactor(gradeFit, g) ?? gapFactor(g);

  const ctx = await athleteContext(new Date(), userId);
  const realistic = ctx.predict(goal.distance || courseKm * 1000)?.realistic ?? null;
  const target = targetSeconds ?? realistic ?? Math.round(courseKm * 360);
  const curve = pacingCurve({ samples, targetSeconds: target, strategy, heat, grade: gradeFn });
  const rows = kmTable(samples, curve);
  const sc = scenarios({ samples, targetSeconds: target, realisticSeconds: realistic, strategy, heat, checkpoints, grade: gradeFn });
  const signal = switchSignal(sc);
  const finish = curve[curve.length - 1] ?? target;

  // Nutrition
  const custom = await prisma.nutritionProduct.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  const products: Product[] = [
    ...DEFAULT_PRODUCTS,
    ...custom.map((p) => ({ id: p.id, name: p.name, carbsG: p.carbsG, sodiumMg: p.sodiumMg, caffeineMg: p.caffeineMg, fluidMl: p.fluidMl })),
  ];
  const cfg: NutritionCfg = plan.nutrition
    ? JSON.parse(plan.nutrition)
    : { mainId: "gel", caffeineId: null, gutTrained: false, sweatRateLh: null, salty: false };
  const settings = await prisma.settings.findUnique({ where: { userId }, select: { weightKg: true } });
  const invert = (sec: number) => {
    for (let i = 1; i < curve.length; i++) if (curve[i] >= sec) return samples[i].d;
    return samples[samples.length - 1]?.d ?? 0;
  };
  const gradeAtTime = (sec: number) => {
    for (let i = 1; i < curve.length; i++) if (curve[i] >= sec) return samples[i].grade;
    return 0;
  };
  const fuel = fuelPlan({
    durationSec: finish,
    kmAt: invert,
    gradeAt: gradeAtTime,
    products,
    mainId: cfg.mainId,
    caffeineId: cfg.caffeineId,
    aidKms: checkpoints.filter((c) => c.kind === "aid").map((c) => c.km),
    gutTrained: cfg.gutTrained,
    sweatRateLh: cfg.sweatRateLh,
    tempC: weather?.tempC ?? null,
    salty: cfg.salty,
    weightKg: settings?.weightKg ?? null,
  });
  const pre = preRace(settings?.weightKg ?? null, finish);
  const pname = (id: string) => {
    const p = products.find((x) => x.id === id);
    return p ? (DEFAULT_PRODUCTS.some((d) => d.id === p.id) ? tn(`product.${p.name}`) : p.name) : id;
  };

  // Débrief (après la course)
  const raceActivity = goal.activities[0];
  const review =
    raceActivity && raceActivity.splits.length >= 3
      ? debrief({ samples, curve: pacingCurve({ samples, targetSeconds: target, strategy }), segments, splits: raceActivity.splits })
      : null;

  const hardest = segments.filter((s) => s.rank !== null).sort((a, b) => a.rank! - b.rank!).slice(0, 3);

  return (
    <div className="space-y-14">
      <PageHead title={t("title")} kicker={goal.name} meta={t("meta")} action={<PrintButton />} />

      {/* ------------------------------------------------ Ouverture : le parcours en grand */}
      <NightBand className="!mt-0">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:items-end">
          <div>
            <div className="eyebrow">{courseKm.toFixed(1)} km · {gain} m D+ · {t(`strategy_${strategy}`)}</div>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="num text-[clamp(3rem,7vw,4.8rem)] font-semibold leading-none tracking-[-0.04em]">{fmtClock(Math.round(finish))}</span>
            </div>
            <p className="mt-3 text-[0.9375rem] text-ink2">
              {targetSeconds ? t("targetOn") : t("targetPredicted")}
              {heat > 0 && <span className="text-ochre"> · {t("heatNote", { pct: (heat * 100).toFixed(1) })}</span>}
            </p>
            {hardest.length > 0 && (
              <p className="mt-4 text-[0.8125rem] leading-relaxed text-ink2">
                {t("hardest", {
                  list: hardest.map((h) => `km ${h.startKm.toFixed(1)} (+${h.gain} m, ${h.grade} %)`).join(" · "),
                })}
              </p>
            )}
          </div>
          <CourseProfile samples={samples} segments={segments} checkpoints={checkpoints} />
        </div>
      </NightBand>

      {/* ------------------------------------------------ Tronçons */}
      <Section title={t("segmentsTitle", { n: segments.length })} note={t("segmentsNote")}>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("colFrom")}</th>
                <th>{t("colKind")}</th>
                <th className="text-right">{t("colLength")}</th>
                <th className="text-right">{t("colElev")}</th>
                <th className="text-right">{t("colGrade")}</th>
                <th className="text-right">{t("colPace")}</th>
                <th className="text-right">{t("colPass")}</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((s, i) => {
                const t0 = timeAt(samples, curve, s.startKm * 1000);
                const t1 = timeAt(samples, curve, s.endKm * 1000);
                const len = s.endKm - s.startKm;
                return (
                  <tr key={i}>
                    <td className="font-mono tabular-nums text-ink2">{s.startKm.toFixed(1)}</td>
                    <td>
                      <span className={s.kind === "up" ? "text-clay" : s.kind === "down" ? "text-sage" : "text-ink2"}>{t(`kind_${s.kind}`)}</span>
                      {s.rank && s.rank <= 3 && <span className="tag ml-2">{t("climbRank", { n: s.rank })}</span>}
                    </td>
                    <td className="text-right font-mono tabular-nums">{len.toFixed(2)} km</td>
                    <td className="text-right font-mono tabular-nums text-ink3">
                      {s.gain > 0 ? `+${s.gain}` : ""}
                      {s.gain > 0 && s.loss > 0 ? " / " : ""}
                      {s.loss > 0 ? `−${s.loss}` : ""}
                    </td>
                    <td className="text-right font-mono tabular-nums">
                      {s.grade > 0 ? "+" : ""}
                      {s.grade} %<span className="text-ink3"> ({s.maxGrade > 0 ? "+" : ""}{s.maxGrade})</span>
                    </td>
                    <td className="text-right font-mono font-medium tabular-nums">{len > 0 ? fmtPace((t1 - t0) / len) : "—"}</td>
                    <td className="text-right font-mono tabular-nums">{fmtClock(Math.round(t1))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ------------------------------------------------ Scénarios */}
      <Section title={t("scenariosTitle")} note={t("scenariosNote")}>
        {signal && (
          <p className="mb-6 max-w-3xl border-l-2 border-clay pl-4 text-[1.05rem] leading-snug">
            {t("switchSignal", { km: signal.km, time: fmtClock(signal.after) })}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("colPoint")}</th>
                {sc.map((s) => (
                  <th key={s.key} className="text-right">
                    {t(`scenario_${s.key}`)} · {fmtClock(s.seconds)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sc[0].passes.map((p, i) => (
                <tr key={i}>
                  <td className="text-ink2">
                    <span className="font-mono tabular-nums">{p.km.toFixed(1)}</span> · {p.label}
                  </td>
                  {sc.map((s) => {
                    const pass = s.passes[i];
                    return (
                      <td key={s.key} className="text-right font-mono tabular-nums">
                        {fmtClock(pass.time)}
                        {pass.margin !== null && (
                          <span className={`ml-2 text-micro ${pass.margin < 600 ? "text-rust" : "text-sage"}`}>
                            {pass.margin >= 0 ? "+" : "−"}
                            {fmtDuration(Math.abs(pass.margin))}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ------------------------------------------------ Nutrition */}
      <Section title={tn("title")} note={tn("note")}>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]">
          <div>
            <div className="grid grid-cols-3 gap-4">
              <Fig value={`${fuel.carbsPerHour}`} unit="g/h" label={tn("carbs")} />
              <Fig value={`${fuel.fluidPerHour}`} unit="ml/h" label={tn("fluid")} />
              <Fig value={`${fuel.sodiumPerHour}`} unit="mg/h" label={tn("sodium")} />
            </div>
            <ul className="mt-6 space-y-2 text-[0.8125rem] leading-relaxed text-ink2">
              {fuel.carbsPerHour === 0 && <li>{tn("shortRace")}</li>}
              {fuel.carryMax > 0 && <li>{tn("carry", { n: fuel.carryMax, product: pname(cfg.mainId) })}</li>}
              {pre.loadingGPerDay && <li>{tn("loading", { g: pre.loadingGPerDay, days: pre.loadingDays })}</li>}
              <li>{tn("breakfast", { g: pre.breakfastG, h: pre.breakfastHoursBefore })}</li>
              {cfg.caffeineId && <li>{tn("caffeineNote", { mg: caffeineDose(settings?.weightKg ?? null) })}</li>}
              {!cfg.sweatRateLh && <li className="text-ochre">{tn("measureSweat")}</li>}
              {fuel.overDrinking && <li className="text-rust">{tn("overDrinking")}</li>}
            </ul>
            <p className="mt-6 text-micro leading-relaxed text-ink3">{tn("disclaimer")}</p>
          </div>
          <div className="min-w-0">
            {fuel.stops.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{tn("colTime")}</th>
                      <th>{tn("colKm")}</th>
                      <th>{tn("colTake")}</th>
                      <th className="text-right">{tn("colDrink")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fuel.stops.map((s, i) => (
                      <tr key={i}>
                        <td className="font-mono tabular-nums">{fmtClock(s.minute * 60)}</td>
                        <td className="font-mono tabular-nums text-ink2">
                          {s.km.toFixed(1)}
                          {s.atAid && <span className="tag ml-2">{tn("aid")}</span>}
                        </td>
                        <td>
                          {pname(s.productId)} <span className="text-micro text-ink3">{s.carbsG} g{s.caffeineMg ? ` · ${s.caffeineMg} mg caf.` : ""}</span>
                          {s.shifted && <span className="ml-2 text-micro text-ochre">{tn("shifted")}</span>}
                        </td>
                        <td className="text-right font-mono tabular-nums text-ink2">{s.drinkMl} ml</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-micro text-ink3">
                  {tn("totals", { carbs: fuel.totals.carbsG, fluid: (fuel.totals.fluidMl / 1000).toFixed(1), sodium: fuel.totals.sodiumMg })}
                </p>
              </div>
            ) : (
              <p className="text-[0.8125rem] text-ink3">{tn("noStops")}</p>
            )}
          </div>
        </div>
        <div className="mt-10 border-t border-hair pt-6 print:hidden">
          <NutritionSettings
            goalId={goal.id}
            products={products.map((p) => ({ id: p.id, name: p.name, carbsG: p.carbsG, caffeineMg: p.caffeineMg, custom: !DEFAULT_PRODUCTS.some((d) => d.id === p.id) }))}
            initial={cfg}
          />
        </div>
      </Section>

      {/* ------------------------------------------------ Bracelet */}
      <Section title={t("bandTitle")} note={t("bandNote")}>
        <div className="inline-block max-w-full overflow-x-auto border border-ink px-3 py-2 font-mono text-[11px] leading-tight tabular-nums">
          <div className="mb-1 flex justify-between gap-4 font-sans text-[10px] font-semibold uppercase tracking-[0.1em]">
            <span>{goal.name}</span>
            <span>{fmtClock(Math.round(finish))}</span>
          </div>
          <div className="grid grid-flow-col grid-rows-6 gap-x-4">
            {rows.map((r) => (
              <span key={r.km} className="whitespace-nowrap">
                <span className="text-ink3">{r.km % 1 === 0 ? r.km : r.km.toFixed(1)}</span> {fmtClock(r.cumulative)}
              </span>
            ))}
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------ Débrief */}
      {review && (
        <Section title={t("debriefTitle")} note={t("debriefNote", { name: raceActivity.name })}>
          <div className="mb-6 flex flex-wrap gap-10">
            <Fig value={fmtClock(review.total.actual)} label={t("actual")} />
            <Fig value={fmtClock(review.total.planned)} label={t("planned")} />
            {review.thirds.map((d, i) => (
              <Fig key={i} value={`${d > 0 ? "+" : ""}${d} %`} label={t("third", { n: i + 1 })} tone={d > 2 ? "text-rust" : d < -2 ? "text-ochre" : "text-sage"} />
            ))}
          </div>
          <ul className="mb-6 space-y-2">
            {review.lessons.map((l) => (
              <li key={l} className="border-l-2 border-clay pl-3 text-[0.9375rem]">
                {t(`lesson_${l}`)}
              </li>
            ))}
          </ul>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("colFrom")}</th>
                  <th className="text-right">{t("planned")}</th>
                  <th className="text-right">{t("actual")}</th>
                  <th className="text-right">Δ</th>
                </tr>
              </thead>
              <tbody>
                {review.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="font-mono tabular-nums text-ink2">
                      {r.fromKm.toFixed(1)} → {r.toKm.toFixed(1)}
                    </td>
                    <td className="text-right font-mono tabular-nums">{fmtDuration(r.planned)}</td>
                    <td className="text-right font-mono tabular-nums">{fmtDuration(r.actual)}</td>
                    <td className={`text-right font-mono tabular-nums ${r.delta > 10 ? "text-rust" : r.delta < -10 ? "text-sage" : "text-ink3"}`}>
                      {r.delta > 0 ? "+" : r.delta < 0 ? "−" : ""}
                      {fmtDuration(Math.abs(r.delta))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ------------------------------------------------ Réglages */}
      <Section title={t("adjust")} note={t("adjustNote")} className="print:hidden">
        <RaceSettings
          goalId={goal.id}
          initial={{ targetSeconds, strategy, tempC: weather?.tempC ?? null, dewC: weather?.dewC ?? null, checkpoints }}
        />
        <div className="mt-6 border-t border-hair pt-4">
          <DeleteRacePlanButton goalId={goal.id} />
        </div>
      </Section>

      {/* ------------------------------------------------ Check-lists */}
      <div className="grid gap-6 lg:grid-cols-3">
        {(["week", "eve", "day"] as const).map((k) => (
          <Section key={k} title={t(`list_${k}`)}>
            <ul className="space-y-2 text-sm text-ink2">
              {[0, 1, 2, 3, 4].map((i) => (
                <li key={i} className="flex gap-2.5">
                  <span className={`mt-[7px] h-[7px] w-[7px] shrink-0 rounded-full ${k === "week" ? "bg-sage" : k === "eve" ? "bg-clay" : "bg-ochre"}`} />
                  {t(`list_${k}_${i}`)}
                </li>
              ))}
            </ul>
          </Section>
        ))}
      </div>

      <p className="text-sm text-ink3 print:hidden">
        <Link href={`/goals/${goal.id}`} className="text-clay hover:underline">
          {t("backToGoal")}
        </Link>
      </p>
    </div>
  );
}

function Fig({ value, unit, label, tone }: { value: string; unit?: string; label: string; tone?: string }) {
  return (
    <div>
      <div className={`num text-[1.6rem] font-semibold leading-none ${tone ?? ""}`}>
        {value}
        {unit && <span className="ml-1 text-micro font-normal text-ink3">{unit}</span>}
      </div>
      <div className="mt-1 text-micro text-ink3">{label}</div>
    </div>
  );
}

/**
 * Profil d'altitude : aire du parcours, tronçons colorés (montée terre cuite,
 * descente sauge), points clés en drapeaux. SVG pur.
 */
function CourseProfile({ samples, segments, checkpoints }: { samples: Sample[]; segments: CourseSegment[]; checkpoints: Checkpoint[] }) {
  if (samples.length < 2) return null;
  const W = 760;
  const H = 180;
  const PADB = 16;
  const total = samples[samples.length - 1].d;
  const eles = samples.map((s) => s.ele);
  const lo = Math.min(...eles);
  const hi = Math.max(...eles, lo + 30);
  const x = (d: number) => (d / total) * W;
  const y = (e: number) => 8 + (1 - (e - lo) / (hi - lo)) * (H - PADB - 16);
  const step = Math.max(1, Math.floor(samples.length / 400));
  const pts = samples.filter((_, i) => i % step === 0 || i === samples.length - 1);
  const line = pts.map((s, i) => `${i ? "L" : "M"}${x(s.d).toFixed(1)},${y(s.ele).toFixed(1)}`).join("");
  const area = `${line}L${W},${H - PADB}L0,${H - PADB}Z`;
  const kmTicks = [];
  const every = total > 60000 ? 10 : total > 25000 ? 5 : total > 8000 ? 2 : 1;
  for (let k = every; k * 1000 < total; k += every) kmTicks.push(k);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="profil">
      <path d={area} fill="rgb(var(--ink) / 0.06)" />
      {segments
        .filter((s) => s.kind !== "flat")
        .map((s, i) => {
          const seg = pts.filter((p) => p.d >= s.startKm * 1000 && p.d <= s.endKm * 1000);
          if (seg.length < 2) return null;
          const d = seg.map((p, j) => `${j ? "L" : "M"}${x(p.d).toFixed(1)},${y(p.ele).toFixed(1)}`).join("");
          return <path key={i} d={d} fill="none" stroke={s.kind === "up" ? "rgb(var(--clay))" : "rgb(var(--sage))"} strokeWidth="2.5" strokeLinecap="round" />;
        })}
      <path d={line} fill="none" stroke="rgb(var(--ink) / 0.5)" strokeWidth="1" />
      {checkpoints.map((c, i) => (
        <g key={i}>
          <line x1={x(c.km * 1000)} x2={x(c.km * 1000)} y1={4} y2={H - PADB} stroke={c.kind === "cutoff" ? "rgb(var(--rust))" : "rgb(var(--ochre))"} strokeDasharray="2 3" />
          <circle cx={x(c.km * 1000)} cy={4} r={3} fill={c.kind === "cutoff" ? "rgb(var(--rust))" : "rgb(var(--ochre))"}>
            <title>{`${c.km} km — ${c.label}`}</title>
          </circle>
        </g>
      ))}
      <line x1={0} x2={W} y1={H - PADB} y2={H - PADB} stroke="rgb(var(--hair-strong))" />
      {kmTicks.map((k) => (
        <text key={k} x={x(k * 1000)} y={H - 3} fontSize="9" fill="rgb(var(--ink-3))" textAnchor="middle">
          {k}
        </text>
      ))}
      <text x={2} y={y(hi) + 10} fontSize="9" fill="rgb(var(--ink-3))">
        {Math.round(hi)} m
      </text>
      <text x={2} y={y(lo) - 3} fontSize="9" fill="rgb(var(--ink-3))">
        {Math.round(lo)} m
      </text>
    </svg>
  );
}
