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

import { decodePolyline, haversine, polylineLength, type LatLng } from "./polyline";
import { densityCore, type DensityCoreOptions } from "./route-view";

export const CELL = 15; // m

/**
 * Longueur maximale d'une arête. Les polylignes résumées peuvent sauter
 * quelques centaines de mètres (décrochage GPS légitime) — mais au-delà de
 * ~2 km, deux points consécutifs ne peuvent pas être reliés à la course :
 * c'est un point aberrant (GPS qui bascule de ville). On coupe alors le tracé
 * au lieu de créer une arête géante qui fausse le territoire, le compteur de
 * km et les boucles générées.
 */
export const MAX_EDGE_METERS = 2000;

export type GraphActivity = { polyline: string | null; startDate: Date; distance?: number | null };

export type RouteEdge = {
  id: string;
  a: string;
  b: string;
  meters: number;
  passes: number;
  lastPassed: number;
  /** centre de la cellule */
  points: LatLng[];
  /** coût de routage (défaut : la longueur) — rues OSM : classe × familiarité */
  cost?: number;
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
    // Tracé corrompu : la polyligne résumée est censée être *plus courte*
    // que la distance réelle (simplification). Si elle la dépasse très
    // largement, c'est un GPS qui a basculé de ville (points aberrants) —
    // on écarte toute l'activité plutôt que de polluer le territoire.
    if (act.distance && act.distance > 0 && polylineLength(act.polyline) > act.distance * 2 + 1000) {
      continue;
    }
    const t = act.startDate.getTime();
    let prevKey: string | null = null;
    let prevPt: LatLng | null = null;
    for (const p of pts) {
      const { x, y } = project(p[0], p[1], reference);
      const key = cellKey(x, y);
      if (prevKey && key !== prevKey) {
        const m = haversine(prevPt!, p);
        // Discontinuité (point aberrant) : on coupe le tracé, sans arête.
        if (m > MAX_EDGE_METERS) {
          prevKey = null;
          prevPt = null;
          continue;
        }
        const a = getNode(prevKey, prevPt![0], prevPt![1]);
        const b = getNode(key, p[0], p[1]);
        const id = edgeId(prevKey, key);
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
  /** points de demi-tour essayés (défaut 70) */
  samples?: number;
};

export type GeneratedLoop = {
  points: LatLng[];
  meters: number;
  score: number;
  /** part d'arêtes reprises (aller-retour) */
  reuse: number;
  /** part de la distance sur des rues jamais courues (1 = tout nouveau) */
  novelty: number;
  /** cap du point le plus éloigné vu du départ : N, NE, E… */
  direction: Compass;
};

export type Compass = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

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
function dijkstraAll(g: RouteGraph, from: string, forbidden = new Set<string>(), forbiddenNodes?: Set<string>) {
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
      if (forbiddenNodes?.has(v)) continue;
      const nd = cur.d + (e.cost ?? e.meters);
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
    // Demi-tour sur un carrefour : depuis un cul-de-sac, le retour serait
    // forcément un aller-retour.
    .filter(([id, d]) => d >= target * 0.25 && d <= target * 0.75 && g.nodes.get(id)!.edges.length >= 3)
    .sort((a, b) => a[1] - b[1]);
  // Échantillon étalé : jusqu'à `samples` nœuds répartis sur la plage de distance.
  const samples = opts.samples ?? 70;
  const sample: string[] = [];
  if (candidates.length) {
    const stride = Math.max(1, Math.floor(candidates.length / samples));
    for (let i = 0; i < candidates.length; i += stride) sample.push(candidates[i][0]);
  }

  const raw: Array<GeneratedLoop & { cells: Set<string> }> = [];
  const startCell = parseCell(startId);
  for (const x of sample) {
    const p1 = reconstruct(g, fromStart.prev, startId, x);
    if (!p1) continue;
    const outNodes = pathNodes(startId, p1);
    // Le retour ne doit pas longer l'aller : les tracés d'une même rue ne
    // tombent pas toujours sur les mêmes cellules (brins parallèles à 15 m),
    // interdire les seules arêtes de l'aller laissait passer des allers-retours
    // déguisés. On interdit donc un couloir de ±45 m autour de l'aller, sauf
    // près du départ et du demi-tour.
    const xCell = parseCell(x);
    const corridor = new Set<string>();
    for (const n of outNodes) {
      const c = parseCell(n);
      if (!c) continue;
      for (let dx = -CORRIDOR; dx <= CORRIDOR; dx++)
        for (let dy = -CORRIDOR; dy <= CORRIDOR; dy++) {
          const k = `${c[0] + dx}:${c[1] + dy}`;
          if (cellDist(k, startCell) > FREE_ZONE && cellDist(k, xCell) > FREE_ZONE) corridor.add(k);
        }
    }
    // Les premiers mètres peuvent se reprendre au retour (« queue de poêle ») :
    // un départ au bout d'une impasse ou d'un chemin n'a qu'une seule sortie.
    const edgeBan = new Set(p1.filter((e) => cellDist(e.a, startCell) > FREE_ZONE || cellDist(e.b, startCell) > FREE_ZONE).map((e) => e.id));
    let p2 = reconstruct(g, dijkstraAll(g, x, edgeBan, corridor).prev, x, startId);
    let strict = true;
    if (!p2) {
      p2 = reconstruct(g, dijkstraAll(g, x, edgeBan).prev, x, startId);
      strict = false;
    }
    if (!p2) continue;
    const total = p1.reduce((a, e) => a + e.meters, 0) + p2.reduce((a, e) => a + e.meters, 0);
    if (total < minD || total > maxD) continue;
    const allEdges = [...p1, ...p2];
    // Part du retour qui longe l'aller (0 quand le couloir a été respecté).
    const backNodes = pathNodes(x, p2);
    const alongside = strict ? 0 : backNodes.filter((n) => corridor.has(n)).length / Math.max(1, backNodes.length);
    const reuse = Math.max(countReuse(allEdges), alongside / 2);
    const novelty = allEdges.reduce((a, e) => a + (e.passes === 0 ? e.meters : 0), 0) / total;
    // Rues rares (≤ 2 passages) : ce que le curseur « découverte » recherche.
    const rare = allEdges.reduce((a, e) => a + (e.passes <= 2 ? e.meters : 0), 0) / total;
    const fit = 1 - Math.abs(total - target) / target;
    const score = fit * 0.5 + (1 - reuse) * 0.3 + rare * (explore > 0.5 ? 0.2 : 0.05) + (1 - rare) * (explore < 0.4 ? 0.1 : 0);
    const cells = new Set([...outNodes, ...backNodes].map(coarseCell));
    raw.push({ points: edgePathPoints(g, startId, allEdges), meters: Math.round(total), score, reuse, novelty, direction: compass(g, startId, x), cells });
  }
  return pickDistinct(raw, 3).map(({ cells: _c, ...l }) => l);
}

/** Couloir interdit au retour, en cellules (3 × 15 m). */
const CORRIDOR = 3;
/** Zone libre autour du départ et du demi-tour, en cellules (~150 m). */
const FREE_ZONE = 10;

function parseCell(id: string): [number, number] | null {
  const i = id.indexOf(":");
  if (i < 0) return null;
  const x = Number(id.slice(0, i));
  const y = Number(id.slice(i + 1));
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}
function cellDist(k: string, c: [number, number] | null): number {
  const d = parseCell(k);
  return d && c ? Math.max(Math.abs(d[0] - c[0]), Math.abs(d[1] - c[1])) : Infinity;
}
/** Maille grossière (~60 m) pour comparer deux boucles malgré les brins parallèles. */
function coarseCell(id: string): string {
  const c = parseCell(id);
  return c ? `${Math.round(c[0] / 4)}:${Math.round(c[1] / 4)}` : id;
}
function pathNodes(from: string, edges: RouteEdge[]): string[] {
  const out = [from];
  let cur = from;
  for (const e of edges) {
    cur = e.a === cur ? e.b : e.a;
    out.push(cur);
  }
  return out;
}
function compass(g: RouteGraph, from: string, to: string): Compass {
  const a = g.nodes.get(from)!;
  const b = g.nodes.get(to)!;
  const dx = (b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180);
  const dy = b.lat - a.lat;
  const deg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  return (["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const)[Math.round(deg / 45) % 8];
}

/** Recouvrement de deux boucles : part commune rapportée à la plus courte. */
export function loopOverlap(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const c of a) if (b.has(c)) inter++;
  return inter / Math.max(1, Math.min(a.size, b.size));
}

/**
 * Les `n` meilleures boucles **distinctes** : on prend la meilleure, puis les
 * suivantes seulement si elles recouvrent peu celles déjà retenues. Mieux vaut
 * proposer une ou deux boucles que trois fois la même.
 */
export function pickDistinct<T extends { score: number; cells: Set<string> }>(loops: T[], n: number, maxOverlap = 0.45): T[] {
  const out: T[] = [];
  for (const l of [...loops].sort((a, b) => b.score - a.score)) {
    if (out.every((o) => loopOverlap(o.cells, l.cells) <= maxOverlap)) out.push(l);
    if (out.length >= n) break;
  }
  return out;
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

/**
 * Secteur géographique du réseau : une composante connexe du graphe (les
 * villes où l'on a couru sont séparées par des centaines de km). Regroupe les
 * nœuds et arêtes d'un même secteur, avec son centre et son poids (nombre de
 * passages) pour choisir le secteur « maison ».
 */
export type GraphSector = {
  nodes: Map<string, RouteNode>;
  edges: RouteEdge[];
  center: LatLng;
  passes: number;
};

export function graphSectors(g: RouteGraph): GraphSector[] {
  // Union-find sur les arêtes : deux nœuds reliés sont dans le même secteur.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    while (parent.get(x) !== root) {
      const next = parent.get(x)!;
      parent.set(x, root);
      x = next;
    }
    return root;
  };
  for (const n of g.nodes.keys()) parent.set(n, n);
  for (const e of g.edges) {
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra !== rb) parent.set(ra, rb);
  }

  const groups = new Map<string, GraphSector>();
  for (const n of g.nodes.values()) {
    const root = find(n.id);
    let s = groups.get(root);
    if (!s) {
      s = { nodes: new Map(), edges: [], center: [0, 0], passes: 0 };
      groups.set(root, s);
    }
    s.nodes.set(n.id, n);
  }
  for (const e of g.edges) groups.get(find(e.a))!.edges.push(e);
  for (const s of groups.values()) {
    let lat = 0;
    let lon = 0;
    let passes = 0;
    for (const n of s.nodes.values()) {
      lat += n.lat;
      lon += n.lon;
      passes += n.edges.reduce((a, e) => a + e.passes, 0);
    }
    s.center = [lat / s.nodes.size, lon / s.nodes.size];
    // Chaque arête compte deux extrémités : diviser par 2 pour un poids honnête.
    s.passes = Math.round(passes / 2);
  }
  return [...groups.values()].sort((a, b) => b.passes - a.passes);
}

/**
 * Le cœur d'un secteur : là où l'on court vraiment (voir `densityCore`).
 * Chaque tronçon pèse longueur × passages.
 */
export function sectorCore(
  sector: Pick<GraphSector, "nodes" | "edges">,
  opts: DensityCoreOptions = {}
): { center: LatLng; bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number } } | null {
  const pts: Array<{ lat: number; lon: number; w: number }> = [];
  for (const e of sector.edges) {
    const a = sector.nodes.get(e.a);
    const b = sector.nodes.get(e.b);
    if (a && b) pts.push({ lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2, w: Math.max(1, e.meters) * e.passes });
  }
  return densityCore(pts, opts);
}

