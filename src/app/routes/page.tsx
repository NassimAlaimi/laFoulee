import { getTranslations } from "next-intl/server";
import { pageMeta } from "@/lib/page-meta";
import { PageHead, Section } from "@/components/ui/Layout";
import { RouteGlyph } from "@/components/route/RouteGlyph";
import { RouteAtelier } from "@/components/route/RouteAtelier";
import { DeleteRouteButton } from "@/components/route/DeleteRouteButton";
import { requireUserId } from "@/lib/auth";
import { fmtPace } from "@/lib/format";
import { graphSectors } from "@/lib/route-graph";
import {
  getRouteGraph,
  listPois,
  listRoutes,
  sectorBbox,
  sectorView,
  graphTotalKm,
} from "@/lib/route-store";
import { framedBbox, polylinePath } from "@/lib/route-view";
import { bboxSpanKm, MINOR_WAYS_MAX_KM, tileBbox } from "@/lib/osm";
import { straightSegments } from "@/lib/route-graph";
import { encodePolyline } from "@/lib/polyline";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return pageMeta("routes");
}

/** Atelier de parcours — dessiner sur son propre réseau, sans tuiles. */
export default async function RoutesPage() {
  const t = await getTranslations("routes");
  const userId = await requireUserId();
  const got = await getRouteGraph(userId);
  const graph = got?.graph ?? null;
  const [routes, pois] = await Promise.all([listRoutes(userId), listPois(userId)]);
  const totalKm = graph ? await graphTotalKm(userId) : 0;

  // Un seul point de vue, simple et logique : le cœur du territoire (le
  // cluster le plus couru). Plus de sélecteur de « secteurs » : on affiche
  // directement la zone où l'on s'entraîne le plus.
  const focus = graph ? (graphSectors(graph)[0] ?? null) : null;

  // Fond OSM : les rues autour du cœur (borné), en cache 24 h.
  // Le cadre couvre tout le cœur (marge + proportions lisibles) : plus de bande
  // écrasée ni de réseau rogné. Le fond de rues est chargé par la carte elle-même,
  // tuile par tuile : la page ne bloque jamais sur Overpass.
  let view: ReturnType<typeof sectorView> | null = null;
  let osmTiles: ReturnType<typeof tileBbox> = [];
  let osmDetail: "streets" | "all" = "all";
  if (focus) {
    const frame = framedBbox(sectorBbox(focus));
    view = sectorView(focus, frame);
    osmTiles = tileBbox(frame);
    osmDetail = bboxSpanKm(frame) <= MINOR_WAYS_MAX_KM ? "all" : "streets";
  }
  const straights = graph ? straightSegments(graph, 400).slice(0, 12) : [];
  const start = focus ? mostUsedStartPoint(focus.nodes) : null;

  // Parcours enregistrés, projetés sur la carte (même bbox que le réseau).
  let savedOnMap: Array<{ id: string; name: string; meters: number; d: string }> = [];
  if (view) {
    savedOnMap = routes
      .map((r) => ({ id: r.id, name: r.name, meters: r.distance, d: polylinePath(r.polyline, view.bbox) }))
      .filter((r) => r.d);
  }

  return (
    <div className="space-y-14">
      <PageHead
        kicker={t("kicker")}
        title={t("title")}
        meta={graph ? t("metaSome", { km: Math.round(totalKm), roads: graph.edges.length }) : t("metaNone")}
      />

      {graph && (
        <div className="rise mb-10 flex flex-wrap items-end justify-between gap-x-12 gap-y-6 border-b border-hair pb-10">
          <div className="flex items-baseline gap-3">
            <span className="display text-[clamp(3.5rem,8vw,5.5rem)] leading-[0.85] tracking-[-0.05em] text-clay">
              {Math.round(totalKm)}
            </span>
            <span className="text-[0.9375rem] text-ink3">km</span>
          </div>
          <p className="max-w-md text-[clamp(1.05rem,2vw,1.375rem)] font-medium leading-snug tracking-[-0.01em]">
            {t("territoryLead")}
          </p>
        </div>
      )}

      {view ? (
        <RouteAtelier
          view={{
            ...view,
            osm: [],
            osmTiles,
            osmDetail,
            pois: pois.map((p) => ({ id: p.id, kind: p.kind, x: xOf(view, p.lng), y: yOf(view, p.lat), note: p.note })),
          }}
          kinds={(["fountain", "toilet", "car", "bakery", "lit", "danger", "track"] as const).map((k) => [k, t(`poi_${k}`)])}
          hasGraph={Boolean(graph)}
          startLat={start?.[0] ?? null}
          startLng={start?.[1] ?? null}
          routes={savedOnMap}
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
