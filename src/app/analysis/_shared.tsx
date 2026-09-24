import Link from "next/link";
import { Hint, PageHead } from "@/components/ui/Layout";
import { PoleStrip } from "@/components/ui/PoleStrip";
import { athleteContext } from "@/lib/plan-store";
import { prisma } from "@/lib/prisma";
import { getBestEfforts, getSettings } from "@/lib/queries";
import {
  consistencyGrid,
  paceByIntensity,
  polarizationByMonth,
  polarizationSummary,
  recordTimeline,
  yearCompare,
} from "@/lib/analysis";
import { formSeries, formSummary, plannedLoad } from "@/lib/fitness-model";
import { classProgression, detectIntervals, intervalClass } from "@/lib/intervals";
import { criticalSpeed, durationCurve } from "@/lib/prediction";
import { estimateThresholds } from "@/lib/thresholds";
import { aerobicDecoupling, decodeStream, efficiencyTrend } from "@/lib/cardio";
import { trimLeadingEmpty } from "@/lib/stats";
import { RUN_TYPES } from "@/lib/strava";
import { STANDARD_DISTANCES } from "@/lib/records";
import { activityMarks } from "@/lib/race-marks";

/**
 * Chargeurs partagés du pôle Analyse, découpé en trois pages :
 * - /analysis (Forme & charge) — PMC, polarisation, régularité, cumul annuel ;
 * - /analysis/modeles (Modèles & seuils) — prédictions, VC, seuils LT1/LT2 ;
 * - /analysis/seances (Séances passées) — intervalles, dérive & efficience.
 * Chaque page est `force-dynamic` et ne charge que ce dont elle a besoin.
 */

const FOCUS_DISTANCES = ["5k", "10k", "half", "marathon"];

export const ANALYSIS_POLES = [
  { href: "/analysis", label: "Forme & charge" },
  { href: "/analysis/modeles", label: "Modèles & seuils" },
  { href: "/analysis/seances", label: "Séances passées" },
  { href: "/records", label: "Performance" },
  { href: "/calculator", label: "Calculateur" },
];

/** Bandeau de pôle : les pages du pôle Analyse, l'active soulignée. */
export function AnalysisPoleStrip({ active }: { active: string }) {
  return <PoleStrip items={ANALYSIS_POLES} active={active} />;
}

/** En-tête commun aux trois pages du pôle. */
export function AnalysisHead({ title, meta }: { title: string; meta: string }) {
  return <PageHead title={title} kicker="Analyse" meta={meta} />;
}