/**
 * Chiffres du territoire, sur une maille de ~60 m (les brins parallèles d'une
 * même rue comptent une fois) :
 * - `uniqueKm` : kilomètres de rues différentes déjà courues ;
 * - `halfKm`   : la moitié de tes kilomètres tient dans ces km de rues.
 */
export function territoryStats(g: Pick<RouteGraph, "nodes" | "edges">): { uniqueKm: number; halfKm: number } {
  const size = CELL * 4;
  const weight = new Map<string, number>();
  for (const e of g.edges) {
    const a = g.nodes.get(e.a);
    const b = g.nodes.get(e.b);
    if (!a || !b) continue;
    // Le tronçon est découpé en pas de ~30 m, chacun versé dans sa maille.
    const steps = Math.max(1, Math.ceil(e.meters / (size / 2)));
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const lat = a.lat + (b.lat - a.lat) * t;
      const lon = a.lon + (b.lon - a.lon) * t;
      const key = `${Math.round((lat * 111_320) / size)}:${Math.round((lon * 111_320 * Math.cos((lat * Math.PI) / 180)) / size)}`;
      weight.set(key, (weight.get(key) ?? 0) + (e.passes * e.meters) / steps);
    }
  }
  const w = [...weight.values()].sort((x, y) => y - x);
  const total = w.reduce((s, x) => s + x, 0);
  let acc = 0;
  let half = 0;
  for (const x of w) {
    acc += x;
    half++;
    if (acc >= total / 2) break;
  }
  return { uniqueKm: (w.length * size) / 1000, halfKm: (half * size) / 1000 };
}

