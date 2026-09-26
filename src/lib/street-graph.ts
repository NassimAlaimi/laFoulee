/**
 * Graphe routable des **vraies rues** (OpenStreetMap), pour proposer des
 * boucles qui ne se limitent pas aux brins des sorties passées.
 *
 * Le réseau personnel (route-graph) est construit depuis des tracés résumés :
 * quelques centaines de brins parallèles, trop pauvres pour offrir trois
 * boucles différentes d'une distance donnée. Ici, les voies OSM en cache sont
 * aimantées sur la même grille de 15 m (mêmes identifiants de cellules, donc
 * mêmes outils : Dijkstra, couloir anti aller-retour, recouvrement), et chaque
 * tronçon reçoit :
 * - `passes` : combien de fois on y a couru (d'après le réseau personnel) ;
 * - `cost`   : longueur × classe de voie (grands axes évités, chemins
 *              favorisés) × familiarité selon le curseur habitude ↔ découverte.
 *
 * Pur : aucune I/O. Testé dans tests/street-graph.test.ts.
 */

import { decodePolyline, haversine, type LatLng } from "./polyline";
import { parseRoad, type RoadClass } from "./osm";
import { CELL, type RouteEdge, type RouteGraph, type RouteNode } from "./route-graph";

/** Point du réseau personnel : milieu d'un tronçon couru, et son nombre de passages. */
export type KnownPoint = { lat: number; lon: number; passes: number };

/** Multiplicateur de coût par classe : grand axe, rue, chemin, escaliers. */
export const CLASS_COST: Record<RoadClass, number> = { 0: 2.2, 1: 1, 2: 0.9, 3: 3 };

/** Rayon d'appariement rue OSM ↔ tronçon couru. */
const KNOWN_CELL = 25; // m

/**
 * Facteur de familiarité : habitude (explore = 0) → rues connues moins
 * chères ; découverte (explore = 1) → rues jamais courues moins chères.
 */
export function familiarityFactor(known: boolean, explore: number): number {
  const e = Math.max(0, Math.min(1, explore));
  return known ? 0.75 + 0.6 * e : 1.3 - 0.4 * e;
}

export function buildStreetGraph(
  roads: string[],
  known: KnownPoint[],
  { center, radiusM, explore = 0.5 }: { center: LatLng; radiusM: number; explore?: number }
): RouteGraph {
  const cos = Math.cos((center[0] * Math.PI) / 180);
  const proj = (p: LatLng) => ({ x: (p[1] - center[1]) * 111_320 * cos, y: (p[0] - center[0]) * 111_320 });

  // Index des tronçons courus, maille de 25 m.
  const knownGrid = new Map<string, number>();
  for (const k of known) {
    const { x, y } = proj([k.lat, k.lon]);
    const key = `${Math.round(x / KNOWN_CELL)}:${Math.round(y / KNOWN_CELL)}`;
    knownGrid.set(key, Math.max(knownGrid.get(key) ?? 0, k.passes));
  }
  const passesAt = (p: LatLng) => {
    const { x, y } = proj(p);
    const gx = Math.round(x / KNOWN_CELL);
    const gy = Math.round(y / KNOWN_CELL);
    let best = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) best = Math.max(best, knownGrid.get(`${gx + dx}:${gy + dy}`) ?? 0);
    return best;
  };

  const nodes = new Map<string, RouteNode>();
  const edges = new Map<string, RouteEdge>();
  const node = (key: string, p: LatLng) => {
    let n = nodes.get(key);
    if (!n) nodes.set(key, (n = { id: key, lat: p[0], lon: p[1], edges: [] }));
    return n;
  };

  for (const raw of roads) {
    const { cls, polyline } = parseRoad(raw);
    const pts = decodePolyline(polyline);
    if (pts.length < 2) continue;
    if (!pts.some((p) => haversine(p, center) <= radiusM)) continue;
    let prevKey: string | null = null;
    let prev: LatLng | null = null;
    for (const p of pts) {
      const { x, y } = proj(p);
      const key = `${Math.round(x / CELL)}:${Math.round(y / CELL)}`;
      if (prevKey && prev && key !== prevKey) {
        const meters = haversine(prev, p);
        const mid: LatLng = [(prev[0] + p[0]) / 2, (prev[1] + p[1]) / 2];
        const passes = passesAt(mid);
        const cost = meters * CLASS_COST[cls] * familiarityFactor(passes > 0, explore);
        const id = prevKey < key ? `${prevKey}|${key}` : `${key}|${prevKey}`;
        const cur = edges.get(id);
        if (!cur) {
          const e: RouteEdge = { id, a: prevKey, b: key, meters, passes, lastPassed: 0, points: [prev, p], cost };
          edges.set(id, e);
          node(prevKey, prev).edges.push(e);
          node(key, p).edges.push(e);
        } else if (cost < (cur.cost ?? Infinity)) {
          // Trottoir et chaussée aimantés sur les mêmes cellules : le moins cher l'emporte.
          cur.cost = cost;
          cur.passes = Math.max(cur.passes, passes);
        }
      }
      prevKey = key;
      prev = p;
    }
  }
  return largestComponent({ nodes, edges: [...edges.values()], cellMeters: CELL });
}

/**
 * Garde la plus grande composante connexe : un départ aimanté sur un bout de
 * chemin isolé (ou un pont sans ses rampes) ne donnerait aucune boucle.
 */
export function largestComponent(g: RouteGraph): RouteGraph {
  const seen = new Set<string>();
  let best: string[] = [];
  for (const id of g.nodes.keys()) {
    if (seen.has(id)) continue;
    const comp: string[] = [];
    const stack = [id];
    seen.add(id);
    while (stack.length) {
      const cur = stack.pop()!;
      comp.push(cur);
      for (const e of g.nodes.get(cur)!.edges) {
        const v = e.a === cur ? e.b : e.a;
        if (!seen.has(v)) {
          seen.add(v);
          stack.push(v);
        }
      }
    }
    if (comp.length > best.length) best = comp;
  }
  const keep = new Set(best);
  const nodes = new Map<string, RouteNode>();
  for (const id of best) nodes.set(id, g.nodes.get(id)!);
  return { nodes, edges: g.edges.filter((e) => keep.has(e.a)), cellMeters: g.cellMeters };
}

/**
 * Points du réseau personnel, un tous les ~`stepM` mètres le long de chaque
 * tronçon : les tracés résumés ont des points espacés de 100 à 250 m, un seul
 * point par tronçon laissait des rues courues passer pour nouvelles.
 */
export function knownPoints(g: Pick<RouteGraph, "nodes" | "edges">, stepM = 20): KnownPoint[] {
  const out: KnownPoint[] = [];
  for (const e of g.edges) {
    const a = g.nodes.get(e.a);
    const b = g.nodes.get(e.b);
    if (!a || !b) continue;
    const n = Math.max(1, Math.ceil(e.meters / stepM));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t, passes: e.passes });
    }
  }
  return out;
}
