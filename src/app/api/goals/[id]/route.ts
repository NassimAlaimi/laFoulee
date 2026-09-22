import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, notFound } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId, error } = await authed();
  if (error) return error;

  // deleteMany avec le userId : supprimer l'objectif d'un autre est impossible,
  // et la réponse ne dit pas si l'identifiant existait.
  await prisma.raceGoal.deleteMany({ where: { id, userId } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId, error } = await authed();
  if (error) return error;

  const body = await req.json();
  const owned = await prisma.raceGoal.findFirst({ where: { id, userId }, select: { id: true } });
  if (!owned) return notFound("Objectif introuvable");

  const goal = await prisma.raceGoal.update({
    where: { id },
    data: {
      ...(body.resultTime !== undefined ? { resultTime: body.resultTime } : {}),
      ...(body.status ? { status: body.status } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    },
  });

  return NextResponse.json({ ok: true, goal });
}