/**
 * Départ habituel : la maille de ~150 m (avec ses voisines) où commencent le
 * plus de sorties, limitée aux départs à moins de `maxKm` de `near` (le cœur
 * du territoire). Renvoie le centre des départs de cette maille.
 */
export function usualStart(starts: LatLng[], near?: LatLng | null, maxKm = 15, cellM = 150): LatLng | null {
  const pts = near ? starts.filter((p) => haversine(p, near) <= maxKm * 1000) : starts;
  if (!pts.length) return null;
  const key = (p: LatLng) => [Math.round((p[0] * 111_320) / cellM), Math.round((p[1] * 111_320 * Math.cos((p[0] * Math.PI) / 180)) / cellM)];
  const cells = new Map<string, LatLng[]>();
  for (const p of pts) {
    const [a, b] = key(p);
    const k = `${a}:${b}`;
    const arr = cells.get(k);
    if (arr) arr.push(p);
    else cells.set(k, [p]);
  }
  let best: LatLng[] = [];
  for (const k of cells.keys()) {
    const [a, b] = k.split(":").map(Number);
    const group: LatLng[] = [];
    for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) group.push(...(cells.get(`${a + da}:${b + db}`) ?? []));
    if (group.length > best.length) best = group;
  }
  return [best.reduce((s, p) => s + p[0], 0) / best.length, best.reduce((s, p) => s + p[1], 0) / best.length];
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

