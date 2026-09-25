/**
 * Import d'activités depuis des fichiers (FIT, GPX, TCX) — sans API, sans
 * dépendance. Décision : pas d'API Garmin (réservée aux partenaires) ; on
 * importe les fichiers que toutes les montres savent produire, ou l'export
 * complet du compte.
 *
 * Chaque format est ramené à une piste commune (`Track`), puis à une activité
 * de l'app (`ImportedActivity`) avec ce que Strava fournit d'habitude : km-
 * splits, courbe FC/vitesse, tracé encodé, meilleurs efforts, D+.
 *
 * Fonctions pures, testées dans tests/track-import.test.ts.
 */

import { decodeFit, fitSportType } from "./fit";
import { encodePolyline, haversine, type LatLng } from "./polyline";
import { encodeStream } from "./cardio";
import { STANDARD_DISTANCES } from "./records";

export type TrackPoint = {
  /** ms epoch */
  t: number;
  lat: number | null;
  lon: number | null;
  ele: number | null;
  hr: number | null;
  cad: number | null;
  /** m cumulés, si le fichier les fournit */
  dist: number | null;
  /** m/s, si le fichier la fournit */
  speed: number | null;
};

export type Track = {
  format: "fit" | "gpx" | "tcx";
  name: string | null;
  type: string;
  points: TrackPoint[];
  /** totaux déclarés par le fichier (prioritaires quand ils existent) */
  declared: { elapsed?: number | null; moving?: number | null; distance?: number | null; ascent?: number | null; calories?: number | null; avgHr?: number | null; maxHr?: number | null };
};

// ---------------------------------------------------------------- XML

const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, "i"));
  return m ? m[1].trim() : null;
};
const numTag = (xml: string, name: string) => {
  const v = tag(xml, name);
  const n = v === null ? NaN : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const decodeEntities = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");

function gpxType(raw: string | null): string {
  const t = (raw ?? "").toLowerCase().trim();
  // Strava exporte des codes numériques : 9 = course, 1 = vélo.
  if (t === "9") return "Run";
  if (t === "1") return "Ride";
  if (/trail/.test(t)) return "TrailRun";
  if (/run|course/.test(t)) return "Run";
  if (/bik|cycl|ride|vélo|velo/.test(t)) return "Ride";
  if (/hik|rando/.test(t)) return "Hike";
  if (/walk|marche/.test(t)) return "Walk";
  return "Run";
}

export function parseGpxTrack(xml: string): Track {
  const trk = tag(xml, "trk") ?? xml;
  const name = tag(trk, "name");
  const type = tag(trk, "type");
  const points: TrackPoint[] = [];
  const re = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>|<trkpt\b([^>]*)\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(trk))) {
    const attrs = m[1] ?? m[3] ?? "";
    const body = m[2] ?? "";
    const lat = attrs.match(/lat="([-\d.]+)"/);
    const lon = attrs.match(/lon="([-\d.]+)"/);
    const time = tag(body, "time");
    const t = time ? Date.parse(time) : NaN;
    if (!Number.isFinite(t)) continue;
    points.push({
      t,
      lat: lat ? +lat[1] : null,
      lon: lon ? +lon[1] : null,
      ele: numTag(body, "ele"),
      hr: numTag(body, "hr"),
      cad: (() => {
        const c = numTag(body, "cad");
        return c !== null ? (c < 120 ? c * 2 : c) : null;
      })(),
      dist: null,
      speed: numTag(body, "speed"),
    });
  }
  return { format: "gpx", name: name ? decodeEntities(name) : null, type: gpxType(type), points, declared: {} };
}

