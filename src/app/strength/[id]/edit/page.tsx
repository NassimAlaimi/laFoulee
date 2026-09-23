import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkoutLogger } from "@/components/strength/WorkoutLogger";
import { requireUserId } from "@/lib/auth";
import { buildMemo, loadWorkouts, toBlocks } from "@/lib/strength-store";

export const dynamic = "force-dynamic";

export default async function EditStrengthPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId();
  const workouts = await loadWorkouts(userId);
  const w = workouts.find((x) => x.id === id);
  if (!w) notFound();

  // La mémoire exclut la séance éditée : sinon elle serait sa propre référence
  const memo = buildMemo(
    workouts.filter((x) => x.date < w.date),
    w.id
  );

  return (
    <>
      <Link href={`/strength/${w.id}`} className="text-micro uppercase tracking-[0.1em] text-ink3 hover:text-clay">
        ← Retour à la séance
      </Link>
      <div className="mt-4">
        <WorkoutLogger
          mode="edit"
          history={memo}
          initial={{
            id: w.id,
            date: w.date.toISOString(),
            name: w.name,
            durationMin: w.durationMin,
            rpe: w.rpe,
            notes: w.notes,
            activityId: w.activityId,
            blocks: toBlocks(w.sets),
          }}
        />
      </div>
    </>
  );
}
