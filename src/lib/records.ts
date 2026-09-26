/**
 * Records personnels et prédictions de performance.
 *
 * Principe : on ne prédit jamais depuis une distance choisie arbitrairement.
 * On évalue le VDOT de CHAQUE record, on retient le meilleur, et on prédit
 * toutes les distances depuis celui-ci.
 */

import { pacePerKm } from "./format";
import {
  timeFromVdot,
  vdotFromPerformance,
  vmaFromVdot,
} from "./vdot";
import type { ActivityLike } from "./stats";

/** Distances suivies. `strava` = nom exact renvoyé par l'API best_efforts. */
export const STANDARD_DISTANCES = [
  { key: "400m", name: "400 m", meters: 400, strava: ["400m"], major: false },
  { key: "800m", name: "800 m", meters: 804.672, strava: ["1/2 mile"], major: false },
  { key: "1k", name: "1 km", meters: 1000, strava: ["1K"], major: true },
  { key: "mile", name: "1 mile", meters: 1609.34, strava: ["1 mile"], major: false },
  { key: "2mile", name: "2 miles", meters: 3218.69, strava: ["2 mile"], major: false },
  { key: "5k", name: "5 km", meters: 5000, strava: ["5K"], major: true },
  { key: "10k", name: "10 km", meters: 10000, strava: ["10K"], major: true },
  { key: "15k", name: "15 km", meters: 15000, strava: ["15K"], major: false },
  { key: "10mile", name: "10 miles", meters: 16093.4, strava: ["10 mile"], major: false },
  { key: "20k", name: "20 km", meters: 20000, strava: ["20K"], major: false },
  { key: "half", name: "Semi-marathon", meters: 21097.5, strava: ["Half-Marathon"], major: true },
  { key: "30k", name: "30 km", meters: 30000, strava: ["30K"], major: false },
  { key: "marathon", name: "Marathon", meters: 42195, strava: ["Marathon"], major: true },
] as const;

export type DistanceKey = (typeof STANDARD_DISTANCES)[number]["key"];

export type BestEffortLike = {
  name: string;
  distance: number;
  movingTime: number;
  startDate: Date;
  activityId: string;
  activity?: { name: string } | null;
};

export type PersonalRecord = {
  key: string;
  name: string;
  meters: number;
  major: boolean;
  seconds: number | null;
  pace: number | null;
  date: Date | null;
  activityId: string | null;
  activityName: string | null;
  vdot: number | null;
  /** true si dérivé d'une activité entière (donc potentiellement non maximal) */
  estimated: boolean;
};

/**
 * Records personnels par distance.
 * Source primaire : best_efforts Strava (segments chronométrés dans l'activité).
 * Fallback : activité entière dont la distance correspond (marquée `estimated`).
 */
export function personalRecords(
  efforts: BestEffortLike[],
  activities: ActivityLike[]
): PersonalRecord[] {
  return STANDARD_DISTANCES.map((d) => {
    let best: PersonalRecord = {
      key: d.key,
      name: d.name,
      meters: d.meters,
      major: d.major,
      seconds: null,
      pace: null,
      date: null,
      activityId: null,
      activityName: null,
      vdot: null,
      estimated: false,
    };

    // 1) best efforts Strava — match par nom exact, sinon par distance à 1,5 %
    const names = d.strava as readonly string[];
    for (const e of efforts) {
      const matches =
        names.includes(e.name) ||
        Math.abs(e.distance - d.meters) / d.meters <= 0.015;
      if (!matches || e.movingTime <= 0) continue;

      if (best.seconds === null || e.movingTime < best.seconds) {
        best = {
          ...best,
          seconds: e.movingTime,
          pace: pacePerKm(d.meters, e.movingTime),
          date: e.startDate,
          activityId: e.activityId,
          activityName: e.activity?.name ?? null,
          vdot: vdotFromPerformance(d.meters, e.movingTime),
          estimated: false,
        };
      }
    }

    // 2) fallback : activité entière couvrant la distance (tolérance +3 %)
    if (best.seconds === null) {
      for (const a of activities) {
        if (a.distance < d.meters || a.distance > d.meters * 1.03) continue;
        const scaled = Math.round(a.movingTime * (d.meters / a.distance));
        if (best.seconds === null || scaled < best.seconds) {
          best = {
            ...best,
            seconds: scaled,
            pace: pacePerKm(d.meters, scaled),
            date: a.startDate,
            activityId: a.id,
            activityName: a.name,
            vdot: vdotFromPerformance(d.meters, scaled),
            estimated: true,
          };
        }
      }
    }

    return best;
  });
}

