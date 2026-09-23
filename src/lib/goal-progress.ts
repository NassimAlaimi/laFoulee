/**
 * Objectifs du quotidien — progression du volume, de la série et de la fréquence.
 *
 * Contrairement aux courses, un objectif du quotidien se mesure à un chiffre
 * simple (« 200 km ce mois », « 30 jours d'affilée », « 4 sorties/semaine »).
 * Ces fonctions calculent la progression en cours, en heure locale.
 *
 * Fonctions pures, testées dans tests/goal-progress.test.ts.
 */

import { addDays, round, startOfWeek } from "./stats";

export type GoalKind = "race" | "volume" | "streak" | "frequency";

export type GoalProgress = {
  /** 0..100, plafonné à 100. */
  percent: number;
  current: number;
  target: number;
  /** Unité d'affichage : km, jours ou sorties/sem. */
  unit: string;
  /** Phrase courte : « 128 km ce mois ». */
  label: string;
  done: boolean;
};

/** Série de jours consécutifs avec au moins une sortie, terminée aujourd'hui ou hier. */
export function currentDailyStreak(dates: Date[], now = new Date()): number {
  const keys = new Set(
    dates.map((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime())
  );
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // La série peut être en cours aujourd'hui, ou hier si on n'a pas encore couru.
  const cursor = new Date(today);
  if (!keys.has(cursor.getTime())) cursor.setDate(cursor.getDate() - 1);
  if (!keys.has(cursor.getTime())) return 0;

  let n = 0;
  while (keys.has(cursor.getTime())) {
    n += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
}

export function goalProgress(opts: {
  kind: GoalKind;
  targetValue: number | null;
  now: Date;
  runs: Array<{ startDate: Date; distance: number }>;
}): GoalProgress | null {
  const target = opts.targetValue;
  if (target == null || target <= 0) return null;
  const { kind, now, runs } = opts;

  const make = (current: number, unit: string, label: string): GoalProgress => ({
    percent: Math.min(100, Math.round((current / target) * 100)),
    current: round(current, 1),
    target,
    unit,
    label,
    done: current >= target,
  });

  if (kind === "volume") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const km =
      runs
        .filter((r) => r.startDate >= start && r.startDate < now)
        .reduce((a, r) => a + r.distance, 0) / 1000;
    return make(km, "km", `${round(km, 1).toLocaleString("fr-FR")} km ce mois`);
  }

  if (kind === "streak") {
    const days = currentDailyStreak(runs.map((r) => r.startDate), now);
    return make(days, "jours", `${days} jour${days > 1 ? "s" : ""} d'affilée`);
  }

  if (kind === "frequency") {
    const monday = startOfWeek(now);
    const sessions = runs.filter((r) => r.startDate >= monday && r.startDate < addDays(monday, 7)).length;
    return make(sessions, "sorties/sem", `${sessions} sortie${sessions > 1 ? "s" : ""} cette semaine`);
  }

  return null;
}
