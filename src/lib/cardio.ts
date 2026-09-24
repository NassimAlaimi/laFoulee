/**
 * Cardio profond — courbes FC / vitesse et métriques dérivées.
 *
 * Les streams Strava (time, heartrate, velocity_smooth) sont stockés en
 * delta-encodage : une séquence « t0,hr0,v0;dt1,dhr1,dv1;… » qui divise la
 * taille par ~3 face au JSON brut (les deltas tiennent sur 1-2 chiffres).
 *
 * Les métriques classiques de la prépa élite sont dérivées ici :
 *
 * - **Découplage aérobie** (aerobic decoupling) : l'efficience (vitesse ÷ FC)
 *   de la seconde moitié comparée à la première. Une dérive positive dit que
 *   le cœur paie de plus en plus cher la même vitesse — le KPI n° 1 des
 *   sorties longues. Sous 5 % : base aérobie solide.
 * - **Facteur d'efficience** (EF) : mètres par minute par battement. Sa
 *   tendance sur les sorties faciles est LE marqueur de développement aérobie.
 *
 * Conventions : les portions d'échauffement et de fin (10 % de part et
 * d'autre) sont exclues des calculs — la dérive cardiaque physiologique des
 * premières minutes n'est pas un défaut d'endurance.
 */

import { round } from "./stats";

export type HrStreamData = {
  /** secondes depuis le départ */
  time: number[];
  /** bpm */
  hr: number[];
  /** m/s */
  speed: number[];
};

/** Fraction de début/fin exclue des calculs (échauffement / fin de séance). */
export const STEADY_EDGE = 0.1;

/**
 * Encode des séries en chaîne delta-compacte.
 * Format : `t0,hr0,v0;dt,dhr,dv;…` — v en cm/s pour des deltas entiers.
 */
export function encodeStream(stream: HrStreamData): string {
  const n = stream.time.length;
  if (n === 0) return "";
  const parts: string[] = [`${Math.round(stream.time[0])},${Math.round(stream.hr[0])},${Math.round(stream.speed[0] * 100)}`];
  for (let i = 1; i < n; i++) {
    const dt = Math.round(stream.time[i] - stream.time[i - 1]);
    const dhr = Math.round(stream.hr[i] - stream.hr[i - 1]);
    const dv = Math.round((stream.speed[i] - stream.speed[i - 1]) * 100);
    if (dt === 0 && dhr === 0 && dv === 0) continue; // échantillon redondant
    // Les deltas nuls sont omis : « 1 » = dt seul, « 1,2 » = dt,dhr…
    if (dhr === 0 && dv === 0) parts.push(`${dt}`);
    else if (dv === 0) parts.push(`${dt},${dhr}`);
    else parts.push(`${dt},${dhr},${dv}`);
  }
  return parts.join(";");
}

/** Décode une chaîne produite par encodeStream. */
export function decodeStream(encoded: string): HrStreamData {
  const time: number[] = [];
  const hr: number[] = [];
  const speed: number[] = [];
  let t = 0;
  let h = 0;
  let v = 0;
  for (const part of encoded.split(";")) {
    if (!part) continue;
    const nums = part.split(",").map(Number);
    if (nums.length === 0 || nums.some((x) => !Number.isFinite(x))) continue;
    const [a, b = 0, c = 0] = nums;
    t += a;
    h += b;
    v += c;
    time.push(t);
    hr.push(h);
    speed.push(v / 100);
  }
  return { time, hr, speed };
}

/** Partie « stable » de la séance : le cœur, sans les 10 % de chaque bord. */
export function steadySlice(stream: HrStreamData): HrStreamData {
  const n = stream.time.length;
  if (n < 8) return stream;
  const from = Math.floor(n * STEADY_EDGE);
  const to = Math.ceil(n * (1 - STEADY_EDGE));
  return {
    time: stream.time.slice(from, to),
    hr: stream.hr.slice(from, to),
    speed: stream.speed.slice(from, to),
  };
}

export type DecouplingResult = {
  /** % — positif = le cœur dérive (efficience perdue en 2e moitié) */
  drift: number;
  /** m/min par bpm sur toute la partie stable */
  efficiency: number;
  /** FC moyenne de la partie stable */
  avgHr: number;
  /** Vitesse moyenne de la partie stable (m/s) */
  avgSpeed: number;
  samples: number;
};

/**
 * Découplage aérobie et facteur d'efficience sur la partie stable.
 * Efficience = vitesse (m/min) ÷ FC. drift = (EF début − EF fin) / EF début.
 */
export function aerobicDecoupling(stream: HrStreamData): DecouplingResult | null {
  const s = steadySlice(stream);
  if (s.hr.length < 8) return null;

  const eff = (from: number, to: number) => {
    let hrSum = 0;
    let spSum = 0;
    for (let i = from; i < to; i++) {
      hrSum += s.hr[i];
      spSum += s.speed[i];
    }
    const hrAvg = hrSum / (to - from);
    const mPerMin = (spSum / (to - from)) * 60;
    return { hrAvg, mPerMin, eff: mPerMin / hrAvg };
  };

  const half = Math.floor(s.hr.length / 2);
  const first = eff(0, half);
  const second = eff(half, s.hr.length);
  const all = eff(0, s.hr.length);

  return {
    drift: round(((first.eff - second.eff) / first.eff) * 100, 1),
    efficiency: round(all.eff, 2),
    avgHr: Math.round(all.hrAvg),
    avgSpeed: round(all.mPerMin / 60, 2),
    samples: s.hr.length,
  };
}

export type ZoneTime = {
  key: string;
  name: string;
  minutes: number;
  /** % du temps total de la séance */
  percent: number;
};

/**
 * Temps passé dans chaque zone cardiaque (bornes [lo, hi[, Infinity pour la
 * dernière). Les zones viennent des seuils personnalisés (lib/thresholds).
 */
export function timeInZones(
  stream: HrStreamData,
  zones: Array<{ key: string; name: string; hrLow: number; hrHigh: number }>
): ZoneTime[] {
  const result: ZoneTime[] = zones.map((z) => ({
    key: z.key,
    name: z.name,
    minutes: 0,
    percent: 0,
  }));
  if (stream.hr.length === 0 || zones.length === 0) return result;

  let total = 0;
  for (let i = 0; i < stream.hr.length; i++) {
    const zone =
      zones.find((z) => stream.hr[i] >= z.hrLow && stream.hr[i] < z.hrHigh) ??
      zones[zones.length - 1];
    const found = result.find((z) => z.key === zone.key)!;
    found.minutes++;
    total++;
  }

  // Échantillonnage ~1 s → minutes ≈ secondes / 60. Les pourcentages sont
  // calculés sur les comptes bruts avant l'arrondi des minutes.
  for (const z of result) {
    z.percent = total > 0 ? Math.round((z.minutes / total) * 100) : 0;
    z.minutes = round(z.minutes / 60, 1);
  }
  return result;
}

/** Tendance d'efficience : moyenne glissante simple sur les séances données. */
export function efficiencyTrend(
  points: Array<{ date: Date; efficiency: number }>,
  windowSize = 4
): Array<{ date: Date; efficiency: number }> {
  const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime());
  const out: Array<{ date: Date; efficiency: number }> = [];
  for (let i = 0; i < sorted.length; i++) {
    const from = Math.max(0, i - windowSize + 1);
    const slice = sorted.slice(from, i + 1);
    out.push({
      date: sorted[i].date,
      efficiency: round(
        slice.reduce((a, p) => a + p.efficiency, 0) / slice.length,
        2
      ),
    });
  }
  return out;
}
