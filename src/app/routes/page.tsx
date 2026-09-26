import { getTranslations } from "next-intl/server";
import { pageMeta } from "@/lib/page-meta";
import { PageHead, Section } from "@/components/ui/Layout";
import { RouteGlyph } from "@/components/route/RouteGlyph";
import { RouteAtelier } from "@/components/route/RouteAtelier";
import { DeleteRouteButton } from "@/components/route/DeleteRouteButton";
import { requireUserId } from "@/lib/auth";
import { fmtPace } from "@/lib/format";
import { graphSectors, sectorCore, straightSegments, territoryStats, usualStart } from "@/lib/route-graph";
import { activityStarts, getRouteGraph, listPois, listRoutes, sectorBbox, sectorView, graphTotalKm } from "@/lib/route-store";
import { buildMapFrame, projectPolyline, type AtelierView } from "@/lib/route-view";
import { encodePolyline, haversine } from "@/lib/polyline";

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

  // Un seul point de vue : le secteur le plus couru, ouvert sur son cœur (là
  // où l'on court vraiment) — on peut dézoomer jusqu'au secteur entier.
  const focus = graph ? (graphSectors(graph)[0] ?? null) : null;
  const stats = graph ? territoryStats(graph) : null;

  let view: AtelierView | null = null;
  let straights: Array<{ d: string; box: AtelierView["core"]; meters: number; passes: number; fromStart: number | null }> = [];
  let savedOnMap: Array<{ id: string; name: string; meters: number; d: string }> = [];
  let zoneKm: { w: number; h: number } | null = null;
  const core = focus ? sectorCore(focus) : null;
  const start = focus ? (usualStart(await activityStarts(userId), core?.center) ?? mostUsedStartPoint(focus.nodes)) : null;
  if (focus) {
    const mf = buildMapFrame(sectorBbox(focus), core?.bbox ?? null);
    const sv = sectorView(focus, mf.bbox);
    const v = mf.v;
    if (core) {
      const k = 111.32 * Math.cos((core.center[0] * Math.PI) / 180);
      zoneKm = { w: Math.round((core.bbox.maxLon - core.bbox.minLon) * k), h: Math.round((core.bbox.maxLat - core.bbox.minLat) * 111.32) };
    }
    view = {
      viewBox: sv.viewBox,
      bbox: sv.bbox,
      pxPerMeter: v.pxPerMeter,
      edges: sv.edges.map(({ x1, y1, x2, y2, passes }) => ({ x1, y1, x2, y2, passes })),
      core: mf.core,
      start: start ? { x: v.x(start[1]), y: v.y(start[0]) } : null,
      tiles: mf.tiles,
      pois: pois.map((p) => ({ id: p.id, kind: p.kind, x: v.x(p.lng), y: v.y(p.lat), note: p.note })),
    };
    straights = straightSegments(focus, 400, { near: start }).flatMap((s) => {
      const pr = projectPolyline(encodePolyline(s.points), sv.bbox);
      if (!pr) return [];
      const mid = s.points[Math.floor(s.points.length / 2)];
      return [{ ...pr, meters: s.meters, passes: Math.round(s.passes), fromStart: start ? haversine(start, mid) : null }];
    });
    savedOnMap = routes.flatMap((r) => {
      const pr = projectPolyline(r.polyline, sv.bbox);
      return pr ? [{ id: r.id, name: r.name, meters: r.distance, d: pr.d }] : [];
    });
  }

  return (
    <div className="space-y-14">
      <PageHead
        kicker={t("kicker")}
        title={t("title")}
        meta={graph ? (zoneKm ? t("metaZone", zoneKm) : null) : t("metaNone")}
      />

      {stats && (
        <div className="rise flex flex-wrap items-end gap-x-14 gap-y-5 border-b border-hair pb-10">
          <div>
            <div className="display text-[clamp(3.75rem,9vw,6.5rem)] leading-[0.82] tracking-[-0.055em] text-clay">
              {Math.round(stats.uniqueKm)}
            </div>
            <div className="mt-3 text-micro font-medium uppercase tracking-[0.14em] text-ink3">{t("uniqueKm")}</div>
          </div>
          <p className="max-w-xl pb-1 text-[clamp(1.15rem,2.2vw,1.55rem)] font-medium leading-[1.25] tracking-[-0.015em] text-ink">
            {t("halfLead", { total: Math.round(totalKm), half: Math.round(stats.halfKm) })}
          </p>
        </div>
      )}

      {view ? (
        <RouteAtelier
          view={view}
          kinds={(["fountain", "toilet", "car", "bakery", "lit", "danger", "track"] as const).map((k) => [k, t(`poi_${k}`)])}
          startLat={start?.[0] ?? null}
          startLng={start?.[1] ?? null}
          routes={savedOnMap}
          straights={straights}
        />
      ) : (
        <p className="max-w-2xl text-[0.8125rem] leading-relaxed text-ink2">{t("emptyGraph")}</p>
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

function mostUsedStartPoint(nodes: Map<string, { lat: number; lon: number; edges: Array<{ passes: number }> }>) {
  let best: { passes: number; lat: number; lon: number } | null = null;
  for (const n of nodes.values()) {
    const passes = n.edges.reduce((a, e) => a + e.passes, 0);
    if (!best || passes > best.passes) best = { passes, lat: n.lat, lon: n.lon };
  }
  return best ? ([best.lat, best.lon] as [number, number]) : null;
}
