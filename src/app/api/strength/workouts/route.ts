import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/api";
import { WorkoutInput, resolveActivity, tickPlannedStrength } from "@/lib/strength-store";

export const dynamic = "force-dynamic";

/** Enregistre une séance de musculation détaillée. */
export async function POST(req: NextRequest) {
  const { userId, error } = await authed();
  if (error) return error;

  const parsed = WorkoutInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    // Le détail zod (noms de champs, contraintes internes) reste côté serveur.
    console.error("[strength] séance invalide", parsed.error.issues.slice(0, 3));
    return NextResponse.json({ ok: false, error: "Données invalides" }, { status: 400 });
  }
  const body = parsed.data;
  const date = new Date(body.date);
  const activityId = await resolveActivity(userId, date, body.activityId);

  const workout = await prisma.strengthWorkout.create({
    data: {
      userId,
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
    select: { id: true },
  });

  const ticked = await tickPlannedStrength(userId, date);
  return NextResponse.json({ ok: true, id: workout.id, linkedActivity: Boolean(activityId), ticked });
}
