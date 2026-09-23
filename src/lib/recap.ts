/**
 * Rétrospective d'une période (année ou mois) : les chiffres qui racontent
 * une saison plutôt que ceux qui pilotent l'entraînement.
 * Fonctions pures, testées dans tests/recap.test.ts.
 */

export type RecapRun = {
  id: string;
  name: string;
  startDate: Date;
  distance: number; // m
  movingTime: number; // s
  totalElevation: number; // m
  polyline?: string | null;
};

/**
 * Comparaisons parlantes : [valeur, « l'équivalent … », « N fois … »].
 * Deux tournures car le français n'accorde pas pareil les deux phrases.
 */
const DISTANCE_REFS: Array<[number, string, string]> = [
  [35, "du tour du périphérique parisien", "le tour du périphérique parisien"],
  [42.195, "d'un marathon", "un marathon"],
  [96, "de Paris → Chartres", "Paris → Chartres"],
  [134, "de Paris → Rouen", "Paris → Rouen"],
  [237, "de Paris → Tours", "Paris → Tours"],
  [392, "de Paris → Lyon", "Paris → Lyon"],
  [660, "de Paris → Marseille", "Paris → Marseille"],
  [1000, "de Brest → Strasbourg", "Brest → Strasbourg"],
  [1500, "de Paris → Rome", "Paris → Rome"],
  [3000, "de Lisbonne → Varsovie", "Lisbonne → Varsovie"],
];

const ELEVATION_REFS: Array<[number, string, string]> = [
  [330, "de la tour Eiffel", "la tour Eiffel"],
  [1465, "du puy de Sancy", "le puy de Sancy"],
  [4808, "du mont Blanc", "le mont Blanc"],
  [8849, "de l'Everest", "l'Everest"],
];

const fr1 = (n: number) => n.toFixed(1).replace(".", ",");

/** « l'équivalent de Paris → Tours » ou « 1,6 fois un marathon ». */
export function distanceComparison(km: number): string | null {
  if (km < 10) return null;
  const fit = [...DISTANCE_REFS].reverse().find(([d]) => km >= d * 0.9);
  if (!fit) return null;
  const ratio = km / fit[0];
  return ratio < 1.15 ? `l'équivalent ${fit[1]}` : `${fr1(ratio)} fois ${fit[2]}`;
}

/** « la hauteur du mont Blanc » ou « 3,0 fois la tour Eiffel ». */
export function elevationComparison(m: number): string | null {
  if (m < 100) return null;
  const fit = [...ELEVATION_REFS].reverse().find(([h]) => m >= h * 0.9) ?? ELEVATION_REFS[0];
  const ratio = m / fit[0];
  return ratio < 1.15 && ratio >= 0.9 ? `la hauteur ${fit[1]}` : `${fr1(ratio)} fois ${fit[2]}`;
}

/** Grille jour de la semaine (lundi = 0) × tranche horaire. */
export function whenYouRun(runs: RecapRun[]): {
  grid: number[][]; // [jour][tranche]
  slots: string[];
  favoriteDay: number | null;
  favoriteSlot: number | null;
  share: number; // part de la tranche favorite
} {
  const slots = ["5–8 h", "8–11 h", "11–14 h", "14–17 h", "17–20 h", "20–23 h"];
  const slotOf = (h: number) => (h < 8 ? 0 : h < 11 ? 1 : h < 14 ? 2 : h < 17 ? 3 : h < 20 ? 4 : 5);
  const grid = Array.from({ length: 7 }, () => Array(6).fill(0));
  for (const r of runs) {
    const d = (r.startDate.getDay() + 6) % 7;
    grid[d][slotOf(r.startDate.getHours())]++;
  }
  const byDay = grid.map((row) => row.reduce((a, b) => a + b, 0));
  const bySlot = slots.map((_, s) => grid.reduce((a, row) => a + row[s], 0));
  const total = runs.length || 1;
  const favoriteDay = runs.length ? byDay.indexOf(Math.max(...byDay)) : null;
  const favoriteSlot = runs.length ? bySlot.indexOf(Math.max(...bySlot)) : null;
  return {
    grid,
    slots,
    favoriteDay,
    favoriteSlot,
    share: favoriteSlot != null ? bySlot[favoriteSlot] / total : 0,
  };
}

/** Plus longue série de jours consécutifs avec au moins une sortie. */
export function longestDayStreak(dates: Date[]): { days: number; end: Date | null } {
  const keys = [...new Set(dates.map((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()))].sort(
    (a, b) => a - b
  );
  let best = 0;
  let bestEnd: number | null = null;
  let cur = 0;
  for (let i = 0; i < keys.length; i++) {
    // Tolérance d'une heure : passage à l'heure d'été / d'hiver
    cur = i > 0 && Math.abs(keys[i] - keys[i - 1] - 86_400_000) <= 3_600_000 ? cur + 1 : 1;
    if (cur > best) {
      best = cur;
      bestEnd = keys[i];
    }
  }
  return { days: best, end: bestEnd != null ? new Date(bestEnd) : null };
}

/** Meilleure semaine (lundi → dimanche) en distance. */
export function bestWeek(runs: RecapRun[]): { start: Date; km: number } | null {
  const map = new Map<number, number>();
  for (const r of runs) {
    const d = new Date(r.startDate);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    map.set(d.getTime(), (map.get(d.getTime()) ?? 0) + r.distance / 1000);
  }
  let best: { start: Date; km: number } | null = null;
  for (const [t, km] of map) if (!best || km > best.km) best = { start: new Date(t), km };
  return best;
}

/** Kilomètres par mois (12 cases pour une année). */
export function monthlyKm(runs: RecapRun[], year: number): number[] {
  const out = Array(12).fill(0);
  for (const r of runs) if (r.startDate.getFullYear() === year) out[r.startDate.getMonth()] += r.distance / 1000;
  return out.map((v) => Math.round(v * 10) / 10);
}

export const DAY_NAMES = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
