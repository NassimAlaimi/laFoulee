import Link from "next/link";
import { PageHead } from "@/components/ui/Layout";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { fmtDateShort } from "@/lib/format";
import { daysBetween } from "@/lib/stats";

export const dynamic = "force-dynamic";

/**
 * Hub « Corps » — force et équipement : l'état d'un coup d'œil, puis les
 * deux univers (musculation, matériel) comme de grandes portes.
 */
export default async function CorpsPage() {
  const userId = await requireUserId();
  const [lastWorkout, monthCount, primaryGear] = await Promise.all([
    prisma.strengthWorkout.findFirst({
      where: { userId },
      orderBy: { date: "desc" },
      select: { name: true, date: true, durationMin: true },
    }),
    prisma.strengthWorkout.count({
      where: { userId, date: { gte: new Date(Date.now() - 30 * 86400000) } },
    }),
    prisma.gear.findFirst({
      where: { userId, primary: true, retired: false },
      select: { name: true, stravaDistance: true, retireAtKm: true },
    }),
  ]);

  const gearKm = primaryGear ? Math.round(primaryGear.stravaDistance / 1000) : null;
  const gearLife = primaryGear && gearKm != null ? Math.round((gearKm / primaryGear.retireAtKm) * 100) : null;
  const daysSince = lastWorkout ? daysBetween(new Date(lastWorkout.date), new Date()) : null;

  return (
    <div className="space-y-12">
      <PageHead
        title="Corps"
        kicker="Force & équipement"
        meta="Musculation du coureur et matériel — le socle sous la foulée"
      />

      <section className="rise" data-tour="corps">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <div className="text-micro font-medium uppercase tracking-[0.16em] text-ink3">
              Dernière séance de force
            </div>
            <div className="mt-2 flex items-baseline gap-4">
              <span className="display text-d4">
                {daysSince === null ? "—" : daysSince === 0 ? "Aujourd'hui" : `J−${daysSince}`}
              </span>
              <span className="text-sm text-ink3">
                {lastWorkout
                  ? `${lastWorkout.name} · ${fmtDateShort(lastWorkout.date)}`
                  : "aucune séance enregistrée"}
              </span>
            </div>
          </div>
          <dl className="flex gap-8">
            <Figure label="séances · 30 j" value={String(monthCount)} />
            <Figure
              label="chaussures"
              value={gearKm != null ? `${gearKm} km` : "—"}
              note={gearLife != null ? `${gearLife} % du seuil` : undefined}
            />
          </dl>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <HubDoor
          href="/strength"
          title="Musculation"
          tagline="La force du coureur : séances, 1RM, garde-fou de charge, objectifs de force."
          note={`${monthCount} séance${monthCount > 1 ? "s" : ""} ces 30 derniers jours`}
        />
        <HubDoor
          href="/gear"
          title="Matériel"
          tagline="Chaussures et équipement : kilométrage, seuils de remplacement, ce qui court avec toi."
          note={primaryGear ? `${primaryGear.name} — ${gearKm} km` : "Aucune paire marquée principale"}
        />
      </div>
    </div>
  );
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
      className="group block border-t-2 border-hair pt-5 transition-colors hover:border-clay"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight group-hover:text-clay">{title}</h2>
        <span className="text-lg text-ink3 transition-transform group-hover:translate-x-1">→</span>
      </div>
      <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-ink2">{tagline}</p>
      <p className="mt-3 text-micro uppercase tracking-[0.12em] text-ink3">{note}</p>
    </Link>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <div className="text-xl font-semibold tracking-tight">{value}</div>
      <div className="mt-0.5 text-micro text-ink3">{label}{note ? ` · ${note}` : ""}</div>
    </div>
  );
}
