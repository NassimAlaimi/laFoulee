import Link from "next/link";
import { notFound } from "next/navigation";
import { FormChart } from "@/components/charts/Lazy";
import { VolumeCurve } from "@/components/training/PlanBuilder";
import { PHASE_COLOR } from "@/lib/training";
import { CreatePlanForGoal } from "@/components/training/CreatePlanForGoal";
import { Section, SectionHead } from "@/components/ui/Layout";
import { Bar } from "@/components/ui/Metric";
import {
  formAtStart,
  formSeries,
  plannedLoad,
  ZONE_LABEL,
  ZONE_TONE,
} from "@/lib/fitness-model";
import { fmtDate, fmtDateShort, fmtDuration, fmtPace } from "@/lib/format";
import { raceReadiness, readinessFacts } from "@/lib/goal";
import { athleteContext } from "@/lib/plan-store";
import { pacingPlan } from "@/lib/prediction";
import type { ChartMark } from "@/lib/race-marks";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { addDays, round, startOfWeek } from "@/lib/stats";
import { PHASE_LABELS } from "@/lib/training";

export const dynamic = "force-dynamic";

export default async function GoalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  // findFirst + userId : l'objectif d'un autre utilisateur donne un 404, pas
  // une page à demi remplie.
  const goal = await prisma.raceGoal.findFirst({ where: { id, userId } });
  if (!goal) notFound();

  const now = new Date();
  const ctx = await athleteContext(now, userId);

  const r = raceReadiness({
    goal,
    fitness: ctx.fitness,
    records: ctx.records,
    profile: ctx.profile,
    endurance: ctx.endurance,
    now,
  });

  // Le plan rattaché à cet objectif — plus aucun plan « fantôme » calculé ici.
  const plan = await prisma.trainingPlan.findFirst({
    where: { userId, raceGoalId: goal.id, status: { in: ["active", "paused"] } },
    orderBy: { createdAt: "desc" },
    include: {
      sessions: {
        orderBy: { date: "asc" },
        select: {
          date: true,
          weekNumber: true,
          weekStart: true,
          phase: true,
          kind: true,
          distanceKm: true,
          durationMin: true,
          intensity: true,
          status: true,
        },
      },
    },
  });

  const weeks = plan ? weekRows(plan.sessions) : [];
  const thisMonday = startOfWeek(now);

  // Réalisé par semaine, pour superposer au prévu
  const actualByWeek = new Map<number, number>();
  if (plan) {
    for (const run of ctx.runs) {
      const wk = weeks.find(
        (w) => run.startDate >= w.weekStart && run.startDate < addDays(w.weekStart, 7)
      );
      if (wk) {
        actualByWeek.set(
          wk.weekNumber,
          round((actualByWeek.get(wk.weekNumber) ?? 0) + run.distance / 1000, 1)
        );
      }
    }
  }

  // Forme projetée jusqu'au jour J
  const future = (plan?.sessions ?? [])
    .filter((s) => s.date > now && s.status === "planned")
    .map((s) => ({ date: s.date, load: plannedLoad(s) }));

  const series = formSeries({ activities: ctx.runs, days: 90, future, now });
  const raceForm = formAtStart(series, goal.raceDate);
  const formRows = series.map((p) => ({
    label: p.label,
    ctl: p.ctl,
    atl: p.atl,
    tsb: p.tsb,
    projected: p.projected,
    ctlPast: p.projected ? null : p.ctl,
    ctlFuture: p.projected ? p.ctl : null,
    tsbPast: p.projected ? null : p.tsb,
    tsbFuture: p.projected ? p.tsb : null,
  }));

  // Sans chrono visé, on cale le plan d'allure sur la prédiction réaliste :
  // un plan d'allure sert justement à ne pas partir au feeling.
  const paceBase = r.targetSeconds ?? r.prediction?.realistic ?? 0;
  const splits = paceBase > 0 ? pacingPlan(goal.distance, paceBase) : [];
  const facts = readinessFacts(r);

  const countdownTone = {
    Préparation: "text-sage",
    Spécifique: "text-ochre",
    Affûtage: "text-clay",
    "Jour J": "text-rust",
    Passée: "text-ink3",
  }[r.phase] ?? "text-clay";

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------- Affiche de l'objectif */}
      <section className="rise grid gap-8 border-y border-hair py-8 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <Link href="/goals" className="text-micro uppercase tracking-[0.1em] text-ink3 hover:text-clay">
            ← Objectifs
          </Link>
          <div className="eyebrow mt-4">{r.phase} · {fmtDate(goal.raceDate)}</div>
          <h1 className="mt-3 text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-[1.02] tracking-[-0.03em]">
            {goal.name}
          </h1>
          <p className="mt-3 text-[0.9375rem] text-ink2">
            {(goal.distance / 1000).toFixed(1)} km
            {goal.targetTime && ` · objectif ${fmtDuration(goal.targetTime)}`}
            {r.targetPace && ` · allure ${fmtPace(r.targetPace)}`}
          </p>
        </div>
        <div className="flex flex-row items-end gap-6 lg:flex-col lg:items-end">
          <div>
            <div className="eyebrow">
              {r.daysRemaining > 0 ? "Jours restants" : r.daysRemaining === 0 ? "C'est le jour J" : "Course passée"}
            </div>
            <div className={`display text-[clamp(4.5rem,10vw,8.5rem)] leading-[0.85] ${countdownTone}`}>
              {r.daysRemaining > 0 ? r.daysRemaining : r.daysRemaining === 0 ? "J" : "—"}
            </div>
          </div>
          <div className="pb-2 text-right text-sm text-ink3">
            <div>{r.weeksRemaining > 0 ? `${r.weeksRemaining} semaine${r.weeksRemaining > 1 ? "s" : ""}` : "dernière ligne droite"}</div>
            <div>préparation {r.readiness}/100</div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ KPI */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Volume actuel"
          value={`${ctx.fitness.weeklyKm} km`}
          note={`${ctx.fitness.weeklyKm4w} km/sem sur 4 sem. · ${ctx.fitness.sessionsPerWeek} sorties/sem`}
        />
        <Kpi
          label="Préparation"
          value={`${r.readiness}/100`}
          bar={r.readiness}
          note={facts[0]}
        />
        <Kpi
          label="Chrono réaliste"
          value={r.prediction ? fmtDuration(r.prediction.realistic) : "—"}
          note={
            r.prediction
              ? `${fmtPace(r.prediction.pace)} · potentiel ${fmtDuration(r.prediction.potential)}`
              : "pas assez de données"
          }
        />
        <Kpi
          label="Fraîcheur jour J"
          value={raceForm ? `${raceForm.tsb > 0 ? "+" : ""}${Math.round(raceForm.tsb)}` : "—"}
          note={
            raceForm
              ? `${ZONE_LABEL[raceForm.zone]} · condition ${Math.round(raceForm.ctl)}`
              : plan
                ? "au-delà de la projection"
                : "aucun plan rattaché"
          }
          tone={raceForm ? ZONE_TONE[raceForm.zone] : undefined}
        />
      </div>

      {/* ------------------------------------------------ Écart au chrono visé */}
      {r.gap && r.prediction && (
        <Section>
          <SectionHead
            title="Écart au chrono visé"
            note={`Objectif ${fmtDuration(r.targetSeconds ?? 0)} · niveau actuel ${fmtDuration(r.prediction.realistic)}`}
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Fact
              label="À trouver"
              value={
                r.gap.secondsToFind > 0
                  ? `−${fmtDuration(Math.abs(r.gap.secondsToFind))}`
                  : `${fmtDuration(Math.abs(r.gap.secondsToFind))} d'avance`
              }
              tone={r.gap.secondsToFind > 0 ? "text-clay" : "text-sage"}
            />
            <Fact
              label="Niveau requis"
              value={`VDOT ${r.gap.requiredVdot}`}
              note={`actuel ${r.gap.currentVdot} · écart ${r.gap.gap > 0 ? "+" : ""}${r.gap.gap}`}
            />
            <Fact
              label="Temps nécessaire"
              value={`${r.gap.weeksNeeded} sem.`}
              note={`${r.weeksRemaining} disponibles · +${r.gap.monthlyVdotGain} VDOT/mois`}
              tone={r.gap.feasible ? "text-sage" : "text-ochre"}
            />
            <Fact
              label="Fourchette"
              value={`${fmtDuration(r.prediction.low)} – ${fmtDuration(r.prediction.high)}`}
              note={r.prediction.reason}
            />
          </div>

          {r.prediction.limiters.length > 0 && (
            <ul className="mt-5 space-y-1.5 border-t border-hair pt-4">
              {r.prediction.limiters.map((l, i) => (
                <li key={i} className="flex items-baseline justify-between gap-4 text-[0.8125rem]">
                  <span className="text-ink2">{l.label}</span>
                  <span className="font-mono text-micro tabular-nums text-clay">
                    +{fmtDuration(l.costSeconds)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* ------------------------------------------------ Plan */}
      {plan ? (
        <Section>
          <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-4">
            <div>
              <h2 className="section-title">{plan.name}</h2>
              <p className="mt-1 text-xs text-ink3">
                {weeks.length} semaines · {round(weeks.reduce((a, w) => a + w.km, 0), 0)} km
                planifiés · pic {plan.targetPeakKm} km/sem
                {plan.status === "paused" && " · en pause"}
              </p>
            </div>
            <Link href={`/training/${plan.id}`} className="btn-outline btn-sm">
              Ouvrir le plan →
            </Link>
          </div>

          <div className="px-5 pb-5">
            <VolumeCurve weeks={weeks} actual={actualByWeek} />
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {Object.entries(PHASE_LABELS).map(([k, label]) => (
                <span key={k} className="flex items-center gap-1.5 text-micro text-ink3">
                  <span
                    className="h-[3px] w-3"
                    style={{ background: PHASE_COLOR[k] ?? "rgb(var(--hair-strong))" }}
                  />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto border-t border-hair">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-12">Sem.</th>
                  <th>Période</th>
                  <th>Phase</th>
                  <th className="text-right">Prévu</th>
                  <th className="text-right">Réalisé</th>
                  <th className="text-right">Séances</th>
                  <th className="w-32">Avancement</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => {
                  const actual = actualByWeek.get(w.weekNumber) ?? 0;
                  const isCurrent = w.weekStart.getTime() === thisMonday.getTime();
                  const isPast = w.weekStart < thisMonday;
                  return (
                    <tr key={w.weekNumber} className={isCurrent ? "bg-clay/[.05]" : ""}>
                      <td className="font-mono tabular-nums text-ink2">
                        {w.weekNumber}
                        {isCurrent && <span className="ml-1 text-clay">•</span>}
                      </td>
                      <td className="whitespace-nowrap text-ink2">
                        {fmtDateShort(w.weekStart)} – {fmtDateShort(addDays(w.weekStart, 6))}
                      </td>
                      <td>
                        <span className="badge bg-sunken text-ink2">
                          {PHASE_LABELS[w.phase as keyof typeof PHASE_LABELS] ?? w.phase}
                        </span>
                      </td>
                      <td className="text-right font-mono font-medium tabular-nums">
                        {w.km} km
                      </td>
                      <td className="text-right font-mono tabular-nums">
                        {isPast || isCurrent ? (
                          <span className={actual >= w.km * 0.9 ? "text-sage" : "text-ink2"}>
                            {actual} km
                          </span>
                        ) : (
                          <span className="text-ink3">—</span>
                        )}
                      </td>
                      <td className="text-right font-mono tabular-nums text-ink2">
                        {w.sessions}
                      </td>
                      <td>
                        {isPast || isCurrent ? (
                          <Bar value={Math.min(100, w.km > 0 ? (actual / w.km) * 100 : 0)} height={4} />
                        ) : (
                          <div className="h-1 rounded-full bg-sunken" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      ) : (
        <Section>
          <SectionHead
            title="Plan d'entraînement"
            note="Aucun plan n'est rattaché à cet objectif"
          />
          <CreatePlanForGoal
            goalId={goal.id}
            goalName={goal.name}
            raceKm={round(goal.distance / 1000, 1)}
            weeksAvailable={r.weeksRemaining}
            startKm={ctx.fitness.weeklyKm}
            neededKm={r.needs.weeklyKm}
          />
        </Section>
      )}

      {/* ------------------------------------------------ Forme projetée */}
      {plan && future.length > 0 && (
        <Section>
          <SectionHead
            title="Forme projetée"
            note="Condition, fatigue et fraîcheur — la partie en pointillés découle des séances planifiées"
          />
          <FormChart data={formRows} marks={raceForm ? [{ label: raceForm.label, kind: "race", date: goal.raceDate } as ChartMark] : []} />
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-micro text-ink3">
            <span>Condition (CTL) : ce que tu encaisses</span>
            <span>Fatigue (ATL) : ce que tu as encaissé récemment</span>
            <span>Fraîcheur (TSB) : la différence — positive le jour J</span>
          </div>
        </Section>
      )}

      {/* ------------------------------------------------ Stratégie d'allure */}
      {splits.length > 0 && (
        <Section>
          <SectionHead
            title="Plan d'allure"
            note={
              r.targetSeconds
                ? `Négatif léger : premier tiers retenu, dernier tiers accéléré — ${fmtDuration(r.targetSeconds)} au total (chrono visé)`
                : `Négatif léger : premier tiers retenu, dernier tiers accéléré — ${fmtDuration(paceBase)} au total (chrono réaliste, aucun objectif saisi)`
            }
          />
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Passage</th>
                  <th className="text-right">Allure</th>
                  <th className="text-right">Temps cumulé</th>
                  <th className="text-right">Écart au régulier</th>
                </tr>
              </thead>
              <tbody>
                {splits.map((s, i) => {
                  const even = (paceBase / (goal.distance / 1000)) * s.km;
                  const delta = Math.round(s.cumulative - even);
                  return (
                    <tr key={i}>
                      <td className="font-mono tabular-nums text-ink2">{s.label}</td>
                      <td className="text-right font-mono font-medium tabular-nums">
                        {fmtPace(s.pace)}
                      </td>
                      <td className="text-right font-mono tabular-nums">
                        {fmtDuration(s.cumulative)}
                      </td>
                      <td className="text-right font-mono text-micro tabular-nums text-ink3">
                        {delta === 0 ? "—" : `${delta > 0 ? "+" : "−"}${Math.abs(delta)} s`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ------------------------------------------------ Prérequis */}
      <Section>
        <SectionHead
          title="Prérequis de la distance"
          note={`${r.raceKm} km — seuils utilisés aussi par le générateur de plan`}
        />
        <div className="space-y-4">
          {r.factors.map((f) => (
            <div key={f.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[0.8125rem] text-ink2">{f.label}</span>
                <span className="font-mono text-micro tabular-nums text-ink3">
                  {f.unit === "s/km"
                    ? f.target > 0
                      ? `${fmtPace(f.value)} / ${fmtPace(f.target)} visés`
                      : fmtPace(f.value)
                    : `${f.value} / ${f.target} ${f.unit}`}
                  <span className={`ml-2 ${f.ok ? "text-sage" : "text-ink3"}`}>
                    {f.score}/{f.max}
                  </span>
                </span>
              </div>
              <div className="mt-1.5">
                <Bar value={(f.score / f.max) * 100} height={4} />
              </div>
            </div>
          ))}
        </div>

        <ul className="mt-5 space-y-1 border-t border-hair pt-4">
          {facts.map((f, i) => (
            <li key={i} className="font-mono text-micro leading-relaxed tabular-nums text-ink2">
              {f}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- Helpers

type WeekRow = {
  weekNumber: number;
  weekStart: Date;
  phase: string;
  km: number;
  sessions: number;
};

function weekRows(
  sessions: Array<{ weekNumber: number; weekStart: Date; phase: string; distanceKm: number; kind: string }>
): WeekRow[] {
  const map = new Map<number, WeekRow>();
  for (const s of sessions) {
    const row = map.get(s.weekNumber) ?? {
      weekNumber: s.weekNumber,
      weekStart: s.weekStart,
      phase: s.phase,
      km: 0,
      sessions: 0,
    };
    row.km = round(row.km + s.distanceKm, 1);
    if (s.distanceKm > 0) row.sessions += 1;
    // La phase de la semaine est celle de la majorité de ses séances.
    if (s.phase === "race" || s.phase === "taper") row.phase = s.phase;
    map.set(s.weekNumber, row);
  }
  return [...map.values()].sort((a, b) => a.weekNumber - b.weekNumber);
}

function Kpi({
  label,
  value,
  note,
  bar,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  bar?: number;
  tone?: string;
}) {
  return (
    <div className="card card-pad">
      <div className="section-title">{label}</div>
      <div className={`display text-d3 mt-2.5 ${tone ?? ""}`}>{value}</div>
      {bar !== undefined && (
        <div className="mt-3">
          <Bar value={bar} height={4} />
        </div>
      )}
      {note && <p className="mt-2 text-micro leading-relaxed text-ink3">{note}</p>}
    </div>
  );
}

function Fact({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: string;
}) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className={`mt-1.5 font-mono text-[0.9375rem] font-medium tabular-nums ${tone ?? ""}`}>
        {value}
      </div>
      {note && <div className="mt-1 text-micro leading-relaxed text-ink3">{note}</div>}
    </div>
  );
}
