/**
 * Migration mono-utilisateur → multi-utilisateur.
 *
 * Lit une sauvegarde de l'ancienne base (schéma sans `User`) et réinjecte tout
 * dans la base courante en rattachant chaque ligne à un utilisateur unique,
 * créé depuis le `StravaAccount` existant.
 *
 *   pnpm db:migrate-users [chemin/vers/backup.db]
 *
 * Le script est idempotent : relancé, il ne duplique rien (il s'arrête si des
 * activités existent déjà pour cet utilisateur).
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const backupPath = resolve(
  process.argv[2] ?? "prisma/backup-pre-multiuser.db"
);

if (!existsSync(backupPath)) {
  console.error(`Sauvegarde introuvable : ${backupPath}`);
  console.error("Usage : pnpm db:migrate-users [chemin/vers/backup.db]");
  process.exit(1);
}

const db = new DatabaseSync(backupPath, { readOnly: true });

/** Les tables de l'ancien schéma ne sont pas toutes garanties présentes. */
function table(name: string): Record<string, unknown>[] {
  try {
    return db.prepare(`SELECT * FROM ${name}`).all() as Record<string, unknown>[];
  } catch {
    return [];
  }
}

const n = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);
const s = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);
const b = (v: unknown): boolean => Boolean(Number(v ?? 0));
/** SQLite stocke les DateTime Prisma en millisecondes epoch. */
const d = (v: unknown): Date | null =>
  v === null || v === undefined ? null : new Date(Number(v));

