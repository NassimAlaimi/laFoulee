import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { regeneratePlan } from "@/lib/plan-store";
import { authed, notFound } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId, error } = await authed();
  if (error) return error;

  const owned = await prisma.trainingPlan.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!owned) return notFound("Plan introuvable");

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.status) data.status = body.status;
  if (body.name) data.name = body.name;
  if (body.notes !== undefined) data.notes = body.notes || null;
  if (body.autoAdapt !== undefined) data.autoAdapt = Boolean(body.autoAdapt);
  // 0 = automatique
  if (body.daysPerWeek !== undefined)
    data.daysPerWeek = Math.max(0, Math.min(7, Number(body.daysPerWeek) || 0));
  if (body.longRunDay !== undefined) data.longRunDay = Number(body.longRunDay);
  if (body.strengthPerWeek !== undefined) data.strengthPerWeek = Number(body.strengthPerWeek);
  if (body.ceilingKm !== undefined) data.ceilingKm = Number(body.ceilingKm);
  if (body.horizonWeeks !== undefined) data.horizonWeeks = Number(body.horizonWeeks);

  if (Object.keys(data).length > 0) {
    await prisma.trainingPlan.update({ where: { id }, data });
  }

  // Tout changement de structure (jours, plafond, horizon) impose de refaire
  // les semaines à venir : sinon le plan affiché ne correspond plus aux réglages.
  if (
    body.regenerate ||
    body.daysPerWeek !== undefined ||
    body.longRunDay !== undefined ||
    body.strengthPerWeek !== undefined ||
    body.ceilingKm !== undefined ||
    body.horizonWeeks !== undefined
  ) {
    await regeneratePlan(id, { userId });
  }

  const plan = await prisma.trainingPlan.findFirst({ where: { id, userId } });
  return NextResponse.json({ ok: true, plan });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId, error } = await authed();
  if (error) return error;

  await prisma.trainingPlan.deleteMany({ where: { id, userId } });
  return NextResponse.json({ ok: true });
}
