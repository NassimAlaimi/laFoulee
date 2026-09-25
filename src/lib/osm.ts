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
  "https://overpass.kumi.systems/api/interpreter",
];
const TIMEOUT = 25_000;
/** Taille max raisonnable : au-delà, on coupe le fond plutôt que d'attendre. */
export const MAX_SPAN_KM = 12;

const QUERY = `[out:json][timeout:25];
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|pedestrian|footway|path|cycleway|track|steps)$"]({south},{west},{north},{east});
out geom;`;

export function overpassQuery(bbox: Bbox): string {
  return QUERY.replace("{south}", bbox.minLat.toFixed(5))
    .replace("{west}", bbox.minLon.toFixed(5))
    .replace("{north}", bbox.maxLat.toFixed(5))
    .replace("{east}", bbox.maxLon.toFixed(5));
}

type OsmWay = { type: string; geometry?: Array<{ lat: number; lon: number }> };

/** Voies (polylines encodées) dans la zone, ou null si indisponible. */
export async function fetchOverpassRoads(bbox: Bbox, maxWays = 1500): Promise<string[] | null> {
  const q = overpassQuery(bbox);
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
      for (const w of ways) {
        if (out.length >= maxWays) break;
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

/** Bbox centrée sur un point ; `spanKm` est la largeur totale, bornée. */
export function bboxAround(lat: number, lon: number, spanKm: number): Bbox {
  const km = Math.min(Math.max(spanKm, 1), MAX_SPAN_KM);
  const dLat = km / (2 * 111.32);
  const dLon = km / (2 * 111.32 * Math.cos((lat * Math.PI) / 180));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLon: lon - dLon, maxLon: lon + dLon };
}
