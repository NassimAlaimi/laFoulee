import Link from "next/link";
import { Empty, PageHead, Section } from "@/components/ui/Layout";
import { Bar } from "@/components/ui/Metric";
import { CheckinForm } from "@/components/training/CheckinForm";
import { ComplianceBand, ComplianceOverview } from "@/components/training/ComplianceBand";
import { PlanBuilder, VolumeCurve } from "@/components/training/PlanBuilder";
import { SessionCard, type SessionView } from "@/components/training/SessionCard";
import { WeekBoard } from "@/components/training/WeekBoard";
import { fmtDateShort } from "@/lib/format";
import {
  actualKmForWeek,
  athleteContext,
  getActivePlan,
  linkActivities,
  parseAdaptation,
  parseFeasibility,
} from "@/lib/plan-store";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { getSettings } from "@/lib/queries";
import { complianceSeries } from "@/lib/compliance";
import { addDays, calendarDaysBetween, daysBetween, round, startOfWeek } from "@/lib/stats";
import {
  intensityBalance,
  PHASE_COLOR,
  PHASE_LABELS,
  TONE_STYLE,
  weekCompliance,
  type Phase,
} from "@/lib/training";

export const dynamic = "force-dynamic";

/**
 * Page d'entraînement : la semaine en cours, séance par séance.
 *
 * C'est la page qu'on ouvre le matin — donc elle répond d'abord à une seule
 * question : « qu'est-ce que je fais aujourd'hui ? ». Le reste (adaptation,
 * trajectoire, assiduité) vient après.
 */
