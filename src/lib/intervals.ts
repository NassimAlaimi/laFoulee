/**
 * Détection automatique des fractions d'intervalles dans une séance.
 *
 * À partir des splits (kilomètres Strava, ou tours si disponibles), on repère
 * les « blocs rapides » — les tronçons nettement plus vites que l'allure
 * médiane de la séance — puis on vérifie qu'ils forment une structure
 * répétée : au moins 3 blocs, de distances comparables, séparés par des
 * récupérations plus lentes. C'est la signature d'un 6 × 1 000, d'un
 * 5 × 3 min ou d'un 8 × 400.
 *
 * Limites assumées (documentées, pas cachées) :
 * - des splits kilométriques mélangent travail et récupération dans un même
 *   tronçon : la distance d'une fraction est donc arrondie au km le plus
 *   proche et les allures de fraction sont des moyennes travail+récup ;
 * - une séance continue rapide (course, tempo régulier) n'est PAS des
 *   intervalles : l'écart-type des allures la trahit.
 *
 * Module pur : aucune base, aucune date. Testé sur des splits synthétiques.
 */

import { round } from "./stats";

export type IntervalSplit = {
  /** mètres */
  distance: number;
  /** secondes */
  seconds: number;
};

export type IntervalRep = {
  /** numéro du split d'origine */
  splitIndex: number;
  distance: number;
  seconds: number;
  /** s/km, moyenne sur le bloc (travail + éventuelle récup fusionnée) */
  pace: number;
};

export type IntervalAnalysis = {
  detected: boolean;
  /** Séance continue (course / tempo) — rapide mais sans structure répétée */
  continuous: boolean;
  reps: IntervalRep[];
  summary: {
    count: number;
    /** Distance type d'une fraction, mètres */
    repDistance: number;
    avgPace: number;
    bestPace: number;
    worstPace: number;
    /** Coefficient de variation des allures de fraction, % */
    cv: number;
    /** Ralentissement entre le début et la fin des fractions, % */
    fatigue: number;
    /** Allure moyenne des récupérations, s/km (null si aucune) */
    recoveryPace: number | null;
    totalKm: number;
  } | null;
};

/** Fraction d'allure en dessous de laquelle un split est « rapide ». */
export const FAST_MARGIN = 0.93;
/** Nombre minimal de blocs rapides pour parler d'intervalles. */
export const MIN_REPS = 3;
/** Deux blocs sont « de même distance » dans cette tolérance. */
export const DIST_TOLERANCE = 0.25;
/** CV en dessous duquel la séance est jugée continue. */
export const CONTINUOUS_CV = 6;

