/**
 * Import de fichiers → base. Chaque activité est rapprochée de l'existant
 * (lib/track-import `sameActivity`) : une sortie déjà venue de Strava est
 * **complétée** (courbe, splits, tracé, meilleurs efforts manquants), jamais
 * écrasée — ni le nom, ni les saisies de l'utilisateur (note, ressenti,
 * drapeau course). Les données de bien-être complètent le carnet sans
 * écraser une valeur saisie à la main.
 */

import { prisma } from "./prisma";
import { isZip, readZip } from "./zip";
import { parseTrackFile, sameActivity, toActivity, type ImportedActivity } from "./track-import";
import { extractWellness } from "./wellness-import";

export type ImportResult = {
  created: number;
  merged: number;
  skipped: number;
  failed: number;
  wellness: number;
  errors: Array<{ file: string; error: string }>;
  batchId: string;
};

const TRACK_RE = /\.(fit|gpx|tcx)$/i;
const JSON_RE = /(sleep|uds|hrv|wellness|health).*\.json$/i;

export async function importFiles(userId: string, files: Array<{ name: string; bytes: Uint8Array }>): Promise<ImportResult> {
  const res: Omit<ImportResult, "batchId"> = { created: 0, merged: 0, skipped: 0, failed: 0, wellness: 0, errors: [] };
  const entries: Array<{ name: string; bytes: Uint8Array }> = [];
  for (const f of files) {
    if (isZip(f.bytes)) {
      try {
        entries.push(...readZip(f.bytes, (n) => TRACK_RE.test(n) || JSON_RE.test(n)));
      } catch {
        res.failed++;
        res.errors.push({ file: f.name, error: "zip" });
      }
    } else entries.push(f);
  }

  const activities: Array<{ file: string; a: ImportedActivity }> = [];
  const wellness = new Map<string, ReturnType<typeof extractWellness>[number]>();
  for (const e of entries) {
    if (/\.json$/i.test(e.name)) {
      try {
        for (const d of extractWellness(JSON.parse(new TextDecoder().decode(e.bytes)))) {
          const prev = wellness.get(d.date);
          wellness.set(d.date, {
            date: d.date,
            sleepHours: d.sleepHours ?? prev?.sleepHours ?? null,
            restHr: d.restHr ?? prev?.restHr ?? null,
            hrv: d.hrv ?? prev?.hrv ?? null,
          });
        }
      } catch {
        /* JSON illisible : ignoré, ce n'était peut-être pas un fichier de bien-être */
      }
      continue;
    }
    try {
      const a = toActivity(parseTrackFile(e.bytes));
      if (a) activities.push({ file: e.name, a });
      else res.skipped++;
    } catch (err) {
      res.failed++;
      if (res.errors.length < 20) res.errors.push({ file: e.name.split("/").pop() ?? e.name, error: err instanceof Error ? err.message : "parse" });
    }
  }

  for (const { a } of activities) {
    const around = await prisma.activity.findMany({
      where: {
        userId,
        startDate: { gte: new Date(a.startDate.getTime() - 180_000), lte: new Date(a.startDate.getTime() + 180_000) },
      },
      select: {
        id: true,
        startDate: true,
        distance: true,
        polyline: true,
        totalElevation: true,
        calories: true,
        averageCadence: true,
        hrStream: { select: { activityId: true } },
        _count: { select: { splits: true, bestEfforts: true } },
      },
    });
    const twin = around.find((x) => sameActivity(x, a));
    if (twin) {
      const data: Record<string, unknown> = {};
      if (!twin.polyline && a.polyline) data.polyline = a.polyline;
      if (!twin.totalElevation && a.totalElevation) data.totalElevation = a.totalElevation;
      if (!twin.calories && a.calories) data.calories = a.calories;
      if (!twin.averageCadence && a.averageCadence) data.averageCadence = a.averageCadence;
      let changed = Object.keys(data).length > 0;
      if (changed) await prisma.activity.update({ where: { id: twin.id }, data });
      if (!twin.hrStream && a.stream) {
        await prisma.hrStream.create({ data: { activityId: twin.id, series: a.stream } });
        await prisma.activity.update({ where: { id: twin.id }, data: { hasHeartrate: true } });
        changed = true;
      }
      if (twin._count.splits === 0 && a.splits.length) {
        await prisma.split.createMany({ data: a.splits.map((s) => ({ ...s, activityId: twin.id })) });
        changed = true;
      }
      if (twin._count.bestEfforts === 0 && a.bestEfforts.length) {
        await prisma.bestEffort.createMany({ data: a.bestEfforts.map((b) => ({ ...b, activityId: twin.id })) });
        changed = true;
      }
      if (changed) res.merged++;
      else res.skipped++;
      continue;
    }
    const created = await prisma.activity.create({
      data: {
        userId,
        source: a.source,
        name: a.name,
        type: a.type,
        startDate: a.startDate,
        distance: a.distance,
        movingTime: a.movingTime,
        elapsedTime: a.elapsedTime,
        totalElevation: a.totalElevation,
        averageSpeed: a.averageSpeed,
        maxSpeed: a.maxSpeed,
        averageHr: a.averageHr,
        maxHr: a.maxHr,
        hasHeartrate: a.hasHeartrate,
        averageCadence: a.averageCadence,
        calories: a.calories,
        polyline: a.polyline,
      },
    });
    if (a.splits.length) await prisma.split.createMany({ data: a.splits.map((s) => ({ ...s, activityId: created.id })) });
    if (a.bestEfforts.length) await prisma.bestEffort.createMany({ data: a.bestEfforts.map((b) => ({ ...b, activityId: created.id })) });
    if (a.stream) await prisma.hrStream.create({ data: { activityId: created.id, series: a.stream } });
    res.created++;
  }

  // Carnet : on ne complète que les champs vides.
  for (const d of wellness.values()) {
    const [y, m, dd] = d.date.split("-").map(Number);
    const date = new Date(y, m - 1, dd);
    const existing = await prisma.dailyLog.findUnique({ where: { userId_date: { userId, date } } });
    const data: Record<string, number> = {};
    if (d.sleepHours !== null && existing?.sleepHours == null) data.sleepHours = d.sleepHours;
    if (d.restHr !== null && existing?.restHr == null) data.restHr = d.restHr;
    if (d.hrv !== null && existing?.hrv == null) data.hrv = d.hrv;
    if (!Object.keys(data).length) continue;
    if (existing) await prisma.dailyLog.update({ where: { id: existing.id }, data });
    else await prisma.dailyLog.create({ data: { userId, date, ...data } });
    res.wellness++;
  }

  const batch = await prisma.importBatch.create({
    data: {
      userId,
      files: files.map((f) => f.name).join(", ").slice(0, 500),
      created: res.created,
      merged: res.merged,
      skipped: res.skipped,
      failed: res.failed,
      wellness: res.wellness,
      errors: res.errors.length ? JSON.stringify(res.errors) : null,
    },
  });
  return { ...res, batchId: batch.id };
}
