/**
 * Accès base de l'atelier de parcours : cache du graphe, parcours enregistrés
 * et points d'intérêt. Toutes les requêtes filtrent par `userId`.
 */

import { prisma } from "./prisma";
import { decodePolyline } from "./polyline";
import { buildGraph, deserializeGraph, findLoops, serializeGraph, type GeneratedLoop, type RouteGraph, type LoopOptions, type RouteNode, type RouteEdge, type GraphSector } from "./route-graph";
import { buildStreetGraph, knownPoints } from "./street-graph";
import { viewFor, polylinePath, type ViewBbox } from "./route-view";
import { bboxAround, fetchOverpassRoads, findOsmZone, OSM_FMT, parseOsmZones, putOsmZone, roadsInCache, gridTiles, zoneKey, type OsmDetail } from "./osm";
import { sameRoute } from "./polyline";

const DAY = 86400000;

/** Graphe du réseau personnel, reconstruit si périmé (nouvelles sorties ou 24 h). */
export async function getRouteGraph(userId: string, now = new Date()): Promise<{ graph: RouteGraph; ref: [number, number] } | null> {
  const cached = await prisma.routeGraph.findUnique({ where: { userId } });
  const latest = await prisma.activity.findFirst({
    where: { userId, polyline: { not: null } },
    orderBy: { startDate: "desc" },
    select: { startDate: true },
  });
  if (cached && latest && cached.builtAt.getTime() >= latest.startDate.getTime() && now.getTime() - cached.builtAt.getTime() < DAY) {
    const g = deserializeGraph(cached.data);
    if (g) return { graph: g, ref: [0, 0] };
  }
  const acts = await prisma.activity.findMany({
    where: { userId, polyline: { not: null } },
    select: { polyline: true, startDate: true, distance: true },
    orderBy: { startDate: "asc" },
  });
  const graph = buildGraph(acts);
  if (graph.nodes.size === 0) return null;
  await prisma.routeGraph.upsert({
    where: { userId },
    create: { userId, data: serializeGraph(graph), builtAt: now },
    update: { data: serializeGraph(graph), builtAt: now },
  });
  return { graph, ref: [0, 0] };
}

/**
 * Boucles proposées. D'abord sur les **vraies rues** (OSM en cache autour du
 * départ, complété si besoin), avec le réseau personnel comme mesure de
 * familiarité ; sinon sur le seul réseau personnel.
 */
export async function generateLoops(
  userId: string,
  opts: LoopOptions & { ref?: [number, number] }
): Promise<{ loops: GeneratedLoop[]; source: "streets" | "network" }> {
  const got = await getRouteGraph(userId);
  if (!got) return { loops: [], source: "network" };
  const { graph } = got;
  const start = opts.ref && opts.start ? opts.ref : null;
  if (start) {
    const radiusM = Math.min(9000, Math.max(1200, opts.targetMeters * 0.45));
    const bbox = bboxAround(start[0], start[1], (2 * radiusM) / 1000);
    let roads = await cachedRoads(userId, bbox);
    if (roads.length < MIN_STREET_ROADS) {
      // Rien en cache (carte jamais ouverte) : on charge la zone, tuile par
      // tuile, dans une limite de temps raisonnable.
      const deadline = Date.now() + 25_000;
      for (const tile of gridTiles(bbox)) {
        if (Date.now() > deadline) break;
        await getOsmRoads(userId, tile, new Date(), { detail: "all" }).catch(() => null);
      }
      roads = await cachedRoads(userId, bbox);
    }
    if (roads.length >= MIN_STREET_ROADS) {
      const streets = buildStreetGraph(roads, knownPoints(graph), { center: start, radiusM, explore: opts.explore });
      const loops = findLoops(streets, start, { ...opts, start: { x: 0, y: 0 }, samples: 90 });
      if (loops.length) return { loops, source: "streets" };
    }
  }
  return { loops: findLoops(graph, opts.ref ?? [0, 0], opts), source: "network" };
}

/** En dessous, le fond OSM est trop maigre pour y tracer des boucles. */
const MIN_STREET_ROADS = 300;

async function cachedRoads(userId: string, bbox: ViewBbox): Promise<string[]> {
  const row = await prisma.osmCache.findUnique({ where: { userId } });
  if (!row) return [];
  return roadsInCache(parseOsmZones(row.data, row.bbox, row.builtAt.getTime()), bbox, Date.now(), OSM_MAX_AGE);
}

