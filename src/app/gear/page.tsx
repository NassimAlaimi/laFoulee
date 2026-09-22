import { revalidatePath } from "next/cache";
import { Empty, PageHead, Section } from "@/components/ui/Layout";
import { Bar } from "@/components/ui/Metric";
import { MiniBars } from "@/components/ui/Spark";
import { fmtDate, fmtDuration, pacePerKm } from "@/lib/format";
import { fmtPace } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { RUN_TYPES } from "@/lib/strava";
import { daysBetween, round } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function GearPage() {
  const userId = await requireUserId();
  const [gear, activities] = await Promise.all([
    prisma.gear.findMany({
      where: { userId },
      orderBy: [{ retired: "asc" }, { name: "asc" }],
    }),
    prisma.activity.findMany({
      where: { userId, gearId: { not: null }, type: { in: [...RUN_TYPES] } },
      orderBy: { startDate: "desc" },
      select: {
        id: true,
        gearId: true,
        distance: true,
        movingTime: true,
        startDate: true,
        name: true,
      },
    }),
  ]);

  async function updateThreshold(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    const km = Number(formData.get("retireAtKm"));
    if (!id || !Number.isFinite(km) || km <= 0) return;
    // updateMany + userId : on ne peut pas régler le seuil d'un autre.
    await prisma.gear.updateMany({
      where: { id, userId: await requireUserId() },
      data: { retireAtKm: km },
    });
    revalidatePath("/gear");
  }

  if (gear.length === 0) {
    return (
      <>
        <PageHead title="Matériel" />
        <Empty
          title="Aucun équipement détecté"
          body="Associe tes chaussures à tes sorties dans Strava, puis relance une synchronisation. Le kilométrage et l'usure seront suivis ici."
        />
      </>
    );
  }

  const now = new Date();

  const rows = gear.map((g) => {
    // `Activity.gearId` reste l'identifiant Strava ; `Gear.id` est propre à
    // l'app depuis le passage en multi-utilisateur.
    const acts = activities.filter((a) => a.gearId === g.stravaGearId);
    const meters = acts.reduce((a, x) => a + x.distance, 0);
    const time = acts.reduce((a, x) => a + x.movingTime, 0);
    const km = round(meters / 1000, 1);

    // Strava connaît aussi le kilométrage d'avant l'import : on garde le plus élevé
    const stravaKm = round(g.stravaDistance / 1000, 1);
    const totalKm = Math.max(km, stravaKm);

    const first = acts.at(-1)?.startDate ?? null;
    const last = acts[0]?.startDate ?? null;
    const days = first ? Math.max(1, daysBetween(first, now)) : 0;
    const kmPerWeek = days ? round((totalKm / days) * 7, 1) : 0;
    const remaining = Math.max(0, g.retireAtKm - totalKm);
    const weeksLeft = kmPerWeek > 0 ? Math.round(remaining / kmPerWeek) : null;
    const wear = Math.min(100, (totalKm / g.retireAtKm) * 100);

    // 10 derniers mois de volume pour la micro-visualisation
    const monthly: number[] = [];
    for (let i = 9; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59);
      monthly.push(
        round(
          acts
            .filter((a) => a.startDate >= start && a.startDate <= end)
            .reduce((s, a) => s + a.distance, 0) / 1000,
          1
        )
      );
    }

    return {
      g,
      acts,
      totalKm,
      sessions: acts.length,
      time,
      avgPace: meters > 0 ? pacePerKm(meters, time) : 0,
      first,
      last,
      kmPerWeek,
      remaining: round(remaining, 0),
      weeksLeft,
      wear,
      monthly,
    };
  });

  const active = rows.filter((r) => !r.g.retired);
  const retired = rows.filter((r) => r.g.retired);

  return (
    <>
      <PageHead
        title="Matériel"
        meta={`${active.length} paire${active.length > 1 ? "s" : ""} en service · suivi d'usure et de kilométrage`}
      />

      <div className="space-y-10">
        <Section
          title="En service"
          note="Le seuil de remplacement est indicatif : la durée de vie d'une paire dépend du modèle, de ton poids et du terrain. Ajuste-le librement."
        >
          <div className="space-y-px">
            {active.map((r) => (
              <GearRow key={r.g.id} row={r} onSubmit={updateThreshold} />
            ))}
          </div>
        </Section>

        {retired.length > 0 && (
          <Section title="Retirées">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Modèle</th>
                  <th className="text-right">Kilométrage</th>
                  <th className="text-right">Séances</th>
                  <th className="text-right">Dernière sortie</th>
                </tr>
              </thead>
              <tbody>
                {retired.map((r) => (
                  <tr key={r.g.id} className="text-ink2">
                    <td>{r.g.name}</td>
                    <td className="num text-right">{r.totalKm} km</td>
                    <td className="num text-right">{r.sessions}</td>
                    <td className="num text-right">
                      {r.last ? fmtDate(r.last) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}
      </div>
    </>
  );
}

type Row = {
  g: {
    id: string;
    name: string;
    brand: string | null;
    model: string | null;
    retireAtKm: number;
    primary: boolean;
  };
  totalKm: number;
  sessions: number;
  time: number;
  avgPace: number;
  first: Date | null;
  last: Date | null;
  kmPerWeek: number;
  remaining: number;
  weeksLeft: number | null;
  wear: number;
  monthly: number[];
};

function GearRow({
  row,
  onSubmit,
}: {
  row: Row;
  onSubmit: (fd: FormData) => Promise<void>;
}) {
  const { g, wear } = row;
  const state =
    wear >= 100
      ? { label: "À remplacer", tone: "text-rust", bar: "rgb(var(--rust))" }
      : wear >= 80
        ? { label: "Fin de vie", tone: "text-ochre", bar: "rgb(var(--ochre))" }
        : { label: "En bon état", tone: "text-sage", bar: "rgb(var(--sage))" };

  return (
    <div className="border-t border-hair py-6 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[1.0625rem] font-medium tracking-tight">{g.name}</h3>
            {g.primary && <span className="tag">par défaut</span>}
            <span className={`text-micro font-medium ${state.tone}`}>
              {state.label}
            </span>
          </div>
          {(g.brand || g.model) && (
            <p className="mt-1 text-[0.8125rem] text-ink2">
              {[g.brand, g.model].filter(Boolean).join(" ")}
            </p>
          )}
        </div>

        <div className="flex items-end gap-7">
          <Fig value={row.totalKm} unit="km" label="parcourus" />
          <Fig value={row.sessions} label="séances" />
          <Fig
            value={row.remaining}
            unit="km"
            label={
              row.weeksLeft !== null
                ? `restants · ~${row.weeksLeft} sem.`
                : "restants"
            }
          />
          <div className="hidden pb-1 sm:block">
            <MiniBars data={row.monthly} width={96} height={28} />
            <div className="mt-1 text-micro text-ink3">10 mois</div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <Bar value={Math.min(100, wear)} tone={state.bar} height={4} />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-micro text-ink3">
          <span>
            {Math.round(wear)} % du seuil · {row.kmPerWeek} km/semaine en moyenne
            {row.avgPace > 0 && ` · allure moyenne ${fmtPace(row.avgPace)}`}
            {row.time > 0 && ` · ${fmtDuration(row.time)} au total`}
          </span>
          <form action={onSubmit} className="flex items-center gap-1.5">
            <input type="hidden" name="id" value={g.id} />
            <label htmlFor={`t-${g.id}`} className="text-micro text-ink3">
              Seuil
            </label>
            <input
              id={`t-${g.id}`}
              name="retireAtKm"
              type="number"
              min="100"
              step="50"
              defaultValue={g.retireAtKm}
              className="field w-20 py-1 text-center font-mono text-micro"
            />
            <span className="text-micro text-ink3">km</span>
            <button type="submit" className="btn-quiet">
              OK
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Fig({
  value,
  unit,
  label,
}: {
  value: number;
  unit?: string;
  label: string;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-1">
        <span className="display text-d4">{value}</span>
        {unit && <span className="text-micro text-ink3">{unit}</span>}
      </div>
      <div className="mt-1 whitespace-nowrap text-micro text-ink3">{label}</div>
    </div>
  );
}
