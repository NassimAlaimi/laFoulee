/**
 * Apprentissage simple et interprétable, sans dépendance — TS pur.
 *
 * Avec les données d'un seul coureur, pas de réseau de neurones : des
 * régressions robustes qui **refusent de conclure** sous un seuil (comme
 * `lib/thresholds`). Deux briques utiles :
 *
 * - **facteur de pente personnel** : sur tes propres splits, mesurer combien
 *   une montée te coûte (par % de pente) — plus juste que la courbe
 *   générique de `race-plan.gapFactor` ;
 * - **régression des moindres carrés robuste** (deux passages, comme les
 *   seuils) et coefficient de corrélation de Pearson avec significativité.
 *
 * Testé dans tests/ml.test.ts.
 */

import { linearFit } from "./prediction";
import { round } from "./stats";

export type GradeSample = { grade: number; factor: number };

/** Facteur d'allure (= 1 sur le plat) d'un split selon sa pente. */
export function gradeSamples(splits: Array<{ distance: number; movingTime: number; elevationDiff: number; averageSpeed: number | null }>): GradeSample[] {
  const flats = splits
    .filter((s) => s.distance >= 900 && s.movingTime > 0 && Math.abs(s.elevationDiff) <= 5 && s.averageSpeed && s.averageSpeed > 1)
    .map((s) => 1000 / s.averageSpeed!);
  if (flats.length < 8) return [];
  flats.sort((a, b) => a - b);
  const baseline = flats[Math.floor(flats.length / 2)];
  const out: GradeSample[] = [];
  for (const s of splits) {
    if (s.distance < 900 || s.movingTime <= 0 || !s.averageSpeed || s.averageSpeed <= 1) continue;
    const grade = (s.elevationDiff / s.distance) * 100;
    if (Math.abs(grade) > 25) continue;
    out.push({ grade: Math.round(grade * 10) / 10, factor: Math.round((1000 / s.averageSpeed! / baseline) * 1000) / 1000 });
  }
  return out;
}

export type GradeFit = { slope: number; intercept: number; r2: number; n: number };

export const GRADE_MIN_N = 40;
export const GRADE_MIN_R2 = 0.25;

/** Régression factor = 1 + pente × grade, en deux passages. */
export function fitGradeFactor(samples: GradeSample[]): GradeFit | null {
  if (samples.length < GRADE_MIN_N) return null;
  const first = linearFit(samples.map((s) => s.grade), samples.map((s) => s.factor));
  if (!Number.isFinite(first.slope)) return null;
  const clean = samples.filter((s) => Math.abs(s.factor - (first.intercept + first.slope * s.grade)) <= 0.25);
  if (clean.length < GRADE_MIN_N) return null;
  const fit = linearFit(clean.map((s) => s.grade), clean.map((s) => s.factor));
  if (!Number.isFinite(fit.slope) || fit.r2 < GRADE_MIN_R2) return null;
  return { slope: fit.slope, intercept: fit.intercept, r2: round(fit.r2, 2), n: clean.length };
}

/** Facteur de pente personnel (borné), sinon null si non concluant. */
export function personalGradeFactor(fit: GradeFit | null, gradePct: number): number | null {
  if (!fit) return null;
  const g = Math.max(-30, Math.min(30, gradePct));
  const f = fit.intercept + fit.slope * g;
  return f > 0.5 && f < 2.5 ? Math.round(f * 1000) / 1000 : null;
}

/** Pearson + significativité (approximation normale du r). */
export function pearson(xs: number[], ys: number[]): { r: number; n: number; significant: boolean } | null {
  if (xs.length !== ys.length || xs.length < 10) return null;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  if (den === 0) return null;
  const r = num / den;
  // Test de significativité : t = r·√((n−2)/(1−r²)), |t| > 2 ≈ p < 0,05.
  const t = Math.abs(r) * Math.sqrt((n - 2) / Math.max(1e-6, 1 - r * r));
  return { r: Math.round(r * 1000) / 1000, n, significant: t > 2 };
}
