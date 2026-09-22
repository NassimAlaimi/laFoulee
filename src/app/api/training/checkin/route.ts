import { NextRequest, NextResponse } from "next/server";
import { submitCheckin } from "@/lib/plan-store";
import { authed, notFound } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Point hebdomadaire → adaptation du plan. */
export async function POST(req: NextRequest) {
  const { userId, error } = await authed();
  if (error) return error;

  const body = await req.json();
  const planId = String(body.planId ?? "");
  if (!planId) return NextResponse.json({ ok: false, error: "planId manquant" }, { status: 400 });

  const adaptation = await submitCheckin(planId, {
    painLevel: clampInt(body.painLevel, 0, 3, 0),
    painArea: body.painArea || null,
    fatigue: clampInt(body.fatigue, 1, 5, 3),
    motivation: clampInt(body.motivation, 1, 5, 3),
    sleep: clampInt(body.sleep, 1, 5, 3),
    availableDays: body.availableDays ? clampInt(body.availableDays, 2, 7, 4) : null,
  }, new Date(), userId);

  // submitCheckin renvoie null quand le plan n'existe pas ou n'est pas à nous.
  if (!adaptation) return notFound("Plan introuvable");

  return NextResponse.json({ ok: true, adaptation });
}

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
