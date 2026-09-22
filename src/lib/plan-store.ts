/**
 * Persistance des plans d'entraînement.
 *
 * Le moteur (`training.ts`) est pur ; ce module fait la jonction avec la base :
 * création, régénération après réadaptation, rattachement des activités
 * réalisées aux séances planifiées.
 *
 * Règle importante : la régénération **ne touche jamais au passé**, ni aux
 * séances marquées `locked` (déplacées ou modifiées à la main). Un plan qui
 * réécrirait l'historique rendrait toute analyse d'assiduité fausse.
 */

import { prisma } from "./prisma";
import { fitnessProfile, personalRecords } from "./records";
import type { FitnessProfile, PersonalRecord } from "./records";
import { getBestEfforts, getRuns } from "./queries";
import { requireUserId } from "./auth";
import {
  enduranceIndex,
  racePrediction,
  type EnduranceIndex,
  type RacePrediction,
} from "./prediction";
import {
  acwrSeries,
  addDays,
  daysBetween,
  round,
  startOfWeek,
  type ActivityLike,
} from "./stats";
import {
  assessFeasibility,
  buildBlueprint,
  currentFitness,
  FOCUS_PRESETS,
  planAdaptation,
  startFromPriorWeeks,
  targetPeakFor,
  volumeTargetFor,
  weekCompliance,
  type Adaptation,
  type Checkin,
  type CurrentFitness,
  type Feasibility,
  type OpenFocus,
  type PlannedSessionSpec,
} from "./training";
import { isRun, type SessionKind } from "./workouts";

export type PlanRow = Awaited<ReturnType<typeof prisma.trainingPlan.findFirst>>;

// ---------------------------------------------------------------- Contexte

export type AthleteContext = {
  fitness: CurrentFitness;
  vdot: number;
  runs: ActivityLike[];
  acwr: number | null;
  records: PersonalRecord[];
  profile: FitnessProfile;
  endurance: EnduranceIndex;
  /**
   * Prédiction pour une distance quelconque, calculée avec le MÊME contexte
   * partout. C'est ce qui garantit que la page Objectif, la page Performance
   * et le plan annoncent le même chrono.
   */
  predict: (meters: number) => RacePrediction | null;
};

/** Photographie complète de l'athlète, partagée par toutes les pages. */
export async function athleteContext(
  now = new Date(),
  userId?: string
): Promise<AthleteContext> {
  const uid = userId ?? (await requireUserId());
  const [runs, efforts] = await Promise.all([getRuns(undefined, uid), getBestEfforts(uid)]);
  const records = personalRecords(efforts, runs);
  const profile = fitnessProfile(records, 365, now);
  const fitness = currentFitness(runs, now);
  const endurance = enduranceIndex(records, profile.vdot);

  const load = acwrSeries(runs, 35, now);
  const lastReady = [...load].reverse().find((p) => p.ready);

  const predict = (meters: number) =>
    racePrediction(meters, {
      records,
      profile,
      weeklyKm: fitness.weeklyKm,
      longestRunKm: fitness.longestRunKm,
      endurance,
    });

  return {
    fitness,
    vdot: profile.vdot > 0 ? profile.vdot : 0,
    runs,
    acwr: lastReady ? lastReady.ratio : null,
    records,
    profile,
    endurance,
    predict,
  };
}

// ---------------------------------------------------------------- Création

export type CreatePlanInput = {
  name: string;
  mode: "race" | "open";
  focus: OpenFocus;
  raceGoalId?: string | null;
  daysPerWeek: number;
  longRunDay: number;
  strengthPerWeek: number;
  ceilingKm: number;
  horizonWeeks: number;
  startWeeklyKm?: number | null;
  /** Charge déclarée des 4 semaines précédentes [S-4 … S-1], en km */
  priorWeeks?: number[] | null;
  /** Sortie la plus longue récente (km), déclarée par l'athlète */
  startLongRunKm?: number | null;
  autoAdapt: boolean;
  now?: Date;
  /** Propriétaire du plan. Par défaut, l'utilisateur de la session. */
  userId?: string;
};