/** Trop peu de sorties : les modèles n'ont pas de matière — et le mode d'emploi pour y remédier. */
export function NotEnough({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <AnalysisHead title={title} meta="Modèles de performance et charge d'entraînement" />
      <AnalysisPoleStrip active="/analysis" />
      <Hint height={230}>
        <p>Il faut au moins quelques sorties pour que les modèles aient du sens.</p>
        <ol className="mt-3 space-y-2">
          {[
            {
              text: "Synchronise Strava pour importer tes activités.",
              href: "/settings",
              label: "Synchroniser",
            },
            {
              text: "Cours avec ta ceinture cardio : les seuils et la charge se calculent dessus.",
              href: null,
              label: null,
            },
            {
              text: "Un 5 km couru à fond cale ton VDOT — et toutes les allures de l'app avec.",
              href: "/workouts",
              label: "Voir la séance test",
            },
          ].map((s, i) => (
            <li key={i} className="flex items-baseline gap-2.5 text-sm text-ink2">
              <span className="font-mono text-clay">{i + 1}.</span>
              <span>
                {s.text}{" "}
                {s.href && s.label && (
                  <Link href={s.href} className="text-clay hover:underline">
                    {s.label} →
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ol>
      </Hint>
    </div>
  );
}

export async function loadForme(now: Date, userId: string) {
  const [ctx, efforts, futureSessions] = await Promise.all([
    athleteContext(now, userId),
    getBestEfforts(userId),
    prisma.plannedSession.findMany({
      where: { date: { gt: now }, status: "planned", plan: { userId, status: "active" } },
      orderBy: { date: "asc" },
      select: { date: true, distanceKm: true, durationMin: true, intensity: true, kind: true },
    }),
  ]);

  const { runs, records, profile, fitness } = ctx;
  const future = futureSessions.map((s) => ({ date: s.date, load: plannedLoad(s) }));
  const series = formSeries({ activities: runs, days: 180, future, now });
  const form = formSummary(series, now);
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
  const marks = activityMarks({ races: runs, records, now });
  const yoy = yearCompare(runs, { years: 3, now });
  const polar = trimLeadingEmpty(
    polarizationByMonth(runs, profile.vdot, { months: 8, now }),
    (r) => r.km === 0
  );
  const polarSum = polarizationSummary(runs, profile.vdot, { days: 90, now });
  const paceZones = trimLeadingEmpty(
    paceByIntensity(runs, profile.vdot, { months: 12, now }),
    (r) => r.easy == null && r.quality == null
  );
  const grid = consistencyGrid(runs, { weeks: 26, now });
  const timeline = recordTimeline(efforts).slice(0, 8);

  return { runs, form, formRows, marks, yoy, polar, polarSum, paceZones, grid, timeline, fitness };
}

export async function loadModeles(now: Date, userId: string) {
  const [ctx, settings] = await Promise.all([athleteContext(now, userId), getSettings(userId)]);
  const { runs, records, profile, endurance } = ctx;

  const cs = criticalSpeed(records);
  const curve = durationCurve(records, profile, endurance).filter((p) => p.seconds > 0);

  const predictions = STANDARD_DISTANCES.filter((d) => FOCUS_DISTANCES.includes(d.key))
    .map((d) => {
      const p = ctx.predict(d.meters);
      return p ? { ...p, name: d.name } : null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const gapRows = predictions.map((p) => ({
    name: p.name,
    potential: p.potential,
    realistic: p.realistic,
    gapPct: Math.round(((p.realistic - p.potential) / p.potential) * 1000) / 10,
  }));

  // Couples (allure, FC) de tous les km-splits récents : la matière des seuils.
  const hrSplits = await prisma.split.findMany({
    where: {
      activity: { userId, startDate: { gte: new Date(now.getTime() - 180 * 86400000) } },
      averageHr: { not: null },
      averageSpeed: { not: null },
    },
    orderBy: { activity: { startDate: "desc" } },
    take: 6000,
    select: { averageHr: true, averageSpeed: true },
  });
  const thresholds = cs
    ? estimateThresholds(
        hrSplits.map((s) => ({ hr: s.averageHr!, pace: 1000 / s.averageSpeed! })),
        cs.pace,
        settings?.maxHr ?? null
      )
    : null;

  return { runs, settings, cs, curve, predictions, gapRows, thresholds, endurance };
}

export async function loadSeances(now: Date, userId: string) {
  const intervalList = await prisma.activity
    .findMany({
      where: {
        userId,
        type: { in: [...RUN_TYPES] },
        startDate: { gte: new Date(now.getTime() - 180 * 86400000) },
      },
      orderBy: { startDate: "desc" },
      take: 80,
      select: {
        id: true,
        name: true,
        startDate: true,
        splits: { orderBy: { index: "asc" }, select: { distance: true, movingTime: true } },
      },
    })
    .then((list) =>
      list
        .map((a) => ({
          id: a.id,
          name: a.name,
          date: a.startDate,
          analysis: detectIntervals(
            a.splits.map((s) => ({ distance: s.distance, seconds: s.movingTime }))
          ),
        }))
        .filter((s) => s.analysis.detected)
    );

  const longStreams = await prisma.hrStream
    .findMany({
      where: {
        series: { not: "" },
        activity: { userId, startDate: { gte: new Date(now.getTime() - 90 * 86400000) } },
      },
      orderBy: { activity: { startDate: "desc" } },
      select: {
        series: true,
        activity: { select: { id: true, name: true, startDate: true, movingTime: true } },
      },
    })
    .then((list) =>
      list
        .map((s) => ({
          id: s.activity.id,
          name: s.activity.name,
          date: s.activity.startDate,
          movingTime: s.activity.movingTime,
          decoupling: aerobicDecoupling(decodeStream(s.series)),
        }))
        .filter((s) => s.movingTime >= 2400 && s.decoupling !== null)
    );

  const efTrend = efficiencyTrend(
    longStreams.map((s) => ({ date: s.date, efficiency: s.decoupling!.efficiency }))
  );

  return { intervalList, longStreams, efTrend, classProgression, intervalClass };
}
