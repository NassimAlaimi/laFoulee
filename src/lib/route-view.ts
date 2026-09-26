/**
 * Projection équirectangulaire locale des tracés dans une boîte de dessin SVG.
 *
 * Pur (aucun accès réseau/DB) : utilisé côté serveur (cartes du territoire)
 * et côté client (aperçu des boucles générées sur la carte). Les deux côtés
 * partagent exactement la même formule pour que les tracés s'alignent.
 */

import { decodePolyline } from "./polyline";

export const MAP_W = 1000;
export const MAP_PAD = 30;

export type ViewBbox = { minLat: number; maxLat: number; minLon: number; maxLon: number };

/** Boîte de dessin : largeur fixe, hauteur déduite, échelle en px/degré. */
export function viewFor(bbox: ViewBbox) {
  const spanLat = Math.max(0.0001, bbox.maxLat - bbox.minLat);
  const spanLon = Math.max(0.0001, bbox.maxLon - bbox.minLon);
  const scale = (MAP_W - 2 * MAP_PAD) / Math.max(spanLon, spanLat * 1.4);
  const x = (lon: number) => MAP_PAD + (lon - bbox.minLon) * scale;
  const y = (lat: number) => MAP_PAD + (bbox.maxLat - lat) * scale;
  const H = Math.round((bbox.maxLat - bbox.minLat) * scale + 2 * MAP_PAD);
  return { W: MAP_W, H, scale, x, y, bbox };
}

/** Polyline → chemin SVG « d » dans la boîte. */
export function polylinePath(polyline: string, bbox: ViewBbox): string {
  const v = viewFor(bbox);
  const pts = decodePolyline(polyline);
  if (pts.length < 2) return "";
  return pts.map((p, i) => `${i ? "L" : "M"}${v.x(p[1]).toFixed(1)},${v.y(p[0]).toFixed(1)}`).join("");
}
