/**
 * Tracés GPS — décodage des polylines Strava et projection en SVG.
 *
 * Strava fournit un `summary_polyline` (algorithme Google, précision 1e-5).
 * On le décode, on le projette en Mercator sphérique (conserve les angles :
 * un virage à 90° reste à 90° à l'écran), puis on l'ajuste dans une boîte.
 *
 * Aucune tuile de carte, aucune dépendance : le tracé seul, dessiné comme une
 * figure. C'est un choix éditorial autant que technique — la forme d'une
 * sortie se reconnaît sans fond de carte.
 */

export type LatLng = [number, number];
export type XY = [number, number];

/** Décode une polyline encodée (algorithme Google). */
export function decodePolyline(encoded: string | null | undefined, precision = 5): LatLng[] {
  if (!encoded) return [];
  const factor = 10 ** precision;
  const out: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    out.push([lat / factor, lng / factor]);
  }
  return out;
}

/** Encode une liste de points (utile pour les tests et les fixtures). */
export function encodePolyline(points: LatLng[], precision = 5): string {
  const factor = 10 ** precision;
  let prevLat = 0;
  let prevLng = 0;
  let out = "";
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = "";
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    return s + String.fromCharCode(n + 63);
  };
  for (const [la, ln] of points) {
    const lat = Math.round(la * factor);
    const lng = Math.round(ln * factor);
    out += enc(lat - prevLat) + enc(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}

/** Mercator sphérique, en unités arbitraires (x vers l'est, y vers le sud). */
export function mercator([lat, lng]: LatLng): XY {
  const x = (lng * Math.PI) / 180;
  const clamped = Math.max(-85, Math.min(85, lat));
  const y = -Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360));
  return [x, y];
}

