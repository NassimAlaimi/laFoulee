import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Index de recherche de la palette de commandes : de quoi retrouver une
 * séance, un objectif ou un plan au clavier. Volontairement compact — la
 * palette filtre côté client, sans aller-retour par frappe.
 */
export async function GET() {
  const { userId, error } = await authed();
  if (error) return error;

  const [activities, goals, plans] = await Promise.all([
    prisma.activity.findMany({
      where: { userId },
      orderBy: { startDate: "desc" },
      take: 400,
      select: {
        id: true,
        name: true,
        type: true,
        startDate: true,
        distance: true,
        movingTime: true,
        isRace: true,
      },
    }),
    prisma.raceGoal.findMany({
      where: { userId },
      orderBy: { raceDate: "desc" },
      select: { id: true, name: true, raceDate: true, distance: true, status: true },
    }),
    prisma.trainingPlan.findMany({
      where: { userId, status: { not: "archived" } },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, status: true },
    }),
  ]);

  return NextResponse.json({
    activities: activities.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      date: a.startDate.toISOString(),
      km: Math.round(a.distance / 100) / 10,
      time: a.movingTime,
      race: a.isRace,
    })),
    goals: goals.map((g) => ({
      id: g.id,
      name: g.name,
      date: g.raceDate.toISOString(),
      km: Math.round(g.distance / 100) / 10,
      status: g.status,
    })),
    plans,
  });
}
