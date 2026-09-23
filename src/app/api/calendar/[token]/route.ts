import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildCalendar, type IcsSession } from "@/lib/ics";
import { KIND_LABELS, type SessionKind, type Step } from "@/lib/workouts";

export const dynamic = "force-dynamic";

/**
 * Flux iCalendar public, authentifié par un jeton secret dans l'URL.
 *
 * Un agenda (Google, Apple, Outlook) ne sait pas envoyer de cookie : l'URL est
 * le seul secret possible. Le jeton est aléatoire (32 octets), révocable et
 * régénérable depuis les réglages, et n'ouvre qu'une lecture du plan.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/, "");
  if (token.length < 20) return new Response("Introuvable", { status: 404 });

  const user = await prisma.user.findUnique({
    where: { calendarToken: token },
    select: { id: true, firstname: true },
  });
  if (!user) return new Response("Introuvable", { status: 404 });

  const since = new Date();
  since.setDate(since.getDate() - 21);
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";

  const [sessions, races] = await Promise.all([
    prisma.plannedSession.findMany({
      where: { date: { gte: since }, kind: { not: "rest" }, plan: { userId: user.id, status: "active" } },
      orderBy: { date: "asc" },
      select: {
        id: true,
        date: true,
        title: true,
        kind: true,
        tagline: true,
        distanceKm: true,
        durationMin: true,
        paceTarget: true,
        status: true,
        structure: true,
        planId: true,
      },
    }),
    prisma.raceGoal.findMany({
      where: { userId: user.id, status: "upcoming", raceDate: { gte: since } },
      select: { id: true, name: true, raceDate: true, distance: true, targetTime: true },
    }),
  ]);

  const ics = buildCalendar({
    name: "Foulée · entraînement",
    sessions: sessions.map(
      (s): IcsSession => ({
        id: s.id,
        date: s.date,
        title: s.title,
        kindLabel: KIND_LABELS[s.kind as SessionKind] ?? s.kind,
        tagline: s.tagline,
        distanceKm: s.distanceKm,
        durationMin: s.durationMin,
        paceTarget: s.paceTarget,
        status: s.status,
        steps: safeSteps(s.structure),
        url: base ? `${base}/training/${s.planId}` : undefined,
      })
    ),
    races: races.map((r) => ({
      id: r.id,
      name: r.name,
      date: r.raceDate,
      distanceKm: Math.round(r.distance / 100) / 10,
      targetTime: r.targetTime,
      url: base ? `${base}/goals/${r.id}` : undefined,
    })),
  });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="foulee.ics"',
      "Cache-Control": "private, max-age=900",
    },
  });
}

function safeSteps(structure: string | null): Step[] {
  if (!structure) return [];
  try {
    const v = JSON.parse(structure);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