export default async function TrainingPage() {
  const now = new Date();
  const userId = await requireUserId();
  const plan = await getActivePlan(userId);

  if (!plan) return <NoPlan userId={userId} />;

  await linkActivities(plan.id, now, userId);

  const thisMonday = startOfWeek(now);
  const nextMonday = addDays(thisMonday, 7);
  const lastMonday = addDays(thisMonday, -7);

  // Semaine « au tableau » : la semaine en cours, ou la première du plan s'il
  // n'a pas encore commencé (sinon la page s'ouvrirait sur une semaine vide).
  const planStartMonday = startOfWeek(plan.startDate);
  const focusMonday = planStartMonday > thisMonday ? planStartMonday : thisMonday;
  const afterFocus = addDays(focusMonday, 7);
  const upcomingPlan = focusMonday > thisMonday;

  const [ctx, sessions, nextSessions, weeks, checkin, allSessions, planSessions] = await Promise.all([
    athleteContext(now, userId),
    loadWeek(plan.id, focusMonday),
    loadWeek(plan.id, afterFocus),
    prisma.plannedSession.groupBy({
      by: ["weekNumber", "weekStart", "phase"],
      where: { planId: plan.id },
      _sum: { distanceKm: true },
      orderBy: { weekNumber: "asc" },
    }),
    prisma.weekCheckin.findUnique({
      where: { planId_weekStart: { planId: plan.id, weekStart: thisMonday } },
    }),
    prisma.plannedSession.findMany({
      where: { planId: plan.id, weekStart: focusMonday },
      select: { distanceKm: true, status: true, kind: true },
    }),
    prisma.plannedSession.findMany({
      where: { planId: plan.id },
      select: {
        weekNumber: true,
        weekStart: true,
        phase: true,
        distanceKm: true,
        status: true,
        kind: true,
      },
      orderBy: { weekNumber: "asc" },
    }),
  ]);

  const doneKm = upcomingPlan ? 0 : actualKmForWeek(ctx.runs, thisMonday);
  const compliance = weekCompliance(allSessions, doneKm);
  const lastWeekSessions = await prisma.plannedSession.findMany({
    where: { planId: plan.id, weekStart: lastMonday },
    select: { distanceKm: true, status: true, kind: true },
  });
  const lastCompliance = weekCompliance(
    lastWeekSessions,
    actualKmForWeek(ctx.runs, lastMonday)
  );

  const balance = intensityBalance(allSessions);
  const adaptation = parseAdaptation(checkin?.applied ?? null);
  const feasibility = parseFeasibility(plan.feasibility);

  const curve = weeks.map((w) => ({
    weekNumber: w.weekNumber,
    km: round(w._sum.distanceKm ?? 0, 1),
    phase: w.phase,
  }));
  const actualMap = new Map<number, number>();
  for (const w of weeks) {
    const monday = new Date(w.weekStart);
    if (monday <= thisMonday) {
      actualMap.set(w.weekNumber, actualKmForWeek(ctx.runs, monday));
    }
  }

  const complianceRows = complianceSeries(planSessions, actualMap, thisMonday);

  const todayKey = now.toDateString();
  const currentWeek = curve.find((c) => {
    const w = weeks.find((x) => x.weekNumber === c.weekNumber);
    return w && new Date(w.weekStart).getTime() === focusMonday.getTime();
  });
  const firstRun = sessions.find((x) => x.kind !== "rest");
  const startsIn = upcomingPlan && firstRun ? calendarDaysBetween(now, new Date(firstRun.date)) : 0;
  const focusKm = round(sessions.reduce((a, s) => a + s.distanceKm, 0), 1);
  const runSessions = sessions.filter((s) => s.kind !== "rest");

  const daysToRace = plan.raceGoal ? daysBetween(now, plan.raceGoal.raceDate) : null;

  return (
    <div className="space-y-12">
      <PageHead
        title="Entraînement"
        kicker={
          <>
            {plan.name}
            {plan.raceGoal && daysToRace !== null && daysToRace >= 0 && <> · J−{daysToRace}</>}
          </>
        }
        action={
          <div className="flex items-center gap-2">
            <Link href="/settings#agenda" className="btn-quiet" title="Abonner ton agenda au plan">
              Dans mon agenda
            </Link>
            <Link href={`/training/${plan.id}`} className="btn-outline btn-sm">
              Plan complet →
            </Link>
          </div>
        }
      />

      {/* ------------------------------------------------ La semaine au tableau */}
      <section className="rise">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <div className="text-micro font-medium uppercase tracking-[0.16em] text-ink3">
              {upcomingPlan
                ? `Le plan démarre ${startsIn <= 1 ? "demain" : `dans ${startsIn} jours`}`
                : "Cette semaine"}
            </div>
            <h2 className="mt-2 text-[clamp(1.9rem,4vw,2.9rem)] font-semibold leading-none tracking-[-0.03em]">
              {currentWeek ? (
                <>
                  Semaine {currentWeek.weekNumber}
                  <span className="text-ink3"> / {curve.length}</span>
                  <span className="ml-3 align-middle text-[0.45em] font-medium tracking-normal" style={{ color: PHASE_COLOR[currentWeek.phase] }}>
                    ● {PHASE_LABELS[(currentWeek.phase as Phase) ?? "base"]}
                  </span>
                </>
              ) : (
                "Hors plan"
              )}
            </h2>
          </div>
          <dl className="flex gap-8">
            <BoardFig label="prévus" value={`${focusKm}`} unit="km" />
            {!upcomingPlan && <BoardFig label="faits" value={`${compliance.doneKm}`} unit="km" tone={compliance.ratio >= 0.9 ? "text-sage" : ""} />}
            <BoardFig
              label="séances"
              value={upcomingPlan ? `${runSessions.length}` : `${compliance.sessionsDone}/${compliance.sessionsPlanned}`}
            />
            <BoardFig label="facile" value={`${balance.easyPct}`} unit="%" note={balance.verdict} />
          </dl>
        </div>
        {!upcomingPlan && (
          <div className="mb-0">
            <Bar value={compliance.plannedKm > 0 ? (compliance.doneKm / compliance.plannedKm) * 100 : 0} height={3} />
          </div>
        )}
        <WeekBoard monday={focusMonday} sessions={sessions} now={now} />
      </section>

      <Section title="Séance par séance" note="Structure, allures et actions : marquer fait, sauter, noter ses sensations.">
        {sessions.length === 0 ? (
          <p className="py-6 text-sm text-ink3">Aucune séance planifiée cette semaine.</p>
        ) : (
          <div>
            {sessions.map((s) => (
              <SessionCard key={s.id} session={s} today={new Date(s.date).toDateString() === todayKey} />
            ))}
          </div>
        )}
      </Section>

      {/* ------------------------------------------------ Adaptation */}
      <Section
        title="Point hebdomadaire"
        note="Douleur, fatigue, disponibilité — le plan se recale sur ces réponses."
      >
        {adaptation && (
          <div className="mb-5 border-l-2 border-hairStrong pl-4">
            <div className={`text-sm font-medium ${TONE_STYLE[adaptation.tone] ?? "text-ink"}`}>
              Semaine ajustée : {adaptation.headline}
            </div>
            <ul className="mt-1.5 space-y-0.5">
              {adaptation.reasons.map((r, i) => (
                <li key={i} className="text-micro leading-relaxed text-ink3">
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <CheckinForm planId={plan.id} existing={adaptation} />

          <div className="space-y-4 border-t border-hair pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <Signal
              label="Semaine dernière"
              value={`${Math.round(lastCompliance.ratio * 100)} %`}
              note={`${lastCompliance.doneKm} / ${lastCompliance.plannedKm} km`}
              tone={lastCompliance.ratio >= 0.9 ? "sage" : lastCompliance.ratio >= 0.6 ? "ochre" : "rust"}
            />
            <Signal
              label="Charge aiguë / chronique"
              value={ctx.acwr ? ctx.acwr.toFixed(2) : "—"}
              note={
                ctx.acwr === null
                  ? "historique insuffisant"
                  : ctx.acwr > 1.5
                    ? "montée rapide"
                    : ctx.acwr < 0.8
                      ? "sous-charge"
                      : "zone optimale"
              }
              tone={
                ctx.acwr === null
                  ? "ink"
                  : ctx.acwr > 1.5
                    ? "rust"
                    : ctx.acwr < 0.8
                      ? "ochre"
                      : "sage"
              }
            />
            <Signal
              label="Volume de référence"
              value={`${ctx.fitness.weeklyKm} km`}
              note={`sortie longue ${ctx.fitness.longestRunKm} km · régularité ${ctx.fitness.consistency} %`}
              tone="ink"
            />
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------ Semaine suivante */}
      {nextSessions.length > 0 && (
        <Section
          title={upcomingPlan ? "La semaine d'après" : "Semaine suivante"}
          note={`${round(nextSessions.reduce((a, s) => a + s.distanceKm, 0), 1)} km prévus`}
        >
          <div className="grid gap-x-8 sm:grid-cols-2">
            {nextSessions.map((s) => (
              <SessionCard key={s.id} session={s} compact />
            ))}
          </div>
        </Section>
      )}

      {/* ------------------------------------------------ Trajectoire */}
      <Section
        title="Trajectoire"
        note={
          feasibility
            ? feasibility.facts[0]
            : `${plan.startWeeklyKm} → ${plan.targetPeakKm} km/sem sur ${curve.length} semaines`
        }
        action={
          <Link href={`/training/${plan.id}`} className="btn-quiet">
            Détail
          </Link>
        }
      >
        <VolumeCurve weeks={curve} actual={actualMap} />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-micro text-ink3">
          <Legend color="rgb(var(--slate))" label="base" />
          <Legend color="rgb(var(--sage))" label="développement" />
          <Legend color="rgb(var(--clay))" label="spécifique" />
          <Legend color="rgb(var(--hair-strong))" label="décharge" />
          <Legend color="rgb(var(--ochre))" label="affûtage" />
          <span className="ml-auto">
            {fmtDateShort(plan.startDate)} → {plan.endDate ? fmtDateShort(plan.endDate) : "—"}
          </span>
        </div>
      </Section>

      {/* ------------------------------------------------ Conformité */}
      <Section
        title="Conformité"
        note="Ce que tu as réellement exécuté face au plan, semaine par semaine. La barre monte avec les séances faites ; le filet de couleur marque la phase."
      >
        <ComplianceOverview rows={complianceRows} />
        <div className="mt-8">
          <ComplianceBand rows={complianceRows} />
        </div>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- Sans plan

async function NoPlan({ userId }: { userId: string }) {
  const now = new Date();
  const [ctx, goals, settings] = await Promise.all([
    athleteContext(now, userId),
    prisma.raceGoal.findMany({
      where: { userId, raceDate: { gte: now } },
      orderBy: { raceDate: "asc" },
    }),
    getSettings(userId),
  ]);

  return (
    <div className="space-y-8">
      <PageHead
        title="Entraînement"
        meta="Un plan séance par séance, calé sur ton volume actuel — avec ou sans course à préparer"
      />

      {ctx.fitness.thin && (
        <p className="text-[0.8125rem] leading-relaxed text-ink2">
          Peu d&apos;historique exploitable pour le moment : le plan partira d&apos;un
          volume prudent que tu peux corriger à la main ci-dessous.
        </p>
      )}

      <Section title="Nouveau plan" className="scroll-mt-24">
        <PlanBuilder
          fitness={ctx.fitness}
          vdot={ctx.vdot}
          defaults={{
            daysPerWeek: settings.daysPerWeek,
            longRunDay: settings.longRunDay,
            ceilingKm: settings.ceilingKm,
          }}
          goals={goals.map((g) => ({
            id: g.id,
            name: g.name,
            raceDate: g.raceDate.toISOString(),
            distanceKm: round(g.distance / 1000, 1),
          }))}
        />
      </Section>

      {goals.length === 0 && (
        <Empty
          title="Pas de course prévue ?"
          body="C'est justement le cas prévu : choisis une orientation (base, vitesse, sortie longue, entretien, reprise) et l'app génère un bloc qui se renouvelle."
          action={
            <Link href="/goals" className="btn-outline btn-sm">
              Ajouter une course quand même
            </Link>
          }
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Helpers

async function loadWeek(planId: string, monday: Date): Promise<SessionView[]> {
  const rows = await prisma.plannedSession.findMany({
    where: { planId, weekStart: monday },
    orderBy: { date: "asc" },
    include: {
      activity: { select: { id: true, name: true, distance: true, movingTime: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    date: r.date.toISOString(),
    kind: r.kind,
    title: r.title,
    tagline: r.tagline,
    structure: r.structure,
    distanceKm: r.distanceKm,
    durationMin: r.durationMin,
    paceTarget: r.paceTarget,
    intensity: r.intensity,
    status: r.status,
    phase: r.phase,
    adapted: r.adapted,
    adaptReason: r.adaptReason,
    rpe: r.rpe,
    painLevel: r.painLevel,
    activity: r.activity
      ? {
          id: r.activity.id,
          name: r.activity.name,
          distance: r.activity.distance,
          movingTime: r.activity.movingTime,
        }
      : null,
  }));
}

function Signal({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: "sage" | "ochre" | "rust" | "ink";
}) {
  const color = {
    sage: "text-sage",
    ochre: "text-ochre",
    rust: "text-rust",
    ink: "text-ink",
  }[tone];

  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hair pb-3 last:border-b-0">
      <div className="min-w-0">
        <div className="eyebrow">{label}</div>
        <div className="mt-1 text-micro text-ink3">{note}</div>
      </div>
      <div className={`shrink-0 font-mono text-lg font-medium tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  );
}

function BoardFig({ label, value, unit, note, tone = "" }: { label: string; value: string; unit?: string; note?: string; tone?: string }) {
  return (
    <div>
      <dd className={`display text-d3 ${tone}`}>
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-ink3">{unit}</span>}
      </dd>
      <dt className="mt-1 text-micro text-ink3">
        {label}
        {note && <span className="ml-1.5">· {note}</span>}
      </dt>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-[1px]" style={{ background: color }} />
      {label}
    </span>
  );
}
