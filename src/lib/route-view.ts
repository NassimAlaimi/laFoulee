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

/**
 * Cadre d'affichage autour d'un réseau : une marge, puis le côté court est
 * élargi pour que la hauteur fasse au moins `minRatio` × la largeur (en km).
 * Sans cela, un réseau étiré donnait une bande de carte illisible. Le côté
 * long est plafonné à `maxKm` autour du centre (le fond OSM au-delà coûte
 * trop cher à charger).
 */
export function framedBbox(
  bbox: ViewBbox,
  { padKm = 0.6, minRatio = 0.55, maxKm = 20 }: { padKm?: number; minRatio?: number; maxKm?: number } = {}
): ViewBbox {
  const lat = (bbox.minLat + bbox.maxLat) / 2;
  const lon = (bbox.minLon + bbox.maxLon) / 2;
  const kmLat = 111.32;
  const kmLon = 111.32 * Math.cos((lat * Math.PI) / 180);
  let w = (bbox.maxLon - bbox.minLon) * kmLon + 2 * padKm;
  let h = (bbox.maxLat - bbox.minLat) * kmLat + 2 * padKm;
  const long = Math.max(w, h);
  if (long > maxKm) {
    w = (w * maxKm) / long;
    h = (h * maxKm) / long;
  }
  if (h < w * minRatio) h = w * minRatio;
  if (w < h * minRatio) w = h * minRatio;
  return {
    minLat: lat - h / 2 / kmLat,
    maxLat: lat + h / 2 / kmLat,
    minLon: lon - w / 2 / kmLon,
    maxLon: lon + w / 2 / kmLon,
  };
}

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

export type ViewWindow = { x: number; y: number; w: number; h: number };

/**
 * Fenêtre initiale d'une carte W × H affichée dans un cadre de ratio `aspect`
 * (largeur / hauteur). « contain » montre tout (marges si besoin) ; « crop »
 * remplit le cadre en rognant les côtés (mobile : carte haute, qu'on déplace
 * au doigt). La fenêtre a toujours exactement le ratio du cadre : un point
 * cliqué se convertit sans erreur.
 */
export function fitWindow(W: number, H: number, aspect: number, mode: "contain" | "crop"): ViewWindow {
  const wider = aspect > W / H; // le cadre est plus large que la carte
  const byHeight = mode === "contain" ? wider : !wider;
  if (byHeight) {
    const w = H * aspect;
    return { x: (W - w) / 2, y: 0, w, h: H };
  }
  const h = W / aspect;
  return { x: 0, y: (H - h) / 2, w: W, h };
}

/**
 * Zoom de `factor` autour du point (cx, cy), ratio conservé, borné entre la
 * fenêtre d'origine (`fit`) et un grossissement ×40.
 */
export function zoomWindow(cur: ViewWindow, factor: number, cx: number, cy: number, fit: ViewWindow): ViewWindow {
  const w = Math.max(fit.w / 40, Math.min(fit.w, cur.w * factor));
  const k = w / cur.w;
  const h = cur.h * k;
  return { x: cx - (cx - cur.x) * k, y: cy - (cy - cur.y) * k, w, h };
}
