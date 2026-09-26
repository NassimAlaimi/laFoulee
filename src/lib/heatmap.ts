/**
 * Carte de chaleur annuelle, façon « contribution ».
 *
 * Un champ de tuiles semaines × jours pour l'année : chaque carré est un jour,
 * coloré par le volume couru. Les trous (coupures, blessures, vacances)
 * sautent aux yeux bien mieux que sur une courbe. Semaines du lundi au
 * dimanche, en heure locale.
 *
 * Fonctions pures, testées dans tests/heatmap.test.ts.
 */

import type { ConsistencyGrid } from "./analysis";
import { addDays, round, startOfWeek } from "./stats";

export type HeatmapRun = {
  startDate: Date;
  /** Distance en mètres. */
  distance: number;
};

/**
 * Grille complète d'une année civile. La première et la dernière colonne
 * peuvent déborder sur l'année voisine pour rester des semaines entières
 * (comme le fait le graphe « contributions » de référence).
 */
export function yearHeatmap(runs: HeatmapRun[], year: number, locale = "fr-FR"): ConsistencyGrid {
  const firstMonday = startOfWeek(new Date(year, 0, 1));
  const lastMonday = startOfWeek(new Date(year, 11, 31));

  const weeks: ConsistencyGrid["weeks"] = [];
  let max = 0;

  for (let monday = firstMonday; monday <= lastMonday; monday = addDays(monday, 7)) {
    const days = Array.from({ length: 7 }, (_, d) => {
      const date = addDays(monday, d);
      const next = addDays(date, 1);
      const dayRuns = runs.filter((r) => r.startDate >= date && r.startDate < next);
      const km = round(dayRuns.reduce((a, r) => a + r.distance / 1000, 0), 1);
      if (km > max) max = km;
      return { date, km, sessions: dayRuns.length };
    });

    weeks.push({
      weekStart: monday,
      label: monday.toLocaleDateString(locale, { day: "2-digit", month: "short" }),
      days,
      km: round(days.reduce((a, d) => a + d.km, 0), 1),
    });
  }

  // Séries de semaines actives — mêmes conventions que consistencyGrid.
  let best = 0;
  let run = 0;
  let current = 0;
  for (const [i, w] of weeks.entries()) {
    if (w.km > 0) {
      run += 1;
      best = Math.max(best, run);
      if (i === weeks.length - 1 || weeks.slice(i + 1).every((x) => x.km > 0)) current = run;
    } else {
      run = 0;
      if (i === weeks.length - 1) current = 0;
    }
  }
  const active = weeks.filter((w) => w.km > 0).length;

  return {
    weeks,
    max,
    currentStreak: current,
    bestStreak: best,
    activeRate: weeks.length ? active / weeks.length : 0,
  };
}