export function detectIntervals(splits: IntervalSplit[]): IntervalAnalysis {
  type IndexedSplit = IntervalSplit & { splitIndex: number; pace: number };
  const valid: IndexedSplit[] = splits
    .map((s, i) => ({
      ...s,
      splitIndex: i,
      pace: s.distance >= 50 && s.seconds > 0 ? s.seconds / (s.distance / 1000) : 0,
    }))
    .filter((s) => s.pace > 0);

  if (valid.length < 4) return { detected: false, continuous: false, reps: [], summary: null };

  const paces = valid.map((s) => s.pace).sort((a, b) => a - b);
  const median = paces[Math.floor(paces.length / 2)];

  const fast = valid.filter((s) => s.pace <= median * FAST_MARGIN);
  if (fast.length < MIN_REPS) {
    // Pas de blocs rapides : séance continue si l'allure est uniforme.
    const cvAll = coefficientOfVariation(valid.map((s) => s.pace));
    const continuous = valid.length >= 4 && cvAll <= CONTINUOUS_CV;
    return { detected: false, continuous, reps: [], summary: null };
  }

  // Blocs = suites de splits rapides consécutifs
  const blocks: IndexedSplit[][] = [];
  for (const s of valid) {
    const isFast = s.pace <= median * FAST_MARGIN;
    if (isFast) {
      const last = blocks[blocks.length - 1];
      if (last && s.splitIndex - last[last.length - 1].splitIndex === 1) last.push(s);
      else blocks.push([s]);
    }
  }

  const blockKm = blocks.map((b) => b.reduce((a, s) => a + s.distance, 0) / 1000);

  // La structure répétée : les blocs ont des distances comparables.
  // La distance type est celle qui rassemble le plus de blocs.
  let modeKm = blockKm[0];
  let bestSupport = 0;
  for (const d of blockKm) {
    const support = blockKm.filter(
      (x) => Math.abs(x - d) <= DIST_TOLERANCE * Math.max(x, d)
    ).length;
    if (support > bestSupport) {
      bestSupport = support;
      modeKm = d;
    }
  }
  const consistent = blockKm.filter((d) => Math.abs(d - modeKm) <= DIST_TOLERANCE * Math.max(d, modeKm));
  if (consistent.length < MIN_REPS) {
    return { detected: false, continuous: false, reps: [], summary: null };
  }

  // Séance continue ? Allures de fraction trop homogènes avec le reste.
  const cvAll = coefficientOfVariation(valid.map((s) => s.pace));
  if (cvAll <= CONTINUOUS_CV) {
    return { detected: false, continuous: true, reps: [], summary: null };
  }

  const reps: IntervalRep[] = blocks.map((b) => {
    const distance = b.reduce((a, s) => a + s.distance, 0);
    const seconds = b.reduce((a, s) => a + s.seconds, 0);
    return {
      splitIndex: b[0].splitIndex,
      distance,
      seconds,
      pace: seconds / (distance / 1000),
    };
  });

  const repPaces = reps.map((r) => r.pace);
  const avgPace = repPaces.reduce((a, p) => a + p, 0) / repPaces.length;
  const firstHalf = repPaces.slice(0, Math.ceil(repPaces.length / 2));
  const secondHalf = repPaces.slice(Math.ceil(repPaces.length / 2));
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const fatigue = mean(firstHalf) > 0 ? ((mean(secondHalf) - mean(firstHalf)) / mean(firstHalf)) * 100 : 0;

  // Récupérations : les splits non rapides situés entre la première et la
  // dernière fraction (l'échauffement et le retour au calme sont exclus).
  const firstIdx = reps[0].splitIndex;
  const lastIdx = reps[reps.length - 1].splitIndex;
  const recovery = valid.filter(
    (s) =>
      s.splitIndex > firstIdx &&
      s.splitIndex < lastIdx &&
      s.pace > median * FAST_MARGIN
  );
  const recoveryPace = recovery.length
    ? recovery.reduce((a, s) => a + s.pace, 0) / recovery.length
    : null;

  return {
    detected: true,
    continuous: false,
    reps,
    summary: {
      count: reps.length,
      repDistance: Math.round((modeKm * 1000) / 10) * 10,
      avgPace,
      bestPace: Math.min(...repPaces),
      worstPace: Math.max(...repPaces),
      cv: coefficientOfVariation(repPaces),
      fatigue: round(fatigue, 1),
      recoveryPace,
      totalKm: round(valid.reduce((a, s) => a + s.distance, 0) / 1000, 1),
    },
  };
}

/** Coefficient de variation en %, arrondi. */
export function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return round((Math.sqrt(variance) / mean) * 100, 1);
}

// ---------------------------------------------------------------- Progression

export type IntervalClass = "court" | "1000" | "long";

export const INTERVAL_CLASS_LABEL: Record<IntervalClass, string> = {
  court: "fractions courtes (≤ 500 m)",
  "1000": "fractions de 1 000 m",
  long: "fractions longues (> 1,3 km)",
};

/** Classe de distance d'une fraction, pour comparer les séances entre elles. */
export function intervalClass(meters: number): IntervalClass {
  if (meters <= 500) return "court";
  if (meters <= 1300) return "1000";
  return "long";
}

export type IntervalSession = {
  id: string;
  name: string;
  date: Date;
  analysis: IntervalAnalysis;
};

/**
 * Progression d'une classe : allures moyennes des séances de la classe,
 * de la plus ancienne à la plus récente (limité aux `limit` dernières).
 */
export function classProgression(
  sessions: IntervalSession[],
  cls: IntervalClass,
  limit = 6
): Array<{ date: Date; pace: number }> {
  return sessions
    .filter(
      (s) =>
        s.analysis.detected &&
        s.analysis.summary !== null &&
        intervalClass(s.analysis.summary.repDistance) === cls
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(-limit)
    .map((s) => ({ date: s.date, pace: s.analysis.summary!.avgPace }));
}
