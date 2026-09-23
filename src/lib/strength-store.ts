import { z } from "zod";
import { prisma } from "./prisma";
import { STRENGTH_TYPES } from "./strava";
import { exerciseHistories, nextSuggestion, type Block, type ExerciseMemo } from "./strength";

export const WorkoutInput = z.object({
  date: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "date invalide"),
  name: z.string().trim().min(1).max(120),
  durationMin: z.number().int().min(1).max(600).nullable().optional(),
  rpe: z.number().int().min(1).max(10).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  activityId: z.string().max(64).nullable().optional(),
  sets: z
    .array(
      z.object({
        exercise: z.string().trim().min(1).max(80),
        position: z.number().int().min(0).max(100),
        setIndex: z.number().int().min(0).max(100),
        reps: z.number().int().min(0).max(3600),
        weightKg: z.number().min(0).max(1000),
        rir: z.number().int().min(0).max(10).nullable().optional(),
        isWarmup: z.boolean().optional(),
      })
    )
    .max(300),
});

export type WorkoutInputT = z.infer<typeof WorkoutInput>;

const dayBounds = (d: Date) => {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

/**
 * Rattache une séance saisie à l'activité Strava du même jour (type
 * musculation), si l'utilisateur n'en a pas désigné une et qu'elle n'est pas
 * déjà prise. Une seule activité par séance : la contrainte est en base.
 */
export async function resolveActivity(
  userId: string,
  date: Date,
  requested: string | null | undefined,
  selfId?: string
): Promise<string | null> {
  if (requested) {
    const a = await prisma.activity.findFirst({
      where: { id: requested, userId },
      select: { id: true, strengthWorkout: { select: { id: true } } },
    });
    if (!a) return null;
    if (a.strengthWorkout && a.strengthWorkout.id !== selfId) return null;
    return a.id;
  }
  const { start, end } = dayBounds(date);
  const a = await prisma.activity.findFirst({
    where: {
      userId,
      type: { in: [...STRENGTH_TYPES] },
      startDate: { gte: start, lt: end },
      OR: [{ strengthWorkout: null }, ...(selfId ? [{ strengthWorkout: { id: selfId } }] : [])],
    },
    orderBy: { startDate: "asc" },
    select: { id: true },
  });
  return a?.id ?? null;
}

/**
 * Coche la séance « renforcement » du plan actif prévue ce jour-là : saisir sa
 * séance de muscu, c'est l'avoir faite — pas besoin de le dire deux fois.
 */
export async function tickPlannedStrength(userId: string, date: Date): Promise<boolean> {
  const { start, end } = dayBounds(date);
  const res = await prisma.plannedSession.updateMany({
    where: {
      kind: "strength",
      status: { in: ["planned", "moved"] },
      date: { gte: start, lt: end },
      plan: { userId, status: "active" },
    },
    data: { status: "done", locked: true },
  });
  return res.count > 0;
}

export async function loadWorkouts(userId: string) {
  return prisma.strengthWorkout.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    include: { sets: { orderBy: [{ position: "asc" }, { setIndex: "asc" }] } },
  });
}

type LoadedWorkout = Awaited<ReturnType<typeof loadWorkouts>>[number];

/** Mémoire par exercice pour le carnet : dernière séance, record, suggestion. */
export function buildMemo(workouts: LoadedWorkout[], excludeId?: string) {
  const hist = exerciseHistories(
    workouts
      .filter((w) => w.id !== excludeId)
      .map((w) => ({ id: w.id, date: w.date, sets: w.sets }))
  );
  const memo: Record<string, ExerciseMemo> = {};
  for (const h of hist) {
    const last = h.sessions[h.sessions.length - 1];
    memo[h.exercise] = {
      lastDate: last.date.toISOString(),
      lastSets: last.sets.map((s) => ({
        reps: s.reps,
        weightKg: s.weightKg,
        rir: s.rir ?? null,
        isWarmup: Boolean(s.isWarmup),
      })),
      bestE1rm: h.bestE1rm,
      suggestion: nextSuggestion(last.sets),
    };
  }
  return memo;
}

/** Séries regroupées par exercice, dans l'ordre de la séance. */
export function toBlocks(sets: LoadedWorkout["sets"]) {
  const blocks: Block[] = [];
  for (const s of [...sets].sort((a, b) => a.position - b.position || a.setIndex - b.setIndex)) {
    let b = blocks[blocks.length - 1];
    if (!b || b.exercise !== s.exercise) {
      b = { exercise: s.exercise, sets: [] };
      blocks.push(b);
    }
    b.sets.push({ reps: s.reps, weightKg: s.weightKg, rir: s.rir, isWarmup: s.isWarmup });
  }
  return blocks;
}
