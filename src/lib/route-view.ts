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

/**
 * Boîte de dessin : largeur fixe, hauteur déduite. Projection conforme à
 * l'échelle locale : un degré de longitude vaut cos(latitude) degré de
 * latitude (0,68 à Nantes). Sans ce facteur, la carte était étirée de ~50 %
 * en largeur — des rues déformées et une carte en bandeau.
 */
export function viewFor(bbox: ViewBbox) {
  const spanLat = Math.max(0.0001, bbox.maxLat - bbox.minLat);
  const spanLon = Math.max(0.0001, bbox.maxLon - bbox.minLon);
  const k = Math.cos((((bbox.minLat + bbox.maxLat) / 2) * Math.PI) / 180);
  const scale = (MAP_W - 2 * MAP_PAD) / (spanLon * k); // px par degré de latitude
  const x = (lon: number) => MAP_PAD + (lon - bbox.minLon) * k * scale;
  const y = (lat: number) => MAP_PAD + (bbox.maxLat - lat) * scale;
  const H = Math.round(spanLat * scale + 2 * MAP_PAD);
  /** Point de la boîte → coordonnées (clic sur la carte). */
  const unproject = (px: number, py: number) => ({
    lat: bbox.maxLat - (py - MAP_PAD) / scale,
    lng: bbox.minLon + (px - MAP_PAD) / (k * scale),
  });
  /** Mètres → unités de la boîte (échelle graphique). */
  const pxPerMeter = scale / 111_320;
  return { W: MAP_W, H, scale, x, y, unproject, pxPerMeter, bbox };
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

/**
 * Plus petite fenêtre de ratio `aspect` (largeur / hauteur) qui contient le
 * rectangle `r`, centrée dessus : l'ouverture de la carte sur la zone où l'on
 * court vraiment, quelle que soit la forme de l'écran.
 */
export function coverWindow(r: ViewWindow, aspect: number): ViewWindow {
  let w = r.w;
  let h = r.h;
  if (w / h < aspect) w = h * aspect;
  else h = w / aspect;
  return { x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - h / 2, w, h };
}

/** Tracé projeté : chemin SVG et boîte englobante (pour cadrer dessus). */
export function projectPolyline(polyline: string, bbox: ViewBbox): { d: string; box: ViewWindow } | null {
  const v = viewFor(bbox);
  const pts = decodePolyline(polyline);
  if (pts.length < 2) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const parts: string[] = [];
  pts.forEach((p, i) => {
    const x = v.x(p[1]);
    const y = v.y(p[0]);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    parts.push(`${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`);
  });
  return { d: parts.join(""), box: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
}

/** Réunion de boîtes, avec une marge relative (cadrer plusieurs tracés). */
export function unionBox(boxes: ViewWindow[], pad = 0.12): ViewWindow | null {
  if (!boxes.length) return null;
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  return { x: minX - w * pad, y: minY - h * pad, w: w * (1 + 2 * pad), h: h * (1 + 2 * pad) };
}

/** Longueur « ronde » d'échelle graphique qui tient dans `maxPx` pixels. */
export function scaleBar(metersPerPx: number, maxPx = 110): { meters: number; px: number } {
  const steps = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000];
  let best = steps[0];
  for (const m of steps) if (m / metersPerPx <= maxPx) best = m;
  return { meters: best, px: best / metersPerPx };
}

/** Deux boîtes (coordonnées de la carte) se chevauchent-elles ? */
export function boxesIntersect(a: ViewWindow, b: ViewWindow): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Tout ce que la carte de l'atelier reçoit du serveur (coordonnées de la boîte). */
export type AtelierView = {
  viewBox: readonly [number, number];
  bbox: ViewBbox;
  pxPerMeter: number;
  edges: Array<{ x1: number; y1: number; x2: number; y2: number; passes: number }>;
  /** fenêtre d'ouverture : la zone où l'on court vraiment */
  core: ViewWindow;
  start: { x: number; y: number } | null;
  /** tuiles du fond de rues, chargées quand elles entrent dans la fenêtre */
  tiles: Array<{ bbox: ViewBbox; box: ViewWindow; detail: "streets" | "all" }>;
  pois: Array<{ id: string; kind: string; x: number; y: number; note: string | null }>;
};