export async function createPlan(input: CreatePlanInput) {
  const now = input.now ?? new Date();
  const userId = input.userId ?? (await requireUserId());
  const ctx = await athleteContext(now, userId);
  const startMonday = addDays(startOfWeek(now), 7);

  // L'objectif doit appartenir à l'utilisateur : sinon on pourrait bâtir un
  // plan sur la course de quelqu'un d'autre en devinant son identifiant.
  const goal = input.raceGoalId
    ? await prisma.raceGoal.findFirst({ where: { id: input.raceGoalId, userId } })
    : null;

  const prior = (input.priorWeeks ?? []).filter((n) => Number.isFinite(n));
  const declared = prior.length ? startFromPriorWeeks(prior) : null;

  const startWeeklyKm =
    input.startWeeklyKm && input.startWeeklyKm > 0
      ? input.startWeeklyKm
      : declared ??
        Math.max(8, ctx.fitness.weeklyKm || ctx.fitness.weeklyKm4w || 15);

  const startLongRunKm =
    input.startLongRunKm && input.startLongRunKm > 0
      ? input.startLongRunKm
      : ctx.fitness.longestRunKm;

  // La charge déclarée prime sur Strava : l'historique importé peut être
  // incomplet (course sur tapis, montre non synchro, reprise après blessure).
  const fitness: CurrentFitness = {
    ...ctx.fitness,
    weeklyKm: startWeeklyKm,
    weeklyKm4w: prior.length
      ? round(prior.reduce((a, b) => a + b, 0) / prior.length, 1)
      : ctx.fitness.weeklyKm4w,
    weeklyHistory: prior.length ? prior : ctx.fitness.weeklyHistory,
    longestRunKm: startLongRunKm,
  };

  let weeks: number;
  let targetPeakKm: number;
  let feasibility: Feasibility | null = null;
  let raceKm: number | null = null;
  let endDate: Date | null = null;

  if (goal) {
    raceKm = goal.distance / 1000;
    weeks = Math.max(2, Math.ceil(daysBetween(startMonday, goal.raceDate) / 7));
    endDate = goal.raceDate;
    feasibility = assessFeasibility({
      raceKm,
      raceDate: goal.raceDate,
      fitness,
      now,
      ceilingKm: input.ceilingKm,
    });
    // Le pic visé tient compte du temps disponible : plancher de la distance
    // quand la course est proche, volume de performance quand il y a la place.
    targetPeakKm = targetPeakFor(feasibility, startWeeklyKm);
  } else {
    const preset = FOCUS_PRESETS[input.focus] ?? FOCUS_PRESETS.base;
    weeks = Math.max(4, input.horizonWeeks);
    targetPeakKm =
      input.ceilingKm > 0
        ? input.ceilingKm
        : round(startWeeklyKm * preset.ceilingFactor, 0);
    endDate = addDays(startMonday, weeks * 7 - 1);
  }

  const blueprint = buildBlueprint({
    mode: input.mode,
    focus: input.focus,
    startMonday,
    weeks,
    startWeeklyKm,
    targetPeakKm,
    daysPerWeek: input.daysPerWeek,
    longRunDay: input.longRunDay,
    strengthPerWeek: input.strengthPerWeek,
    ceilingKm: input.ceilingKm,
    vdot: ctx.vdot,
    fallbackPace: ctx.fitness.avgPace,
    raceKm,
    raceDate: goal?.raceDate ?? null,
    racePace:
      goal?.targetTime && goal.distance > 0
        ? (goal.targetTime / goal.distance) * 1000
        : null,
    raceName: goal?.name ?? null,
    observedSessionsPerWeek: ctx.fitness.sessionsPerWeek,
    currentLongRunKm: startLongRunKm,
  });

  const plan = await prisma.trainingPlan.create({
    data: {
      userId,
      name: input.name,
      mode: input.mode,
      focus: input.focus,
      raceGoalId: goal?.id ?? null,
      startDate: startMonday,
      endDate,
      horizonWeeks: weeks,
      daysPerWeek: input.daysPerWeek,
      longRunDay: input.longRunDay,
      strengthPerWeek: input.strengthPerWeek,
      startWeeklyKm: round(startWeeklyKm, 1),
      startLongRunKm: round(startLongRunKm, 1),
      priorLoad: prior.length ? JSON.stringify(prior) : null,
      targetPeakKm: round(blueprint.peakKm, 1),
      ceilingKm: input.ceilingKm,
      autoAdapt: input.autoAdapt,
      status: "active",
      feasibility: feasibility ? JSON.stringify(feasibility) : null,
    },
  });

  await persistSessions(plan.id, blueprint.sessions);

  // Les préférences servent de valeurs par défaut au prochain plan.
  await prisma.settings.upsert({
    where: { userId },
    create: {
      userId,
      daysPerWeek: input.daysPerWeek,
      longRunDay: input.longRunDay,
      ceilingKm: input.ceilingKm,
    },
    update: {
      daysPerWeek: input.daysPerWeek,
      longRunDay: input.longRunDay,
      ceilingKm: input.ceilingKm,
    },
  });

  return plan;
}