export type FitnessProfile = {
  /**
   * VDOT en pleine précision. NE PAS arrondir ici : les prédictions sont
   * dérivées de cette valeur, et un arrondi rendrait la prédiction sur la
   * distance source légèrement différente du record qui l'a produite.
   * L'arrondi se fait à l'affichage.
   */
  vdot: number;
  /** Valeur arrondie, uniquement pour l'affichage */
  vdotDisplay: number;
  vma: number;
  /** Record qui porte le meilleur VDOT */
  source: PersonalRecord | null;
  /** Tous les records ayant un VDOT, triés du meilleur au moins bon */
  ranked: PersonalRecord[];
};

/**
 * Niveau de forme actuel = meilleur VDOT parmi les records.
 *
 * C'est ici que se joue la correction du bug historique : une sortie longue
 * tranquille produit un VDOT bas et ne peut plus servir de base de prédiction.
 *
 * @param withinDays ne considère que les records récents (la forme se perd).
 *                   null = tout l'historique.
 */
export function fitnessProfile(
  records: PersonalRecord[],
  withinDays: number | null = 365,
  now = new Date()
): FitnessProfile {
  const eligible = records.filter((r) => {
    if (r.vdot === null || r.seconds === null) return false;
    if (withinDays === null || !r.date) return true;
    const ageDays = (now.getTime() - r.date.getTime()) / 86_400_000;
    return ageDays <= withinDays;
  });

  const ranked = [...eligible].sort((a, b) => (b.vdot ?? 0) - (a.vdot ?? 0));
  const source = ranked[0] ?? null;
  const vdot = source?.vdot ?? 0;

  return {
    vdot,
    vdotDisplay: Math.round(vdot * 10) / 10,
    vma: Math.round(vmaFromVdot(vdot) * 10) / 10,
    source,
    ranked,
  };
}

export type Confidence = "high" | "medium" | "low";

/**
 * Un record n'est un effort MAXIMAL que si son VDOT est proche du meilleur.
 * Un 10 km couru en sortie tranquille reste le « record » faute de mieux, mais il
 * ne témoigne pas du potentiel réel : on ne doit ni s'appuyer dessus, ni laisser
 * croire à l'utilisateur que la prédiction en découle.
 */
export function isMaximalEffort(
  recordVdot: number | null,
  profileVdot: number,
  tolerance = 2
): boolean {
  if (recordVdot === null || profileVdot <= 0) return false;
  return recordVdot >= profileVdot - tolerance;
}

export type Prediction = {
  key: string;
  name: string;
  meters: number;
  major: boolean;
  seconds: number;
  pace: number;
  /** Fiabilité selon l'écart d'extrapolation et le volume d'entraînement */
  confidence: Confidence;
  confidenceReason: string;
  /** Record actuel sur cette distance, s'il existe */
  currentRecord: number | null;
  /** true si le record réel est déjà meilleur que la prédiction */
  beatsPrediction: boolean;
  /** true si le record existant témoigne d'un effort maximal */
  recordIsMaximal: boolean;
};

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: "Fiable",
  medium: "Indicatif",
  low: "Spéculatif",
};

/**
 * Prédictions sur toutes les distances depuis le meilleur VDOT.
 *
 * La fiabilité décroît avec l'écart d'extrapolation : prédire un marathon
 * depuis un 5 km suppose une endurance que le 5 km ne démontre pas. On tient
 * aussi compte du volume hebdomadaire, facteur limitant sur longue distance.
 */