export type StraightSegment = { points: LatLng[]; meters: number; straightness: number; passes: number };

/**
 * Lignes droites pour le fractionné : suites de tronçons dont le cap varie
 * peu, entre `minMeters` et `maxMeters` (une « ligne droite » de 4 km n'aide
 * personne à caler ses 400 m). Un tronçon de plus de `maxEdge` est un trou de
 * GPS, pas une rue : il interrompt la ligne. Les lignes qui se recouvrent
 * (la même rue prise dans l'autre sens, ou décalée d'une cellule) ne sont
 * gardées qu'une fois. Classement : longueur utile × rectitude × habitude.
 */
export function straightSegments(
  g: Pick<RouteGraph, "nodes">,
  minMeters = 400,
  { maxMeters = 1600, maxEdge = 250, limit = 8, near }: { maxMeters?: number; maxEdge?: number; limit?: number; near?: LatLng | null } = {}
): StraightSegment[] {
  const out: Array<StraightSegment & { cells: Set<string>; rank: number }> = [];
  for (const start of g.nodes.values()) {
    for (const e0 of start.edges) {
      if (e0.meters > maxEdge) continue;
      const pts: LatLng[] = [[start.lat, start.lon]];
      const cells = new Set<string>([coarseCell(start.id)]);
      let meters = 0;
      let passes = 0;
      let heading = bearing(e0, start, g);
      let cur = e0;
      let from = start.id;
      let turn = 0;
      const used = new Set<string>([e0.id]);
      for (let i = 0; i < 200; i++) {
        const n = g.nodes.get(cur.a === from ? cur.b : cur.a)!;
        pts.push([n.lat, n.lon]);
        cells.add(coarseCell(n.id));
        meters += cur.meters;
        passes += cur.passes * cur.meters;
        if (meters >= maxMeters) break;
        // Choix de la suite la plus rectiligne
        const nexts = n.edges.filter((e) => !used.has(e.id) && e.meters <= maxEdge);
        if (!nexts.length) break;
        let best: RouteEdge | null = null;
        let bestDiff = Infinity;
        for (const e of nexts) {
          const diff = Math.abs(angleDiff(heading, bearing(e, n, g)));
          if (diff < bestDiff) {
            bestDiff = diff;
            best = e;
          }
        }
        if (bestDiff > 25) break;
        turn += bestDiff;
        // Cap lissé : une ligne qui tourne lentement n'est pas une ligne droite.
        heading = heading + angleDiff(heading, bearing(best!, n, g)) * 0.3;
        from = n.id;
        cur = best!;
        used.add(cur.id);
      }
      if (meters < minMeters - 1) continue;
      // Vol d'oiseau / distance : 1 pour une vraie ligne droite.
      const chord = haversine(pts[0], pts[pts.length - 1]) / meters;
      if (chord < 0.93) continue;
      const straightness = Math.max(0, Math.min(1, chord * (1 - turn / pts.length / 45)));
      const avgPasses = passes / meters;
      // Une ligne à deux pas du départ vaut mieux qu'une ligne à 10 km.
      const away = near ? haversine(near, pts[Math.floor(pts.length / 2)]) : 0;
      const rank = (Math.min(meters, 1200) * straightness * (1 + 0.35 * Math.log1p(avgPasses))) / (1 + away / 3000);
      out.push({ points: pts, meters: Math.round(meters), straightness, passes: Math.round(avgPasses * 10) / 10, cells, rank });
    }
  }
  out.sort((a, b) => b.rank - a.rank);
  const kept: typeof out = [];
  for (const s of out) {
    if (kept.some((k) => loopOverlap(k.cells, s.cells) > 0.3)) continue;
    kept.push(s);
    if (kept.length >= limit) break;
  }
  return kept.map(({ cells: _c, rank: _r, ...s }) => s);
}

function bearing(e: RouteEdge, at: RouteNode, g: Pick<RouteGraph, "nodes">): number {
  const other = g.nodes.get(e.a === at.id ? e.b : e.a)!;
  const dx = (other.lon - at.lon) * Math.cos((at.lat * Math.PI) / 180);
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
/**
 * Version de construction du graphe. À incrémenter à chaque changement de
 * `buildGraph` : un cache construit par l'ancien code (ex. avant la coupure
 * des sauts GPS — des « lignes droites » de 500 km) est alors reconstruit au
 * lieu d'être servi pendant 24 h.
 */
export const GRAPH_VERSION = 2;

export function serializeGraph(g: RouteGraph): string {
  return JSON.stringify({
    v: GRAPH_VERSION,
    cell: g.cellMeters,
    nodes: [...g.nodes.values()].map((n) => ({ id: n.id, lat: n.lat, lon: n.lon })),
    edges: g.edges.map((e) => ({ id: e.id, a: e.a, b: e.b, m: Math.round(e.meters), p: e.passes, t: e.lastPassed })),
  });
}

export function deserializeGraph(raw: string): RouteGraph | null {
  try {
    const o = JSON.parse(raw);
    if (o?.v !== GRAPH_VERSION) return null;
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
