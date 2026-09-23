/**
 * Analyses longitudinales : comparaisons année/année, polarisation de
 * l'entraînement, régularité.
 *
 * Tout est dérivé des mêmes activités que le reste de l'app — aucune de ces
 * fonctions ne redéfinit « le volume » ou « une séance rapide » de son côté :
 * la classification d'intensité s'appuie sur les allures de Daniels calculées
 * depuis le VDOT.
 */

import { danielsPaces } from "./vdot";

/** Seuils d'allure personnels, extraits des allures de Daniels. */
function thresholds(vdot: number): { easy: number; marathon: number; threshold: number } {
  const zones = danielsPaces(vdot);
  const get = (key: string) => zones.find((z) => z.key === key)?.pace ?? 0;
  return { easy: get("easy"), marathon: get("marathon"), threshold: get("threshold") };
}
import { addDays, round, startOfWeek, type ActivityLike } from "./stats";

// ---------------------------------------------------------------- Année/année

export type YearCompareResult = {
  rows: Array<Record<string, number | string>>;
  years: string[];
  totals: Array<{ year: string; km: number; runs: number; atWeek: number | null }>;
};

/**
 * Cumul kilométrique semaine par semaine, une courbe par année.
 * La comparaison la plus honnête : à date égale dans l'année, où en suis-je ?
 */
export function yearCompare(
  activities: ActivityLike[],
  opts: { years?: number; now?: Date } = {}
): YearCompareResult {
  const now = opts.now ?? new Date();
  const count = opts.years ?? 3;
  const currentYear = now.getFullYear();
  // Seulement les années où l'on a couru (l'année en cours toujours) : trois
  // courbes plates à zéro n'apprennent rien.
  const ranYears = new Set(activities.map((a) => String(a.startDate.getFullYear())));
  const years = Array.from({ length: count }, (_, i) => String(currentYear - i)).filter(
    (y, i) => i === 0 || ranYears.has(y)
  );

  const perYear = new Map<string, number[]>();
  for (const y of years) perYear.set(y, new Array(53).fill(0));

  for (const a of activities) {
    const y = String(a.startDate.getFullYear());
    const bucket = perYear.get(y);
    if (!bucket) continue;
    bucket[weekOfYear(a.startDate)] += a.distance / 1000;
  }

  const currentWeek = weekOfYear(now);

  const rows: Array<Record<string, number | string>> = [];
  const running = new Map<string, number>(years.map((y) => [y, 0]));

  for (let w = 1; w <= 52; w++) {
    const row: Record<string, number | string> = {
      week: w,
      label: `S${w}`,
    };
    for (const y of years) {
      const cum = (running.get(y) ?? 0) + (perYear.get(y)?.[w] ?? 0);
      running.set(y, cum);
      // L'année en cours s'arrête à la semaine courante : prolonger la courbe
      // à plat laisserait croire à un arrêt de l'entraînement.
      const future = y === String(currentYear) && w > currentWeek;
      if (!future) row[y] = round(cum, 0);
    }
    rows.push(row);
  }

  const totals = years.map((y) => {
    const runs = activities.filter((a) => String(a.startDate.getFullYear()) === y);
    const atWeek =
      y === String(currentYear)
        ? null
        : round(
            runs
              .filter((a) => weekOfYear(a.startDate) <= currentWeek)
              .reduce((acc, a) => acc + a.distance / 1000, 0),
            0
          );
    return {
      year: y,
      km: round(runs.reduce((acc, a) => acc + a.distance / 1000, 0), 0),
      runs: runs.length,
      atWeek,
    };
  });

  return { rows, years, totals };
}

function weekOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - start.getTime()) / 86_400_000);
  return Math.min(52, Math.floor(days / 7) + 1);
}

// ---------------------------------------------------------------- Polarisation

export type IntensityBand = "easy" | "moderate" | "hard";

/**
 * Classement d'une sortie par intensité, relatif au niveau de l'athlète.
 *
 * La « zone grise » (moderate) est celle qui coûte cher en fatigue sans
 * produire les adaptations de l'endurance fondamentale ni celles du travail
 * intense. Le modèle polarisé cherche à la minimiser.
 */
