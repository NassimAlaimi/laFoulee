/**
 * Saison multi-objectifs — périodiser l'année autour de 3-4 courses.
 *
 * Les courses sont notées A / B / C (priorité `RaceGoal.priority` existe
 * déjà) :
 * - **A** : bloc complet base → développement → spécifique → affûtage, puis
 *   récupération. Affûtage proportionnel à la distance.
 * - **B** : mini-affûtage de 4 jours, sans interrompre le bloc en cours.
 * - **C** : course d'entraînement, aucun affûtage.
 *
 * Entre deux A trop proches (le prochain bloc commencerait pendant la
 * récupération de la précédente), on marque la semaine « maintien » et on
 * signale le conflit — plutôt que de promettre un bloc impossible.
 *
 * Sorties : un calendrier semaine par semaine (phase, objectif, km indicatif,
 * courses de la semaine) et les blocs de chaque course A. Le volume n'est
 * qu'indicatif : la création du plan réel passe par `lib/training` (volumes
 * exacts, faisabilité, réadaptation).
 *
 * Fonctions pures, testées dans tests/season.test.ts.
 */

import { startOfWeek } from "./stats";

export type SeasonRace = { id: string; name: string; date: Date; distanceKm: number; priority: "A" | "B" | "C" };

export type SeasonPhase = "base" | "build" | "peak" | "taper" | "race" | "recovery" | "maintain";

export type SeasonWeek = {
  weekStart: Date;
  phase: SeasonPhase;
  /** courses de la semaine (id) */
  raceIds: string[];
  /** km indicatif */
  targetKm: number;
  note: string | null;
};

export type SeasonBlock = { raceId: string; from: Date; to: Date; weeks: number };

export type Season = {
  weeks: SeasonWeek[];
  blocks: SeasonBlock[];
  /** id des courses A trop proches pour un bloc complet */
  conflicts: string[];
};

const DAY = 86400000;
const WEEK = 7 * DAY;

/** Semaines d'affûtage selon la distance. */
export function taperWeeks(distanceKm: number): number {
  // Au moins 2 semaines : la dernière est la semaine de course, l'avant-
  // dernière porte le « taper » visible.
  if (distanceKm >= 42) return 3;
  return 2;
}
/** Semaines de récupération post-course selon la distance. */
export function recoveryWeeks(distanceKm: number): number {
  if (distanceKm >= 42) return 3;
  if (distanceKm >= 20) return 2;
  return 1;
}
/** Semaines du bloc « développement + spécifique » selon la distance. */
export function buildWeeks(distanceKm: number): number {
  if (distanceKm >= 42) return 12;
  if (distanceKm >= 20) return 10;
  return 8;
}

const PHASE_WEIGHT: Record<SeasonPhase, number> = {
  base: 0.72,
  build: 0.88,
  peak: 1,
  taper: 0.55,
  race: 0.6,
  recovery: 0.45,
  maintain: 0.65,
};

const PHASE_PRECEDENCE: SeasonPhase[] = ["recovery", "taper", "peak", "build", "base", "maintain"];

export function seasonPlan(opts: {
  races: SeasonRace[];
  startWeeklyKm: number;
  now?: Date;
}): Season {
  const now = opts.now ?? new Date();
  const races = [...opts.races].sort((a, b) => a.date.getTime() - b.date.getTime());
  const aRaces = races.filter((r) => r.priority === "A");
  if (aRaces.length === 0) return { weeks: [], blocks: [], conflicts: [] };

  const first = aRaces[0];
  const seasonStart = new Date(first.date.getTime() - (buildWeeks(first.distanceKm) + taperWeeks(first.distanceKm) + 8) * WEEK);
  const last = aRaces[aRaces.length - 1];
  const lastRace = races[races.length - 1];
  const seasonEnd = new Date(Math.max(last.date.getTime() + recoveryWeeks(last.distanceKm) * WEEK, lastRace.date.getTime()) + WEEK);

  // Fenêtres de chaque course A.
  type Window = { race: SeasonRace; taperStart: Date; peakStart: Date; buildStart: Date; baseStart: Date; recoveryEnd: Date; conflict: boolean };
  const windows: Window[] = [];
  for (const r of aRaces) {
    const taper = taperWeeks(r.distanceKm);
    const build = buildWeeks(r.distanceKm);
    const taperStart = new Date(r.date.getTime() - taper * WEEK);
    const peakStart = new Date(taperStart.getTime() - 3 * WEEK);
    const buildStart = new Date(peakStart.getTime() - (build - 3) * WEEK);
    const recoveryEnd = new Date(r.date.getTime() + recoveryWeeks(r.distanceKm) * WEEK);
    const prev = windows[windows.length - 1];
    const baseStart = prev ? new Date(Math.max(prev.recoveryEnd.getTime(), buildStart.getTime() - 8 * WEEK)) : new Date(seasonStart);
    const conflict = prev ? buildStart.getTime() < prev.recoveryEnd.getTime() : false;
    windows.push({ race: r, taperStart, peakStart, buildStart, baseStart, recoveryEnd, conflict });
  }

  const peakKm = Math.max(20, Math.round((opts.startWeeklyKm + (opts.startWeeklyKm * (buildWeeks(first.distanceKm) + 6)) * 0.05) / 2) * 2);

  const weeks: SeasonWeek[] = [];
  const blocks: SeasonBlock[] = [];
  for (let monday = startOfWeek(seasonStart).getTime(); monday <= seasonEnd.getTime(); monday += WEEK) {
    const ws = new Date(monday);
    const weekEnd = monday + WEEK;
    const raceIds = races.filter((r) => r.date.getTime() >= monday && r.date.getTime() < weekEnd).map((r) => r.id);
    let phase: SeasonPhase = "maintain";
    let conflict = false;
    for (const w of windows) {
      const inWindow = monday >= w.baseStart.getTime() && monday < w.recoveryEnd.getTime();
      if (!inWindow) continue;
      if (w.conflict && monday >= w.buildStart.getTime() && monday < w.race.date.getTime()) conflict = true;
      let p: SeasonPhase;
      if (monday >= w.race.date.getTime() && monday < w.recoveryEnd.getTime()) p = "recovery";
      else if (monday >= w.taperStart.getTime()) p = "taper";
      else if (monday >= w.peakStart.getTime()) p = "peak";
      else if (monday >= w.buildStart.getTime()) p = "build";
      else p = "base";
      if (PHASE_PRECEDENCE.indexOf(p) < PHASE_PRECEDENCE.indexOf(phase)) phase = p;
    }
    if (raceIds.some((id) => races.find((r) => r.id === id)?.priority === "A")) phase = "race";
    let note: string | null = null;
    const inRace = races.filter((r) => r.date.getTime() >= monday && r.date.getTime() < weekEnd);
    if (inRace.length) note = inRace.map((r) => `${r.priority === "A" ? "A" : r.priority === "B" ? "B" : "C"} · ${r.name}`).join(" ; ");
    else if (conflict) note = "courses trop proches : maintien, pas de nouveau bloc";
    weeks.push({
      weekStart: ws,
      phase,
      raceIds,
      targetKm: Math.round(peakKm * PHASE_WEIGHT[phase]),
      note,
    });
  }

  for (const w of windows) {
    if (w.conflict) continue;
    blocks.push({
      raceId: w.race.id,
      from: new Date(w.buildStart),
      to: w.race.date,
      weeks: Math.round((w.race.date.getTime() - w.buildStart.getTime()) / WEEK),
    });
  }
  return { weeks, blocks, conflicts: windows.filter((w) => w.conflict).map((w) => w.race.id) };
}
