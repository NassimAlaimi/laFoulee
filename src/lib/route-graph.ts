/**
 * Atelier de parcours — le réseau personnel comme carte.
 *
 * Pas de service de tuiles (AGENTS.md) : on construit le **graphe des rues
 * déjà courues** à partir des tracés (`summary_polyline`). Les points sont
 * projetés en mètres autour du premier point, aimantés sur une grille de
 * ~15 m : deux passages dans la même rue tombent sur les mêmes cellules, et
 * les cellules adjacentes deviennent des arêtes pondérées (longueur, nombre
 * de passages, dernière date).
 *
 * Trois façons de créer un parcours :
 * - `findLoops` : « une boucle de D km » — marche aléatoire vers l'extérieur
 *   puis plus court chemin de retour, notée sur l'ajustement à la distance,
 *   le peu d'allers-retours, et un curseur habitude ↔ découverte ;
 * - `shortestPath` : le dessin guidé (le tracé s'aimante au réseau) ;
 * - `straightSegments` : lignes droites plates pour le fractionné.
 *
 * Le dénivelé par tronçon arrive plus tard (altitude des imports FIT).
 * Fonctions pures, testées dans tests/route-graph.test.ts.
 */

import { decodePolyline, encodePolyline, haversine, type LatLng } from "./polyline";

export const CELL = 15; // m

export type GraphActivity = { polyline: string | null; startDate: Date };

export type RouteEdge = {
  id: string;
  a: string;
  b: string;
  meters: number;
  passes: number;
  lastPassed: number;
  /** centre de la cellule */
  points: LatLng[];
};

export type RouteNode = { id: string; lat: number; lon: number; edges: RouteEdge[] };

export type RouteGraph = {
  nodes: Map<string, RouteNode>;
  edges: RouteEdge[];
  cellMeters: number;
};

// ---------------------------------------------------------------- Projection

function project(lat: number, lon: number, ref: LatLng) {
  const cos = Math.cos((ref[0] * Math.PI) / 180);
  return { x: (lon - ref[1]) * 111_320 * cos, y: (lat - ref[0]) * 111_320 };
}
function unproject(x: number, y: number, ref: LatLng): LatLng {
  const cos = Math.cos((ref[0] * Math.PI) / 180);
  return [ref[0] + y / 111_320, ref[1] + x / (111_320 * cos)];
}
const cellKey = (x: number, y: number) => `${Math.round(x / CELL)}:${Math.round(y / CELL)}`;

function polylinePoints(encoded: string | null): LatLng[] {
  return encoded ? decodePolyline(encoded) : [];
}

/** Construit le graphe. Les tracés vides ou dégénérés sont ignorés. */
export function buildGraph(activities: GraphActivity[], ref?: LatLng): RouteGraph {
  let reference = ref;
  // Premier point du premier tracé non vide : origine locale.
  if (!reference) {
    outer: for (const a of activities) {
      const pts = polylinePoints(a.polyline);
      if (pts.length) {
        reference = pts[0];
        break outer;
      }
    }
  }
  reference ??= [0, 0];

  const nodes = new Map<string, RouteNode>();
  const edgeMap = new Map<string, RouteEdge>();
  const getNode = (key: string, lat: number, lon: number): RouteNode => {
    let n = nodes.get(key);
    if (!n) {
      n = { id: key, lat, lon, edges: [] };
      nodes.set(key, n);
    } else {
      // Moyenne glissante de la position du nœud.
      const k = 0.5;
      n.lat += (lat - n.lat) * k;
      n.lon += (lon - n.lon) * k;
    }
    return n;
  };
  const edgeId = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  for (const act of activities) {
    const pts = polylinePoints(act.polyline);
    if (pts.length < 2) continue;
    const t = act.startDate.getTime();
    let prevKey: string | null = null;
    let prevPt: LatLng | null = null;
    const seen = new Set<string>();
    for (const p of pts) {
      const { x, y } = project(p[0], p[1], reference);
      const key = cellKey(x, y);
      if (prevKey && key !== prevKey) {
        const a = getNode(prevKey, prevPt![0], prevPt![1]);
        const b = getNode(key, p[0], p[1]);
        const id = edgeId(prevKey, key);
        const m = haversine(prevPt!, p);
        let e = edgeMap.get(id);
        if (!e) {
          e = { id, a: prevKey, b: key, meters: m, passes: 0, lastPassed: 0, points: [] };
          edgeMap.set(id, e);
          a.edges.push(e);
          b.edges.push(e);
        }
        // La géométrie de l'arête suit le dernier passage (le plus fidèle).
        e.points = [prevPt!, p];
        e.passes++;
        e.lastPassed = Math.max(e.lastPassed, t);
        e.meters = m;
        if (!seen.has(id)) {
          seen.add(id);
        }
      }
      prevKey = key;
      prevPt = p;
    }
  }
  return { nodes, edges: [...edgeMap.values()], cellMeters: CELL };
}

