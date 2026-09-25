/**
 * « Allure à FC fixe » — la forme aérobie mesurée à chaque sortie, sans course.
 *
 * Le nuage allure × FC était juste mais illisible. On en tire une seule
 * phrase : « à 145 bpm, tu cours aujourd'hui à 5:22/km, contre 5:41 il y a
 * trois mois ». Méthode :
 *
 * 1. On garde les km-splits **comparables** : sorties d'endurance (ni course,
 *    ni trail), kilomètre quasi plat (|dénivelé| ≤ 15 m), FC et allure
 *    plausibles, hors premier kilomètre (FC pas encore stabilisée).
 * 2. Sur une fenêtre glissante de 6 semaines, régression linéaire
 *    vitesse ~ FC, lue à une FC de référence fixe (≈ seuil aérobie, arrondie
 *    à 5 bpm). Intervalle de confiance à 95 % sur la moyenne prédite.
 * 3. On refuse de conclure sous 30 splits / 4 sorties, ou si le lien
 *    FC-vitesse est trop faible (r² < 0,15) : pas de chiffre inventé.
 *
 * Fonctions pures, testées dans tests/aerobic-pace.test.ts.
 */

import { linearFit } from "./prediction";

export type AerobicSplit = {
  activityId: string;
  date: Date;
  /** numéro du split dans la sortie (Strava commence à 1) */
  index: number;
  distance: number; // m
  movingTime: number; // s
  averageHr: number | null;
  elevationDiff: number; // m
  /** type d'activité (Run, TrailRun…) et drapeau course */
  type: string;
  isRace: boolean;
};

export const WINDOW_DAYS = 42;
export const MIN_SPLITS = 30;
export const MIN_ACTIVITIES = 4;
export const MIN_R2 = 0.15;
/** Marge d'erreur maximale (s/km) pour qu'un point soit publié. */
export const MAX_BAND = 45;

type Clean = { activityId: string; t: number; hr: number; speed: number };

export function comparableSplits(splits: AerobicSplit[]): Clean[] {
  const out: Clean[] = [];
  for (const s of splits) {
    if (s.isRace || s.type !== "Run") continue;
    if (s.index <= 1) continue; // premier km : FC pas encore stabilisée
    if (!s.averageHr || s.averageHr < 100 || s.averageHr > 200) continue;
    if (s.distance < 900 || s.movingTime <= 0) continue;
    if (Math.abs(s.elevationDiff) > 15) continue;
    const speed = s.distance / s.movingTime;
    if (speed < 1.8 || speed > 6.5) continue; // 9:15/km … 2:34/km
    out.push({ activityId: s.activityId, t: s.date.getTime(), hr: s.averageHr, speed });
  }
  return out;
}

/**
 * FC de référence : l'allure **facile réelle** de l'athlète, mesurée au
 * quartile bas de ses FC de course — pas une valeur théorique sous sa plage.
 * L'idée du « pace à FC fixe » est de lire l'allure *à l'intérieur* des
 * données, jamais d'extrapoler (une extrapolation vers 155 bpm chez un
 * coureur qui tourne à 172 bpm sort un 7'28"/km sans aucun sens).
 */
export function referenceHr(clean: Clean[], lthr: number | null): number | null {
  if (clean.length < 20) return null;
  const hrs = clean.map((c) => c.hr).sort((a, b) => a - b);
  const q = (p: number) => hrs[Math.min(hrs.length - 1, Math.floor(p * hrs.length))];
  // Seuil aérobie théorique, s'il tombe dans le quart « facile » réel.
  const theoretical = lthr ? 0.85 * lthr : null;
  if (theoretical !== null && theoretical >= q(0.2) && theoretical <= q(0.6)) {
    return Math.round(theoretical / 5) * 5;
  }
  // Sinon : le quartile bas de ses propres FC (sa zone facile observée).
  return Math.round(q(0.25) / 5) * 5;
}

export type AerobicPoint = {
  date: Date;
  /** s/km à la FC de référence */
  pace: number;
  /** bornes de l'intervalle à 95 % (s/km) */
  paceFast: number;
  paceSlow: number;
  splits: number;
  activities: number;
};