async function main() {
  const accounts = table("StravaAccount");
  if (accounts.length === 0) {
    console.error(
      "Aucun StravaAccount dans la sauvegarde : impossible de savoir à qui appartiennent les données."
    );
    process.exit(1);
  }
  if (accounts.length > 1) {
    console.error(
      `${accounts.length} comptes Strava trouvés — l'ancien schéma n'en prévoyait qu'un. Abandon.`
    );
    process.exit(1);
  }

  const acc = accounts[0];
  const athleteId = BigInt(String(acc.athleteId));

  // -------------------------------------------------------------- Utilisateur
  const existing = await prisma.user.findUnique({ where: { athleteId } });
  const user =
    existing ??
    (await prisma.user.create({
      data: {
        athleteId,
        firstname: s(acc.firstname),
        lastname: s(acc.lastname),
        avatarUrl: s(acc.profileUrl),
        // Le propriétaire des données historiques est l'administrateur.
        role: "admin",
        settings: { create: {} },
      },
    }));

  const already = await prisma.activity.count({ where: { userId: user.id } });
  if (already > 0) {
    console.log(
      `${already} activités déjà présentes pour ${s(acc.firstname) ?? athleteId} — rien à faire.`
    );
    return;
  }

  console.log(
    `Utilisateur ${existing ? "existant" : "créé"} : ${s(acc.firstname) ?? ""} ${
      s(acc.lastname) ?? ""
    } (athlète ${athleteId})`
  );

  // -------------------------------------------------------------- Strava
  await prisma.stravaAccount.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      athleteId,
      firstname: s(acc.firstname),
      lastname: s(acc.lastname),
      profileUrl: s(acc.profileUrl),
      city: s(acc.city),
      country: s(acc.country),
      weightKg: n(acc.weightKg),
      accessToken: String(acc.accessToken),
      refreshToken: String(acc.refreshToken),
      expiresAt: Number(acc.expiresAt),
      scope: s(acc.scope),
      lastSyncAt: d(acc.lastSyncAt),
    },
    update: {},
  });

  // -------------------------------------------------------------- Réglages
  const settings = table("Settings")[0];
  if (settings) {
    await prisma.settings.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        maxHr: n(settings.maxHr),
        restHr: n(settings.restHr) ?? 55,
        birthYear: n(settings.birthYear),
        weightKg: n(settings.weightKg),
        vmaKmh: n(settings.vmaKmh),
        weeklyKmGoal: n(settings.weeklyKmGoal) ?? 40,
        units: s(settings.units) ?? "metric",
        daysPerWeek: n(settings.daysPerWeek) ?? 4,
        longRunDay: n(settings.longRunDay) ?? 6,
        ceilingKm: n(settings.ceilingKm) ?? 0,
      },
      update: {},
    });
  }

  // -------------------------------------------------------------- Objectifs
  // Les objectifs d'abord : les activités et les plans y font référence.
  const goals = table("RaceGoal");
  for (const g of goals) {
    await prisma.raceGoal.create({
      data: {
        id: String(g.id),
        userId: user.id,
        name: String(g.name),
        raceDate: d(g.raceDate)!,
        distance: Number(g.distance),
        targetTime: n(g.targetTime),
        targetPace: n(g.targetPace),
        elevation: n(g.elevation),
        priority: s(g.priority) ?? "A",
        status: s(g.status) ?? "upcoming",
        resultTime: n(g.resultTime),
        notes: s(g.notes),
        createdAt: d(g.createdAt) ?? new Date(),
      },
    });
  }

  // -------------------------------------------------------------- Activités
  const activities = table("Activity");
  for (const a of activities) {
    await prisma.activity.create({
      data: {
        id: String(a.id),
        userId: user.id,
        stravaId: a.stravaId === null ? null : BigInt(String(a.stravaId)),
        source: s(a.source) ?? "strava",
        name: String(a.name),
        type: String(a.type),
        sportType: s(a.sportType),
        startDate: d(a.startDate)!,
        timezone: s(a.timezone),
        distance: Number(a.distance),
        movingTime: Number(a.movingTime),
        elapsedTime: Number(a.elapsedTime),
        totalElevation: Number(a.totalElevation ?? 0),
        averageSpeed: n(a.averageSpeed),
        maxSpeed: n(a.maxSpeed),
        averageHr: n(a.averageHr),
        maxHr: n(a.maxHr),
        hasHeartrate: b(a.hasHeartrate),
        sufferScore: n(a.sufferScore),
        averageCadence: n(a.averageCadence),
        calories: n(a.calories),
        perceivedExertion: n(a.perceivedExertion),
        trainingLoad: n(a.trainingLoad),
        isRace: b(a.isRace),
        isCommute: b(a.isCommute),
        isTrainer: b(a.isTrainer),
        gearId: s(a.gearId),
        polyline: s(a.polyline),
        notes: s(a.notes),
        raceGoalId: s(a.raceGoalId),
        createdAt: d(a.createdAt) ?? new Date(),
      },
    });
  }

  const efforts = table("BestEffort");
  if (efforts.length) {
    await prisma.bestEffort.createMany({
      data: efforts.map((e) => ({
        id: String(e.id),
        activityId: String(e.activityId),
        name: String(e.name),
        distance: Number(e.distance),
        movingTime: Number(e.movingTime),
        elapsedTime: Number(e.elapsedTime),
        startDate: d(e.startDate)!,
        prRank: n(e.prRank),
      })),
    });
  }

  const splits = table("Split");
  if (splits.length) {
    await prisma.split.createMany({
      data: splits.map((sp) => ({
        id: String(sp.id),
        activityId: String(sp.activityId),
        index: Number(sp.index),
        distance: Number(sp.distance),
        movingTime: Number(sp.movingTime),
        elapsedTime: Number(sp.elapsedTime),
        elevationDiff: Number(sp.elevationDiff ?? 0),
        averageSpeed: n(sp.averageSpeed),
        averageHr: n(sp.averageHr),
      })),
    });
  }

  // -------------------------------------------------------------- Plans
  const plans = table("TrainingPlan");
  for (const p of plans) {
    await prisma.trainingPlan.create({
      data: {
        id: String(p.id),
        userId: user.id,
        name: String(p.name),
        mode: s(p.mode) ?? "open",
        focus: s(p.focus) ?? "base",
        raceGoalId: s(p.raceGoalId),
        startDate: d(p.startDate)!,
        endDate: d(p.endDate),
        horizonWeeks: n(p.horizonWeeks) ?? 8,
        daysPerWeek: n(p.daysPerWeek) ?? 0,
        longRunDay: n(p.longRunDay) ?? 6,
        strengthPerWeek: n(p.strengthPerWeek) ?? 0,
        startWeeklyKm: Number(p.startWeeklyKm),
        priorLoad: s(p.priorLoad),
        startLongRunKm: n(p.startLongRunKm),
        targetPeakKm: Number(p.targetPeakKm),
        ceilingKm: Number(p.ceilingKm ?? 0),
        rampPct: Number(p.rampPct ?? 0.08),
        autoAdapt: b(p.autoAdapt),
        status: s(p.status) ?? "active",
        notes: s(p.notes),
        feasibility: s(p.feasibility),
        createdAt: d(p.createdAt) ?? new Date(),
      },
    });
  }

  const sessions = table("PlannedSession");
  for (const ps of sessions) {
    await prisma.plannedSession.create({
      data: {
        id: String(ps.id),
        planId: String(ps.planId),
        date: d(ps.date)!,
        weekStart: d(ps.weekStart)!,
        weekNumber: Number(ps.weekNumber),
        phase: s(ps.phase) ?? "base",
        kind: String(ps.kind),
        title: String(ps.title),
        tagline: s(ps.tagline),
        structure: s(ps.structure),
        distanceKm: Number(ps.distanceKm ?? 0),
        durationMin: Number(ps.durationMin ?? 0),
        paceTarget: n(ps.paceTarget),
        paceFast: n(ps.paceFast),
        intensity: Number(ps.intensity ?? 1),
        status: s(ps.status) ?? "planned",
        rpe: n(ps.rpe),
        feeling: n(ps.feeling),
        painLevel: Number(ps.painLevel ?? 0),
        painArea: s(ps.painArea),
        comment: s(ps.comment),
        activityId: s(ps.activityId),
        adapted: b(ps.adapted),
        adaptReason: s(ps.adaptReason),
        locked: b(ps.locked),
        createdAt: d(ps.createdAt) ?? new Date(),
      },
    });
  }

  const checkins = table("WeekCheckin");
  if (checkins.length) {
    await prisma.weekCheckin.createMany({
      data: checkins.map((c) => ({
        id: String(c.id),
        planId: String(c.planId),
        weekStart: d(c.weekStart)!,
        painLevel: Number(c.painLevel ?? 0),
        painArea: s(c.painArea),
        fatigue: Number(c.fatigue ?? 3),
        motivation: Number(c.motivation ?? 3),
        sleep: Number(c.sleep ?? 3),
        availableDays: n(c.availableDays),
        note: s(c.note),
        applied: s(c.applied),
        createdAt: d(c.createdAt) ?? new Date(),
      })),
    });
  }

  const planWeeks = table("PlanWeek");
  if (planWeeks.length) {
    await prisma.planWeek.createMany({
      data: planWeeks.map((w) => ({
        id: String(w.id),
        raceGoalId: String(w.raceGoalId),
        weekStart: d(w.weekStart)!,
        weekNumber: Number(w.weekNumber),
        phase: s(w.phase) ?? "base",
        targetKm: Number(w.targetKm),
        targetSessions: Number(w.targetSessions ?? 3),
        notes: s(w.notes),
      })),
    });
  }

  // -------------------------------------------------------------- Matériel
  const gear = table("Gear");
  for (const g of gear) {
    await prisma.gear.create({
      data: {
        userId: user.id,
        // L'ancien `id` était l'identifiant Strava ; il devient `stravaGearId`.
        stravaGearId: String(g.id),
        name: String(g.name),
        brand: s(g.brand),
        model: s(g.model),
        stravaDistance: Number(g.stravaDistance ?? 0),
        retired: b(g.retired),
        retireAtKm: Number(g.retireAtKm ?? 700),
        primary: b(g.primary),
        createdAt: d(g.createdAt) ?? new Date(),
      },
    });
  }

  const logs = table("SyncLog");
  if (logs.length) {
    await prisma.syncLog.createMany({
      data: logs.map((l) => ({
        id: String(l.id),
        userId: user.id,
        startedAt: d(l.startedAt) ?? new Date(),
        finishedAt: d(l.finishedAt),
        status: s(l.status) ?? "success",
        imported: Number(l.imported ?? 0),
        updated: Number(l.updated ?? 0),
        message: s(l.message),
      })),
    });
  }

  console.log(
    [
      `  ${activities.length} activités`,
      `  ${efforts.length} efforts · ${splits.length} splits`,
      `  ${goals.length} objectifs`,
      `  ${plans.length} plans · ${sessions.length} séances · ${checkins.length} points hebdo`,
      `  ${gear.length} équipements · ${logs.length} synchros`,
    ].join("\n")
  );
  console.log("\nMigration terminée. La sauvegarde n'a pas été modifiée.");
}

try {
  await main();
} finally {
  db.close();
  await prisma.$disconnect();
}
