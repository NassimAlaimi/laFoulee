import { prisma } from "./prisma";
import { RUN_TYPES, STRENGTH_TYPES } from "./strava";
import { requireUserId } from "./auth";
import type { ActivityLike } from "./stats";
import type { BestEffortLike } from "./records";

/**
 * Toutes les lectures passent par l'utilisateur courant.
 *
 * Aucune fonction de ce module n'accepte de lire « toutes » les données : le
 * `userId` est résolu ici, à partir de la session, et jamais transmis depuis
 * l'extérieur. Impossible d'oublier un filtre au niveau d'une page.
 */
async function scope(userId?: string): Promise<string> {
  return userId ?? (await requireUserId());
}

const ACTIVITY_SELECT = {
  id: true,
  name: true,
  type: true,
  startDate: true,
  distance: true,
  movingTime: true,
  elapsedTime: true,
  totalElevation: true,
  averageSpeed: true,
  maxSpeed: true,
  averageHr: true,
  maxHr: true,
  sufferScore: true,
  averageCadence: true,
  isRace: true,
} as const;

/** Toutes les courses de l'utilisateur, les plus récentes d'abord. */
export async function getRuns(limit?: number, userId?: string): Promise<ActivityLike[]> {
  return prisma.activity.findMany({
    where: { userId: await scope(userId), type: { in: [...RUN_TYPES] } },
    orderBy: { startDate: "desc" },
    ...(limit ? { take: limit } : {}),
    select: ACTIVITY_SELECT,
  });
}

export async function getStrengthSessions(
  limit?: number,
  userId?: string
): Promise<ActivityLike[]> {
  return prisma.activity.findMany({
    where: { userId: await scope(userId), type: { in: [...STRENGTH_TYPES] } },
    orderBy: { startDate: "desc" },
    ...(limit ? { take: limit } : {}),
    select: ACTIVITY_SELECT,
  });
}

export async function getBestEfforts(userId?: string): Promise<BestEffortLike[]> {
  return prisma.bestEffort.findMany({
    // Les efforts n'ont pas de userId : ils appartiennent à leur activité.
    where: { activity: { userId: await scope(userId) } },
    orderBy: { movingTime: "asc" },
    select: {
      name: true,
      distance: true,
      movingTime: true,
      startDate: true,
      activityId: true,
      activity: { select: { name: true } },
    },
  });
}

/** Réglages de l'utilisateur, créés à la volée si absents. */
export async function getSettings(userId?: string) {
  const id = await scope(userId);
  const existing = await prisma.settings.findUnique({ where: { userId: id } });
  if (existing) return existing;
  return prisma.settings.create({ data: { userId: id } });
}

export async function getStravaAccount(userId?: string) {
  return prisma.stravaAccount.findUnique({ where: { userId: await scope(userId) } });
}

export async function getLastSync(userId?: string) {
  return prisma.syncLog.findFirst({
    where: { userId: await scope(userId) },
    orderBy: { startedAt: "desc" },
  });
}
