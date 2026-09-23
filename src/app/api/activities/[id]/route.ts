import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authed, notFound } from "@/lib/api";

export const dynamic = "force-dynamic";

const Patch = z.object({
  privateNote: z.string().max(4000).nullable().optional(),
  perceivedExertion: z.number().int().min(1).max(10).nullable().optional(),
  feeling: z.number().int().min(1).max(5).nullable().optional(),
  isRace: z.boolean().optional(),
});

/**
 * Annotations d'une activité : ressenti, note personnelle, drapeau course. Rien de ce qui vient de Strava (distance, temps…) n'est éditable
 * ici : la synchro en reste la source.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId, error } = await authed();
  if (error) return error;

  const owned = await prisma.activity.findFirst({ where: { id, userId }, select: { id: true } });
  if (!owned) return notFound("Activité introuvable");

  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Données invalides" }, { status: 400 });
  }
  const body = parsed.data;
  const data: Record<string, unknown> = {};
  if (body.privateNote !== undefined) data.privateNote = body.privateNote?.trim() || null;
  if (body.perceivedExertion !== undefined) data.perceivedExertion = body.perceivedExertion;
  if (body.feeling !== undefined) data.feeling = body.feeling;
  if (body.isRace !== undefined) {
    data.isRace = body.isRace;
    data.raceLocked = true;
  }
  await prisma.activity.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}
