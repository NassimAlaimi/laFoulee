import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPlan } from "@/lib/plan-store";
import { authed } from "@/lib/api";
import type { OpenFocus } from "@/lib/training";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { userId, error } = await authed();
  if (error) return error;

  const body = await req.json();

  const mode = body.mode === "race" ? "race" : "open";
  const raceGoalId = mode === "race" ? String(body.raceGoalId ?? "") : null;

  if (mode === "race" && !raceGoalId) {
    return NextResponse.json({ ok: false, error: "Objectif manquant" }, { status: 400 });
  }

  // Un seul plan actif à la fois : deux plans concurrents produiraient deux
  // charges hebdomadaires cumulées et aucune adaptation cohérente.
  if (body.replaceActive !== false) {
    await prisma.trainingPlan.updateMany({
      where: { status: "active", userId },
      data: { status: "archived" },
    });
  }

  const plan = await createPlan({
    name: String(body.name ?? "Plan").slice(0, 80) || "Plan",
    mode,
    focus: (body.focus ?? "base") as OpenFocus,
    raceGoalId,
    // 0 = automatique : le nombre de sorties suit le volume
    daysPerWeek: num(body.daysPerWeek, 0, 0, 7),
    longRunDay: num(body.longRunDay, 6, 0, 6),
    strengthPerWeek: num(body.strengthPerWeek, 1, 0, 3),
    ceilingKm: Math.max(0, Number(body.ceilingKm) || 0),
    horizonWeeks: num(body.horizonWeeks, 12, 4, 52),
    startWeeklyKm: body.startWeeklyKm ? Number(body.startWeeklyKm) : null,
    priorWeeks: Array.isArray(body.priorWeeks)
      ? body.priorWeeks
          .slice(0, 8)
          .map((v: unknown) => Math.max(0, Math.min(400, Number(v) || 0)))
      : null,
    startLongRunKm: body.startLongRunKm ? Number(body.startLongRunKm) : null,
    autoAdapt: body.autoAdapt !== false,
    userId,
  });

  return NextResponse.json({ ok: true, planId: plan.id });
}

function num(v: unknown, fallback: number, lo: number, hi: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
