import { prisma } from "@/lib/prisma";
import { authed, notFound } from "@/lib/api";
import { userPaces } from "@/lib/custom-workout-store";
import { workoutToFit } from "@/lib/fit-workout";
import type { WorkoutStep } from "@/lib/workout-dsl";

export const dynamic = "force-dynamic";

/** Téléchargement de la séance au format FIT « workout », pour la montre. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, error } = await authed();
  if (error) return error;
  const w = await prisma.customWorkout.findFirst({ where: { id, userId } });
  if (!w) return notFound();
  const bytes = workoutToFit(w.name, JSON.parse(w.structure) as WorkoutStep[], await userPaces(userId));
  const file = w.name.normalize("NFD").replace(/[^\w-]+/g, "_").slice(0, 40) || "seance";
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/vnd.ant.fit",
      "Content-Disposition": `attachment; filename="${file}.fit"`,
    },
  });
}
