import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { authed } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { athleteContext } from "@/lib/plan-store";
import { periodStats } from "@/lib/stats";
import { composeBrief, sanitizeBrief, BRIEF_SYSTEM } from "@/lib/agent";
import { isLlmConfigured, provider } from "@/lib/llm";
import { adviceOfTheDay } from "@/lib/coach";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function frenchAdvice(key: string): string {
  try {
    const msg = JSON.parse(readFileSync("messages/fr.json", "utf8"));
    return msg.coach.advice[key] ?? msg.coach.advice.base;
  } catch {
    return "Régularité avant tout.";
  }
}

/**
 * Brief de l'agent : bilan + semaine à venir + objectif + conseil. Calculé
 * par règles (aucun LLM requis) ; si une clé est configurée, le LLM le met
 * en forme — il ne reçoit que des agrégats, jamais de tracé ni de données
 * personnelles.
 */
export async function POST() {
  const { userId, error } = await authed();
  if (error) return error;
  const now = new Date();

  const [ctx, settings, planned, todayLog, nextRace] = await Promise.all([
    athleteContext(now, userId),
    prisma.settings.findUnique({ where: { userId } }),
    prisma.plannedSession.findMany({
      where: { plan: { userId, status: "active" }, date: { gte: now, lte: new Date(now.getTime() + 7 * 86400000) }, status: "planned" },
      orderBy: { date: "asc" },
      select: { date: true, kind: true, title: true, distanceKm: true },
    }),
    prisma.dailyLog.findFirst({ where: { userId, date: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } }),
    prisma.raceGoal.findFirst({ where: { userId, kind: "race", status: "upcoming", raceDate: { gte: now } }, orderBy: { raceDate: "asc" }, select: { name: true, raceDate: true, distance: true, racePlan: { select: { id: true } } } }),
  ]);

  const runs = ctx.runs;
  const week = periodStats(runs.filter((r) => (now.getTime() - r.startDate.getTime()) <= 7 * 86400000));
  const prevWeek = periodStats(runs.filter((r) => {
    const d = now.getTime() - r.startDate.getTime();
    return d > 7 * 86400000 && d <= 14 * 86400000;
  }));
  const easy = runs.filter((r) => (now.getTime() - r.startDate.getTime()) <= 28 * 86400000 && r.averageSpeed && r.averageHr);
  const easyShare = easy.length >= 4 ? Math.round((easy.filter((r) => (r.averageHr ?? 0) < 0.85 * (settings?.maxHr ?? 175)).length / easy.length) * 100) / 100 : 0.8;
  const advice = adviceOfTheDay({
    tsb: null,
    acwr: ctx.acwr,
    logDays: 0,
    feelingMissing: 0,
    nextRace: nextRace ? { days: Math.ceil((nextRace.raceDate.getTime() - now.getTime()) / 86400000), distanceKm: nextRace.distance / 1000, hasRacePlan: Boolean(nextRace.racePlan) } : null,
    phase: planned[0] ? (planned[0] as unknown as { phase?: string }).phase ?? null : null,
    pain: todayLog?.painLevel ?? 0,
  });

  const bestRun = [...runs].sort((a, b) => b.distance - a.distance)[0] ?? null;
  const briefCtx = {
    week: { km: Math.round(week.km), sessions: week.sessions, goalKm: Math.round(settings?.weeklyKmGoal ?? 0), easyShare },
    prevKm: Math.round(prevWeek.km),
    acwr: ctx.acwr,
    nextWeek: {
      km: Math.round(planned.reduce((a, s) => a + s.distanceKm, 0)),
      sessions: planned.length,
      key: planned.map((s) => s.title),
    },
    nextRace: nextRace ? { name: nextRace.name, days: Math.ceil((nextRace.raceDate.getTime() - now.getTime()) / 86400000), distanceKm: Math.round(nextRace.distance / 100) / 10 } : null,
    advice: frenchAdvice(advice?.key ?? "base"),
    pain: todayLog?.painLevel ?? 0,
    bestRun: bestRun && bestRun.averageSpeed ? { name: bestRun.name, distanceKm: bestRun.distance / 1000, pace: 1000 / bestRun.averageSpeed } : null,
  };

  const deterministic = composeBrief(briefCtx);
  let content = deterministic;
  let usedLlm = false;
  if (isLlmConfigured()) {
    try {
      const llm = await provider().complete(
        [
          { role: "system", content: BRIEF_SYSTEM },
          { role: "user", content: `Brief factuel :\n\n${deterministic}` },
        ],
        { maxTokens: 600 }
      );
      if (llm && llm.trim().length > 40) {
        content = sanitizeBrief(llm);
        usedLlm = true;
      }
    } catch {
      /* LLM indisponible : le brief déterministe suffit */
    }
  }

  const brief = await prisma.agentBrief.create({ data: { userId, content, usedLlm } });
  return NextResponse.json({ ok: true, id: brief.id, content, usedLlm, createdAt: brief.createdAt });
}