export function classifyIntensity(
  pace: number,
  paces: { easy: number; marathon: number; threshold: number }
): IntensityBand {
  if (pace > paces.marathon + 12) return "easy";
  if (pace > paces.threshold) return "moderate";
  return "hard";
}

export type PolarPoint = {
  label: string;
  easy: number;
  moderate: number;
  hard: number;
  km: number;
};

/** Répartition mensuelle du volume par intensité, en %. */
export function polarizationByMonth(
  activities: ActivityLike[],
  vdot: number,
  opts: { months?: number; now?: Date } = {}
): PolarPoint[] {
  const months = opts.months ?? 8;
  const now = opts.now ?? new Date();
  if (vdot <= 0) return [];
  const paces = thresholds(vdot);

  const out: PolarPoint[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

    const acc = { easy: 0, moderate: 0, hard: 0 };
    for (const a of activities) {
      if (a.startDate < start || a.startDate >= end) continue;
      if (!a.averageSpeed || a.averageSpeed <= 0) continue;
      const pace = 1000 / a.averageSpeed;
      acc[classifyIntensity(pace, paces)] += a.distance / 1000;
    }

    const total = acc.easy + acc.moderate + acc.hard;
    out.push({
      label: start.toLocaleDateString("fr-FR", { month: "short" }),
      easy: total > 0 ? Math.round((acc.easy / total) * 100) : 0,
      moderate: total > 0 ? Math.round((acc.moderate / total) * 100) : 0,
      hard: total > 0 ? Math.round((acc.hard / total) * 100) : 0,
      km: round(total, 0),
    });
  }

  return out;
}

export type PolarSummary = {
  easy: number;
  moderate: number;
  hard: number;
  /** Indice de polarisation : part d'intensité hors zone grise */
  verdict: string;
  tone: "good" | "warn" | "bad";
};

/** Bilan sur la période récente, avec un verdict court et chiffré. */
export function polarizationSummary(
  activities: ActivityLike[],
  vdot: number,
  opts: { days?: number; now?: Date } = {}
): PolarSummary | null {
  const days = opts.days ?? 90;
  const now = opts.now ?? new Date();
  if (vdot <= 0) return null;
  const paces = thresholds(vdot);
  const since = addDays(now, -days);

  const acc = { easy: 0, moderate: 0, hard: 0 };
  for (const a of activities) {
    if (a.startDate < since || !a.averageSpeed) continue;
    acc[classifyIntensity(1000 / a.averageSpeed, paces)] += a.distance / 1000;
  }
  const total = acc.easy + acc.moderate + acc.hard;
  if (total <= 0) return null;

  const easy = Math.round((acc.easy / total) * 100);
  const moderate = Math.round((acc.moderate / total) * 100);
  const hard = Math.round((acc.hard / total) * 100);

  let verdict: string;
  let tone: PolarSummary["tone"];
  if (moderate >= 35) {
    verdict = `${moderate} % en zone grise`;
    tone = "bad";
  } else if (easy >= 75 && hard >= 8) {
    verdict = "Polarisé";
    tone = "good";
  } else if (hard < 5) {
    verdict = `${hard} % d'intensité seulement`;
    tone = "warn";
  } else if (easy < 70) {
    verdict = `${easy} % en facile (80 % visés)`;
    tone = "warn";
  } else {
    verdict = "Équilibré";
    tone = "good";
  }

  return { easy, moderate, hard, verdict, tone };
}

// ---------------------------------------------------------------- Allures par zone

export type PaceZonePoint = {
  label: string;
  easy: number | null;
  quality: number | null;
};

/**
 * Allure moyenne des sorties faciles vs des séances rapides, mois par mois.
 * Une allure facile qui s'améliore à fréquence cardiaque égale est le signal
 * le plus fiable de progression de la base aérobie.
 */
