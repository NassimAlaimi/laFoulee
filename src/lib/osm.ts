/**
 * Fond de rues OpenStreetMap via l'API Overpass — service réseau externe,
 * activé sur décision explicite (Nassim, sept. 2026).
 *
 * L'atelier de parcours dessine sur le **réseau personnel** (les rues déjà
 * courues) ; ce fond ajoute les rues *autour* du territoire, pour voir où
 * aller explorer et poser des points d'intérêt. Affichage seulement : le
 * routage des boucles reste sur le réseau personnel (un graphe OSM routable
 * est une étape ultérieure).
 *
 * - Requête POST sur l'API Overpass, bbox bornée, timeout 25 s.
 * - Les voies sont rééchantillonnées (~20 m) puis encodées en polylines.
 * - Aucune dépendance, échec silencieux (l'app fonctionne sans réseau).
 */

import { encodePolyline, haversine, type LatLng } from "./polyline";

export type Bbox = { minLat: number; minLon: number; maxLat: number; maxLon: number };

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
/** Par serveur. La page n'attend plus Overpass (chargement côté client). */
const TIMEOUT = 25_000;
/** Au-delà de ce côté, trottoirs et sentiers sont omis (poids × 5, illisibles). */
export const MINOR_WAYS_MAX_KM = 8;
/** Taille max raisonnable : au-delà, on coupe le fond plutôt que d'attendre. */
export const MAX_SPAN_KM = 12;

const STREETS = "trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|cycleway";
const MINOR = "footway|path|track|steps";

/** Côté le plus long d'une bbox, en km. */
export function bboxSpanKm(b: Bbox): number {
  const lat = (b.minLat + b.maxLat) / 2;
  return Math.max((b.maxLat - b.minLat) * 111.32, (b.maxLon - b.minLon) * 111.32 * Math.cos((lat * Math.PI) / 180));
}

/**
 * Découpe une zone en tuiles d'au plus `maxKm` de côté : une grosse requête
 * Overpass est refusée (504) dès que le serveur public est chargé, des petites
 * passent, se mettent en cache séparément et s'affichent au fil de l'eau.
 */
export function tileBbox(b: Bbox, maxKm = 6): Bbox[] {
  const lat = (b.minLat + b.maxLat) / 2;
  const wKm = (b.maxLon - b.minLon) * 111.32 * Math.cos((lat * Math.PI) / 180);
  const hKm = (b.maxLat - b.minLat) * 111.32;
  const nx = Math.max(1, Math.ceil(wKm / maxKm));
  const ny = Math.max(1, Math.ceil(hKm / maxKm));
  const dLon = (b.maxLon - b.minLon) / nx;
  const dLat = (b.maxLat - b.minLat) / ny;
  const out: Bbox[] = [];
  // Du centre vers les bords : les rues du cœur arrivent en premier.
  const cells: Array<[number, number]> = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) cells.push([i, j]);
  cells.sort((a, b) => Math.hypot(a[0] - (nx - 1) / 2, a[1] - (ny - 1) / 2) - Math.hypot(b[0] - (nx - 1) / 2, b[1] - (ny - 1) / 2));
  for (const [i, j] of cells) {
    out.push({ minLon: b.minLon + i * dLon, maxLon: b.minLon + (i + 1) * dLon, minLat: b.minLat + j * dLat, maxLat: b.minLat + (j + 1) * dLat });
  }
  return out;
}

/** `minor` : trottoirs et sentiers inclus (par défaut : selon la taille de la zone). */
export function overpassQuery(bbox: Bbox, minor = bboxSpanKm(bbox) <= MINOR_WAYS_MAX_KM): string {
  const kinds = minor ? `${STREETS}|${MINOR}` : STREETS;
  const q = `[out:json][timeout:25];\nway["highway"~"^(${kinds})$"]({south},{west},{north},{east});\nout geom;`;
  return q.replace("{south}", bbox.minLat.toFixed(5))
    .replace("{west}", bbox.minLon.toFixed(5))
    .replace("{north}", bbox.maxLat.toFixed(5))
    .replace("{east}", bbox.maxLon.toFixed(5));
}

type OsmWay = { type: string; tags?: { highway?: string }; geometry?: Array<{ lat: number; lon: number }> };

/** Importance d'une voie : quand il faut couper, on perd d'abord les sentiers. */
const HIGHWAY_RANK: Record<string, number> = {
  trunk: 0, primary: 0, secondary: 1, tertiary: 1, unclassified: 2, residential: 2,
  living_street: 2, pedestrian: 3, cycleway: 3, track: 4, footway: 5, path: 5, steps: 6,
};

