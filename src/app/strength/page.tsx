import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { Empty, PageHead, Section } from "@/components/ui/Layout";
import { Bar, Metric, MetricBand } from "@/components/ui/Metric";
import { Sparkline } from "@/components/ui/Spark";
import { requireUserId } from "@/lib/auth";
import { fmtDateShort, fmtDuration } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSettings, getStrengthSessions } from "@/lib/queries";
import { addDays, compareTrend, daysBetween, startOfWeek } from "@/lib/stats";
import { loadWorkouts } from "@/lib/strength-store";
import {
  EXERCISES,
  MUSCLE_LABELS,
  RUNNER_WEEKLY_SETS,
  TEMPLATES,
  exerciseHistories,
  exerciseInfo,
  isHardSet,
  muscleSeries,
  relativeLevel,
  relativeStrength,
  rpeLoad,
  setsByMuscle,
  strengthAcwr,
  strengthGoalProgress,
  tonnage,
  workoutPRs,
  type Muscle,
} from "@/lib/strength";

export const dynamic = "force-dynamic";

const kg = (v: number) => (v % 1 ? v.toFixed(1).replace(".", ",") : String(v));

const STRENGTH_ACWR_LABEL: Record<string, string> = {
  insufficient: "Sous-charge",
  optimal: "Zone optimale",
  caution: "Prudence",
  danger: "Risque élevé",
};
const STRENGTH_ACWR_TONE: Record<string, string> = {
  insufficient: "text-ink3",
  optimal: "text-sage",
  caution: "text-ochre",
  danger: "text-rust",
};

/**
 * Musculation — le renforcement vu depuis la course à pied.
 *
 * Deux sources : les séances détaillées saisies ici (exercices, séries,
 * charges) et les séances Strava de type musculation, qui n'ont qu'une durée.
 * Une séance Strava peut être « détaillée » : elle devient alors une séance
 * saisie, rattachée à l'activité.
 */
