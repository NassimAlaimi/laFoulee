import Link from "next/link";
import { Empty, Hint, PageHead } from "@/components/ui/Layout";
import { Metric, MetricBand } from "@/components/ui/Metric";
import { MiniBars } from "@/components/ui/Spark";
import { fmtDate, fmtDuration, fmtPace, pacePerKm } from "@/lib/format";
import { getRuns } from "@/lib/queries";
import { periodStats, weeklyVolume } from "@/lib/stats";

export const dynamic = "force-dynamic";

type Filters = {
  q?: string;
  type?: string;
  sort?: string;
  period?: string;
};

const PERIODS = [
  { key: "all", label: "Tout" },
  { key: "30", label: "30 j" },
  { key: "90", label: "90 j" },
  { key: "365", label: "1 an" },
];

const TYPES = [
  { key: "all", label: "Toutes" },
  { key: "race", label: "Courses" },
  { key: "trail", label: "Trail" },
  { key: "long", label: "≥ 15 km" },
];

const SORTS = [
  { key: "date", label: "Date" },
  { key: "distance", label: "Distance" },
  { key: "pace", label: "Allure" },
  { key: "elevation", label: "D+" },
];

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  const params = await searchParams;
  const all = await getRuns();

  if (all.length === 0) {
    return (
      <>
        <PageHead title="Activités" />
        <Empty
          title="Aucune activité"
          body="Synchronise ton compte Strava pour importer tes courses."
          action={<Link href="/settings" className="btn-solid">Réglages</Link>}
        />
      </>
    );
  }

  const period = params.period ?? "all";
  const type = params.type ?? "all";
  const sort = params.sort ?? "date";

  let runs = all;

  if (period !== "all") {
    const cutoff = Date.now() - Number(period) * 86_400_000;
    runs = runs.filter((r) => r.startDate.getTime() >= cutoff);
  }
  if (params.q) {
    const q = params.q.toLowerCase();
    runs = runs.filter((r) => r.name.toLowerCase().includes(q));
  }
  if (type === "race") runs = runs.filter((r) => r.isRace);
  if (type === "trail") runs = runs.filter((r) => r.type === "TrailRun");
  if (type === "long") runs = runs.filter((r) => r.distance >= 15000);

  runs = [...runs].sort((a, b) => {
    switch (sort) {
      case "distance":
        return b.distance - a.distance;
      case "pace":
        return (
          pacePerKm(a.distance, a.movingTime) - pacePerKm(b.distance, b.movingTime)
        );
      case "elevation":
        return b.totalElevation - a.totalElevation;
      default:
        return b.startDate.getTime() - a.startDate.getTime();
    }
  });

  const stats = periodStats(runs);
  const weekly = weeklyVolume(runs, 12);

  const qs = (patch: Partial<Filters>) => {
    const next = new URLSearchParams();
    const merged = { q: params.q, type, sort, period, ...patch };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== "all" && !(k === "sort" && v === "date")) next.set(k, String(v));
    }
    const s = next.toString();
    return s ? `/activities?${s}` : "/activities";
  };

  return (
    <div className="space-y-6">
      <PageHead
        title="Activités"
        meta={`${stats.sessions} course${stats.sessions > 1 ? "s" : ""} · ${stats.km} km · ${stats.timeHours} h · ${stats.elevation} m D+`}
      />

      <MetricBand>
        <Metric
          label="Distance totale"
          value={stats.km}
          unit="km"
          visual={<MiniBars data={weekly.map((w) => w.km)} />}
        />
        <Metric label="Allure moyenne" value={fmtPace(stats.avgPace, "")} unit="/km" />
        <Metric label="Plus longue" value={stats.longestRunKm} unit="km" />
        <Metric
          label="Dénivelé"
          value={stats.elevation}
          unit="m"
          visual={<MiniBars data={weekly.map((w) => w.elevation)} />}
        />
      </MetricBand>

      {/* ---------------------------------------------------- Filtres */}
      <section className="mt-8 space-y-4 border-b border-hair pb-5">
        <form className="flex flex-wrap items-center gap-2">
          <input
            name="q"
            defaultValue={params.q}
            placeholder="Rechercher une séance…"
            className="field w-full sm:w-64"
          />
          {type !== "all" && <input type="hidden" name="type" value={type} />}
          {sort !== "date" && <input type="hidden" name="sort" value={sort} />}
          {period !== "all" && <input type="hidden" name="period" value={period} />}
          <button className="btn-outline" type="submit">
            Rechercher
          </button>
          {params.q && (
            <Link href={qs({ q: undefined })} className="btn-quiet">
              Effacer
            </Link>
          )}
        </form>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <FilterGroup label="Période" options={PERIODS} active={period} href={(k) => qs({ period: k })} />
          <FilterGroup label="Type" options={TYPES} active={type} href={(k) => qs({ type: k })} />
          <FilterGroup label="Trier par" options={SORTS} active={sort} href={(k) => qs({ sort: k })} />
        </div>
      </section>

      {/* ---------------------------------------------------- Tableau */}
      {runs.length === 0 ? (
        <Hint height={200}>Aucune activité ne correspond à ces filtres.</Hint>
      ) : (
        <div className="mt-6">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Séance</th>
                  <th className="text-right">Distance (km)</th>
                  <th className="text-right">Temps</th>
                  <th className="text-right">Allure</th>
                  <th className="text-right">FC moy</th>
                  <th className="text-right">FC max</th>
                  <th className="text-right">D+ (m)</th>
                  <th className="text-right">Cadence</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-ink2">
                      {fmtDate(r.startDate)}
                    </td>
                    <td>
                      <Link
                        href={`/activities/${r.id}`}
                        className="inline-flex max-w-[320px] items-center gap-2 truncate align-middle hover:text-clay"
                      >
                        {r.isRace && <span className="tag shrink-0 border-clay/40 text-clay">course</span>}
                        <span className="truncate">{r.name}</span>
                        {r.type === "TrailRun" && (
                          <span className="tag shrink-0">trail</span>
                        )}
                      </Link>
                    </td>
                    <td className="num text-right">
                      {(r.distance / 1000).toFixed(2)}
                    </td>
                    <td className="num text-right">
                      {fmtDuration(r.movingTime)}
                    </td>
                    <td className="num text-right">
                      {fmtPace(pacePerKm(r.distance, r.movingTime), "")}
                    </td>
                    <td className="num text-right text-ink2">
                      {r.averageHr ? Math.round(r.averageHr) : "—"}
                    </td>
                    <td className="num text-right text-ink2">
                      {r.maxHr ? Math.round(r.maxHr) : "—"}
                    </td>
                    <td className="num text-right text-ink2">
                      {Math.round(r.totalElevation)}
                    </td>
                    <td className="num text-right text-ink2">
                      {r.averageCadence ? Math.round(r.averageCadence) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterGroup({
  label,
  options,
  active,
  href,
}: {
  label: string;
  options: Array<{ key: string; label: string }>;
  active: string;
  href: (key: string) => string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-micro uppercase tracking-[0.08em] text-ink3">{label}</span>
      <div className="flex gap-0.5">
        {options.map((o) => (
          <Link
            key={o.key}
            href={href(o.key)}
            className={`rounded-[6px] border px-2.5 py-1 text-[0.8125rem] transition-colors ${
              active === o.key
                ? "border-clay/40 bg-clay/10 font-medium text-clay"
                : "border-transparent text-ink2 hover:text-ink"
            }`}
          >
            {o.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
