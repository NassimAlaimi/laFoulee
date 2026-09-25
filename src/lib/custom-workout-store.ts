/**
 * Accès base des séances personnalisées. Le texte (DSL) est la source :
 * il est toujours re-analysé côté serveur, jamais la structure envoyée par
 * le client. Toutes les requêtes filtrent par `userId`.
 */

import { prisma } from "./prisma";
import { athleteContext } from "./plan-store";
import { paceSet, type PaceSet } from "./workouts";
import { inferKind, parseWorkout, summarize, toDsl, toPlanSteps, type WorkoutStep } from "./workout-dsl";
import { addDays, startOfWeek } from "./stats";

export async function userPaces(userId: string, now = new Date()): Promise<PaceSet> {
  const ctx = await athleteContext(now, userId);
  const recent = ctx.runs.slice(0, 20).filter((r) => r.averageSpeed);
  const avg = recent.length ? recent.reduce((a, r) => a + 1000 / r.averageSpeed!, 0) / recent.length : null;
  return paceSet(ctx.vdot, avg);
}

export type CustomInput = { name: string; dsl: string; notes?: string | null; favorite?: boolean };

export type Analysed =
  | { ok: true; dsl: string; steps: WorkoutStep[]; kind: string }
  | { ok: false; error: string; at: number };

export function analyse(dsl: string, paces: PaceSet): Analysed {
  const r = parseWorkout(dsl);
  if (!r.ok) return r;
  return { ok: true, dsl: toDsl(r.steps), steps: r.steps, kind: inferKind(r.steps, paces) };
}

export async function listCustom(userId: string) {
  return prisma.customWorkout.findMany({
    where: { userId },
    orderBy: [{ favorite: "desc" }, { updatedAt: "desc" }],
  });
}

/**
 * Pose une séance perso dans le plan actif, à une date : remplace la séance
 * de course non réalisée prévue ce jour-là, sinon en crée une. La séance est
 * verrouillée pour que la régénération automatique ne l'écrase pas.
 */
export async function scheduleCustom(userId: string, workoutId: string, date: Date) {
  const w = await prisma.customWorkout.findFirst({ where: { id: workoutId, userId } });
  if (!w) return { ok: false as const, error: "notFound" };
  const plan = await prisma.trainingPlan.findFirst({ where: { userId, status: "active" }, orderBy: { createdAt: "desc" } });
  if (!plan) return { ok: false as const, error: "noPlan" };

  const paces = await userPaces(userId);
  const steps = JSON.parse(w.structure) as WorkoutStep[];
  const sum = summarize(steps, paces);
  const planSteps = toPlanSteps(steps, paces);
  const work = planSteps.find((s) => s.kind === "work" || s.kind === "block");
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const weekStart = startOfWeek(day);
  const sameWeek = await prisma.plannedSession.findFirst({ where: { planId: plan.id, weekStart }, select: { weekNumber: true, phase: true } });
  const weekNumber = sameWeek?.weekNumber ?? Math.max(1, Math.floor((weekStart.getTime() - startOfWeek(plan.startDate).getTime()) / (7 * 86400000)) + 1);

  const data = {
    date: day,
    weekStart,
    weekNumber,
    phase: sameWeek?.phase ?? "base",
    kind: w.kind,
    title: w.name,
    tagline: w.dsl,
    structure: JSON.stringify(planSteps),
    distanceKm: Math.round(sum.meters / 100) / 10,
    durationMin: Math.round(sum.seconds / 60),
    paceTarget: work?.pace ?? null,
    intensity: sum.intensity,
    status: "planned",
    locked: true,
    adapted: false,
    adaptReason: null,
  };

  const existing = await prisma.plannedSession.findFirst({
    where: {
      planId: plan.id,
      date: { gte: new Date(day.getFullYear(), day.getMonth(), day.getDate()), lt: addDays(new Date(day.getFullYear(), day.getMonth(), day.getDate()), 1) },
      status: { in: ["planned", "moved"] },
      kind: { notIn: ["strength", "mobility", "rest", "cross", "race"] },
    },
  });
  const session = existing
    ? await prisma.plannedSession.update({ where: { id: existing.id }, data })
    : await prisma.plannedSession.create({ data: { ...data, planId: plan.id } });
  await prisma.customWorkout.update({ where: { id: w.id }, data: { usedCount: { increment: 1 } } });
  return { ok: true as const, sessionId: session.id, replaced: Boolean(existing), planId: plan.id };
}
