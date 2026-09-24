import Link from "next/link";
import { Section } from "@/components/ui/Layout";
import { fmtPace } from "@/lib/format";
import { actualKmForWeek, getActivePlan, linkActivities } from "@/lib/plan-store";
import { prisma } from "@/lib/prisma";
import { getRuns } from "@/lib/queries";
import { addDays, round, startOfWeek } from "@/lib/stats";
import { weekCompliance } from "@/lib/training";
import { getTranslations } from "next-intl/server";
import { KIND_LABELS, type SessionKind } from "@/lib/workouts";

/**
 * Encart « à venir » du tableau de bord.
 * Trois prochaines séances + l'état de la semaine. Rien de plus : le détail
 * vit sur /training.
 */
export async function UpNext({
  now = new Date(),
  userId,
}: {
  now?: Date;
  userId: string;
}) {
  const t = await getTranslations("common");
  const plan = await getActivePlan(userId);
  if (!plan) {
    return (
      <Section
        title="Entraînement"
        note="Aucun plan actif — génère un plan séance par séance, avec ou sans course à préparer."
      >
        <Link href="/training" className="btn-outline btn-sm">
          Créer un plan →
        </Link>
      </Section>
    );
  }

  await linkActivities(plan.id, now, userId);

  const monday = startOfWeek(now);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const [upcoming, weekSessions, runs] = await Promise.all([
    prisma.plannedSession.findMany({
      // Aujourd'hui est traité par l'en-tête du tableau de bord : ici, la suite
      where: { planId: plan.id, date: { gte: addDays(today, 1) }, status: { in: ["planned", "moved"] }, kind: { not: "rest" } },
      orderBy: { date: "asc" },
      take: 3,
    }),
    prisma.plannedSession.findMany({
      where: { planId: plan.id, weekStart: monday },
      select: { distanceKm: true, status: true, kind: true },
    }),
    getRuns(undefined, userId),
  ]);

  const doneKm = actualKmForWeek(runs, monday);
  const compliance = weekCompliance(weekSessions, doneKm);

  return (
    <Section
      title="Ensuite"
      note={
        compliance.plannedKm > 0
          ? `${plan.name} · ${compliance.doneKm}/${compliance.plannedKm} km cette semaine`
          : plan.name
      }
      action={
        <Link href="/training" className="btn-quiet">
          Tout voir
        </Link>
      }
    >
      {upcoming.length === 0 ? (
        <p className="py-4 text-sm text-ink3">Rien de planifié pour les jours qui viennent.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {upcoming.map((s) => {
            const d = new Date(s.date);
            const isToday = d.toDateString() === now.toDateString();
            const isTomorrow = d.toDateString() === addDays(now, 1).toDateString();
            return (
              <Link
                key={s.id}
                href="/training"
                className="group border-t border-hair pt-3 transition-colors hover:border-hairStrong"
              >
                <div className="text-micro uppercase tracking-wider text-ink3">
                  {isToday
                    ? "Aujourd'hui"
                    : isTomorrow
                      ? "Demain"
                      : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" })}
                </div>
                <div className="mt-1.5 text-[0.9375rem] font-medium transition-colors group-hover:text-clay">
                  {s.title}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-2.5 text-micro text-ink3">
                  <span className="tag">{t(KIND_LABELS[s.kind as SessionKind] ?? `kind.${s.kind}`)}</span>
                  {s.distanceKm > 0 && (
                    <span className="font-mono tabular-nums">{round(s.distanceKm, 1)} km</span>
                  )}
                  <span>~{s.durationMin} min</span>
                  {s.paceTarget && <span>{fmtPace(s.paceTarget)}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Section>
  );
}