export function paceByIntensity(
  activities: ActivityLike[],
  vdot: number,
  opts: { months?: number; now?: Date } = {}
): PaceZonePoint[] {
  const months = opts.months ?? 12;
  const now = opts.now ?? new Date();
  if (vdot <= 0) return [];
  const paces = thresholds(vdot);

  const out: PaceZonePoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

    const easy: number[] = [];
    const quality: number[] = [];
    for (const a of activities) {
      if (a.startDate < start || a.startDate >= end || !a.averageSpeed) continue;
      const pace = 1000 / a.averageSpeed;
      const band = classifyIntensity(pace, paces);
      if (band === "easy") easy.push(pace);
      else quality.push(pace);
    }

    out.push({
      label: start.toLocaleDateString("fr-FR", { month: "short" }),
      easy: easy.length >= 2 ? round(avg(easy), 0) : null,
      quality: quality.length >= 2 ? round(avg(quality), 0) : null,
    });
  }
  return out;
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// ---------------------------------------------------------------- Régularité

export type ConsistencyGrid = {
  weeks: Array<{
    weekStart: Date;
    label: string;
    days: Array<{ date: Date; km: number; sessions: number }>;
    km: number;
  }>;
  max: number;
  /** Semaines consécutives avec au moins une sortie, en cours */
  currentStreak: number;
  /** Meilleure série de semaines actives */
  bestStreak: number;
  /** Part de semaines actives sur la période */
  activeRate: number;
};

/** Grille jour × semaine, façon carte de chaleur. */
export function consistencyGrid(
  activities: ActivityLike[],
  opts: { weeks?: number; now?: Date } = {}
): ConsistencyGrid {
  const weeks = opts.weeks ?? 26;
  const now = opts.now ?? new Date();
  const firstMonday = addDays(startOfWeek(now), -7 * (weeks - 1));

  const out: ConsistencyGrid["weeks"] = [];
  let max = 0;

  for (let w = 0; w < weeks; w++) {
    const weekStart = addDays(firstMonday, w * 7);
    const days = Array.from({ length: 7 }, (_, d) => {
      const date = addDays(weekStart, d);
      const next = addDays(date, 1);
      const dayRuns = activities.filter((a) => a.startDate >= date && a.startDate < next);
      const km = round(dayRuns.reduce((acc, a) => acc + a.distance / 1000, 0), 1);
      if (km > max) max = km;
      return { date, km, sessions: dayRuns.length };
    });

    out.push({
      weekStart,
      label: weekStart.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
      days,
      km: round(days.reduce((a, d) => a + d.km, 0), 1),
    });
  }

  let best = 0;
  let run = 0;
  let current = 0;
  for (const [i, w] of out.entries()) {
    if (w.km > 0) {
      run += 1;
      best = Math.max(best, run);
      // La semaine en cours (dernière) compte dans la série courante.
      if (i === out.length - 1 || out.slice(i + 1).every((x) => x.km > 0)) current = run;
    } else {
      run = 0;
      if (i === out.length - 1) current = 0;
    }
  }

  const active = out.filter((w) => w.km > 0).length;

  return {
    weeks: out,
    max,
    currentStreak: current,
    bestStreak: best,
    activeRate: Math.round((active / weeks) * 100),
  };
}

// ---------------------------------------------------------------- Records

export type RecordTimelinePoint = {
  date: Date;
  label: string;
  distance: string;
  seconds: number;
  improvementSeconds: number;
};

/**
 * Chronologie des records : chaque fois qu'une barre est passée.
 * On ne garde que les améliorations réelles, distance par distance.
 */
export function recordTimeline(
  efforts: Array<{ name: string; distance: number; movingTime: number; startDate: Date }>,
  opts: { minMeters?: number } = {}
): RecordTimelinePoint[] {
  const minMeters = opts.minMeters ?? 1000;
  const best = new Map<string, number>();
  const out: RecordTimelinePoint[] = [];

  const sorted = [...efforts]
    .filter((e) => e.distance >= minMeters && e.movingTime > 0)
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  for (const e of sorted) {
    const key = e.name;
    const prev = best.get(key);
    if (prev === undefined || e.movingTime < prev) {
      if (prev !== undefined) {
        out.push({
          date: e.startDate,
          label: e.startDate.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" }),
          distance: key,
          seconds: e.movingTime,
          improvementSeconds: Math.round(prev - e.movingTime),
        });
      }
      best.set(key, e.movingTime);
    }
  }

  return out.reverse();
}
