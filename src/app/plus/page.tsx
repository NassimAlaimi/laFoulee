import Link from "next/link";
import { PageHead } from "@/components/ui/Layout";
import { TourDoor } from "@/components/tour/TourDoor";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { fmtDateShort } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Hub « Plus » — rétrospective, réglages, agenda, export : tout ce qui ne se
 * consulte pas tous les jours, mais qui compte à la fin.
 */
export default async function PlusPage() {
  const userId = await requireUserId();
  const [activities, goals, plans] = await Promise.all([
    prisma.activity.count({ where: { userId } }),
    prisma.raceGoal.count({ where: { userId } }),
    prisma.trainingPlan.count({ where: { userId } }),
  ]);

  return (
    <div className="space-y-12">
      <PageHead
        title="Plus"
        kicker="Rétro & réglages"
        meta="La rétrospective, l'agenda, l'export — et tout ce qui configure l'app"
      />

      <section className="rise">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <div className="text-micro font-medium uppercase tracking-[0.16em] text-ink3">
              Ton compte en trois chiffres
            </div>
            <div className="mt-2 flex items-baseline gap-4">
              <span className="display text-d4">{activities}</span>
              <span className="text-sm text-ink3">activités importées</span>
            </div>
          </div>
          <dl className="flex gap-8">
            <Figure label="objectifs" value={String(goals)} />
            <Figure label="plans d'entraînement" value={String(plans)} />
          </dl>
        </div>
      </section>

      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
        <HubDoor
          href="/recap"
          title="Rétrospective"
          tagline="L'année qui s'achève : kilomètres, courses, records, moments — imprimable."
          note={`Bilan ${new Date().getFullYear()}`}
        />
        <HubDoor
          href="/settings#agenda"
          title="Agenda"
          tagline="Ton plan d'entraînement dans ton calendrier (Google, Apple…) via un flux."
          note="Abonnement iCal"
        />
        <HubDoor
          href="/settings#export"
          title="Export"
          tagline="Toutes tes données à toi : JSON complet ou CSV des activités."
          note="Données brutes"
        />
        <HubDoor
          href="/settings"
          title="Réglages"
          tagline="Compte Strava, synchronisation, profil, thème — tout se règle ici."
          note="Compte & préférences"
        />
        <TourDoor />
      </div>

      <p className="border-t border-hair pt-4 text-micro text-ink3">
        Synchronisé en dernier lieu le{" "}
        {await lastSync(userId)}
      </p>
    </div>
  );
}

async function lastSync(userId: string) {
  const log = await prisma.syncLog.findFirst({
    where: { userId, status: "success" },
    orderBy: { finishedAt: "desc" },
    select: { finishedAt: true },
  });
  return log?.finishedAt ? fmtDateShort(log.finishedAt) : "jamais";
}

function HubDoor({
  href,
  title,
  tagline,
  note,
}: {
  href: string;
  title: string;
  tagline: string;
  note: string;
}) {
  return (
    <Link
      href={href}
      className="group block border-t-2 border-hair pt-4 transition-colors hover:border-clay"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight group-hover:text-clay">{title}</h2>
        <span className="text-ink3 transition-transform group-hover:translate-x-1">→</span>
      </div>
      <p className="mt-1.5 max-w-[44ch] text-sm leading-relaxed text-ink2">{tagline}</p>
      <p className="mt-2.5 text-micro uppercase tracking-[0.12em] text-ink3">{note}</p>
    </Link>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xl font-semibold tracking-tight">{value}</div>
      <div className="mt-0.5 text-micro text-ink3">{label}</div>
    </div>
  );
}
