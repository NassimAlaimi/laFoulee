import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, notFound } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Mise à jour d'une séance : statut, ressenti, déplacement.
 * Toute modification manuelle pose `locked` pour que la régénération
 * automatique du plan ne l'écrase pas.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId, error } = await authed();
  if (error) return error;

  // L'appartenance d'une séance passe par son plan.
  const owned = await prisma.plannedSession.findFirst({
    where: { id, plan: { userId } },
    select: { id: true },
  });
  if (!owned) return notFound("Séance introuvable");

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (typeof body.status === "string") data.status = body.status;
  if (body.rpe !== undefined) data.rpe = body.rpe === null ? null : Number(body.rpe);
  if (body.feeling !== undefined) data.feeling = body.feeling === null ? null : Number(body.feeling);
  if (body.painLevel !== undefined) data.painLevel = Number(body.painLevel);
  if (body.painArea !== undefined) data.painArea = body.painArea || null;
  if (body.comment !== undefined) data.comment = body.comment || null;

  if (body.date) {
    data.date = new Date(body.date);
    data.status = "moved";
    data.locked = true;
  }
  if (body.locked !== undefined) data.locked = Boolean(body.locked);

  // Un ressenti saisi est une décision de l'athlète : on verrouille la séance.
  if (body.rpe !== undefined || body.painLevel !== undefined || body.status) {
    data.locked = true;
  }

  const session = await prisma.plannedSession.update({ where: { id }, data });
  return NextResponse.json({ ok: true, session });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId, error } = await authed();
  if (error) return error;

  await prisma.plannedSession.deleteMany({ where: { id, plan: { userId } } });
  return NextResponse.json({ ok: true });
}