/** Estimation sur un lot de splits, ou null si non concluant. */
export function paceAtHr(clean: Clean[], hr: number): Omit<AerobicPoint, "date"> | null {
  const acts = new Set(clean.map((c) => c.activityId)).size;
  if (clean.length < MIN_SPLITS || acts < MIN_ACTIVITIES) return null;
  const xs = clean.map((c) => c.hr);
  const ys = clean.map((c) => c.speed);
  // Garde d'extrapolation : la FC de référence doit être au cœur des données
  // de la fenêtre (assez de points proches), pas à l'extrémité.
  const near = clean.filter((c) => Math.abs(c.hr - hr) <= 6).length;
  const hrs = xs.slice().sort((a, b) => a - b);
  const lo = hrs[0];
  const hi = hrs[hrs.length - 1];
  if (hr < lo + 2 || hr > hi - 2 || near < Math.max(8, clean.length * 0.12)) return null;
  const fit = linearFit(xs, ys);
  if (!Number.isFinite(fit.slope) || fit.slope <= 0 || fit.r2 < MIN_R2) return null;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const sse = xs.reduce((a, x, i) => a + (ys[i] - (fit.intercept + fit.slope * x)) ** 2, 0);
  const s = Math.sqrt(sse / Math.max(1, n - 2));
  const se = s * Math.sqrt(1 / n + (hr - mx) ** 2 / sxx);
  const v = fit.intercept + fit.slope * hr;
  if (v <= 0.5) return null;
  const vHi = v + 1.96 * se;
  const vLo = Math.max(0.5, v - 1.96 * se);
  if (1000 / vLo - 1000 / vHi > MAX_BAND) return null;
  return {
    pace: Math.round(1000 / v),
    paceFast: Math.round(1000 / vHi),
    paceSlow: Math.round(1000 / vLo),
    splits: n,
    activities: acts,
  };
}

/**
 * Série hebdomadaire (un point par dimanche) sur `weeks` semaines, chaque
 * point estimé sur les 6 semaines qui précèdent.
 */
export function aerobicPaceSeries(
  splits: AerobicSplit[],
  opts: { lthr: number | null; weeks?: number; now: Date }
): { refHr: number | null; points: AerobicPoint[] } {
  const clean = comparableSplits(splits);
  const refHr = referenceHr(clean, opts.lthr);
  if (!refHr) return { refHr: null, points: [] };
  const weeks = opts.weeks ?? 52;
  const points: AerobicPoint[] = [];
  const end = new Date(opts.now.getFullYear(), opts.now.getMonth(), opts.now.getDate(), 23, 59, 59);
  for (let w = weeks - 1; w >= 0; w--) {
    const at = new Date(end);
    at.setDate(at.getDate() - 7 * w);
    const from = at.getTime() - WINDOW_DAYS * 86400000;
    const slice = clean.filter((c) => c.t > from && c.t <= at.getTime());
    const est = paceAtHr(slice, refHr);
    if (est) points.push({ date: at, ...est });
  }
  return { refHr, points };
}

export type AerobicSummary = {
  refHr: number;
  now: AerobicPoint;
  /** point d'il y a ~3 mois (ou le plus ancien disponible au-delà de 8 semaines) */
  then: AerobicPoint | null;
  /** s/km, négatif = plus rapide aujourd'hui */
  delta: number | null;
  /** l'écart dépasse-t-il le bruit (intervalles disjoints) */
  significant: boolean;
};

export function aerobicSummary(series: { refHr: number | null; points: AerobicPoint[] }, now: Date): AerobicSummary | null {
  const { refHr, points } = series;
  if (!refHr || points.length === 0) return null;
  const last = points[points.length - 1];
  // Le dernier point doit être récent (≤ 14 jours), sinon la forme a pu changer.
  if (now.getTime() - last.date.getTime() > 14 * 86400000) return null;
  const target = now.getTime() - 91 * 86400000;
  const older = points.filter((p) => p.date.getTime() <= now.getTime() - 56 * 86400000);
  const then = older.length
    ? older.reduce((best, p) => (Math.abs(p.date.getTime() - target) < Math.abs(best.date.getTime() - target) ? p : best))
    : null;
  const delta = then ? last.pace - then.pace : null;
  const significant = Boolean(then && (last.paceSlow < then.paceFast || last.paceFast > then.paceSlow));
  return { refHr, now: last, then, delta, significant };
}
