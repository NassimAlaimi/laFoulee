/**
 * Accès base de l'atelier de parcours : cache du graphe, parcours enregistrés
 * et points d'intérêt. Toutes les requêtes filtrent par `userId`.
 */

import { prisma } from "./prisma";
import { decodePolyline } from "./polyline";
import { buildGraph, deserializeGraph, findLoops, serializeGraph, type RouteGraph, type LoopOptions, type RouteNode, type RouteEdge, type GraphSector } from "./route-graph";
import { viewFor, polylinePath, type ViewBbox } from "./route-view";
import { fetchOverpassRoads } from "./osm";
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

/** Trois boucles générées depuis le réseau. */
export async function generateLoops(userId: string, opts: LoopOptions & { ref?: [number, number] }) {
  const { graph, ref } = (await getRouteGraph(userId)) ?? {};
  if (!graph) return [];
  return findLoops(graph, opts.ref ?? ref ?? [0, 0], opts);
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

function bboxKey(bbox: ViewBbox): string {
  return [bbox.minLat, bbox.maxLat, bbox.minLon, bbox.maxLon].map((n) => n.toFixed(4)).join(",");
}

/** Fond de rues OpenStreetMap autour de la zone, en cache 24 h (par bbox). */
export async function getOsmRoads(userId: string, bbox: ViewBbox, now = new Date()): Promise<string[] | null> {
  const key = bboxKey(bbox);
  const cached = await prisma.osmCache.findUnique({ where: { userId } });
  // Le cache n'est valable que pour la même zone : sinon on refait la requête.
  if (cached && cached.bbox === key && now.getTime() - cached.builtAt.getTime() < 24 * 86400000) {
    try {
      return JSON.parse(cached.data) as string[];
    } catch {
      /* cache illisible : on refait la requête */
    }
  }
  const roads = await fetchOverpassRoads(bbox);
  if (roads === null) return cached && cached.bbox === key ? (JSON.parse(cached.data) as string[]) : null;
  await prisma.osmCache.upsert({
    where: { userId },
    create: { userId, bbox: key, data: JSON.stringify(roads), builtAt: now },
    update: { bbox: key, data: JSON.stringify(roads), builtAt: now },
  });
  return roads;
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