export function parseTcx(xml: string): Track {
  const act = xml.match(/<Activity\b[^>]*Sport="([^"]*)"[^>]*>([\s\S]*?)<\/Activity>/i);
  const body = act ? act[2] : xml;
  const sport = act ? act[1] : "Running";
  const points: TrackPoint[] = [];
  let elapsed = 0;
  let distance = 0;
  let calories = 0;
  const laps = body.match(/<Lap\b[\s\S]*?<\/Lap>/g) ?? [];
  for (const lap of laps) {
    elapsed += numTag(lap, "TotalTimeSeconds") ?? 0;
    distance += numTag(lap.replace(/<Track>[\s\S]*<\/Track>/, ""), "DistanceMeters") ?? 0;
    calories += numTag(lap, "Calories") ?? 0;
  }
  const re = /<Trackpoint>([\s\S]*?)<\/Trackpoint>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const p = m[1];
    const time = tag(p, "Time");
    const t = time ? Date.parse(time) : NaN;
    if (!Number.isFinite(t)) continue;
    const hrBlock = tag(p, "HeartRateBpm");
    const cad = numTag(p, "RunCadence") ?? numTag(p, "Cadence");
    points.push({
      t,
      lat: numTag(p, "LatitudeDegrees"),
      lon: numTag(p, "LongitudeDegrees"),
      ele: numTag(p, "AltitudeMeters"),
      hr: hrBlock ? numTag(hrBlock, "Value") : null,
      cad: cad !== null ? (cad < 120 ? cad * 2 : cad) : null,
      dist: numTag(p, "DistanceMeters"),
      speed: numTag(p, "Speed"),
    });
  }
  const type = /run/i.test(sport) ? "Run" : /bik/i.test(sport) ? "Ride" : "Workout";
  return {
    format: "tcx",
    name: null,
    type,
    points,
    declared: { elapsed: elapsed || null, distance: distance || null, calories: calories || null },
  };
}

export function fitToTrack(bytes: Uint8Array): Track {
  const fit = decodeFit(bytes);
  const s = fit.sessions[0];
  return {
    format: "fit",
    name: null,
    type: fitSportType(s?.sport ?? 1, s?.subSport ?? null),
    points: fit.records.map((r) => ({
      t: r.time.getTime(),
      lat: r.lat,
      lon: r.lon,
      ele: r.altitude,
      hr: r.hr,
      cad: r.cadence,
      dist: r.distance,
      speed: r.speed,
    })),
    declared: s
      ? {
          elapsed: s.elapsed,
          moving: s.timer,
          distance: s.distance,
          ascent: s.ascent,
          calories: s.calories,
          avgHr: s.avgHr,
          maxHr: s.maxHr,
        }
      : {},
  };
}

/** Détecte le format d'après le contenu (pas l'extension). */
export function parseTrackFile(bytes: Uint8Array): Track {
  if (bytes.length >= 12 && bytes[8] === 0x2e && bytes[9] === 0x46 && bytes[10] === 0x49 && bytes[11] === 0x54) {
    return fitToTrack(bytes);
  }
  const text = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 4096)));
  const full = () => new TextDecoder().decode(bytes);
  if (/<TrainingCenterDatabase/i.test(text)) return parseTcx(full());
  if (/<gpx/i.test(text)) return parseGpxTrack(full());
  throw new Error("format");
}

// ---------------------------------------------------------------- Activité

export type ImportedSplit = {
  index: number;
  distance: number;
  movingTime: number;
  elapsedTime: number;
  elevationDiff: number;
  averageSpeed: number | null;
  averageHr: number | null;
};

export type ImportedActivity = {
  source: "fit" | "gpx" | "tcx";
  name: string;
  type: string;
  startDate: Date;
  distance: number;
  movingTime: number;
  elapsedTime: number;
  totalElevation: number;
  averageSpeed: number | null;
  maxSpeed: number | null;
  averageHr: number | null;
  maxHr: number | null;
  hasHeartrate: boolean;
  averageCadence: number | null;
  calories: number | null;
  polyline: string | null;
  splits: ImportedSplit[];
  /** HrStream.series (lib/cardio), null sans cardio */
  stream: string | null;
  bestEfforts: Array<{ name: string; distance: number; movingTime: number; elapsedTime: number; startDate: Date }>;
};

/** Vitesse en dessous de laquelle on est à l'arrêt (m/s). */
const MOVING_SPEED = 0.6;
/** Écart de temps au-delà duquel c'est une pause montre (s). */
const PAUSE_GAP = 10;
/** Hystérésis du dénivelé (m) : filtre le bruit barométrique/GPS. */
const ELE_HYSTERESIS = 3;

type Enriched = TrackPoint & { d: number; v: number };

/** Distance cumulée et vitesse de chaque point, quelle que soit la source. */
export function enrich(points: TrackPoint[]): Enriched[] {
  const pts = [...points].sort((a, b) => a.t - b.t);
  const out: Enriched[] = [];
  let d = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const prev = out[i - 1];
    if (p.dist !== null && p.dist >= (prev?.d ?? 0)) d = p.dist;
    else if (prev && p.lat !== null && p.lon !== null && prev.lat !== null && prev.lon !== null) {
      d = prev.d + haversine([prev.lat, prev.lon], [p.lat, p.lon]);
    }
    const dt = prev ? (p.t - prev.t) / 1000 : 0;
    const v = p.speed ?? (prev && dt > 0 ? (d - prev.d) / dt : 0);
    out.push({ ...p, d, v });
  }
  // Vitesse lissée sur 5 points quand elle est dérivée (GPS bruité).
  if (points.every((p) => p.speed === null)) {
    for (let i = 0; i < out.length; i++) {
      const a = out[Math.max(0, i - 2)];
      const b = out[Math.min(out.length - 1, i + 2)];
      const dt = (b.t - a.t) / 1000;
      out[i].v = dt > 0 ? (b.d - a.d) / dt : 0;
    }
  }
  return out;
}

