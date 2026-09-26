import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHead, Section } from "@/components/ui/Layout";
import { RouteGlyph } from "@/components/route/RouteGlyph";
import { RouteAtelier } from "@/components/route/RouteAtelier";
import { DeleteRouteButton } from "@/components/route/DeleteRouteButton";
import { requireUserId } from "@/lib/auth";
import { fmtPace } from "@/lib/format";
import { graphSectors } from "@/lib/route-graph";
import {
  getRouteGraph,
  getOsmRoads,
  listPois,
  listRoutes,
  sectorBbox,
  sectorView,
  graphTotalKm,
} from "@/lib/route-store";
import { polylinePath } from "@/lib/route-view";
import { bboxAround } from "@/lib/osm";
import { straightSegments } from "@/lib/route-graph";
import { encodePolyline } from "@/lib/polyline";

export const dynamic = "force-dynamic";

/** Atelier de parcours — dessiner sur son propre réseau, sans tuiles. */
export default async function RoutesPage({
  searchParams,
}: {
  searchParams: Promise<{ sector?: string }>;
}) {
  const t = await getTranslations("routes");
  const userId = await requireUserId();
  const params = await searchParams;
  const got = await getRouteGraph(userId);
  const graph = got?.graph ?? null;
  const [routes, pois] = await Promise.all([listRoutes(userId), listPois(userId)]);
  const totalKm = graph ? await graphTotalKm(userId) : 0;

  // Le réseau peut couvrir plusieurs villes (composantes connexes séparées de
  // centaines de km) : on n'en affiche qu'une à la fois, sinon tout est écrasé.
  const sectors = graph ? graphSectors(graph) : [];
  const sectorIdx = Math.max(0, Math.min((Number(params.sector) || 0), sectors.length - 1));
  const sector = sectors[sectorIdx] ?? null;

  // Fond OSM : les rues autour du secteur sélectionné (borné), en cache 24 h.
  let osm: string[] | null = null;
  let view = sector ? sectorView(sector) : null;
  if (sector) {
    const b = sectorBbox(sector);
    const centerLat = (b.minLat + b.maxLat) / 2;
    const centerLon = (b.minLon + b.maxLon) / 2;
    const spanKm =
      Math.max(
        (b.maxLat - b.minLat) * 111.32,
        (b.maxLon - b.minLon) * 111.32 * Math.cos((centerLat * Math.PI) / 180)
      ) + 2;
    const osmBbox = bboxAround(centerLat, centerLon, spanKm);
    const roads = await getOsmRoads(userId, osmBbox);
    if (roads && roads.length) {
      osm = roads.map((r) => polylinePath(r, osmBbox)).filter((d) => d);
      view = sectorView(sector, osmBbox);
    }
  }
  const straights = graph ? straightSegments(graph, 400).slice(0, 12) : [];
  const start = sector ? mostUsedStartPoint(sector.nodes) : null;

  const sectorHref = (i: number) =>
    i === 0 ? "/routes" : `/routes?sector=${i}`;

  return (
    <div className="space-y-14">
      <PageHead
        kicker={t("kicker")}
        title={t("title")}
        meta={graph ? t("metaSome", { km: Math.round(totalKm), roads: graph.edges.length }) : t("metaNone")}
      />

      {sectors.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-micro uppercase tracking-[0.08em] text-ink3">{t("sector")}</span>
          {sectors.map((s, i) => (
            <Link
              key={i}
              href={sectorHref(i)}
              className={`rounded-[6px] border px-2.5 py-1 text-[0.8125rem] transition-colors ${
                i === sectorIdx
                  ? "border-clay/40 bg-clay/10 font-medium text-clay"
                  : "border-hair text-ink2 hover:text-ink"
              }`}
            >
              {i === 0 ? t("main") : t("sectorN", { n: i + 1 })}
              <span className="ml-1.5 font-mono text-micro text-ink3">{s.nodes.size}</span>
            </Link>
          ))}
        </div>
      )}

      {view ? (
        <RouteAtelier
          view={{
            ...view,
            osm: osm ?? [],
            pois: pois.map((p) => ({ id: p.id, kind: p.kind, x: xOf(view, p.lng), y: yOf(view, p.lat), note: p.note })),
          }}
          kinds={(["fountain", "toilet", "car", "bakery", "lit", "danger", "track"] as const).map((k) => [k, t(`poi_${k}`)])}
          hasGraph={Boolean(graph)}
          startLat={start?.[0] ?? null}
          startLng={start?.[1] ?? null}
          emptyGraph={t("emptyGraph")}
        />
      ) : (
        <p className="max-w-2xl text-[0.8125rem] leading-relaxed text-ink2">{t("emptyGraph")}</p>
      )}

      {straights.length > 0 && (
        <Section title={t("straights")} note={t("straightsNote")}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {straights.slice(0, 9).map((s, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-hair py-2">
                <span className="num w-16 shrink-0 text-[1.2rem] font-semibold">{(s.meters / 1000).toFixed(2)}</span>
                <span className="text-micro text-ink2">{t("straightKm")}</span>
                <RouteGlyph polyline={encodePolyline(s.points)} size={72} className="ml-auto text-sage" dot={false} />
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title={t("savedRoutes")} note={t("savedNote")}>
        {routes.length === 0 ? (
          <p className="text-[0.8125rem] text-ink3">{t("noRoutes")}</p>
        ) : (
          <ul className="divide-y divide-hair border-y border-hair">
            {routes.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-4 py-4">
                <RouteGlyph polyline={r.polyline} size={64} className="text-clay" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate font-semibold">{r.name}</span>
                    {r.tags && <span className="tag">{r.tags}</span>}
                  </div>
                  <p className="mt-0.5 text-micro text-ink3">
                    {(r.distance / 1000).toFixed(1)} km
                    {r.elevationGain > 0 ? ` · ${r.elevationGain} m D+` : ""}
                    {r.timesRun > 0 && ` · ${t("timesRun", { n: r.timesRun })}${r.bestPace ? ` · ${fmtPace(r.bestPace)}` : ""}`}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <a className="btn-outline btn-sm" href={`/api/routes/${r.id}/gpx`} download>
                    GPX
                  </a>
                  <DeleteRouteButton id={r.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function xOf(v: { bbox: { minLon: number; maxLon: number }; scale: number }, lon: number) {
  return Math.round(30 + (lon - v.bbox.minLon) * v.scale);
}
function yOf(v: { bbox: { minLat: number; maxLat: number }; scale: number }, lat: number) {
  return Math.round(30 + (v.bbox.maxLat - lat) * v.scale);
}
function mostUsedStartPoint(nodes: Map<string, { lat: number; lon: number; edges: Array<{ passes: number }> }>) {
  let best: { passes: number; lat: number; lon: number } | null = null;
  for (const n of nodes.values()) {
    const passes = n.edges.reduce((a, e) => a + e.passes, 0);
    if (!best || passes > best.passes) best = { passes, lat: n.lat, lon: n.lon };
  }
  return best ? ([best.lat, best.lon] as [number, number]) : null;
}
