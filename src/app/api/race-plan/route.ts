import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/api";
import { elevationProfile, parseGpx } from "@/lib/gpx";

export const dynamic = "force-dynamic";

/**
 * Plan de course — upsert par objectif.
 * Le GPX envoyé est parsé et profilé côté serveur ; le profil est stocké
 * sérialisé pour un rendu rapide. Les champs non fournis sont conservés.
 */

const RacePlanSchema = z.object({
  goalId: z.string().min(1),
  gpx: z.string().max(3_000_000).nullable().optional(),
  strategy: z.enum(["even", "negative", "positive"]).optional(),
  targetSeconds: z.number().int().min(0).max(200000).nullable().optional(),
  fuelingKm: z.number().min(0).max(20).optional(),
  fuelingNote: z.string().max(300).nullable().optional(),
});

export async function POST(req: Request) {
  const { userId, error } = await authed();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = RacePlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "entrée invalide" },
      { status: 400 }
    );
  }
  const { goalId, gpx, ...fields } = parsed.data;

  const goal = await prisma.raceGoal.findFirst({
    where: { id: goalId, userId },
    select: { id: true },
  });
  if (!goal) return NextResponse.json({ ok: false, error: "Objectif introuvable" }, { status: 404 });

  const data: Record<string, unknown> = { ...fields };
  if (gpx != null) {
    const points = parseGpx(gpx);
    if (points.length < 10) {
      return NextResponse.json(
        { ok: false, error: "Fichier GPX illisible ou trop court (10 points minimum)" },
        { status: 400 }
      );
    }
    data.gpx = gpx;
    data.profile = JSON.stringify(elevationProfile(points));
  }

  const plan = await prisma.racePlan.upsert({
    where: { goalId },
    create: { goalId, ...data },
    update: data,
  });

  return NextResponse.json({ ok: true, id: plan.id });
}

/** Supprime le plan de course de l'objectif (le GPX peut alors être remplacé). */
export async function DELETE(req: Request) {
  const { userId, error } = await authed();
  if (error) return error;
  const body = await req.json().catch(() => null);
  const goalId = typeof body?.goalId === "string" ? body.goalId : null;
  if (!goalId) return NextResponse.json({ ok: false, error: "objectif manquant" }, { status: 400 });
  const goal = await prisma.raceGoal.findFirst({ where: { id: goalId, userId }, select: { id: true } });
  if (!goal) return NextResponse.json({ ok: false, error: "Objectif introuvable" }, { status: 404 });
  await prisma.racePlan.deleteMany({ where: { goalId } });
  return NextResponse.json({ ok: true });
}
