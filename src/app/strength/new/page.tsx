import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { WorkoutLogger } from "@/components/strength/WorkoutLogger";
import { requireUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addDays } from "@/lib/stats";
import { buildMemo, loadWorkouts, toBlocks } from "@/lib/strength-store";
import { STRENGTH_TYPES } from "@/lib/strava";

export const dynamic = "force-dynamic";

/**
 * Nouvelle séance. `?activity=<id>` préremplit depuis une séance Strava de
 * musculation (date, durée, nom) et l'y rattache. `?planned=1` préremplit
 * depuis la séance de renforcement prévue par le plan (aujourd'hui/demain).
 */
export default async function NewStrengthPage({
  searchParams,
}: {
  searchParams: Promise<{ activity?: string; from?: string; planned?: string }>;
}) {
  const userId = await requireUserId();
  const t = await getTranslations("strength");
  const { activity: activityParam, from, planned: plannedParam } = await searchParams;
  const workouts = await loadWorkouts(userId);

  const activity = activityParam
    ? await prisma.activity.findFirst({
        where: { id: activityParam, userId, type: { in: [...STRENGTH_TYPES] } },
        select: { id: true, name: true, startDate: true, movingTime: true },
      })
    : null;

  const planned = plannedParam
    ? await prisma.plannedSession.findFirst({
        where: {
          kind: "strength",
          status: { in: ["planned", "moved"] },
          date: { gte: new Date(new Date().setHours(0, 0, 0, 0)), lt: addDays(new Date(new Date().setHours(0, 0, 0, 0)), 2) },
          plan: { userId, status: "active" },
        },
        orderBy: { date: "asc" },
        select: { date: true, title: true, durationMin: true },
      })
    : null;

  // « Dupliquer » une séance passée : elle devient le modèle « Répéter »
  const last = (from && workouts.find((w) => w.id === from)) || workouts[0];

  return (
    <>
      <Link href="/strength" className="text-micro uppercase tracking-[0.1em] text-ink3 hover:text-clay">
        {t("backToStrength")}
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
              : planned
                ? {
                    date: planned.date.toISOString(),
                    durationMin: planned.durationMin,
                    name: planned.title || t("defaultName"),
                  }
                : null
          }
        />
      </div>
    </>
  );
}