async function persistSessions(planId: string, specs: PlannedSessionSpec[]) {
  if (specs.length === 0) return;
  await prisma.plannedSession.createMany({
    data: specs.map((s) => ({
      planId,
      date: s.date,
      weekStart: s.weekStart,
      weekNumber: s.weekNumber,
      phase: s.phase,
      kind: s.kind,
      title: s.title,
      tagline: s.tagline,
      structure: JSON.stringify(s.steps),
      distanceKm: s.km,
      durationMin: s.minutes,
      paceTarget: s.paceTarget,
      paceFast: s.paceFast,
      intensity: s.intensity,
      adapted: s.adapted,
      adaptReason: s.adaptReason,
    })),
  });
}

// ---------------------------------------------------------------- Régénération

/**
 * Régénère les séances à venir d'un plan, en tenant compte d'une éventuelle
 * adaptation. Le passé et les séances verrouillées sont préservés.
 *
 * Le volume de départ de la régénération est le **volume réel récent**, pas
 * celui prévu à l'origine : si les trois dernières semaines ont été à 25 km au
 * lieu des 40 planifiés, repartir de 40 serait absurde.
 */
export async function regeneratePlan(
  planId: string,
  opts: {
    adaptation?: Adaptation | null;
    now?: Date;
    fromMonday?: Date;
    userId?: string;
  } = {}
) {
  const now = opts.now ?? new Date();
  const userId = opts.userId ?? (await requireUserId());
  const plan = await prisma.trainingPlan.findFirst({
    where: { id: planId, userId },
    include: { raceGoal: true },
  });
  if (!plan) return null;

  const from = opts.fromMonday ?? startOfWeek(now);
  const ctx = await athleteContext(now, plan.userId);

  const remainingWeeks =
    plan.mode === "race" && plan.raceGoal
      ? Math.max(1, Math.ceil(daysBetween(from, plan.raceGoal.raceDate) / 7))
      : plan.horizonWeeks;

  // Point de départ = réalité observée, recalée sur le plan si l'athlète a
  // plutôt sur-réalisé.
  const observed = ctx.fitness.weeklyKm;
  const lastPlanned = await prisma.plannedSession.aggregate({
    where: { planId, weekStart: addDays(from, -7) },
    _sum: { distanceKm: true },
  });
  const plannedLast = lastPlanned._sum.distanceKm ?? 0;
  const startKm = Math.max(
    8,
    observed > 0 ? Math.min(Math.max(observed, plannedLast * 0.8), plannedLast * 1.15 || observed) : plannedLast
  );

  const raceKm = plan.raceGoal ? plan.raceGoal.distance / 1000 : null;

  const targetPeak =
    plan.mode === "race" && raceKm
      ? Math.max(plan.targetPeakKm, startKm * 1.05)
      : plan.ceilingKm > 0
        ? plan.ceilingKm
        : plan.targetPeakKm;

  const blueprint = buildBlueprint({
    mode: plan.mode as "race" | "open",
    focus: plan.focus as OpenFocus,
    startMonday: from,
    weeks: remainingWeeks,
    startWeeklyKm: round(startKm, 1),
    targetPeakKm: targetPeak,
    daysPerWeek: plan.daysPerWeek,
    longRunDay: plan.longRunDay,
    strengthPerWeek: plan.strengthPerWeek,
    ceilingKm: plan.ceilingKm,
    vdot: ctx.vdot,
    fallbackPace: ctx.fitness.avgPace,
    raceKm,
    raceDate: plan.raceGoal?.raceDate ?? null,
    racePace:
      plan.raceGoal?.targetTime && plan.raceGoal.distance > 0
        ? (plan.raceGoal.targetTime / plan.raceGoal.distance) * 1000
        : null,
    raceName: plan.raceGoal?.name ?? null,
    observedSessionsPerWeek: ctx.fitness.sessionsPerWeek,
    currentLongRunKm: Math.max(
      ctx.fitness.longestRunKm,
      plan.startLongRunKm ?? 0
    ),
    adaptation: opts.adaptation ?? null,
  });

  // Décalage des numéros de semaine pour rester continu avec le passé
  const offset = Math.max(0, Math.round(daysBetween(plan.startDate, from) / 7));

  // On ne réécrit jamais un jour déjà passé, même à l'intérieur de la semaine
  // en cours : ce qui a été couru lundi reste ce qui a été couru lundi.
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const cutoff = from > today ? from : today;

  await prisma.plannedSession.deleteMany({
    where: { planId, date: { gte: cutoff }, locked: false, status: "planned" },
  });

  const existing = await prisma.plannedSession.findMany({
    where: { planId, date: { gte: cutoff } },
    select: { date: true },
  });
  const taken = new Set(existing.map((e) => dayKey(e.date)));

  await persistSessions(
    planId,
    blueprint.sessions
      .filter((s) => s.date >= cutoff && !taken.has(dayKey(s.date)))
      .map((s) => ({ ...s, weekNumber: s.weekNumber + offset }))
  );

  await prisma.trainingPlan.update({
    where: { id: planId },
    data: { targetPeakKm: round(Math.max(plan.targetPeakKm, blueprint.peakKm), 1) },
  });

  return blueprint;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// ---------------------------------------------------------------- Check-in

/**
 * Enregistre le ressenti de la semaine, calcule l'ajustement et régénère
 * les semaines à venir. Renvoie l'adaptation appliquée pour l'afficher.
 */
export async function submitCheckin(
  planId: string,
  checkin: Checkin,
  now = new Date(),
  userId?: string
): Promise<Adaptation | null> {
  const uid = userId ?? (await requireUserId());
  const plan = await prisma.trainingPlan.findFirst({ where: { id: planId, userId: uid } });
  if (!plan) return null;

  const thisMonday = startOfWeek(now);
  const lastMonday = addDays(thisMonday, -7);

  const ctx = await athleteContext(now, uid);
  const compliance = await weekComplianceFor(planId, lastMonday, ctx.runs);
  const painFlags = await prisma.plannedSession.count({
    where: { planId, date: { gte: addDays(now, -10) }, painLevel: { gte: 1 } },
  });

  const adaptation = planAdaptation({
    checkin,
    compliance: compliance.sessionsPlanned > 0 ? compliance.ratio : null,
    acwr: ctx.acwr,
    recentPainFlags: painFlags,
  });

  await prisma.weekCheckin.upsert({
    where: { planId_weekStart: { planId, weekStart: thisMonday } },
    create: {
      planId,
      weekStart: thisMonday,
      painLevel: checkin.painLevel,
      painArea: checkin.painArea ?? null,
      fatigue: checkin.fatigue,
      motivation: checkin.motivation,
      sleep: checkin.sleep,
      availableDays: checkin.availableDays ?? null,
      applied: JSON.stringify(adaptation),
    },
    update: {
      painLevel: checkin.painLevel,
      painArea: checkin.painArea ?? null,
      fatigue: checkin.fatigue,
      motivation: checkin.motivation,
      sleep: checkin.sleep,
      availableDays: checkin.availableDays ?? null,
      applied: JSON.stringify(adaptation),
    },
  });

  if (plan.autoAdapt) {
    await regeneratePlan(planId, {
      adaptation,
      now,
      fromMonday: thisMonday,
      userId: uid,
    });
  }

  return adaptation;
}

// ---------------------------------------------------------------- Assiduité

/** Kilomètres réellement courus sur une semaine. */
export function actualKmForWeek(runs: ActivityLike[], monday: Date): number {
  const end = addDays(monday, 7);
  return round(
    runs
      .filter((r) => r.startDate >= monday && r.startDate < end)
      .reduce((a, r) => a + r.distance, 0) / 1000,
    1
  );
}

export async function weekComplianceFor(
  planId: string,
  monday: Date,
  runs: ActivityLike[]
) {
  const sessions = await prisma.plannedSession.findMany({
    where: { planId, weekStart: monday },
    select: { distanceKm: true, status: true, kind: true },
  });
  return weekCompliance(sessions, actualKmForWeek(runs, monday));
}

// ---------------------------------------------------------------- Rattachement

/**
 * Rattache automatiquement les activités réalisées aux séances planifiées
 * du même jour. Appelé après une synchro Strava et à l'affichage.
 *
 * On ne devine pas au-delà du jour : rattacher une sortie du mardi à la séance
 * du jeudi produirait des statistiques d'assiduité fantaisistes.
 */
export async function linkActivities(
  planId: string,
  now = new Date(),
  userId?: string
) {
  const uid = userId ?? (await requireUserId());
  const owned = await prisma.trainingPlan.count({ where: { id: planId, userId: uid } });
  if (owned === 0) return 0;

  const sessions = await prisma.plannedSession.findMany({
    where: {
      planId,
      activityId: null,
      status: { in: ["planned", "done"] },
      date: { lte: addDays(now, 1), gte: addDays(now, -120) },
    },
  });
  if (sessions.length === 0) return 0;

  let linked = 0;
  for (const s of sessions) {
    if (!isRun(s.kind as SessionKind)) continue;
    const dayStart = new Date(s.date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = addDays(dayStart, 1);

    const activity = await prisma.activity.findFirst({
      where: {
        userId: uid,
        startDate: { gte: dayStart, lt: dayEnd },
        distance: { gt: 500 },
        plannedSession: { is: null },
      },
      orderBy: { distance: "desc" },
      select: { id: true },
    });
    if (!activity) continue;

    await prisma.plannedSession.update({
      where: { id: s.id },
      data: { activityId: activity.id, status: "done" },
    });
    linked++;
  }

  // Les séances passées jamais réalisées basculent en « manquée »
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  await prisma.plannedSession.updateMany({
    where: { planId, date: { lt: cutoff }, status: "planned", activityId: null },
    data: { status: "skipped" },
  });

  return linked;
}

// ---------------------------------------------------------------- Lecture

export async function getActivePlan(userId?: string) {
  return prisma.trainingPlan.findFirst({
    where: { status: "active", userId: userId ?? (await requireUserId()) },
    orderBy: { createdAt: "desc" },
    include: { raceGoal: true },
  });
}

export async function getPlanWeek(planId: string, monday: Date, userId?: string) {
  const uid = userId ?? (await requireUserId());
  return prisma.plannedSession.findMany({
    where: { planId, weekStart: monday, plan: { userId: uid } },
    orderBy: { date: "asc" },
    include: { activity: { select: { id: true, name: true, distance: true, movingTime: true, averageHr: true } } },
  });
}

/**
 * Charge un plan en vérifiant qu'il appartient bien à l'utilisateur.
 * Renvoie null plutôt que de lever : les appelants répondent 404, ce qui ne
 * révèle pas l'existence du plan d'un autre.
 */
export async function getOwnedPlan(planId: string, userId?: string) {
  return prisma.trainingPlan.findFirst({
    where: { id: planId, userId: userId ?? (await requireUserId()) },
    include: { raceGoal: true },
  });
}

/** Séance appartenant à l'utilisateur, via son plan. */
export async function getOwnedSession(sessionId: string, userId?: string) {
  return prisma.plannedSession.findFirst({
    where: { id: sessionId, plan: { userId: userId ?? (await requireUserId()) } },
  });
}

export function parseFeasibility(raw: string | null): Feasibility | null {
  if (!raw) return null;
  try {
    const f = JSON.parse(raw) as Feasibility;
    return {
      ...f,
      comfortableDate: f.comfortableDate ? new Date(f.comfortableDate) : null,
    };
  } catch {
    return null;
  }
}

export function parseAdaptation(raw: string | null): Adaptation | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Adaptation;
  } catch {
    return null;
  }
}

/** Cible de volume pour une distance, exposée aux pages. */
export { volumeTargetFor };