export type LoopOptions = {
  targetMeters: number;
  /** 0 = habitude (rues très courues), 1 = découverte (rues oubliées) */
  explore?: number;
  attempts?: number;
  seed?: number;
  /** 0 = plus fréquent, sinon cellule de départ {x,y} en mètres */
  start?: { x: number; y: number } | null;
};

export type GeneratedLoop = {
  points: LatLng[];
  meters: number;
  score: number;
  /** part d'arêtes reprises (aller-retour) */
  reuse: number;
  /** part d'arêtes peu courues (1 = tout nouveau) */
  novelty: number;
};

export type RouteResult = { polyline: string; meters: number; score: number; reuse: number; novelty: number };

function nodeCenter(g: RouteGraph, id: string, ref: LatLng): { x: number; y: number } {
  const n = g.nodes.get(id)!;
  return project(n.lat, n.lon, ref);
}

/** Le nœud le plus proche d'une position, à moins de `radius` mètres. */
export function nearestNode(g: RouteGraph, ref: LatLng, point: LatLng, radius = 80): string | null {
  const { x, y } = project(point[0], point[1], ref);
  let best: string | null = null;
  let bestD = radius;
  for (const n of g.nodes.values()) {
    const c = nodeCenter(g, n.id, ref);
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < bestD) {
      bestD = d;
      best = n.id;
    }
  }
  return best;
}

/** File de priorité minimale (tas binaire), sans décrément — Dijkstra paresseux. */
class MinHeap {
  private h: Array<{ n: string; d: number }> = [];
  get size() {
    return this.h.length;
  }
  push(n: string, d: number) {
    this.h.push({ n, d });
    let i = this.h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.h[i].d >= this.h[p].d) break;
      const t = this.h[i];
      this.h[i] = this.h[p];
      this.h[p] = t;
      i = p;
    }
  }
  pop(): { n: string; d: number } | null {
    if (!this.h.length) return null;
    const top = this.h[0];
    const last = this.h.pop()!;
    if (this.h.length) {
      this.h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let m = i;
        if (l < this.h.length && this.h[l].d < this.h[m].d) m = l;
        if (r < this.h.length && this.h[r].d < this.h[m].d) m = r;
        if (m === i) break;
        const t = this.h[i];
        this.h[i] = this.h[m];
        this.h[m] = t;
        i = m;
      }
    }
    return top;
  }
}

/** Dijkstra depuis `from` vers tous : distances et arbre de plus courts chemins. */
function dijkstraAll(g: RouteGraph, from: string, forbidden = new Set<string>()) {
  const heap = new MinHeap();
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, RouteEdge | null>([[from, null]]);
  heap.push(from, 0);
  while (heap.size) {
    const cur = heap.pop()!;
    if (cur.d > (dist.get(cur.n) ?? Infinity)) continue;
    for (const e of g.nodes.get(cur.n)!.edges) {
      if (forbidden.has(e.id)) continue;
      const v = e.a === cur.n ? e.b : e.a;
      const nd = cur.d + e.meters;
      if (nd < (dist.get(v) ?? Infinity)) {
        dist.set(v, nd);
        prev.set(v, e);
        heap.push(v, nd);
      }
    }
  }
  return { dist, prev };
}

function reconstruct(g: RouteGraph, prev: Map<string, RouteEdge | null>, from: string, to: string): RouteEdge[] | null {
  if (!prev.has(to)) return null;
  const path: RouteEdge[] = [];
  let cur = to;
  while (cur !== from) {
    const e = prev.get(cur);
    if (!e) return null;
    path.push(e);
    cur = e.a === cur ? e.b : e.a;
  }
  return path.reverse();
}

function dijkstra(g: RouteGraph, from: string, to: string, forbidden = new Set<string>()): RouteEdge[] | null {
  return reconstruct(g, dijkstraAll(g, from, forbidden).prev, from, to);
}

