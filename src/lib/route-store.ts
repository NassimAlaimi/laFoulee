/**
 * Accès base de l'atelier de parcours : cache du graphe, parcours enregistrés
 * et points d'intérêt. Toutes les requêtes filtrent par `userId`.
 */

import { prisma } from "./prisma";
import { decodePolyline } from "./polyline";
import { buildGraph, deserializeGraph, findLoops, serializeGraph, type RouteGraph, type LoopOptions } from "./route-graph";
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
    select: { polyline: true, startDate: true },
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

/** Projection du réseau dans une boîte de dessin (équirectangulaire locale). */
export function networkView(graph: RouteGraph) {
  const nodes = [...graph.nodes.values()];
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const n of nodes) {
    minLat = Math.min(minLat, n.lat); maxLat = Math.max(maxLat, n.lat);
    minLon = Math.min(minLon, n.lon); maxLon = Math.max(maxLon, n.lon);
  }
  const W = 1000;
  const pad = 30;
  const spanLat = Math.max(0.0001, maxLat - minLat);
  const spanLon = Math.max(0.0001, maxLon - minLon);
  const scale = (W - 2 * pad) / Math.max(spanLon, spanLat * 1.4);
  const x = (lon: number) => pad + (lon - minLon) * scale;
  const y = (lat: number) => pad + (maxLat - lat) * scale;
  const H = Math.round((maxLat - minLat) * scale + 2 * pad);
  return {
    viewBox: [W, H] as const,
    bbox: { minLat, maxLat, minLon, maxLon },
    scale,
    nodes: nodes.map((n) => ({ id: n.id, x: Math.round(x(n.lon)), y: Math.round(y(n.lat)) })),
    edges: graph.edges.map((e) => {
      const a = graph.nodes.get(e.a)!;
      const b = graph.nodes.get(e.b)!;
      return { x1: Math.round(x(a.lon)), y1: Math.round(y(a.lat)), x2: Math.round(x(b.lon)), y2: Math.round(y(b.lat)), passes: e.passes, id: e.id };
    }),
  };
}
