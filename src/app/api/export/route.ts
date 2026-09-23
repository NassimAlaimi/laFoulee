import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Export des données de l'athlète — souveraineté des données, zéro dépendance.
 *
 * - `?format=json` (défaut) : tout (activités, objectifs, séances du plan) ;
 * - `?format=csv` : les activités en CSV, prêtes pour un tableur.
 */

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const { userId, error } = await authed();
  if (error) return error;

  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "json";

  const [activities, goals, sessions] = await Promise.all([
    prisma.activity.findMany({
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
    }),
    prisma.raceGoal.findMany({ where: { userId }, orderBy: { raceDate: "asc" } }),
    prisma.plannedSession.findMany({
      where: { plan: { userId } },
      orderBy: { date: "asc" },
      select: {
        id: true,
        date: true,
        weekNumber: true,
        weekStart: true,
        phase: true,
        kind: true,
        distanceKm: true,
        durationMin: true,
        intensity: true,
        status: true,
      },
    }),
  ]);

  if (format === "csv") {
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
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="foulee-activites.csv"',
      },
    });
  }

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    activities,
    goals,
    sessions,
  });
}