export async function saveRoute(userId: string, input: { name: string; polyline: string; distance: number; tags?: string | null; elevationGain?: number }) {
  const pts = decodePolyline(input.polyline);
  if (pts.length < 2) return null;
  return prisma.route.create({
    data: {
      userId,
      name: input.name,
      polyline: input.polyline,
      distance: input.distance,
      elevationGain: input.elevationGain ?? 0,
      tags: input.tags ?? null,
      startLat: pts[0][0],
      startLng: pts[0][1],
    },
  });
}

const OSM_MAX_AGE = 7 * DAY; // les rues bougent peu

/**
 * Fond de rues OpenStreetMap pour une zone. Le cache garde plusieurs zones
 * (atelier de parcours, carte des activités…) et réutilise une zone plus
 * grande qui contient celle demandée : Overpass n'est appelé qu'en dernier
 * recours.
 */
export async function getOsmRoads(
  userId: string,
  bbox: ViewBbox,
  now = new Date(),
  { cacheOnly = false, detail }: { cacheOnly?: boolean; detail?: OsmDetail } = {}
): Promise<string[] | null> {
  const cached = await prisma.osmCache.findUnique({ where: { userId } });
  const zones = cached ? parseOsmZones(cached.data, cached.bbox, cached.builtAt.getTime()) : [];
  const hit = findOsmZone(zones, bbox, now.getTime(), OSM_MAX_AGE, detail);
  if (hit) return hit.roads;
  // Rendu de page : on ne bloque jamais sur Overpass (jusqu'à 24 s).
  if (cacheOnly) return null;
  const roads = await fetchOverpassRoads(bbox, detail ? detail === "all" : undefined);
  if (roads === null) {
    // Overpass indisponible : une zone périmée vaut mieux que rien.
    return findOsmZone(zones, bbox, now.getTime(), Infinity, detail)?.roads ?? null;
  }
  // Écriture sérialisée par utilisateur, cache relu juste avant : deux tuiles
  // chargées en parallèle ne s'écrasent pas l'une l'autre.
  await withOsmLock(userId, async () => {
    const fresh = await prisma.osmCache.findUnique({ where: { userId } });
    const current = fresh ? parseOsmZones(fresh.data, fresh.bbox, fresh.builtAt.getTime()) : [];
    const next = putOsmZone(current, { key: zoneKey(bbox, detail), bbox, builtAt: now.getTime(), roads, detail, fmt: OSM_FMT });
    const data = JSON.stringify({ zones: next });
    await prisma.osmCache.upsert({
      where: { userId },
      create: { userId, bbox: "multi", data, builtAt: now },
      update: { bbox: "multi", data, builtAt: now },
    });
  });
  return roads;
}

const osmLocks = new Map<string, Promise<unknown>>();
async function withOsmLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const prev = osmLocks.get(userId) ?? Promise.resolve();
  const run = prev.catch(() => null).then(fn);
  osmLocks.set(userId, run);
  try {
    return await run;
  } finally {
    if (osmLocks.get(userId) === run) osmLocks.delete(userId);
  }
}

/** Premier point de chaque sortie tracée (départ habituel). */
export async function activityStarts(userId: string): Promise<Array<[number, number]>> {
  const acts = await prisma.activity.findMany({ where: { userId, polyline: { not: null } }, select: { polyline: true } });
  const out: Array<[number, number]> = [];
  for (const a of acts) {
    const first = firstPoint(a.polyline);
    if (first) out.push(first);
  }
  return out;
}

/** Premier point d'une polyline, sans la décoder entière. */
function firstPoint(encoded: string | null): [number, number] | null {
  if (!encoded) return null;
  const pts = decodePolyline(encoded.slice(0, 24));
  return pts.length ? pts[0] : null;
}

/** Distance totale réellement courue (somme des activités tracées), en km. */
export async function graphTotalKm(userId: string): Promise<number> {
  const agg = await prisma.activity.aggregate({
    where: { userId, polyline: { not: null } },
    _sum: { distance: true },
  });
  return (agg._sum.distance ?? 0) / 1000;
}