/** Les voies les plus structurantes d'abord (tri stable), dans la limite de `max`. */
export function rankWays<T extends { tags?: { highway?: string } }>(ways: T[], max: number): T[] {
  const rank = (w: T) => HIGHWAY_RANK[w.tags?.highway ?? ""] ?? 4;
  return ways
    .map((w, i) => ({ w, i, r: rank(w) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, max)
    .map((x) => x.w);
}

/** Voies (polylines encodées) dans la zone, ou null si indisponible. */
export async function fetchOverpassRoads(bbox: Bbox, minor?: boolean, maxWays = 6000): Promise<string[] | null> {
  const q = overpassQuery(bbox, minor);
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(`${endpoint}?data=${encodeURIComponent(q)}`, {
        headers: { "User-Agent": "la-foulee/1.0 (personal training app)" },
        signal: AbortSignal.timeout(TIMEOUT),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { elements?: OsmWay[] };
      const ways = (json.elements ?? []).filter((e) => e.type === "way" && e.geometry && e.geometry.length >= 2);
      if (!ways.length) return [];
      const out: string[] = [];
      for (const w of rankWays(ways, maxWays)) {
        const line = downsample(w.geometry!.map((g) => [g.lat, g.lon] as LatLng));
        if (line.length >= 2) out.push(encodePolyline(line));
      }
      return out;
    } catch {
      continue;
    }
  }
  return null;
}

function downsample(points: LatLng[]): LatLng[] {
  const out: LatLng[] = [points[0]];
  let last = points[0];
  for (let i = 1; i < points.length; i++) {
    if (haversine(last, points[i]) >= 18 || i === points.length - 1) {
      out.push(points[i]);
      last = points[i];
    }
  }
  return out;
}

// ------------------------------------------------------------------ Cache
//
// Une seule ligne de cache par utilisateur (pas de clé composite : `db push`
// resterait destructif), mais plusieurs zones dedans. Sans cela, l'atelier de
// parcours et la carte des activités s'écrasaient mutuellement le cache et
// chaque changement de page relançait Overpass.

/** `detail` : « streets » (rues) ou « all » (+ trottoirs et sentiers) ; absent = ancien cache. */
export type OsmDetail = "streets" | "all";
export type OsmZone = { key: string; bbox: Bbox; builtAt: number; roads: string[]; detail?: OsmDetail };

/** Clé de zone en cache : la bbox et le niveau de détail. */
export function zoneKey(b: Bbox, detail?: OsmDetail): string {
  return detail ? `${bboxKey(b)}|${detail}` : bboxKey(b);
}

/** Nombre de zones gardées en cache (les plus récentes). */
export const MAX_ZONES = 24; // tuiles de l'atelier + carte des activités

export function bboxKey(b: Bbox): string {
  return [b.minLat, b.maxLat, b.minLon, b.maxLon].map((n) => n.toFixed(4)).join(",");
}

/** Lit le contenu du cache ; l'ancien format (tableau + colonne bbox) reste compris. */
export function parseOsmZones(raw: string, legacyKey: string, legacyBuiltAt: number): OsmZone[] {
  try {
    const o = JSON.parse(raw);
    if (Array.isArray(o)) {
      const parts = legacyKey.split(",").map(Number);
      if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return [];
      const [minLat, maxLat, minLon, maxLon] = parts;
      return [{ key: legacyKey, bbox: { minLat, maxLat, minLon, maxLon }, builtAt: legacyBuiltAt, roads: o as string[] }];
    }
    return Array.isArray(o?.zones) ? (o.zones as OsmZone[]) : [];
  } catch {
    return [];
  }
}

function contains(outer: Bbox, inner: Bbox): boolean {
  return outer.minLat <= inner.minLat && outer.maxLat >= inner.maxLat && outer.minLon <= inner.minLon && outer.maxLon >= inner.maxLon;
}

/**
 * Zone en cache utilisable pour `bbox` : même zone, ou une zone plus grande
 * qui la contient (les rues débordent simplement du cadre).
 */
export function findOsmZone(zones: OsmZone[], bbox: Bbox, now: number, maxAgeMs: number, detail?: OsmDetail): OsmZone | null {
  // Une zone « all » (ou ancienne) contient aussi les rues : elle sert une demande « streets ».
  const fits = (z: OsmZone) => !detail || !z.detail || z.detail === detail || z.detail === "all";
  const fresh = zones.filter((z) => now - z.builtAt < maxAgeMs && fits(z));
  const key = zoneKey(bbox, detail);
  return fresh.find((z) => z.key === key) ?? fresh.find((z) => contains(z.bbox, bbox)) ?? null;
}

/** Ajoute (ou remplace) une zone, en ne gardant que les `MAX_ZONES` plus récentes. */
export function putOsmZone(zones: OsmZone[], zone: OsmZone): OsmZone[] {
  return [zone, ...zones.filter((z) => z.key !== zone.key)]
    .sort((a, b) => b.builtAt - a.builtAt)
    .slice(0, MAX_ZONES);
}

/** Bbox centrée sur un point ; `spanKm` est la largeur totale, bornée. */
export function bboxAround(lat: number, lon: number, spanKm: number): Bbox {
  const km = Math.min(Math.max(spanKm, 1), MAX_SPAN_KM);
  const dLat = km / (2 * 111.32);
  const dLon = km / (2 * 111.32 * Math.cos((lat * Math.PI) / 180));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLon: lon - dLon, maxLon: lon + dLon };
}
