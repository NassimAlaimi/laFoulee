/**
 * Backyard ultra — le format : une boucle de 6,706 km toutes les heures,
 * départ à l'heure pile, dernier debout gagne. 24 boucles = 160,9 km.
 *
 * La difficulté n'est pas la vitesse mais la **répétabilité** : rester sous
 * l'heure boucle après boucle, dormir peu, digérer en marchant. Ce module
 * calcule le tableau boucle par boucle (allure mixte course/marche, temps de
 * repos, distance cumulée) et le volume d'entraînement en **heures**.
 *
 * Fonctions pures, testées dans tests/backyard.test.ts.
 */

export const BACKYARD_LOOP_KM = 6.706;

export type BackyardInput = {
  /** allure de course en s/km */
  runPace: number;
  /** allure de marche en s/km */
  walkPace: number;
  /** part de course dans la boucle, 0..1 (le reste en marche) */
  runRatio: number;
  loops: number;
};

export type BackyardLoop = {
  loop: number;
  /** secondes pour boucler */
  loopSeconds: number;
  /** secondes de repos avant la boucle suivante */
  restSeconds: number;
  km: number;
  /** heures cumulées depuis le départ */
  hours: number;
  /** temps de boucle formaté en minutes:secondes */
  tooSlow: boolean;
};

export type BackyardTable = {
  rows: BackyardLoop[];
  totalKm: number;
  totalHours: number;
  /** heures de sommeil « empruntées » au-delà de 24 h */
  sleepBorrowed: number;
};

export function backyardTable(input: BackyardInput): BackyardTable {
  const mixPace = input.runPace * input.runRatio + input.walkPace * (1 - input.runRatio);
  const loopSeconds = BACKYARD_LOOP_KM * mixPace;
  const restSeconds = 3600 - loopSeconds;
  const rows: BackyardLoop[] = [];
  for (let i = 1; i <= input.loops; i++) {
    rows.push({
      loop: i,
      loopSeconds: Math.round(loopSeconds),
      restSeconds: Math.round(restSeconds),
      km: Math.round(BACKYARD_LOOP_KM * i * 10) / 10,
      hours: Math.round((i * 3600) / 360) / 10,
      tooSlow: loopSeconds >= 3540,
    });
  }
  const totalHours = input.loops;
  return {
    rows,
    totalKm: Math.round(BACKYARD_LOOP_KM * input.loops * 10) / 10,
    totalHours,
    sleepBorrowed: Math.max(0, totalHours - 24),
  };
}

/** Cible d'entraînement hebdo en heures, pour un objectif de N boucles. */
export function backyardWeeklyHours(targetLoops: number): { peak: number; base: number; longRun: number } {
  // Pic ≈ 1 h de temps sur pieds par boucle visée, réparti sur la semaine.
  const peak = Math.round(targetLoops * 0.9);
  return { peak, base: Math.round(peak * 0.6), longRun: Math.round(peak * 0.4) };
}