/** Distance entre deux points GPS, en mètres (haversine). */
export function haversine(a: LatLng, b: LatLng): number {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export function boundsOf(points: XY[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Ajuste des points projetés dans une boîte w × h en conservant le ratio,
 * centrés, avec une marge. Renvoie aussi la fonction de projection pour placer
 * d'autres éléments (départ, arrivée, repères kilométriques) au même endroit.
 */
export function fitToBox(
  points: XY[],
  w: number,
  h: number,
  pad = 6,
  bounds: Bounds = boundsOf(points)
): { points: XY[]; project: (p: XY) => XY; scale: number } {
  const spanX = bounds.maxX - bounds.minX || 1e-9;
  const spanY = bounds.maxY - bounds.minY || 1e-9;
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
  const offX = (w - spanX * scale) / 2;
  const offY = (h - spanY * scale) / 2;
  const project = ([x, y]: XY): XY => [
    (x - bounds.minX) * scale + offX,
    (y - bounds.minY) * scale + offY,
  ];
  return { points: points.map(project), project, scale };
}

/** Ramer–Douglas–Peucker : allège un tracé sans en changer la silhouette. */
export function simplify(points: XY[], tolerance: number): XY[] {
  if (points.length <= 2 || tolerance <= 0) return points;
  const sq = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];

  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i];
      let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px;
      const ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > sq && idx > 0) {
      keep[idx] = 1;
      stack.push([first, idx], [idx, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Chemin SVG (`M … L …`) arrondi au dixième de pixel. */
export function toPath(points: XY[]): string {
  if (!points.length) return "";
  return points
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join("");
}

/** Tracé prêt à dessiner dans une boîte w × h. Vide si la polyline est absente. */
export function routePath(
  encoded: string | null | undefined,
  w: number,
  h: number,
  pad = 6
): { d: string; start: XY | null; end: XY | null; loop: boolean } {
  const ll = decodePolyline(encoded);
  if (ll.length < 2) return { d: "", start: null, end: null, loop: false };
  const fitted = fitToBox(ll.map(mercator), w, h, pad).points;
  const simple = simplify(fitted, 0.35);
  const loop = haversine(ll[0], ll[ll.length - 1]) < 250;
  return {
    d: toPath(simple),
    start: simple[0],
    end: simple[simple.length - 1],
    loop,
  };
}

/**
 * Regroupe les sorties par secteur géographique (point de départ à moins de
 * `radiusKm` du premier départ du groupe). Sert à ne pas écraser la carte
 * quand un coureur a couru en vacances à 800 km de chez lui : la carte
 * superposée n'a de sens que sur un même secteur.
 */
export function clusterByStart<T extends { start: LatLng }>(
  items: T[],
  radiusKm = 25
): Array<{ center: LatLng; items: T[] }> {
  const clusters: Array<{ center: LatLng; items: T[] }> = [];
  for (const it of items) {
    const c = clusters.find((c) => haversine(c.center, it.start) <= radiusKm * 1000);
    if (c) c.items.push(it);
    else clusters.push({ center: it.start, items: [it] });
  }
  return clusters.sort((a, b) => b.items.length - a.items.length);
}

/**
 * Carte de chaleur vectorielle : toutes les sorties d'un secteur projetées
 * dans une même boîte. Les bornes sont communes, sinon chaque tracé serait
 * ajusté indépendamment et les superpositions n'auraient aucun sens.
 *
 * Les bornes ignorent les 2 % de points les plus excentrés : une seule sortie
 * lointaine ne doit pas réduire toutes les autres à un point.
 */
export function overlayPaths<T extends { id: string; polyline: string | null }>(
  items: T[],
  w: number,
  h: number,
  pad = 16
): Array<{ id: string; d: string; item: T }> {
  const decoded = items
    .map((it) => ({ it, pts: decodePolyline(it.polyline).map(mercator) }))
    .filter((r) => r.pts.length >= 2);
  if (!decoded.length) return [];

  const xs = decoded.flatMap((r) => r.pts.map((p) => p[0])).sort((a, b) => a - b);
  const ys = decoded.flatMap((r) => r.pts.map((p) => p[1])).sort((a, b) => a - b);
  const q = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
  const trim = xs.length > 200 ? 0.01 : 0;
  const bounds: Bounds = {
    minX: q(xs, trim),
    maxX: q(xs, 1 - trim),
    minY: q(ys, trim),
    maxY: q(ys, 1 - trim),
  };

  return decoded.map(({ it, pts }) => {
    const fitted = fitToBox(pts, w, h, pad, bounds).points;
    return { id: it.id, d: toPath(simplify(fitted, 0.25)), item: it };
  });
}

/**
 * Découpe un tracé en tronçons d'un kilomètre, dans une boîte w × h.
 *
 * La polyline résumée de Strava est simplifiée : sa longueur est un peu plus
 * courte que la distance réelle. Les distances cumulées sont donc remises à
 * l'échelle de `totalMeters` pour que le tronçon n°5 corresponde bien au
 * split n°5.
 */
export function kmSegments(
  encoded: string | null | undefined,
  totalMeters: number,
  w: number,
  h: number,
  pad = 24
): {
  segments: Array<{ km: number; d: string }>;
  markers: Array<{ km: number; at: XY }>;
  start: XY | null;
  end: XY | null;
  pxPerMeter: number;
} {
  const ll = decodePolyline(encoded);
  if (ll.length < 2) return { segments: [], markers: [], start: null, end: null, pxPerMeter: 0 };
  const fitted = fitToBox(ll.map(mercator), w, h, pad);
  const pts = fitted.points;
  // En Mercator, une unité vaut R·cos(latitude) mètres au sol
  const pxPerMeter = fitted.scale / (6371e3 * Math.cos((ll[0][0] * Math.PI) / 180));

  const cum = [0];
  for (let i = 1; i < ll.length; i++) cum.push(cum[i - 1] + haversine(ll[i - 1], ll[i]));
  const ratio = totalMeters > 0 && cum[cum.length - 1] > 0 ? totalMeters / cum[cum.length - 1] : 1;

  const segments: Array<{ km: number; d: string }> = [];
  const markers: Array<{ km: number; at: XY }> = [];
  let current: XY[] = [pts[0]];
  let km = 1;

  for (let i = 1; i < pts.length; i++) {
    const d0 = cum[i - 1] * ratio;
    const d1 = cum[i] * ratio;
    // Un segment GPS peut franchir une (ou plusieurs) bornes kilométriques :
    // on interpole le point exact de la borne pour couper proprement.
    while (d1 >= km * 1000 && d1 > d0) {
      const t = (km * 1000 - d0) / (d1 - d0);
      const at: XY = [
        pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
        pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t,
      ];
      current.push(at);
      segments.push({ km, d: toPath(current) });
      markers.push({ km, at });
      current = [at];
      km++;
    }
    current.push(pts[i]);
  }
  if (current.length >= 2) segments.push({ km, d: toPath(current) });

  return { segments, markers, start: pts[0], end: pts[pts.length - 1], pxPerMeter };
}

/** Barre d'échelle « ronde » (100 m, 500 m, 1 km…) d'environ `targetPx` pixels. */
export function niceScale(pxPerMeter: number, targetPx: number): { px: number; label: string } | null {
  if (!(pxPerMeter > 0)) return null;
  const steps = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000];
  const want = targetPx / pxPerMeter;
  const m = steps.reduce((best, s) => (Math.abs(s - want) < Math.abs(best - want) ? s : best), steps[0]);
  return { px: m * pxPerMeter, label: m >= 1000 ? `${m / 1000} km` : `${m} m` };
}

/**
 * Signature d'un parcours : `n` points rééchantillonnés à distance égale le
 * long du tracé. Deux sorties sur le même parcours ont des signatures proches
 * point à point, quelle que soit la densité de leurs polylines.
 */
export function routeSignature(encoded: string | null | undefined, n = 16): LatLng[] {
  const ll = decodePolyline(encoded);
  if (ll.length < 2) return [];
  const cum = [0];
  for (let i = 1; i < ll.length; i++) cum.push(cum[i - 1] + haversine(ll[i - 1], ll[i]));
  const total = cum[cum.length - 1];
  if (total <= 0) return [];
  const out: LatLng[] = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const target = (k / (n - 1)) * total;
    while (j < cum.length - 1 && cum[j] < target) j++;
    const seg = cum[j] - cum[j - 1] || 1;
    const t = Math.max(0, Math.min(1, (target - cum[j - 1]) / seg));
    out.push([
      ll[j - 1][0] + (ll[j][0] - ll[j - 1][0]) * t,
      ll[j - 1][1] + (ll[j][1] - ll[j - 1][1]) * t,
    ]);
  }
  return out;
}

/**
 * Écart moyen (m) entre deux signatures. Une boucle courue dans l'autre sens
 * est le même parcours : on garde le meilleur des deux sens.
 */
export function signatureGap(a: LatLng[], b: LatLng[]): number {
  if (!a.length || a.length !== b.length) return Infinity;
  const mean = (bb: LatLng[]) => a.reduce((s, p, i) => s + haversine(p, bb[i]), 0) / a.length;
  return Math.min(mean(b), mean([...b].reverse()));
}

/** Même parcours : écart moyen sous 120 m et distance à ±12 %. */
export function sameRoute(
  a: { polyline: string | null; distance: number },
  b: { polyline: string | null; distance: number },
  sigA = routeSignature(a.polyline),
  sigB = routeSignature(b.polyline)
): boolean {
  if (!sigA.length || !sigB.length || a.distance <= 0 || b.distance <= 0) return false;
  const ratio = a.distance / b.distance;
  if (ratio < 0.88 || ratio > 1 / 0.88) return false;
  return signatureGap(sigA, sigB) < 120;
}

/**
 * Regroupe les sorties en parcours récurrents. Glouton, dans l'ordre fourni :
 * chaque sortie rejoint le premier groupe dont le représentant (la première
 * sortie du groupe) est le même parcours, sinon en fonde un nouveau.
 * Les signatures sont calculées une seule fois par sortie.
 */
export function groupRoutes<T extends { polyline: string | null; distance: number }>(
  items: T[]
): Array<{ lead: T; items: T[] }> {
  const groups: Array<{ lead: T; sig: LatLng[]; items: T[] }> = [];
  for (const it of items) {
    const sig = routeSignature(it.polyline);
    if (!sig.length) continue;
    const g = groups.find((g) => sameRoute(g.lead, it, g.sig, sig));
    if (g) g.items.push(it);
    else groups.push({ lead: it, sig, items: [it] });
  }
  return groups
    .map(({ lead, items }) => ({ lead, items }))
    .sort((a, b) => b.items.length - a.items.length);
}

/** Premier point d'un tracé, ou null. */
export function startOf(encoded: string | null | undefined): LatLng | null {
  const ll = decodePolyline(encoded);
  return ll.length ? ll[0] : null;
}