/** Points d'un chemin d'arêtes, orienté de `from` vers `to`. */
function edgePathPoints(g: RouteGraph, from: string, edges: RouteEdge[]): LatLng[] {
  const out: LatLng[] = [];
  let cur = from;
  for (const e of edges) {
    const n = g.nodes.get(e.a === cur ? e.b : e.a)!;
    // e.points va de e.a vers e.b ; on l'oriente.
    const pts = e.a === cur ? e.points : [...e.points].reverse();
    const start = g.nodes.get(cur)!;
    out.push([start.lat, start.lon]);
    for (const p of pts.slice(1)) out.push(p);
    cur = e.a === cur ? e.b : e.a;
  }
  out.push([g.nodes.get(cur)!.lat, g.nodes.get(cur)!.lon]);
  return out;
}

/**
 * Boucles de distance cible : marche aléatoire jusqu'à ~D/2, puis plus court
 * chemin de retour. Renvoie les meilleures, dédupliquées.
 */
export function findLoops(g: RouteGraph, ref: LatLng, opts: LoopOptions): GeneratedLoop[] {
  const explore = Math.max(0, Math.min(1, opts.explore ?? 0.5));
  const now = Date.now();
  const target = opts.targetMeters;
  const minD = target * 0.9;
  const maxD = target * 1.1;
  let startId: string | null;
  if (opts.start) {
    const un = unproject(opts.start.x, opts.start.y, ref);
    startId = nearestNode(g, ref, un, 1000) ?? [...g.nodes.keys()][0] ?? null;
  } else {
    startId = mostUsedStart(g, ref);
  }
  if (!startId) return [];

  // Tous les plus courts chemins depuis le départ.
  const fromStart = dijkstraAll(g, startId);
  const candidates = [...fromStart.dist.entries()]
    .filter(([, d]) => d >= target * 0.3 && d <= target * 0.7)
    .sort((a, b) => a[1] - b[1]);
  // Échantillon étalé : jusqu'à 70 nœuds répartis sur la plage de distance.
  const sample: string[] = [];
  if (candidates.length) {
    const stride = Math.max(1, Math.floor(candidates.length / 70));
    for (let i = 0; i < candidates.length; i += stride) sample.push(candidates[i][0]);
  }

  const raw: GeneratedLoop[] = [];
  for (const x of sample) {
    const p1 = reconstruct(g, fromStart.prev, startId, x);
    if (!p1) continue;
    const forbidden = new Set(p1.map((e) => e.id));
    const back = dijkstraAll(g, x, forbidden);
    const p2 = reconstruct(g, back.prev, x, startId);
    if (!p2) continue;
    const total = p1.reduce((a, e) => a + e.meters, 0) + p2.reduce((a, e) => a + e.meters, 0);
    if (total < minD || total > maxD) continue;
    const allEdges = [...p1, ...p2];
    const reuse = countReuse(allEdges);
    const novelty = allEdges.reduce((a, e) => a + (e.passes <= 2 ? 1 : 0), 0) / allEdges.length;
    const fit = 1 - Math.abs(total - target) / target;
    const score = fit * 0.5 + (1 - reuse) * 0.3 + novelty * (explore > 0.5 ? 0.2 : 0.05);
    raw.push({ points: edgePathPoints(g, startId, allEdges), meters: Math.round(total), score, reuse, novelty });
  }
  const seen = new Set<string>();
  const uniq: GeneratedLoop[] = [];
  for (const r of raw.sort((a, b) => b.score - a.score)) {
    const sig = `${r.meters}-${r.points[0][0].toFixed(3)},${r.points[0][1].toFixed(3)}-${r.points[Math.floor(r.points.length / 2)][0].toFixed(3)}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    uniq.push(r);
    if (uniq.length >= 3) break;
  }
  return uniq;
}

function countReuse(edges: RouteEdge[]): number {
  const ids = new Set<string>();
  let dup = 0;
  for (const e of edges) if (ids.has(e.id)) dup++;
  else ids.add(e.id);
  return edges.length ? dup / edges.length : 1;
}

export function mostUsedStart(g: RouteGraph, ref: LatLng): string | null {
  let best: string | null = null;
  let bestPasses = 0;
  for (const n of g.nodes.values()) {
    const p = n.edges.reduce((a, e) => a + e.passes, 0);
    if (p > bestPasses) {
      bestPasses = p;
      best = n.id;
    }
  }
  return best;
}

/** Plus court chemin entre deux points (dessin guidé). */
export function shortestPath(g: RouteGraph, ref: LatLng, a: LatLng, b: LatLng): { points: LatLng[]; meters: number } | null {
  const na = nearestNode(g, ref, a, 120);
  const nb = nearestNode(g, ref, b, 120);
  if (!na || !nb || na === nb) return null;
  const edges = dijkstra(g, na, nb);
  if (!edges) return null;
  const pts = edgePathPoints(g, na, edges);
  return { points: pts, meters: Math.round(edges.reduce((s, e) => s + e.meters, 0)) };
}

export type StraightSegment = { points: LatLng[]; meters: number; straightness: number };

/**
 * Lignes quasi droites de ≥ `minMeters` (fractionné) : suites de cellules dont
 * le cap varie peu. La rectitude = 1 − (écart de cap moyen / 45°), bornée.
 */
export function straightSegments(g: RouteGraph, minMeters = 400): StraightSegment[] {
  const out: StraightSegment[] = [];
  for (const start of g.nodes.values()) {
    for (const e0 of start.edges) {
      const pts: LatLng[] = [[start.lat, start.lon]];
      let meters = 0;
      let heading = bearing(e0, start, g);
      let cur = e0;
      let from = start.id;
      let turn = 0;
      const used = new Set<string>([e0.id]);
      for (let i = 0; i < 200; i++) {
        const n = g.nodes.get(cur.a === from ? cur.b : cur.a)!;
        pts.push([n.lat, n.lon]);
        meters += cur.meters;
        // Choix de la suite la plus rectiligne
        const nexts = n.edges.filter((e) => !used.has(e.id));
        if (!nexts.length) break;
        let best: RouteEdge | null = null;
        let bestDiff = Infinity;
        for (const e of nexts) {
          const d = bearing(e, n, g);
          let diff = Math.abs(angleDiff(heading, d));
          if (diff < bestDiff) {
            bestDiff = diff;
            best = e;
          }
        }
        if (bestDiff > 30) break;
        turn += bestDiff;
        heading = bearing(best!, n, g);
        from = n.id;
        cur = best!;
        used.add(cur.id);
      }
      if (meters >= minMeters - 1) {
        out.push({ points: pts, meters: Math.round(meters), straightness: Math.max(0, 1 - turn / pts.length / 45) });
      }
    }
  }
  out.sort((a, b) => b.meters - a.meters);
  // Dédupliquer les sous-segments d'une même ligne.
  const uniq: StraightSegment[] = [];
  const seen = new Set<string>();
  for (const s of out) {
    const sig = s.points[0][0].toFixed(3) + s.points[s.points.length - 1][0].toFixed(3) + s.meters;
    if (seen.has(sig)) continue;
    seen.add(sig);
    uniq.push(s);
    if (uniq.length >= 40) break;
  }
  return uniq;
}

function bearing(e: RouteEdge, at: RouteNode, g: RouteGraph): number {
  const other = g.nodes.get(e.a === at.id ? e.b : e.a)!;
  const dx = other.lon - at.lon;
  const dy = other.lat - at.lat;
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}
function angleDiff(a: number, b: number): number {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/** Sérialisation du graphe pour le cache base (RouteGraph.data). */
export function serializeGraph(g: RouteGraph): string {
  return JSON.stringify({
    cell: g.cellMeters,
    nodes: [...g.nodes.values()].map((n) => ({ id: n.id, lat: n.lat, lon: n.lon })),
    edges: g.edges.map((e) => ({ id: e.id, a: e.a, b: e.b, m: Math.round(e.meters), p: e.passes, t: e.lastPassed })),
  });
}

export function deserializeGraph(raw: string): RouteGraph | null {
  try {
    const o = JSON.parse(raw);
    const nodes = new Map<string, RouteNode>();
    for (const n of o.nodes) nodes.set(n.id, { id: n.id, lat: n.lat, lon: n.lon, edges: [] });
    const edges: RouteEdge[] = o.edges.map((e: any) => ({ id: e.id, a: e.a, b: e.b, meters: e.m, passes: e.p, lastPassed: e.t, points: [] }));
    for (const e of edges) {
      nodes.get(e.a)!.edges.push(e);
      nodes.get(e.b)!.edges.push(e);
    }
    return { nodes, edges, cellMeters: o.cell };
  } catch {
    return null;
  }
}

/** Boucle générée → polyline encodée. */
export function loopToRoute(g: RouteGraph, loop: GeneratedLoop): RouteResult {
  return { polyline: encodePolyline(loop.points), meters: loop.meters, score: loop.score, reuse: loop.reuse, novelty: loop.novelty };
}