export function elevationGain(eles: Array<number | null>): number {
  let gain = 0;
  let ref: number | null = null;
  for (const e of eles) {
    if (e === null) continue;
    if (ref === null) {
      ref = e;
      continue;
    }
    if (e - ref >= ELE_HYSTERESIS) {
      gain += e - ref;
      ref = e;
    } else if (ref - e >= ELE_HYSTERESIS) ref = e;
  }
  return Math.round(gain);
}

/** Km-splits (comme Strava) : temps en mouvement, FC moyenne, dénivelé. */
export function kmSplits(pts: Enriched[]): ImportedSplit[] {
  const out: ImportedSplit[] = [];
  if (pts.length < 2) return out;
  let startIdx = 0;
  let next = 1000;
  const flush = (endIdx: number, dist: number) => {
    let moving = 0;
    let hrSum = 0;
    let hrW = 0;
    for (let i = startIdx + 1; i <= endIdx; i++) {
      const dt = (pts[i].t - pts[i - 1].t) / 1000;
      if (dt <= 0 || dt > PAUSE_GAP) continue;
      if (pts[i].v >= MOVING_SPEED) moving += dt;
      if (pts[i].hr) {
        hrSum += pts[i].hr! * dt;
        hrW += dt;
      }
    }
    const eA = pts[startIdx].ele;
    const eB = pts[endIdx].ele;
    out.push({
      index: out.length + 1,
      distance: Math.round(dist),
      movingTime: Math.round(moving),
      elapsedTime: Math.round((pts[endIdx].t - pts[startIdx].t) / 1000),
      elevationDiff: eA !== null && eB !== null ? Math.round((eB - eA) * 10) / 10 : 0,
      averageSpeed: moving > 0 ? Math.round((dist / moving) * 1000) / 1000 : null,
      averageHr: hrW > 0 ? Math.round((hrSum / hrW) * 10) / 10 : null,
    });
    startIdx = endIdx;
  };
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].d >= next) {
      flush(i, pts[i].d - pts[startIdx].d);
      next += 1000;
    }
  }
  const rest = pts[pts.length - 1].d - pts[startIdx].d;
  if (rest >= 100) flush(pts.length - 1, rest);
  return out;
}

/** Meilleur temps sur chaque distance standard (fenêtre glissante). */
export function bestEffortsOf(pts: Enriched[], start: Date) {
  const out: ImportedActivity["bestEfforts"] = [];
  const total = pts.length ? pts[pts.length - 1].d : 0;
  // Temps « actif » cumulé : les pauses montre ne comptent pas dans un record.
  const at: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const dt = i ? (pts[i].t - pts[i - 1].t) / 1000 : 0;
    at.push((at[i - 1] ?? 0) + (dt > 0 && dt <= PAUSE_GAP ? dt : 0));
  }
  for (const sd of STANDARD_DISTANCES) {
    if (sd.meters > total) continue;
    let best = Infinity;
    let bestStart = 0;
    let j = 0;
    for (let i = 0; i < pts.length; i++) {
      while (j < pts.length && pts[j].d - pts[i].d < sd.meters) j++;
      if (j >= pts.length) break;
      // Interpolation sur le dernier segment pour la distance exacte.
      const over = pts[j].d - pts[i].d - sd.meters;
      const seg = pts[j].d - pts[j - 1].d;
      const aj = seg > 0 ? at[j] - ((at[j] - at[j - 1]) * over) / seg : at[j];
      const dt = aj - at[i];
      if (dt > 0 && dt < best) {
        best = dt;
        bestStart = pts[i].t;
      }
    }
    if (Number.isFinite(best)) {
      out.push({ name: sd.strava[0], distance: sd.meters, movingTime: Math.round(best), elapsedTime: Math.round(best), startDate: new Date(bestStart || start.getTime()) });
    }
  }
  return out;
}