export default async function StrengthPage() {
  const t = await getTranslations("strengthPage");
  const userId = await requireUserId();
  const now = new Date();
  const [workouts, strava, settings, goals] = await Promise.all([
    loadWorkouts(userId),
    getStrengthSessions(undefined, userId),
    getSettings(userId),
    prisma.strengthGoal.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
  ]);

  const linked = new Set(workouts.map((w) => w.activityId).filter(Boolean));
  const undetailed = strava.filter((s) => !linked.has(s.id));

  // Séance de renfo prévue par le plan, aujourd'hui ou demain
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const planned = await prisma.plannedSession.findFirst({
    where: {
      kind: "strength",
      status: { in: ["planned", "moved"] },
      date: { gte: today, lt: addDays(today, 2) },
      plan: { userId, status: "active" },
    },
    orderBy: { date: "asc" },
    select: { date: true, title: true, durationMin: true, tagline: true },
  });

  if (!workouts.length && !strava.length) {
    return (
      <>
        <PageHead title="Musculation" />
        <Empty
          title={t("emptyTitle")}
          body="Note tes séances exercice par exercice : l'app retient tes charges, estime ton 1RM, propose la progression de la séance suivante et vérifie que la chaîne du coureur (fessiers, ischios, mollets, hanches) reçoit assez de travail."
          action={
            <Link href="/strength/new" className="btn-solid">
              Première séance
            </Link>
          }
        />
        <Templates />
      </>
    );
  }

  // ------------------------------------------------------------ Chiffres
  const within = (d: Date, a: number, b = 0) => {
    const n = daysBetween(d, now);
    return n <= a && n > b;
  };
  const w28 = workouts.filter((w) => within(w.date, 28, -1));
  const w56 = workouts.filter((w) => within(w.date, 56, 28));
  const sessions28 = w28.length + undetailed.filter((s) => within(s.startDate, 28, -1)).length;
  const sessionsPrev = w56.length + undetailed.filter((s) => within(s.startDate, 56, 28)).length;
  const tonnage28 = w28.reduce((a, w) => a + tonnage(w.sets), 0);
  const hardPerWeek = w28.reduce((a, w) => a + w.sets.filter(isHardSet).length, 0) / 4;

  // Garde-fou de charge + évolution par muscle + force relative
  const acwr = strengthAcwr(workouts, now);
  const series = muscleSeries(workouts, 12, now);
  const bodyweight = settings.weightKg ?? null;
  const rpe = rpeLoad(workouts);

  const prs90 = workouts
    .filter((w) => within(w.date, 90, -1))
    .flatMap((w) => workoutPRs(w, workouts).map((p) => ({ ...p, date: w.date, workoutId: w.id })));

  // ------------------------------------------------------------ Équilibre
  const muscle28 = setsByMuscle(w28.flatMap((w) => w.sets));
  const runnerRows = (Object.keys(RUNNER_WEEKLY_SETS) as Muscle[]).map((m) => {
    const [lo, hi] = RUNNER_WEEKLY_SETS[m]!;
    const perWeek = muscle28[m] / 4;
    return { m, lo, hi, perWeek };
  });
  const scaleMax = Math.max(12, ...runnerRows.map((r) => r.perWeek + 1));

  // ------------------------------------------------------------ Exercices
  const histories = exerciseHistories(workouts.map((w) => ({ id: w.id, date: w.date, sets: w.sets })));

  // ------------------------------------------------------------ Régularité
  const monday = startOfWeek(now);
  const weeks = Array.from({ length: 16 }, (_, i) => {
    const start = addDays(monday, -7 * (15 - i));
    const end = addDays(start, 7);
    const inWeek = (d: Date) => d >= start && d < end;
    return {
      start,
      detailed: workouts.filter((w) => inWeek(w.date)).length,
      strava: undetailed.filter((s) => inWeek(s.startDate)).length,
    };
  });
  const maxWeek = Math.max(4, ...weeks.map((w) => w.detailed + w.strava));

  // ------------------------------------------------------------ Historique fusionné
  const history = [
    ...workouts.map((w) => ({ kind: "detailed" as const, date: w.date, w })),
    ...undetailed.map((s) => ({ kind: "strava" as const, date: s.startDate, s })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  async function createStrengthGoal(formData: FormData) {
    "use server";
    const exercise = String(formData.get("exercise") ?? "").trim();
    const mode = String(formData.get("mode") ?? "weight");
    const target = Number(formData.get("target"));
    if (!exercise || !Number.isFinite(target) || target <= 0) return;
    const owner = await requireUserId();
    await prisma.strengthGoal.create({
      data: {
        userId: owner,
        exercise,
        targetKg: mode === "weight" ? target : null,
        targetRel: mode === "relative" ? target : null,
      },
    });
    revalidatePath("/strength");
  }

  async function deleteStrengthGoal(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    const owner = await requireUserId();
    await prisma.strengthGoal.deleteMany({ where: { id, userId: owner } });
    revalidatePath("/strength");
  }

  return (
    <>
      <PageHead
        title={t("title")}
        meta={`${workouts.length} séance${workouts.length > 1 ? "s" : ""} détaillée${workouts.length > 1 ? "s" : ""} · ${strava.length} depuis Strava`}
        action={
          <Link href="/strength/new" className="btn-solid">
            + Nouvelle séance
          </Link>
        }
      />

      {planned && (
        <Link
          href="/strength/new?planned=1"
          className="group mb-8 flex items-center justify-between gap-4 rounded-card border border-sage/40 bg-sage/[.07] px-5 py-4 transition-colors hover:bg-sage/[.12]"
        >
          <span>
            <span className="block text-micro font-medium uppercase tracking-[0.12em] text-sage">
              Prévu {planned.date.toDateString() === now.toDateString() ? "aujourd'hui" : "demain"} par ton plan
            </span>
            <span className="mt-1 block font-medium">
              {planned.title}
              <span className="ml-2 text-[0.8125rem] font-normal text-ink2">~{planned.durationMin} min</span>
            </span>
          </span>
          <span className="text-[0.8125rem] font-medium text-sage transition-transform group-hover:translate-x-0.5">
            Commencer →
          </span>
        </Link>
      )}

      <MetricBand>
        <Metric label={t("sessions28")} value={sessions28} trend={compareTrend(sessions28, sessionsPrev)} />
        <Metric label={t("hardSets")} value={Math.round(hardPerWeek * 10) / 10} note={t("avg4w")} />
        <Metric label={t("tonnage28")} value={Math.round(tonnage28).toLocaleString("fr-FR")} unit="kg" />
        <Metric
          label={t("records90")}
          value={prs90.length}
          note={prs90[0] ? `dernier : ${exerciseInfo(prs90[0].exercise).name}` : undefined}
        />
      </MetricBand>

      {/* ---------------------------------------------- Garde-fou de charge */}
      <Section
        title={t("guardrail")}
        note="Comme en course, la blessure vient de la montée trop rapide, pas du volume : séries dures de la semaine contre la moyenne des 4 dernières semaines."
      >
        <div className="flex flex-wrap items-baseline gap-x-12 gap-y-5">
          <div>
            <div className="eyebrow">Ratio aiguë / chronique</div>
            <div className="mt-2 flex items-baseline gap-2.5">
              <span className={`display text-d2 ${acwr.ratio != null ? STRENGTH_ACWR_TONE[acwr.zone] : ""}`}>
                {acwr.ratio != null ? acwr.ratio.toFixed(2) : "—"}
              </span>
              <span className="text-sm text-ink2">
                {acwr.ratio != null ? STRENGTH_ACWR_LABEL[acwr.zone] : "pas encore assez de recul"}
              </span>
            </div>
          </div>
          <div>
            <div className="eyebrow">Aiguë · 7 j</div>
            <div className="mt-2 text-xl font-semibold tabular-nums">
              {acwr.acute} <span className="text-sm font-normal text-ink3">séries dures</span>
            </div>
          </div>
          <div>
            <div className="eyebrow">Chronique · 28 j</div>
            <div className="mt-2 text-xl font-semibold tabular-nums">
              {acwr.chronic} <span className="text-sm font-normal text-ink3">/ semaine</span>
            </div>
          </div>
        </div>
        {(acwr.zone === "danger" || acwr.zone === "caution") && (
          <p className="mt-5 rounded-[7px] border border-ochre/40 bg-ochre/10 px-4 py-3 text-[0.8125rem] leading-relaxed text-ink2">
            Tu as ajouté plus de séries dures que d&apos;habitude cette semaine. Ralentis ou garde
            une sortie facile : c&apos;est la montée rapide qui blesse, pas le volume.
          </p>
        )}
      </Section>

      <div className="mt-10 space-y-10">
        {/* ---------------------------------------------- Équilibre du coureur */}
        <Section
          title={t("chain")}
          note="Séries dures par semaine (moyenne sur 4 semaines) face à une fourchette de complément à la course : assez pour gagner en force et en solidité des tendons, sans empiéter sur la récupération."
        >
          <div className="space-y-1">
            {runnerRows.map((r) => {
              const status = r.perWeek < r.lo ? "under" : r.perWeek > r.hi ? "over" : "in";
              return (
                <div key={r.m} className="grid grid-cols-[150px_minmax(0,1fr)_120px] items-center gap-4 py-2">
                  <span className="text-[0.8125rem]">{MUSCLE_LABELS[r.m]}</span>
                  <div className="relative h-6">
                    <div className="absolute inset-y-[9px] left-0 right-0 rounded-full bg-sunken" />
                    <div
                      className="absolute inset-y-[5px] rounded-[3px] border border-dashed border-sage/60 bg-sage/10"
                      style={{ left: `${(r.lo / scaleMax) * 100}%`, width: `${((r.hi - r.lo) / scaleMax) * 100}%` }}
                      title={t("targetSets", { lo: r.lo, hi: r.hi })}
                    />
                    <div
                      className={`absolute inset-y-[9px] left-0 rounded-full ${status === "in" ? "bg-sage" : status === "over" ? "bg-ochre" : "bg-clay"}`}
                      style={{ width: `${Math.max(1, (r.perWeek / scaleMax) * 100)}%` }}
                    />
                  </div>
                  <span className="text-right text-micro">
                    <span className="font-mono text-[0.8125rem] font-medium">{kg(Math.round(r.perWeek * 10) / 10)}</span>
                    <span className={`ml-2 ${status === "in" ? "text-sage" : status === "over" ? "text-ochre" : "text-clay"}`}>
                      {status === "in" ? "dans la cible" : status === "over" ? "au-dessus" : `vise ${r.lo}+`}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ---------------------------------------------- Chaîne du coureur · évolution */}
        <Section
          title={t("chain12")}
          note="Séries dures par semaine, muscle par muscle — repère les groupes qui progressent et ceux qui s'endorment."
        >
          <div className="space-y-2.5">
            {(Object.keys(RUNNER_WEEKLY_SETS) as Muscle[]).map((m) => (
              <div key={m} className="grid grid-cols-[140px_minmax(0,1fr)_56px] items-center gap-4">
                <span className="text-[0.8125rem]">{MUSCLE_LABELS[m]}</span>
                <Sparkline data={series.map((s) => s.byMuscle[m])} width={240} height={28} className="w-full" />
                <span className="text-right font-mono text-[0.8125rem] font-medium tabular-nums">
                  {kg(series[series.length - 1].byMuscle[m])}
                </span>
              </div>
            ))}
          </div>
        </Section>

        {/* ---------------------------------------------- Objectifs de force */}
        <Section
          title={t("strengthGoals")}
          note="Une cible de 1RM à atteindre — en kg absolus ou en multiple de ton poids de corps."
        >
          {goals.length > 0 && (
            <div className="mb-5">
              {goals.map((g) => {
                const h = histories.find((x) => x.exercise === g.exercise);
                const p = strengthGoalProgress({
                  targetKg: g.targetKg,
                  targetRel: g.targetRel,
                  bestE1rm: h?.bestE1rm ?? null,
                  bodyweightKg: bodyweight,
                });
                const info = exerciseInfo(g.exercise);
                return (
                  <div key={g.id} className="border-b border-hair py-3 first:pt-0">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="font-medium">{info.name}</span>
                      <form action={deleteStrengthGoal}>
                        <input type="hidden" name="id" value={g.id} />
                        <button type="submit" className="text-micro text-ink3 transition-colors hover:text-rust">
                          supprimer
                        </button>
                      </form>
                    </div>
                    {p ? (
                      <div className="mt-2 flex items-center gap-3">
                        <div className="flex-1">
                          <Bar value={p.percent} height={6} />
                        </div>
                        <span className="whitespace-nowrap font-mono text-[0.8125rem] tabular-nums text-ink2">
                          {p.unit === "kg"
                            ? `${kg(p.current)} / ${kg(p.target)} kg`
                            : `${p.current.toLocaleString("fr-FR")}× / ${p.target.toLocaleString("fr-FR")}×`}
                        </span>
                        <span className={`w-12 text-right font-mono text-sm font-semibold tabular-nums ${p.done ? "text-sage" : "text-ink"}`}>
                          {p.percent} %
                        </span>
                      </div>
                    ) : (
                      <p className="mt-1.5 text-micro text-ink3">
                        {g.targetKg
                          ? "Saisis une séance avec cet exercice pour voir ta progression."
                          : "Renseigne ton poids dans les réglages pour mesurer le ratio."}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <form action={createStrengthGoal} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="field-label" htmlFor="gexercise">
                Exercice
              </label>
              <select id="gexercise" name="exercise" className="field">
                {EXERCISES.filter((e) => !e.bodyweight && e.unit !== "seconds").map((e) => (
                  <option key={e.slug} value={e.slug}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="gmode">
                Cible
              </label>
              <select id="gmode" name="mode" className="field">
                <option value="weight">{t("optWeight")}</option>
                <option value="relative">{t("optRelative")}</option>
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="gtarget">
                Objectif
              </label>
              <input id="gtarget" name="target" type="number" step="0.1" min="0.1" required placeholder="100" className="field" />
            </div>
            <div className="flex items-end">
              <button type="submit" className="btn-solid w-full">
                Ajouter
              </button>
            </div>
          </form>
        </Section>

        {/* ---------------------------------------------- RPE × charge */}
        {rpe.length >= 2 && (
          <Section
            title="RPE × charge"
            note="Effort perçu (1-10) contre la charge de la séance (séries dures). Plus de séries au même RPE = tu progresses ; même charge mais RPE qui grimpe = fatigue."
          >
            <RpeScatter points={rpe} />
          </Section>
        )}

        {/* ---------------------------------------------- Exercices */}
        {histories.length > 0 && (
          <Section title="Tes exercices" note="Meilleur 1RM estimé (Epley/Brzycki, répétitions en réserve incluses) et son évolution séance après séance.">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Exercice</th>
                    <th className="text-right">Séances</th>
                    <th className="text-right">Dernière</th>
                    <th className="text-right">Meilleure série</th>
                    <th className="text-right">1RM est.</th>
                    <th className="text-right">Tendance</th>
                  </tr>
                </thead>
                <tbody>
                  {histories.map((h) => {
                    const info = exerciseInfo(h.exercise);
                    const top = h.sessions.reduce((a, b) => (b.topWeight > a.topWeight ? b : a));
                    const trend = h.sessions.map((s) => s.e1rm ?? s.topReps);
                    const rel = relativeStrength(h.bestE1rm, bodyweight);
                    const level = rel != null ? relativeLevel(rel, info) : null;
                    return (
                      <tr key={h.exercise}>
                        <td>
                          <Link href={`/strength/exercise/${encodeURIComponent(h.exercise)}`} className="hover:text-clay">
                            {info.name}
                          </Link>
                        </td>
                        <td className="num text-right text-ink2">{h.sessions.length}</td>
                        <td className="num text-right text-ink2">{fmtDateShort(h.lastDate)}</td>
                        <td className="num text-right">
                          {top.topWeight > 0 ? `${top.topReps} × ${kg(top.topWeight)} kg` : `${h.bestReps}${info.unit === "seconds" ? " s" : " reps"}`}
                        </td>
                        <td className="num text-right font-medium">
                          {h.bestE1rm ? `${kg(Math.round(h.bestE1rm))} kg` : "—"}
                          {rel != null && (
                            <div className="font-mono text-micro font-normal tabular-nums text-ink3">
                              {rel.toLocaleString("fr-FR")} × poids
                              {level && <span className="ml-1 text-sage">{level}</span>}
                            </div>
                          )}
                        </td>
                        <td className="text-right">
                          <span className="inline-block">
                            <Sparkline data={trend} width={72} height={20} />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* ---------------------------------------------- Régularité */}
        <Section title="Régularité" note="16 dernières semaines — séances détaillées et séances Strava sans détail.">
          <div className="flex h-[120px] items-end gap-1.5">
            {weeks.map((w) => (
              <div
                key={w.start.toISOString()}
                className="mx-auto flex w-full max-w-[22px] flex-1 flex-col-reverse gap-[3px]"
                title={`Semaine du ${fmtDateShort(w.start)} : ${w.detailed} détaillée(s), ${w.strava} Strava`}
              >
                {Array.from({ length: w.detailed }, (_, i) => (
                  <span key={`d${i}`} className="block rounded-[2px] bg-plum" style={{ height: `${110 / maxWeek - 3}px` }} />
                ))}
                {Array.from({ length: w.strava }, (_, i) => (
                  <span key={`s${i}`} className="block rounded-[2px] bg-plum/35" style={{ height: `${110 / maxWeek - 3}px` }} />
                ))}
                {w.detailed + w.strava === 0 && <span className="block h-[2px] rounded-full bg-hair" />}
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-ink3">
            <span>{fmtDateShort(weeks[0].start)}</span>
            <span className="flex gap-3">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-[2px] bg-plum" /> détaillée
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-[2px] bg-plum/35" /> Strava
              </span>
            </span>
            <span>cette semaine</span>
          </div>
        </Section>

        {/* ---------------------------------------------- Historique */}
        <Section title="Historique">
          {history.slice(0, 40).map((h) =>
            h.kind === "detailed" ? (
              <Link
                key={h.w.id}
                href={`/strength/${h.w.id}`}
                className="group grid grid-cols-[72px_minmax(0,1fr)_auto] items-baseline gap-4 border-b border-hair py-3 last:border-b-0"
              >
                <span className="font-mono text-micro text-ink3">{fmtDateShort(h.date)}</span>
                <span className="min-w-0">
                  <span className="font-medium transition-colors group-hover:text-clay">{h.w.name}</span>
                  <span className="mt-0.5 block truncate text-micro text-ink3">
                    {[...new Set(h.w.sets.map((s) => s.exercise))].map((e) => exerciseInfo(e).name).join(" · ")}
                  </span>
                </span>
                <span className="text-right font-mono text-micro text-ink2">
                  {Math.round(tonnage(h.w.sets)).toLocaleString("fr-FR")} kg
                  {workoutPRs(h.w, workouts).length > 0 && <span className="ml-2 text-clay">★ record</span>}
                </span>
              </Link>
            ) : (
              <div
                key={h.s.id}
                className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-baseline gap-4 border-b border-hair py-3 last:border-b-0"
              >
                <span className="font-mono text-micro text-ink3">{fmtDateShort(h.date)}</span>
                <span className="min-w-0">
                  <span className="text-ink2">{h.s.name}</span>
                  <span className="mt-0.5 block text-micro text-ink3">
                    Strava · {fmtDuration(h.s.movingTime)}
                    {h.s.averageHr ? ` · ${Math.round(h.s.averageHr)} bpm` : ""}
                  </span>
                </span>
                <Link href={`/strength/new?activity=${h.s.id}`} className="btn-quiet">
                  Détailler →
                </Link>
              </div>
            )
          )}
        </Section>

        <Templates />
      </div>
    </>
  );
}

function RpeScatter({ points }: { points: Array<{ date: Date; rpe: number; hardSets: number; tonnage: number }> }) {
  const W = 720;
  const H = 240;
  const P = { l: 40, r: 16, t: 14, b: 32 };
  const maxX = Math.max(6, ...points.map((p) => p.hardSets)) + 1;
  const x = (hs: number) => P.l + (hs / maxX) * (W - P.l - P.r);
  const y = (rpe: number) => P.t + (1 - (rpe - 1) / 9) * (H - P.t - P.b);
  const rpeTicks = [1, 3, 5, 7, 9];
  const xTicks = Array.from({ length: Math.ceil(maxX) + 1 }, (_, i) => i).filter((t) => t % 2 === 0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="RPE contre charge">
      {rpeTicks.map((t) => (
        <g key={t}>
          <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="rgb(var(--hair))" />
          <text x={P.l - 8} y={y(t)} dy="0.35em" textAnchor="end" fontSize={10} fill="rgb(var(--ink-3))">
            {t}
          </text>
        </g>
      ))}
      {xTicks.map((t) => (
        <text key={t} x={x(t)} y={H - 10} textAnchor="middle" fontSize={10} fill="rgb(var(--ink-3))">
          {t}
        </text>
      ))}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={x(p.hardSets)}
          cy={y(p.rpe)}
          r={p.hardSets >= 10 ? 6 : 4}
          fill="rgb(var(--clay))"
          fillOpacity={0.55}
          stroke="rgb(var(--clay))"
          strokeWidth={1}
        >
          <title>{`${fmtDateShort(p.date)} · ${p.hardSets} séries dures · ${p.tonnage.toLocaleString("fr-FR")} kg · RPE ${p.rpe}`}</title>
        </circle>
      ))}
      <text x={P.l} y={14} fontSize={10} fill="rgb(var(--ink-3))">
        RPE
      </text>
      <text x={W - P.r} y={H - 10} textAnchor="end" fontSize={10} fill="rgb(var(--ink-3))">
        séries dures
      </text>
    </svg>
  );
}

function Templates() {
  return (
    <Section title="Modèles de séance" note="Choisis-en un en créant une séance : les charges sont préremplies d'après ta dernière fois.">
      <div className="grid gap-x-10 gap-y-4 md:grid-cols-2">
        {TEMPLATES.map((t) => (
          <div key={t.key} className="border-b border-hair pb-4">
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-medium">{t.name}</span>
              <span className="text-micro text-ink3">{t.note}</span>
            </div>
            <div className="mt-1.5 text-micro leading-relaxed text-ink2">
              {t.items.map((i) => `${exerciseInfo(i.exercise).name} ${i.sets}×${i.reps}${exerciseInfo(i.exercise).unit === "seconds" ? "s" : ""}`).join(" · ")}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
