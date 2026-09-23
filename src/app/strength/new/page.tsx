import Link from "next/link";
import { WorkoutLogger } from "@/components/strength/WorkoutLogger";
import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildMemo, loadWorkouts, toBlocks } from "@/lib/strength-store";
import { STRENGTH_TYPES } from "@/lib/strava";

export const dynamic = "force-dynamic";

/**
 * Nouvelle séance. `?activity=<id>` préremplit depuis une séance Strava de
 * musculation (date, durée, nom) et l'y rattache.
 */
export default async function NewStrengthPage({
  searchParams,
}: {
  searchParams: Promise<{ activity?: string; from?: string }>;
}) {
  const userId = await requireUserId();
  const { activity: activityParam, from } = await searchParams;
  const workouts = await loadWorkouts(userId);

  const activity = activityParam
    ? await prisma.activity.findFirst({
        where: { id: activityParam, userId, type: { in: [...STRENGTH_TYPES] } },
        select: { id: true, name: true, startDate: true, movingTime: true },
      })
    : null;

  // « Dupliquer » une séance passée : elle devient le modèle « Répéter »
  const last = (from && workouts.find((w) => w.id === from)) || workouts[0];

  return (
    <>
      <Link href="/strength" className="text-micro uppercase tracking-[0.1em] text-ink3 hover:text-clay">
        ← Muscu
      </Link>
      <div className="mt-4">
        <WorkoutLogger
          mode="new"
          history={buildMemo(workouts)}
          lastWorkout={last ? { name: last.name, blocks: toBlocks(last.sets) } : null}
          prefill={
            activity
              ? {
                  date: activity.startDate.toISOString(),
                  durationMin: Math.round(activity.movingTime / 60),
                  activityId: activity.id,
                  name: activity.name,
                }
              : null
          }
        />
      </div>
    </>
  );
}
