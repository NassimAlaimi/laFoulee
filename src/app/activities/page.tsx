import Link from "next/link";
import { Empty, Hint, PageHead } from "@/components/ui/Layout";
import { Metric, MetricBand } from "@/components/ui/Metric";
import { MiniBars } from "@/components/ui/Spark";
import { fmtDate, fmtDateShort, fmtDuration, fmtPace, pacePerKm } from "@/lib/format";
import { getRuns } from "@/lib/queries";
import { periodStats, weeklyVolume } from "@/lib/stats";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { clusterByStart, groupRoutes, overlayPaths, startOf } from "@/lib/polyline";
import { RouteGlyph } from "@/components/route/RouteGlyph";
import { RouteOverlay } from "@/components/route/RouteOverlay";

export const dynamic = "force-dynamic";

type Filters = {
  q?: string;
  type?: string;
  sort?: string;
  period?: string;
  view?: string;
  zone?: string;
};

const VIEWS = [
  { key: "list", label: "Liste" },
  { key: "mosaic", label: "Mosaïque" },
  { key: "map", label: "Carte" },
];

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
  const userId = await requireUserId();
  const all = await getRuns(undefined, userId);

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
  const view = VIEWS.some((v) => v.key === params.view) ? params.view! : "list";

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

  // Les tracés ne sont chargés que pour les activités affichées
  const polyRows = await prisma.activity.findMany({
    where: { userId, id: { in: runs.map((r) => r.id) } },
    select: { id: true, polyline: true },
  });
  const poly = new Map(polyRows.map((p) => [p.id, p.polyline]));

  const stats = periodStats(runs);
  const weekly = weeklyVolume(runs, 12);

  const qs = (patch: Partial<Filters>) => {
    const next = new URLSearchParams();
    const merged = { q: params.q, type, sort, period, view, zone: params.zone, ...patch };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== "all" && !(k === "sort" && v === "date") && !(k === "view" && v === "list")) {
        next.set(k, String(v));
      }
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
          {view !== "list" && <input type="hidden" name="view" value={view} />}
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
          <div className="ml-auto">
            <FilterGroup label="Vue" options={VIEWS} active={view} href={(k) => qs({ view: k, zone: undefined })} />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- Tableau */}
      {runs.length === 0 ? (
        <Hint height={200}>Aucune activité ne correspond à ces filtres.</Hint>
      ) : view === "mosaic" ? (
        <Mosaic runs={runs} poly={poly} />
      ) : view === "map" ? (
        <MapView runs={runs} poly={poly} zone={Number(params.zone ?? 0) || 0} qs={(z) => qs({ zone: String(z) })} />
      ) : (
        <div className="mt-6">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-10" aria-label="Tracé" />
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
                    <td className="py-1.5 text-ink2">
                      <RouteGlyph polyline={poly.get(r.id)} size={30} strokeWidth={1.4} />
                    </td>
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

type Run = Awaited<ReturnType<typeof getRuns>>[number];

/**
 * Mosaïque : chaque sortie réduite à sa silhouette. Sur quelques mois, on
 * reconnaît d'un coup d'œil ses boucles habituelles, ses allers-retours et
 * les sorties qui sortent du lot.
 */
function Mosaic({ runs, poly }: { runs: Run[]; poly: Map<string, string | null> }) {
  return (
    <div className="mt-8 grid grid-cols-3 overflow-hidden rounded-card border-l border-t border-hair sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
      {runs.map((r, i) => (
        <Link
          key={r.id}
          href={`/activities/${r.id}`}
          prefetch={false}
          className="rise group relative flex aspect-square flex-col border-b border-r border-hair p-3 transition-colors hover:bg-panel"
          style={{ animationDelay: `${Math.min(i, 40) * 12}ms` }}
          title={r.name}
        >
          <div className="flex items-baseline justify-between text-[10px] text-ink3">
            <span className="font-mono">{fmtDateShort(r.startDate)}</span>
            {r.isRace && <span className="h-1.5 w-1.5 rounded-full bg-clay" aria-label="course" />}
          </div>
          <div className="flex flex-1 items-center justify-center py-1 text-ink2 transition-colors group-hover:text-clay">
            <RouteGlyph polyline={poly.get(r.id)} size={76} strokeWidth={1.5} dot={false} />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[0.8125rem] font-medium tabular-nums">
              {(r.distance / 1000).toFixed(1)}
              <span className="ml-0.5 text-[10px] font-normal text-ink3">km</span>
            </span>
            <span className="font-mono text-[10px] text-ink3">{fmtPace(pacePerKm(r.distance, r.movingTime), "")}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function MapView({
  runs,
  poly,
  zone,
  qs,
}: {
  runs: Run[];
  poly: Map<string, string | null>;
  zone: number;
  qs: (zone: number) => string;
}) {
  const located = runs
    .map((r) => ({ ...r, polyline: poly.get(r.id) ?? null, start: startOf(poly.get(r.id)) }))
    .filter((r): r is typeof r & { start: [number, number] } => r.start !== null);

  if (!located.length) {
    return <Hint height={240}>Aucune de ces activités n&apos;a de tracé GPS.</Hint>;
  }

  const clusters = clusterByStart(located, 25);
  const active = clusters[Math.min(zone, clusters.length - 1)];
  const W = 1200;
  const H = 700;
  const paths = overlayPaths(active.items, W, H, 28).map((p) => ({
    id: p.id,
    d: p.d,
    name: p.item.name,
    date: fmtDate(p.item.startDate),
    km: p.item.distance / 1000,
    pace: fmtPace(pacePerKm(p.item.distance, p.item.movingTime)),
    race: p.item.isRace,
  }));

  const groups = groupRoutes(active.items).filter((g) => g.items.length >= 2);
  const zoneKm = active.items.reduce((a, r) => a + r.distance, 0) / 1000;

  return (
    <div className="mt-8 space-y-10">
      {clusters.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-micro uppercase tracking-[0.08em] text-ink3">Secteur</span>
          {clusters.map((c, i) => (
            <Link
              key={i}
              href={qs(i)}
              className={`rounded-[6px] border px-2.5 py-1 text-[0.8125rem] transition-colors ${
                c === active ? "border-clay/40 bg-clay/10 font-medium text-clay" : "border-hair text-ink2 hover:text-ink"
              }`}
            >
              {i === 0 ? "Principal" : `Secteur ${i + 1}`}
              <span className="ml-1.5 font-mono text-micro text-ink3">
                {c.items.length}
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <RouteOverlay paths={paths} w={W} h={H} />
        <div>
          <div className="eyebrow">Sur ce secteur</div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="display text-d2">{Math.round(zoneKm)}</span>
            <span className="text-sm text-ink3">km</span>
          </div>
          <p className="mt-2 text-[0.8125rem] text-ink2">
            {active.items.length} sorties · {groups.length} parcours récurrent{groups.length > 1 ? "s" : ""}
          </p>
          <p className="mt-6 text-micro leading-relaxed text-ink3">
            Chaque sortie est un trait fin et translucide : plus une rue est empruntée,
            plus elle s&apos;illumine. Clique un tracé pour ouvrir la séance.
          </p>
        </div>
      </div>

      {groups.length > 0 && (
        <section className="border-t border-hair pt-5">
          <h2 className="eyebrow">Tes parcours récurrents</h2>
          <p className="mt-1.5 max-w-2xl text-[0.8125rem] leading-relaxed text-ink2">
            Sorties reconnues comme le même parcours (tracé à moins de 120 m en moyenne,
            distance à ±12 %). Le record de chaque parcours est ton chrono de référence
            pour mesurer tes progrès à conditions égales.
          </p>
          <div className="mt-6 grid gap-x-10 gap-y-2 md:grid-cols-2">
            {groups.slice(0, 10).map((g) => {
              const withPace = g.items.map((r) => ({ r, pace: pacePerKm(r.distance, r.movingTime) }));
              const best = withPace.reduce((a, b) => (b.pace < a.pace ? b : a));
              const last = withPace.reduce((a, b) => (b.r.startDate > a.r.startDate ? b : a));
              const gap = Math.round(last.pace - best.pace);
              const avgKm = g.items.reduce((a, r) => a + r.distance, 0) / g.items.length / 1000;
              return (
                <div key={g.lead.id} className="flex items-center gap-4 border-b border-hair py-3">
                  <RouteGlyph polyline={g.lead.polyline} size={52} strokeWidth={1.5} className="shrink-0 text-ink2" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[0.9375rem] font-medium">
                        {avgKm.toFixed(1)} km
                        <span className="ml-2 text-[0.8125rem] font-normal text-ink3">× {g.items.length}</span>
                      </span>
                      <Link href={`/activities/${best.r.id}`} className="font-mono text-[0.8125rem] font-medium hover:text-clay" title="Meilleur passage">
                        {fmtDuration(best.r.movingTime)}
                      </Link>
                    </div>
                    <div className="mt-0.5 flex items-baseline justify-between gap-3 text-micro text-ink3">
                      <span>
                        dernier passage {fmtDateShort(last.r.startDate)}
                        {last.r.id === best.r.id ? " · record" : ` · +${gap} s/km vs record`}
                      </span>
                      <span className="font-mono">{fmtPace(best.pace)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