function defaultName(type: string, start: Date): string {
  const h = start.getHours();
  const moment = h < 12 ? "matinale" : h < 18 ? "de l'après-midi" : "du soir";
  const kind = type === "TrailRun" ? "Trail" : type === "Ride" ? "Sortie vélo" : type === "Walk" || type === "Hike" ? "Marche" : "Course";
  return `${kind} ${moment}`;
}

export function toActivity(track: Track): ImportedActivity | null {
  const pts = enrich(track.points);
  if (pts.length < 2) return null;
  const start = new Date(pts[0].t);
  let moving = 0;
  for (let i = 1; i < pts.length; i++) {
    const dt = (pts[i].t - pts[i - 1].t) / 1000;
    if (dt > 0 && dt <= PAUSE_GAP && pts[i].v >= MOVING_SPEED) moving += dt;
  }
  const elapsed = track.declared.elapsed ?? (pts[pts.length - 1].t - pts[0].t) / 1000;
  const distance = track.declared.distance ?? pts[pts.length - 1].d;
  const movingTime = Math.round(track.declared.moving && track.declared.moving < elapsed * 1.01 ? Math.min(track.declared.moving, moving || track.declared.moving) : moving || elapsed);
  const hrs = pts.map((p) => p.hr).filter((h): h is number => h !== null && h > 30);
  const cads = pts.map((p) => p.cad).filter((c): c is number => c !== null && c > 60);

  let hrWeighted = 0;
  let hrTime = 0;
  for (let i = 1; i < pts.length; i++) {
    const dt = (pts[i].t - pts[i - 1].t) / 1000;
    if (dt > 0 && dt <= PAUSE_GAP && pts[i].hr) {
      hrWeighted += pts[i].hr! * dt;
      hrTime += dt;
    }
  }

  // Tracé : au plus ~1 500 points, précision 5 décimales (≈ 1 m).
  const geo = pts.filter((p) => p.lat !== null && p.lon !== null);
  const stepGeo = Math.max(1, Math.ceil(geo.length / 1500));
  const line: LatLng[] = geo.filter((_, i) => i % stepGeo === 0 || i === geo.length - 1).map((p) => [p.lat!, p.lon!]);

  // Courbe FC/vitesse : ~1 point / 2 s, au plus 6 000.
  let stream: string | null = null;
  if (hrs.length > 30) {
    const stepS = Math.max(1, Math.ceil(pts.length / 6000));
    const sel = pts.filter((_, i) => i % stepS === 0);
    stream = encodeStream({
      time: sel.map((p) => (p.t - pts[0].t) / 1000),
      hr: sel.map((p) => p.hr ?? 0),
      speed: sel.map((p) => Math.max(0, p.v)),
    });
  }

  const maxSpeed = pts.reduce((a, p) => Math.max(a, p.v), 0);
  return {
    source: track.format,
    name: track.name ?? defaultName(track.type, start),
    type: track.type,
    startDate: start,
    distance: Math.round(distance * 10) / 10,
    movingTime,
    elapsedTime: Math.round(elapsed),
    totalElevation: track.declared.ascent ?? elevationGain(pts.map((p) => p.ele)),
    averageSpeed: movingTime > 0 ? Math.round((distance / movingTime) * 1000) / 1000 : null,
    maxSpeed: maxSpeed > 0 ? Math.round(Math.min(maxSpeed, 12) * 1000) / 1000 : null,
    averageHr: track.declared.avgHr ?? (hrTime > 0 ? Math.round((hrWeighted / hrTime) * 10) / 10 : null),
    maxHr: track.declared.maxHr ?? (hrs.length ? Math.max(...hrs) : null),
    hasHeartrate: hrs.length > 0,
    averageCadence: cads.length ? Math.round(cads.reduce((a, b) => a + b, 0) / cads.length) : null,
    calories: track.declared.calories ?? null,
    polyline: line.length >= 2 ? encodePolyline(line) : null,
    splits: kmSplits(pts),
    stream,
    bestEfforts: /Run/.test(track.type) ? bestEffortsOf(pts, start) : [],
  };
}

// ---------------------------------------------------------------- Doublons

/**
 * Même sortie ? Départ à ± 2 min et distance à ± 3 % (ou ± 150 m pour les
 * très courtes). Sert à fusionner un fichier avec l'activité Strava déjà là.
 */
export function sameActivity(
  a: { startDate: Date; distance: number },
  b: { startDate: Date; distance: number }
): boolean {
  if (Math.abs(a.startDate.getTime() - b.startDate.getTime()) > 120_000) return false;
  const tol = Math.max(150, 0.03 * Math.max(a.distance, b.distance));
  return Math.abs(a.distance - b.distance) <= tol;
}
