/**
 * Accès base pour les zones : seuils personnels et séances détaillées
 * (splits + courbe à la seconde). Toutes les requêtes filtrent par `userId`.
 */

import { prisma } from "./prisma";
import { RUN_TYPES } from "./strava";
import { decodeStream } from "./cardio";
import { criticalSpeed } from "./prediction";
import { estimateThresholds, type PersonalThresholds } from "./thresholds";
import { danielsPaces } from "./vdot";
import { robustMaxHr, zoneModel, type ActivityForZones, type ZoneModel } from "./zones";
import type { PersonalRecord } from "./records";

const DAY = 86400000;

/** Seuils LT1/LT2 personnels depuis les km-splits des 180 derniers jours. */
export async function loadThresholds(
  userId: string,
  now: Date,
  records: PersonalRecord[],
  maxHr: number | null
): Promise<PersonalThresholds | null> {
  const cs = criticalSpeed(records);
  if (!cs) return null;
  const hrSplits = await prisma.split.findMany({
    where: {
      activity: { userId, startDate: { gte: new Date(now.getTime() - 180 * DAY) } },
      averageHr: { not: null },
      averageSpeed: { not: null },
    },
    orderBy: { activity: { startDate: "desc" } },
    take: 6000,
    select: { averageHr: true, averageSpeed: true },
  });
  return estimateThresholds(
    hrSplits.map((s) => ({ hr: s.averageHr!, pace: 1000 / s.averageSpeed! })),
    cs.pace,
    maxHr
  );
}

export type ZoneContext = {
  model: ZoneModel;
  maxHr: number | null;
  /** la FC max vient-elle des réglages (sinon estimée) */
  maxHrSet: boolean;
  thresholds: PersonalThresholds | null;
};

/** Modèle de zones de l'utilisateur, selon la cascade de lib/zones. */
export async function loadZoneContext(opts: {
  userId: string;
  now: Date;
  records: PersonalRecord[];
  vdot: number;
  settings: { maxHr: number | null; restHr: number | null; birthYear?: number | null } | null;
  runs: Array<{ maxHr: number | null }>;
}): Promise<ZoneContext> {
  const set = opts.settings?.maxHr ?? null;
  let maxHr = set ?? robustMaxHr(opts.runs.map((r) => r.maxHr));
  if (!maxHr && opts.settings?.birthYear) {
    maxHr = Math.round(208 - 0.7 * (opts.now.getFullYear() - opts.settings.birthYear));
  }
  const thresholds = await loadThresholds(opts.userId, opts.now, opts.records, set);
  const threshold = opts.vdot > 0 ? danielsPaces(opts.vdot).find((p) => p.key === "threshold") : null;
  const model = zoneModel({
    personal: thresholds ? { lt2Hr: thresholds.lt2Hr, lt2Pace: thresholds.lt2Pace } : null,
    maxHr,
    restHr: opts.settings?.restHr ?? null,
    vdotThresholdPace: threshold ? (threshold.pace + threshold.paceFast) / 2 : null,
  });
  return { model, maxHr, maxHrSet: set !== null, thresholds };
}

export type DetailedRun = ActivityForZones & {
  id: string;
  startDate: Date;
};

/** Courses depuis `since`, avec splits et courbe décodée. */
export async function loadDetailedRuns(
  userId: string,
  since: Date,
  opts: { streams?: boolean } = {}
): Promise<DetailedRun[]> {
  const withStreams = opts.streams ?? true;
  const list = await prisma.activity.findMany({
    where: { userId, type: { in: [...RUN_TYPES] }, startDate: { gte: since } },
    orderBy: { startDate: "asc" },
    select: {
      id: true,
      startDate: true,
      movingTime: true,
      averageHr: true,
      averageSpeed: true,
      splits: {
        orderBy: { index: "asc" },
        select: { movingTime: true, averageHr: true, averageSpeed: true },
      },
      ...(withStreams ? { hrStream: { select: { series: true } } } : {}),
    },
  });
  return list.map((a) => ({
    id: a.id,
    startDate: a.startDate,
    movingTime: a.movingTime,
    averageHr: a.averageHr,
    averageSpeed: a.averageSpeed,
    splits: a.splits,
    stream: "hrStream" in a && a.hrStream?.series ? decodeStream(a.hrStream.series as string) : null,
  }));
}
