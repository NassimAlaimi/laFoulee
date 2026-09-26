import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Empty, Hint, PageHead } from "@/components/ui/Layout";
import { Metric, MetricBand } from "@/components/ui/Metric";
import { MiniBars } from "@/components/ui/Spark";
import { fmtDate, fmtDateShort, fmtDuration, fmtPace, pacePerKm } from "@/lib/format";
import { getRuns } from "@/lib/queries";
import { periodStats, weeklyVolume } from "@/lib/stats";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { clusterByStart, decodePolyline, groupRoutes, overlayPaths, overlayRoads, polylineLength, privatePolyline, startOf } from "@/lib/polyline";
import { getPrivacyZone } from "@/lib/queries";
import { getOsmRoads } from "@/lib/route-store";
import { favoriteRoute } from "@/lib/favorite-route";
import { FavoriteRoute } from "@/components/route/FavoriteRoute";
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
  { key: "list", labelKey: "list" },
  { key: "mosaic", labelKey: "mosaic" },
  { key: "map", labelKey: "map" },
];

const PERIODS = [
  { key: "all", labelKey: "all" },
  { key: "30", labelKey: "30" },
  { key: "90", labelKey: "90" },
  { key: "365", labelKey: "365" },
];

const TYPES = [
  { key: "all", labelKey: "all" },
  { key: "race", labelKey: "race" },
  { key: "trail", labelKey: "trail" },
  { key: "long", labelKey: "long" },
];

