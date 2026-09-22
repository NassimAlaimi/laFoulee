/**
 * Lecture d'un objectif de course — source unique.
 *
 * Avant, chaque page recalculait « où j'en suis » à sa façon : moyenne 4
 * semaines ici, moyenne 8 semaines là, médiane ailleurs, avec trois seuils de
 * volume différents. Résultat : trois chiffres contradictoires pour la même
 * course. Tout est désormais dérivé de `currentFitness()` et de la table de
 * volumes de `training.ts`.
 */

import { pacePerKm } from "./format";
import type { EnduranceIndex, RacePrediction } from "./prediction";
import { goalGap, racePrediction, type GoalGap } from "./prediction";
import type { FitnessProfile, PersonalRecord } from "./records";
import { daysBetween, round } from "./stats";
import { volumeTargetFor, type CurrentFitness } from "./training";

export type GoalLike = {
  id?: string;
  name?: string;
  raceDate: Date;
  distance: number;
  targetTime: number | null;
};

export type ReadinessFactor = {
  label: string;
  /** Valeur actuelle */
  value: number;
  /** Valeur attendue pour cette distance */
  target: number;
  unit: string;
  /** Contribution au score */
  score: number;
  max: number;
  ok: boolean;
};

export type RaceReadiness = {
  daysRemaining: number;
  weeksRemaining: number;
  phase: "Préparation" | "Spécifique" | "Affûtage" | "Jour J" | "Passée";
  /** Score /100, décomposé et explicable */
  readiness: number;
  factors: ReadinessFactor[];
  /** Chrono visé, s'il existe */
  targetSeconds: number | null;
  targetPace: number | null;
  /** Prédiction unifiée pour la distance de la course */
  prediction: RacePrediction | null;
  /** Écart entre le chrono visé et le niveau actuel */
  gap: GoalGap | null;
  /** Volume et sortie longue attendus pour la distance */
  needs: { weeklyKm: number; idealWeeklyKm: number; longRunKm: number };
  raceKm: number;
};

export function raceReadiness(input: {
  goal: GoalLike;
  fitness: CurrentFitness;
  records: PersonalRecord[];
  profile: FitnessProfile;
  endurance?: EnduranceIndex;
  now?: Date;
}): RaceReadiness {
  const { goal, fitness, records, profile } = input;
  const now = input.now ?? new Date();

  const raceKm = goal.distance / 1000;
  const daysRemaining = Math.max(0, daysBetween(now, goal.raceDate));
  const weeksRemaining = Math.ceil(daysRemaining / 7);
  const needs = volumeTargetFor(raceKm);

  const prediction = racePrediction(goal.distance, {
    records,
    profile,
    weeklyKm: fitness.weeklyKm,
    longestRunKm: fitness.longestRunKm,
    endurance: input.endurance,
  });

  const targetSeconds = goal.targetTime;
  const targetPace = targetSeconds ? pacePerKm(goal.distance, targetSeconds) : null;

  // --- Facteurs, tous exprimés en « actuel vs attendu »
  const longRunScore = Math.min(1, fitness.longestRunKm / needs.longRun) * 40;
  const volumeScore = Math.min(1, fitness.weeklyKm / needs.min) * 30;

  // Niveau : par rapport au chrono visé s'il existe, sinon par rapport à la
  // capacité à tenir la distance (prédiction disponible ou non).
  const paceRatio =
    targetPace && prediction ? Math.min(1, targetPace / prediction.pace) : null;
  const paceScore = paceRatio !== null ? paceRatio * 30 : prediction ? 21 : 15;

  const factors: ReadinessFactor[] = [
    {
      label: "Sortie longue",
      value: fitness.longestRunKm,
      target: needs.longRun,
      unit: "km",
      score: round(longRunScore, 0),
      max: 40,
      ok: fitness.longestRunKm >= needs.longRun,
    },
    {
      label: "Volume hebdo",
      value: fitness.weeklyKm,
      target: needs.min,
      unit: "km/sem",
      score: round(volumeScore, 0),
      max: 30,
      ok: fitness.weeklyKm >= needs.min,
    },
    {
      label: "Niveau d'allure",
      value: prediction ? round(prediction.pace, 0) : 0,
      target: targetPace ? round(targetPace, 0) : 0,
      unit: "s/km",
      score: round(paceScore, 0),
      max: 30,
      ok: paceRatio !== null ? paceRatio >= 0.995 : false,
    },
  ];

  const gap =
    targetSeconds && prediction
      ? goalGap(
          targetSeconds,
          goal.distance,
          profile.vdot,
          prediction.realistic,
          weeksRemaining
        )
      : null;

  return {
    daysRemaining,
    weeksRemaining,
    phase: racePhase(daysRemaining),
    readiness: Math.round(longRunScore + volumeScore + paceScore),
    factors,
    targetSeconds,
    targetPace,
    prediction,
    gap,
    needs: { weeklyKm: needs.min, idealWeeklyKm: needs.ideal, longRunKm: needs.longRun },
    raceKm,
  };
}

function racePhase(daysRemaining: number): RaceReadiness["phase"] {
  if (daysRemaining <= 0) return "Jour J";
  if (daysRemaining <= 14) return "Affûtage";
  if (daysRemaining <= 56) return "Spécifique";
  return "Préparation";
}

/**
 * Verdict court et chiffré : ce qui manque, en nombres, sans commentaire sur
 * la volonté ou le sérieux de l'athlète.
 */
export function readinessFacts(r: RaceReadiness): string[] {
  const out: string[] = [];
  const f = (n: number) => Math.round(n);

  for (const factor of r.factors) {
    if (factor.ok || factor.target === 0) continue;
    if (factor.label === "Sortie longue") {
      out.push(`Sortie longue ${f(factor.value)} km → ${f(factor.target)} km attendus`);
    } else if (factor.label === "Volume hebdo") {
      out.push(`Volume ${f(factor.value)} km/sem → ${f(factor.target)} km/sem attendus`);
    }
  }

  if (r.gap && r.gap.secondsToFind > 0) {
    const min = Math.floor(r.gap.secondsToFind / 60);
    const sec = r.gap.secondsToFind % 60;
    out.push(
      `${min > 0 ? `${min} min ` : ""}${sec > 0 ? `${sec} s` : ""} à trouver · ${r.gap.weeksNeeded} semaines nécessaires, ${r.weeksRemaining} disponibles`.trim()
    );
  }

  if (out.length === 0) {
    out.push(`Tous les prérequis de la distance sont couverts`);
  }
  return out;
}
