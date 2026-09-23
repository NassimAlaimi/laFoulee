import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed, notFound } from "@/lib/api";
import { WorkoutInput, resolveActivity } from "@/lib/strength-store";

export const dynamic = "force-dynamic";

/** Remplace une séance (en-tête + séries). */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId, error } = await authed();
  if (error) return error;

  const owned = await prisma.strengthWorkout.findFirst({ where: { id, userId }, select: { id: true } });
  if (!owned) return notFound("Séance introuvable");

  const parsed = WorkoutInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Données invalides" }, { status: 400 });
  }
  const body = parsed.data;
  const date = new Date(body.date);
  const activityId = await resolveActivity(userId, date, body.activityId, id);

  await prisma.$transaction([
    prisma.strengthSet.deleteMany({ where: { workoutId: id } }),
    prisma.strengthWorkout.update({
      where: { id },
      data: {
        date,
        name: body.name,
        durationMin: body.durationMin ?? null,
        rpe: body.rpe ?? null,
        notes: body.notes?.trim() || null,
        activityId,
        sets: {
          create: body.sets.map((s) => ({
            exercise: s.exercise,
            position: s.position,
            setIndex: s.setIndex,
            reps: s.reps,
            weightKg: s.weightKg,
            rir: s.rir ?? null,
            isWarmup: Boolean(s.isWarmup),
          })),
        },
      },
    }),
  ]);
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId, error } = await authed();
  if (error) return error;
  await prisma.strengthWorkout.deleteMany({ where: { id, userId } });
  return NextResponse.json({ ok: true });
}
