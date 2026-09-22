import Link from "next/link";
import { notFound } from "next/navigation";
import { Section, SectionHead } from "@/components/ui/Layout";
import { Bar } from "@/components/ui/Metric";
import { FeasibilityPanel, VolumeCurve } from "@/components/training/PlanBuilder";
import { PlanSettings } from "@/components/training/PlanSettings";
import { WeekAccordion } from "@/components/training/WeekAccordion";
import { fmtDateShort } from "@/lib/format";
import {
  actualKmForWeek,
  athleteContext,
  linkActivities,
  parseFeasibility,
} from "@/lib/plan-store";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { round, startOfWeek } from "@/lib/stats";
import { intensityBalance, PHASE_LABELS, type Phase } from "@/lib/training";
import { KIND_LABELS, type SessionKind } from "@/lib/workouts";

export const dynamic = "force-dynamic";

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const plan = await prisma.trainingPlan.findFirst({
    where: { id, userId },
    include: { raceGoal: true, checkins: { orderBy: { weekStart: "desc" }, take: 8 } },
  });
  if (!plan) notFound();

  const now = new Date();
  await linkActivities(plan.id, now, userId);

  const [ctx, sessions] = await Promise.all([
    athleteContext(now, userId),
    prisma.plannedSession.findMany({
      where: { planId: plan.id },
      orderBy: { date: "asc" },
      include: { activity: { select: { id: true, name: true, distance: true, movingTime: true } } },
    }),
  ]);

  const thisMonday = startOfWeek(now);
  const feasibility = parseFeasibility(plan.feasibility);

  // Regroupement par semaine
  const byWeek = new Map<
    number,
    { weekStart: Date; phase: string; km: number; sessions: typeof sessions }
  >();
  for (const s of sessions) {
    const entry = byWeek.get(s.weekNumber);
    if (entry) {
      entry.km += s.distanceKm;
      entry.sessions.push(s);
    } else {
      byWeek.set(s.weekNumber, {
        weekStart: s.weekStart,
        phase: s.phase,
        km: s.distanceKm,
        sessions: [s],
      });
    }
  }

  const weeks = [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([weekNumber, w]) => ({
      weekNumber,
      weekStart: w.weekStart,
      phase: w.phase,
      km: round(w.km, 1),
      actualKm: w.weekStart <= thisMonday ? actualKmForWeek(ctx.runs, w.weekStart) : null,
      isCurrent: w.weekStart.getTime() === thisMonday.getTime(),
      sessions: w.sessions.map((s) => ({
        id: s.id,
        date: s.date.toISOString(),
        kind: s.kind,
        title: s.title,
        tagline: s.tagline,
        structure: s.structure,
        distanceKm: s.distanceKm,
        durationMin: s.durationMin,
        paceTarget: s.paceTarget,
        intensity: s.intensity,
        status: s.status,
        phase: s.phase,
        adapted: s.adapted,
        adaptReason: s.adaptReason,
        rpe: s.rpe,
        painLevel: s.painLevel,
        activity: s.activity
          ? {
              id: s.activity.id,
              name: s.activity.name,
              distance: s.activity.distance,
              movingTime: s.activity.movingTime,
            }
          : null,
      })),
    }));

  const curve = weeks.map((w) => ({ weekNumber: w.weekNumber, km: w.km, phase: w.phase }));
  const actualMap = new Map(
    weeks.filter((w) => w.actualKm !== null).map((w) => [w.weekNumber, w.actualKm as number])
  );

  const balance = intensityBalance(
    sessions.map((s) => ({ distanceKm: s.distanceKm, kind: s.kind }))
  );

  const kindTotals = new Map<string, { count: number; km: number }>();
  for (const s of sessions) {
    const e = kindTotals.get(s.kind) ?? { count: 0, km: 0 };
    e.count++;
    e.km += s.distanceKm;
    kindTotals.set(s.kind, e);
  }

  const totalKm = round(sessions.reduce((a, s) => a + s.distanceKm, 0), 0);
  const doneSessions = sessions.filter((s) => s.status === "done").length;
  const pastSessions = sessions.filter((s) => s.date < now).length;

  return (
    <div className="space-y-10">
      <div>
        <Link href="/training" className="text-xs text-ink3 transition-colors hover:text-clay">
          ← Entraînement
        </Link>
        <h1 className="mt-2 text-[1.75rem] font-semibold tracking-[-0.02em]">{plan.name}</h1>
        <p className="mt-1.5 text-sm text-ink2">
          {plan.mode === "race" && plan.raceGoal
            ? `${plan.raceGoal.name} · ${round(plan.raceGoal.distance / 1000, 1)} km · ${fmtDateShort(plan.raceGoal.raceDate)}`
            : "Progression libre, sans course"}
          {" · "}
          {weeks.length} semaines · {totalKm} km
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div>
          <SectionHead
            title="Volume planifié"
            note={`${plan.startWeeklyKm} → ${plan.targetPeakKm} km/sem · la barre sombre indique le réalisé`}
          />
          <VolumeCurve weeks={curve} actual={actualMap} />
        </div>

        <div className="space-y-5">
          {feasibility ? (
            <FeasibilityPanel f={feasibility} />
          ) : (
            <div>
              <span className="eyebrow">Répartition</span>
              <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink2">
                {balance.easyPct} % du volume en endurance, {balance.hardPct} % en
                intensité — {balance.verdict.toLowerCase()}.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 border-t border-hair pt-4">
            <Fig label="Séances faites" value={`${doneSessions}/${pastSessions || "—"}`} />
            <Fig label="Intensité" value={`${balance.hardPct} %`} note={balance.verdict} />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------ Composition */}
      <Section title="Composition du plan" note="Nombre de séances par type sur toute la durée">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[...kindTotals.entries()]
            .sort((a, b) => b[1].count - a[1].count)
            .map(([kind, v]) => (
              <div key={kind} className="border-t border-hair pt-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[0.8125rem] text-ink2">
                    {KIND_LABELS[kind as SessionKind] ?? kind}
                  </span>
                  <span className="font-mono text-micro tabular-nums text-ink3">
                    {v.count}
                  </span>
                </div>
                <div className="mt-1.5">
                  <Bar
                    value={v.count}
                    max={Math.max(...[...kindTotals.values()].map((x) => x.count))}
                    height={2}
                    tone="rgb(var(--clay))"
                  />
                </div>
                {v.km > 0 && (
                  <div className="mt-1 text-micro text-ink3">{round(v.km, 0)} km</div>
                )}
              </div>
            ))}
        </div>
      </Section>

      {/* ------------------------------------------------ Semaines */}
      <Section
        title="Semaine par semaine"
        note="Clique une semaine pour voir le détail des séances et les modifier"
      >
        <WeekAccordion weeks={weeks} />
      </Section>

      {/* ------------------------------------------------ Historique ressentis */}
      {plan.checkins.length > 0 && (
        <Section title="Historique des ressentis" note="Ce qui a modifié le plan">
          <table className="data-table">
            <thead>
              <tr>
                <th>Semaine</th>
                <th className="text-right">Douleur</th>
                <th className="text-right">Fatigue</th>
                <th className="text-right">Motivation</th>
                <th>Ajustement</th>
              </tr>
            </thead>
            <tbody>
              {plan.checkins.map((c) => {
                const applied = c.applied ? JSON.parse(c.applied) : null;
                return (
                  <tr key={c.id}>
                    <td className="whitespace-nowrap text-ink2">{fmtDateShort(c.weekStart)}</td>
                    <td className="text-right font-mono tabular-nums">
                      <span className={c.painLevel > 0 ? "text-ochre" : "text-ink3"}>
                        {c.painLevel}/3
                      </span>
                      {c.painArea && <span className="ml-1.5 text-micro text-ink3">{c.painArea}</span>}
                    </td>
                    <td className="text-right font-mono tabular-nums text-ink2">{c.fatigue}/5</td>
                    <td className="text-right font-mono tabular-nums text-ink2">{c.motivation}/5</td>
                    <td className="text-[0.8125rem] text-ink2">
                      {applied?.headline ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      )}

      {/* ------------------------------------------------ Réglages */}
      <Section title="Réglages du plan" note="Toute modification régénère les semaines à venir">
        <PlanSettings
          plan={{
            id: plan.id,
            daysPerWeek: plan.daysPerWeek,
            longRunDay: plan.longRunDay,
            strengthPerWeek: plan.strengthPerWeek,
            ceilingKm: plan.ceilingKm,
            horizonWeeks: plan.horizonWeeks,
            autoAdapt: plan.autoAdapt,
            status: plan.status,
            mode: plan.mode,
          }}
        />
      </Section>

      <p className="text-micro text-ink3">
        Phase actuelle :{" "}
        {PHASE_LABELS[(weeks.find((w) => w.isCurrent)?.phase as Phase) ?? "base"]}
      </p>
    </div>
  );
}

function Fig({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mt-1.5 font-mono text-lg font-medium tabular-nums">{value}</div>
      {note && <div className="mt-0.5 text-micro text-ink3">{note}</div>}
    </div>
  );
}
