/**
 * Plan de course — GPX, profil de dénivelé et allures ajustées à la pente.
 *
 * Trois briques pures, testées :
 *
 * 1. **parseGpx** : lit les `<trkpt>` d'un fichier GPX (regex — le format est
 *    régulier, pas besoin de parseur XML dédié ni de dépendance nouvelle).
 * 2. **elevationProfile** : regroupe les points en tronçons de ~1 km avec
 *    montée, descente et pente moyenne (haversine + deltas d'altitude).
 * 3. **elevationPacingPlan** : répartit le chrono visé entre les tronçons au
 *    prorata de leur coût — le coût d'un kilomètre en côte est plus élevé
 *    qu'en descente, donc le plan ralentit en montée et accélère en descente
 *    sans jamais dépasser le total.
 *
 * Le modèle de pente (coût par % de dénivelé) suit les ordres de grandeur de
 * la littérature (Minetti) : +4 % d'allure par % de montée, −2,2 % par % de
 * descente, bornés pour rester crédibles.
 */

import { haversine } from "./polyline";
import { round } from "./stats";

export type GpxPoint = { lat: number; lon: number; ele: number };

/** Extraits les points de trace d'un fichier GPX. */
export function parseGpx(xml: string): GpxPoint[] {
  const points: GpxPoint[] = [];
  const re = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)">([\s\S]*?)<\/trkpt>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const eleMatch = /<ele>([^<]+)<\/ele>/.exec(m[3]);
    const ele = eleMatch ? Number(eleMatch[1]) : 0;
    points.push({ lat, lon, ele: Number.isFinite(ele) ? ele : 0 });
  }
  return points;
}

export type ProfileBin = {
  /** kilomètre de départ du tronçon */
  km: number;
  /** longueur du tronçon en km */
  lengthKm: number;
  gain: number;
  loss: number;
  /** pente moyenne en % (positive = montée) */
  grade: number;
};

/** Profil de dénivelé regroupé par tronçons de ~1 km. */
export function elevationProfile(
  points: GpxPoint[],
  binMeters = 1000
): ProfileBin[] {
  const bins: ProfileBin[] = [];
  if (points.length < 2) return bins;

  let current: ProfileBin = { km: 0, lengthKm: 0, gain: 0, loss: 0, grade: 0 };
  let dist = 0;

  for (let i = 1; i < points.length; i++) {
    const d = haversine([points[i - 1].lat, points[i - 1].lon], [points[i].lat, points[i].lon]);
    const de = points[i].ele - points[i - 1].ele;
    dist += d;
    current.lengthKm += d / 1000;
    if (de > 0) current.gain += de;
    else current.loss -= de;

    if (current.lengthKm >= binMeters / 1000) {
      current.grade = round(
        ((current.gain - current.loss) / (current.lengthKm * 1000)) * 100,
        1
      );
      bins.push(current);
      current = { km: bins.length * (binMeters / 1000), lengthKm: 0, gain: 0, loss: 0, grade: 0 };
    }
  }
  if (current.lengthKm > 0.05) {
    current.grade = round(
      ((current.gain - current.loss) / Math.max(1, current.lengthKm * 1000)) * 100,
      1
    );
    bins.push(current);
  }
  return bins;
}

/** Facteur d'allure selon la pente (1 = plat). Borné pour rester crédible. */
export function gradeFactor(gradePct: number): number {
  if (gradePct > 0) return 1 + 0.04 * gradePct; // +4 % d'allure par % de montée
  return Math.max(0.72, 1 + 0.022 * gradePct); // −2,2 % par % de descente
}

/** Allure (s/km) ajustée à la pente. */
export function paceForGrade(basePace: number, gradePct: number): number {
  return basePace * gradeFactor(gradePct);
}

export type ElevationSegment = {
  km: number;
  lengthKm: number;
  grade: number;
  /** s/km ajustée à la pente */
  pace: number;
  /** temps du tronçon en secondes */
  seconds: number;
  /** temps cumulé depuis le départ */
  cumulative: number;
};

/**
 * Répartit le chrono visé entre les tronçons au prorata du coût pente.
 * La somme des tronçons vaut exactement `targetSeconds`.
 */
export function elevationPacingPlan(
  profile: ProfileBin[],
  targetSeconds: number,
  basePace: number
): ElevationSegment[] {
  if (profile.length === 0 || targetSeconds <= 0 || basePace <= 0) return [];

  const costs = profile.map((b) => {
    const pace = paceForGrade(basePace, b.grade);
    return { bin: b, pace, cost: (b.lengthKm * 1000 * pace) / 1000 };
  });
  const totalCost = costs.reduce((a, c) => a + c.cost, 0);
  if (totalCost <= 0) return [];

  let cumulative = 0;
  return costs.map((c) => {
    const seconds = (c.cost / totalCost) * targetSeconds;
    cumulative += seconds;
    return {
      km: round(c.bin.km, 2),
      lengthKm: round(c.bin.lengthKm, 2),
      grade: c.bin.grade,
      pace: round(c.pace),
      seconds: Math.round(seconds),
      cumulative: Math.round(cumulative),
    };
  });
}

/** Étapes de ravitaillement : tous les X km, jamais au départ ni à l'arrivée. */
export function fuelingStops(
  distanceKm: number,
  everyKm: number,
  maxStops = 15
): Array<{ km: number; label: string }> {
  if (everyKm <= 0 || distanceKm <= 0) return [];
  const stops: Array<{ km: number; label: string }> = [];
  for (let km = everyKm; km < distanceKm - 0.5 && stops.length < maxStops; km += everyKm) {
    stops.push({ km: round(km, 1), label: `km ${round(km, 1)}` });
  }
  return stops;
}