const SORTS = [
  { key: "date", labelKey: "date" },
  { key: "distance", labelKey: "distance" },
  { key: "pace", labelKey: "pace" },
  { key: "elevation", labelKey: "elevation" },
];

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  const t = await getTranslations("activities");
  const locale = await getLocale();
  const params = await searchParams;
  const userId = await requireUserId();
  const all = await getRuns(undefined, userId);

  if (all.length === 0) {
    return (
      <>
        <PageHead title={t("title")} />
        <Empty
          title={t("empty")}
          body={t("emptyBody")}
          action={<Link href="/settings" className="btn-solid">{t("settingsLink")}</Link>}
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
  // Zone de confidentialité : début et fin des tracés masqués à l'affichage.
  const zone = await getPrivacyZone(userId);
  const poly = new Map(polyRows.map((p) => [p.id, privatePolyline(p.polyline, zone)]));

  const stats = periodStats(runs);
  const weekly = weeklyVolume(runs, 12, new Date(), locale);

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
        title={t("title")}
        kicker={t(`periods.${PERIODS.find((x) => x.key === period)?.labelKey ?? "all"}`)}
        meta={t("meta", { sessions: stats.sessions, km: stats.km, h: stats.timeHours, elev: stats.elevation })}
      />

      <MetricBand>
        <Metric
          label={t("totalDistance")}
          value={stats.km}
          unit="km"
          visual={<MiniBars data={weekly.map((w) => w.km)} />}
        />
        <Metric label={t("avgPace")} value={fmtPace(stats.avgPace, "")} unit="/km" />
        <Metric label={t("longest")} value={stats.longestRunKm} unit="km" />
        <Metric
          label={t("elevation")}
          value={stats.elevation}
          unit="m"
          visual={<MiniBars data={weekly.map((w) => w.elevation)} />}
        />
      </MetricBand>

      {/* ---------------------------------------------------- Filtres */}
      <section className="mt-8 space-y-4 border-b border-hair pb-5" data-tour="activities">
        <form className="flex flex-wrap items-center gap-2">
          <input
            name="q"
            defaultValue={params.q}
            placeholder={t("searchPlaceholder")}
            className="field w-full sm:w-64"
          />
          {type !== "all" && <input type="hidden" name="type" value={type} />}
          {sort !== "date" && <input type="hidden" name="sort" value={sort} />}
          {period !== "all" && <input type="hidden" name="period" value={period} />}
          {view !== "list" && <input type="hidden" name="view" value={view} />}
          <button className="btn-outline" type="submit">
            {t("search")}
          </button>
          {params.q && (
            <Link href={qs({ q: undefined })} className="btn-quiet">
              {t("clear")}
            </Link>
          )}
        </form>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <FilterGroup label={t("filterPeriod")} ns="periods" options={PERIODS} active={period} href={(k) => qs({ period: k })} t={t} />
          <FilterGroup label={t("filterType")} ns="types" options={TYPES} active={type} href={(k) => qs({ type: k })} t={t} />
          <FilterGroup label={t("filterSort")} ns="sorts" options={SORTS} active={sort} href={(k) => qs({ sort: k })} t={t} />
          <div className="ml-auto">
            <FilterGroup label={t("filterView")} ns="views" options={VIEWS} active={view} href={(k) => qs({ view: k, zone: undefined })} t={t} />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- Tableau */}
      {runs.length === 0 ? (
        <Hint height={200}>{t("noMatch")}</Hint>
      ) : view === "mosaic" ? (
        <Mosaic runs={runs} poly={poly} locale={locale} t={t} />
      ) : view === "map" ? (
        <MapView runs={runs} poly={poly} zone={Number(params.zone ?? 0) || 0} qs={(z) => qs({ zone: String(z) })} locale={locale} t={t} userId={userId} />
      ) : (
        <div className="mt-6">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-10" aria-label={t("trace")} />
                  <th>{t("date")}</th>
                  <th>{t("session")}</th>
                  <th className="text-right">{t("distanceKm")}</th>
                  <th className="text-right">{t("time")}</th>
                  <th className="text-right">{t("pace")}</th>
                  <th className="text-right">{t("avgHr")}</th>
                  <th className="text-right">{t("maxHr")}</th>
                  <th className="text-right">{t("elevM")}</th>
                  <th className="text-right">{t("cadence")}</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="py-1.5 text-ink2">
                      <RouteGlyph polyline={poly.get(r.id)} size={30} strokeWidth={1.4} />
                    </td>
                    <td className="whitespace-nowrap text-ink2">
                      {fmtDate(r.startDate, locale)}
                    </td>
                    <td>
                      <Link
                        href={`/activities/${r.id}`}
                        className="inline-flex max-w-[320px] items-center gap-2 truncate align-middle hover:text-clay"
                      >
                        {r.isRace && <span className="tag shrink-0 border-clay/40 text-clay">{t("tagRace")}</span>}
                        <span className="truncate">{r.name}</span>
                        {r.type === "TrailRun" && (
                          <span className="tag shrink-0">{t("tagTrail")}</span>
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
  ns,
  options,
  active,
  href,
  t,
}: {
  label: string;
  ns: string;
  options: Array<{ key: string; labelKey: string }>;
  active: string;
  href: (key: string) => string;
  t: (key: string) => string;
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
            {t(`${ns}.${o.labelKey}`)}
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
function Mosaic({
  runs,
  poly,
  locale,
  t,
}: {
  runs: Run[];
  poly: Map<string, string | null>;
  locale: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
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
            <span className="font-mono">{fmtDateShort(r.startDate, locale)}</span>
            {r.isRace && <span className="h-1.5 w-1.5 rounded-full bg-clay" aria-label={t("tagRace")} />}
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

async function MapView({
  runs,
  poly,
  zone,
  qs,
  locale,
  t,
  userId,
}: {
  runs: Run[];
  poly: Map<string, string | null>;
  zone: number;
  qs: (zone: number) => string;
  locale: string;
  t: (key: string, params?: Record<string, string | number>) => string;
  userId: string;
}) {
  const located = runs
    .map((r) => ({ ...r, polyline: poly.get(r.id) ?? null }))
    // Tracé corrompu (GPS qui bascule de ville) : il fausserait les bornes
    // de la carte de chaleur. On l'écarte, comme pour le graphe de parcours.
    .filter((r) => r.polyline && !(r.distance > 0 && polylineLength(r.polyline) > r.distance * 2 + 1000))
    .map((r) => ({ ...r, start: startOf(r.polyline) }))
    .filter((r): r is typeof r & { start: [number, number] } => r.start !== null);

  if (!located.length) {
    return <Hint height={240}>{t("noGps")}</Hint>;
  }

  const clusters = clusterByStart(located, 25);
  const active = clusters[Math.min(zone, clusters.length - 1)];
  const W = 1200;
  const H = 700;

  // Fond de rues OpenStreetMap autour du secteur (mêmes bornes que les
  // tracés, pour qu'on reconnaisse où l'on court).
  const osm: string[] = [];
  const bbox = traceBbox(active.items);
  if (bbox) {
    const roads = await getOsmRoads(userId, bbox);
    if (roads && roads.length) osm.push(...overlayRoads(active.items, roads, W, H, 28));
  }
  const paths = overlayPaths(active.items, W, H, 28).map((p) => ({
    id: p.id,
    d: p.d,
    name: p.item.name,
    date: fmtDate(p.item.startDate, locale),
    km: p.item.distance / 1000,
    pace: fmtPace(pacePerKm(p.item.distance, p.item.movingTime)),
    race: p.item.isRace,
  }));

  const groups = groupRoutes(active.items).filter((g) => g.items.length >= 2);
  const zoneKm = active.items.reduce((a, r) => a + r.distance, 0) / 1000;

  // Le parcours le plus couru de tout l'historique, quel que soit le secteur.
  const fav = favoriteRoute(located);

  return (
    <div className="mt-8 space-y-10">
      {fav && <FavoriteRoute items={fav.items} polyline={fav.lead.polyline} />}
      {clusters.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-micro uppercase tracking-[0.08em] text-ink3">{t("sector")}</span>
          {clusters.map((c, i) => (
            <Link
              key={i}
              href={qs(i)}
              className={`rounded-[6px] border px-2.5 py-1 text-[0.8125rem] transition-colors ${
                c === active ? "border-clay/40 bg-clay/10 font-medium text-clay" : "border-hair text-ink2 hover:text-ink"
              }`}
            >
              {i === 0 ? t("main") : t("sectorN", { n: i + 1 })}
              <span className="ml-1.5 font-mono text-micro text-ink3">
                {c.items.length}
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <RouteOverlay paths={paths} osm={osm} w={W} h={H} />
        <div>
          <div className="eyebrow">{t("onSector")}</div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="display text-d2">{Math.round(zoneKm)}</span>
            <span className="text-sm text-ink3">km</span>
          </div>
          <p className="mt-2 text-[0.8125rem] text-ink2">
            {t("runsCount", { n: active.items.length, r: groups.length, s: groups.length > 1 ? "s" : "" })}
          </p>
          <p className="mt-6 text-micro leading-relaxed text-ink3">
            {t("mapHint")}
          </p>
        </div>
      </div>

      {groups.length > 0 && (
        <section className="border-t border-hair pt-5">
          <h2 className="eyebrow">{t("recurringTitle")}</h2>
          <p className="mt-1.5 max-w-2xl text-[0.8125rem] leading-relaxed text-ink2">
            {t("recurringBody")}
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
                      <Link href={`/activities/${best.r.id}`} className="font-mono text-[0.8125rem] font-medium hover:text-clay" title={t("bestTitle")}>
                        {fmtDuration(best.r.movingTime)}
                      </Link>
                    </div>
                    <div className="mt-0.5 flex items-baseline justify-between gap-3 text-micro text-ink3">
                      <span>
                        {t("lastPass", { date: fmtDateShort(last.r.startDate, locale) })}
                        {last.r.id === best.r.id ? ` · ${t("record")}` : t("vsRecord", { s: gap })}
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

/** Bornes lat/lon d'un ensemble de tracés (extrémités rognées à 1 %). */
function traceBbox(items: Array<{ polyline: string | null }>): { minLat: number; maxLat: number; minLon: number; maxLon: number } | null {
  const pts = items.flatMap((r) => decodePolyline(r.polyline));
  if (pts.length < 2) return null;
  const lats = pts.map((p) => p[0]).sort((a, b) => a - b);
  const lons = pts.map((p) => p[1]).sort((a, b) => a - b);
  const q = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
  const trim = pts.length > 400 ? 0.01 : 0;
  return {
    minLat: q(lats, trim),
    maxLat: q(lats, 1 - trim),
    minLon: q(lons, trim),
    maxLon: q(lons, 1 - trim),
  };
}