export function predictions(
  records: PersonalRecord[],
  profile: FitnessProfile,
  opts: { weeklyKm?: number; longestRunMeters?: number } = {}
): Prediction[] {
  if (!profile.source || profile.vdot <= 0) return [];

  const baseMeters = profile.source.meters;
  const weeklyKm = opts.weeklyKm ?? 0;
  const longestRun = opts.longestRunMeters ?? 0;

  return STANDARD_DISTANCES.map((d) => {
    const seconds = timeFromVdot(profile.vdot, d.meters);
    const record = records.find((r) => r.key === d.key);
    const currentRecord = record?.seconds ?? null;

    const recordIsMaximal =
      !record?.estimated && isMaximalEffort(record?.vdot ?? null, profile.vdot);

    const { confidence, reason } = predictionConfidence({
      targetMeters: d.meters,
      baseMeters,
      weeklyKm,
      longestRun,
      // Seul un effort réellement maximal sur CETTE distance justifie d'annoncer
      // une prédiction fiable.
      hasMaximalRecord: recordIsMaximal,
    });

    return {
      key: d.key,
      name: d.name,
      meters: d.meters,
      major: d.major,
      seconds,
      pace: pacePerKm(d.meters, seconds),
      confidence,
      confidenceReason: reason,
      currentRecord,
      beatsPrediction: currentRecord !== null && currentRecord <= seconds,
      recordIsMaximal,
    };
  });
}

function predictionConfidence(args: {
  targetMeters: number;
  baseMeters: number;
  weeklyKm: number;
  longestRun: number;
  hasMaximalRecord: boolean;
}): { confidence: Confidence; reason: string } {
  const { targetMeters, baseMeters, weeklyKm, longestRun, hasMaximalRecord } =
    args;

  if (hasMaximalRecord) {
    return {
      confidence: "high",
      reason: "Effort maximal réalisé sur cette distance",
    };
  }

  const ratio = targetMeters / baseMeters;
  const targetKm = targetMeters / 1000;

  // Volume insuffisant : facteur limitant dominant sur longue distance
  if (targetKm >= 21 && weeklyKm > 0 && weeklyKm < targetKm * 1.5) {
    return {
      confidence: "low",
      reason: `Volume hebdo trop faible (${Math.round(weeklyKm)} km) pour tenir ${Math.round(targetKm)} km`,
    };
  }

  // Sortie longue insuffisante
  if (targetKm >= 21 && longestRun > 0 && longestRun < targetMeters * 0.6) {
    return {
      confidence: "low",
      reason: `Sortie la plus longue : ${(longestRun / 1000).toFixed(0)} km seulement`,
    };
  }

  if (ratio > 4 || ratio < 0.25) {
    return {
      confidence: "low",
      reason: "Extrapolation lointaine depuis ton meilleur effort",
    };
  }
  if (ratio > 2 || ratio < 0.5) {
    return {
      confidence: "medium",
      reason: "Extrapolation modérée",
    };
  }
  return { confidence: "medium", reason: "Proche de ton meilleur effort" };
}

/**
 * Évolution du VDOT dans le temps : un point par mois, calculé sur la
 * meilleure performance de la fenêtre glissante de 90 jours précédente.
 */
export function vdotHistory(
  efforts: BestEffortLike[],
  months = 12,
  now = new Date(),
  locale = "fr-FR"
): Array<{ month: string; label: string; vdot: number | null }> {
  const points: Array<{ month: string; label: string; vdot: number | null }> = [];

  for (let i = months - 1; i >= 0; i--) {
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    const start = new Date(end.getTime() - 90 * 86_400_000);

    let best = 0;
    for (const e of efforts) {
      if (e.startDate < start || e.startDate > end) continue;
      if (e.distance < 800) continue; // trop court : peu fiable pour le VDOT
      const v = vdotFromPerformance(e.distance, e.movingTime);
      if (v > best) best = v;
    }

    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    points.push({
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString(locale, { month: "short", year: "2-digit" }),
      vdot: best > 0 ? Math.round(best * 10) / 10 : null,
    });
  }
  return points;
}

/** Objectif de chrono → VDOT requis, et écart avec le VDOT actuel. */
export function vdotRequiredFor(meters: number, targetSeconds: number) {
  return vdotFromPerformance(meters, targetSeconds);
}