/** Parcours enregistrés + combien de fois courus (rapprochement par tracé). */
export async function listRoutes(userId: string) {
  const [routes, acts] = await Promise.all([
    prisma.route.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.activity.findMany({
      where: { userId, polyline: { not: null } },
      select: { polyline: true, distance: true, startDate: true, averageSpeed: true },
      orderBy: { startDate: "desc" },
    }),
  ]);
  return routes.map((r) => {
    const matches = acts.filter((a) => a.polyline && sameRoute({ polyline: r.polyline, distance: r.distance }, { polyline: a.polyline, distance: a.distance }));
    let bestPace: number | null = null;
    for (const m of matches) if (m.averageSpeed) {
      const pace = 1000 / m.averageSpeed;
      if (!bestPace || pace < bestPace) bestPace = Math.round(pace);
    }
    return { id: r.id, name: r.name, polyline: r.polyline, distance: r.distance, elevationGain: r.elevationGain, tags: r.tags, createdAt: r.createdAt, timesRun: matches.length, bestPace };
  });
}

export async function deleteRoute(userId: string, id: string) {
  await prisma.route.deleteMany({ where: { id, userId } });
}

export async function listPois(userId: string) {
  return prisma.routePoi.findMany({ where: { userId } });
}

export async function addPoi(userId: string, p: { kind: string; lat: number; lng: number; note?: string | null }) {
  return prisma.routePoi.create({ data: { userId, kind: p.kind, lat: p.lat, lng: p.lng, note: p.note ?? null } });
}

export async function deletePoi(userId: string, id: string) {
  await prisma.routePoi.deleteMany({ where: { id, userId } });
}

/** GPX minimal (sans altitude) pour la montre, depuis une polyline. */
export function polylineToGpx(name: string, polyline: string): string {
  const pts = decodePolyline(polyline);
  const body = pts
    .map(([lat, lon]) => `  <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"></trkpt>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Foulée">\n <trk><name>${name.replace(/[<>&]/g, "")}</name><trkseg>\n${body}\n </trkseg></trk>\n</gpx>\n`;
}

/** Bbox du réseau personnel. */
export function networkBbox(graph: RouteGraph): ViewBbox {
  return bboxOfNodes(graph.nodes.values());
}

function bboxOfNodes(nodes: Iterable<RouteNode>): ViewBbox {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const n of nodes) {
    minLat = Math.min(minLat, n.lat); maxLat = Math.max(maxLat, n.lat);
    minLon = Math.min(minLon, n.lon); maxLon = Math.max(maxLon, n.lon);
  }
  return { minLat, maxLat, minLon, maxLon };
}

/** Bbox d'un secteur (composante connexe du réseau). */
export function sectorBbox(sector: GraphSector): ViewBbox {
  return bboxOfNodes(sector.nodes.values());
}

/** Projection du réseau dans une boîte de dessin (équirectangulaire locale). */
export function networkView(graph: RouteGraph, bboxOverride?: ViewBbox) {
  const bbox = bboxOverride ?? networkBbox(graph);
  return buildView(graph.nodes.values(), graph.edges, graph.nodes, bbox);
}

/** Projection d'un secteur dans une boîte de dessin. */
export function sectorView(sector: GraphSector, bboxOverride?: ViewBbox) {
  const bbox = bboxOverride ?? sectorBbox(sector);
  return buildView(sector.nodes.values(), sector.edges, sector.nodes, bbox);
}

function buildView(
  nodeIter: Iterable<RouteNode>,
  edges: RouteEdge[],
  nodeMap: Map<string, RouteNode>,
  bbox: ViewBbox
) {
  const v = viewFor(bbox);
  const nodes = [...nodeIter];
  return {
    viewBox: [v.W, v.H] as const,
    bbox: v.bbox,
    scale: v.scale,
    nodes: nodes.map((n) => ({ id: n.id, x: Math.round(v.x(n.lon)), y: Math.round(v.y(n.lat)) })),
    edges: edges.map((e) => {
      const a = nodeMap.get(e.a)!;
      const b = nodeMap.get(e.b)!;
      return { x1: Math.round(v.x(a.lon)), y1: Math.round(v.y(a.lat)), x2: Math.round(v.x(b.lon)), y2: Math.round(v.y(b.lat)), passes: e.passes, id: e.id };
    }),
  };
}
