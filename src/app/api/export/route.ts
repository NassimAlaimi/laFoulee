import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/api";
import { csvCell } from "@/lib/csv";

export const dynamic = "force-dynamic";

/**
 * Export des données de l'athlète — souveraineté des données, zéro dépendance.
 *
 * - `?format=json` (défaut) : **tout** ce que l'instance sait de l'athlète
 *   (droit à la portabilité, RGPD art. 20) — profil, réglages, activités avec
 *   courbes, km par km et records, objectifs, plans, carnet, équipement, muscu,
 *   séances perso, parcours, nutrition, historique d'imports. Seuls les
 *   secrets (empreinte du mot de passe, jetons Strava, jeton d'agenda,
 *   sessions) et les caches techniques en sont exclus ;
 * - `?format=csv` : les activités en CSV, prêtes pour un tableur.
 */


export async function GET(req: Request) {
  const { userId, error } = await authed();
  if (error) return error;

  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "json";

  if (format === "csv") {
    const activities = await prisma.activity.findMany({
      where: { userId },
      orderBy: { startDate: "asc" },
      select: {
        id: true,
        name: true,
        type: true,
        sportType: true,
        startDate: true,
        timezone: true,
        distance: true,
        movingTime: true,
        elapsedTime: true,
        totalElevation: true,
        averageSpeed: true,
        maxSpeed: true,
        averageHr: true,
        maxHr: true,
        hasHeartrate: true,
        sufferScore: true,
        averageCadence: true,
        calories: true,
        perceivedExertion: true,
        trainingLoad: true,
        isRace: true,
        isCommute: true,
        isTrainer: true,
        gearId: true,
        polyline: true,
        notes: true,
        privateNote: true,
        feeling: true,
      },
    });

    const header = [
      "id",
      "name",
      "type",
      "date",
      "km",
      "movingTime",
      "elevation",
      "avgHr",
      "isRace",
      "feeling",
      "note",
    ];
    const rows = activities.map((a) => [
      a.id,
      a.name,
      a.type,
      a.startDate.toISOString(),
      (a.distance / 1000).toFixed(2),
      a.movingTime,
      a.totalElevation,
      a.averageHr ?? "",
      a.isRace ? "1" : "",
      a.feeling ?? "",
      a.privateNote ?? "",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map(csvCell).join(","))
      .join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="foulee-activites.csv"',
      },
    });
  }

  const everything = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      firstname: true,
      lastname: true,
      email: true,
      athleteId: true,
      language: true,
      role: true,
      createdAt: true,
      settings: true,
      activities: {
        orderBy: { startDate: "asc" },
        include: { splits: true, bestEfforts: true, hrStream: true },
      },
      raceGoals: { include: { racePlan: true, weeks: true } },
      plans: { include: { sessions: true, checkins: true } },
      gear: true,
      dailyLogs: { orderBy: { date: "asc" } },
      strengthWorkouts: { include: { sets: true } },
      strengthGoals: true,
      customWorkouts: true,
      routes: true,
      routePois: true,
      nutritionProducts: true,
      importBatches: true,
      agentBriefs: true,
    },
  });

  // BigInt (identifiants Strava) → texte : JSON ne sait pas les représenter.
  const body = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      format: "foulee-export/2",
      ...everything,
    },
    (_k, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  );
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="foulee-export.json"',
    },
  });
}
