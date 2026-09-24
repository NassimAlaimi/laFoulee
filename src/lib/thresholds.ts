/**
 * Seuils personnalisés (LT1 / LT2) estimés depuis les données réelles.
 *
 * L'idée : on ne se contente pas de % de FC max génériques. Chaque split
 * kilométrique Strava porte un couple (allure, FC moyenne). Sur l'ensemble
 * des sorties récentes, la relation allure → FC est linéaire dans la plage
 * aérobie ; on la mesure, puis on lit les deux seuils dessus :
 *
 * - **LT2** (seuil anaérobie) : FC à la **vitesse critique** du modèle
 *   Monod-Scherrer — CS est physiologiquement proche du seuil (≈ 88-92 %
 *   de VMA). C'est le point d'ancrage « sans lactate ».
 * - **LT1** (seuil aérobie) : FC à 85 % de la vitesse critique.
 *
 * Robustesse : deux passages de régression — le premier détecte les points
 * aberrants (côtes, dérive cardiaque, GPS perdu), le second s'ajuste sur les
 * points propres. En dessous de 20 points ou d'un r² de 0,25, on refuse de
 * conclure : mieux vaut des % génériques qu'un seuil inventé.
 */

import { linearFit } from "./prediction";
import { round } from "./stats";

export type HrPacePoint = {
  /** s/km */
  pace: number;
  /** bpm */
  hr: number;
};

export type PersonalZone = {
  key: "z1" | "z2" | "z3" | "z4" | "z5";
  name: string;
  color: string;
  /** borne basse incluse (bpm) */
  hrLow: number;
  /** borne haute exclue (bpm) — Infinity pour la dernière */
  hrHigh: number;
  /** allure plafond de la zone (s/km) — Infinity pour Z1 */
  paceCeil: number;
};

export type PersonalThresholds = {
  lt1Hr: number;
  lt2Hr: number;
  /** s/km */
  lt1Pace: number;
  lt2Pace: number;
  /** s/km, vitesse critique utilisée comme ancrage */
  csPace: number;
  points: number;
  r2: number;
  zones: PersonalZone[];
};

export const MIN_POINTS = 20;
export const MIN_R2 = 0.25;
/** LT1 ≈ 88 % de la FC du seuil (repère physiologique standard). */
export const LT1_HR_FRACTION = 0.88;
/** LT1 ≈ 87 % de la vitesse critique (repère d'allure standard). */
export const LT1_SPEED_FRACTION = 0.87;
/** Résidu au-delà duquel un point est écarté au second passage. */
export const RESIDUAL_CUT = 20;

/**
 * Estime les seuils à partir des couples (allure, FC) des splits.
 * @param csPace vitesse critique en s/km (lib/prediction)
 * @param maxHr FC max connue, pour borner l'extrapolation
 * @returns null si les données ne permettent pas de conclure
 */
export function estimateThresholds(
  points: HrPacePoint[],
  csPace: number,
  maxHr?: number | null
): PersonalThresholds | null {
  const valid = points.filter(
    (p) => p.hr >= 90 && p.hr <= 210 && p.pace >= 150 && p.pace <= 600
  );
  if (valid.length < MIN_POINTS || csPace <= 0) return null;

  const speeds = valid.map((p) => 1000 / p.pace);

  // Premier passage : fit complet, puis on écarte les résidus extrêmes.
  const first = linearFit(speeds, valid.map((p) => p.hr));
  const clean: { speed: number; hr: number }[] = [];
  for (let i = 0; i < speeds.length; i++) {
    const predicted = first.slope * speeds[i] + first.intercept;
    if (Math.abs(valid[i].hr - predicted) <= RESIDUAL_CUT) {
      clean.push({ speed: speeds[i], hr: valid[i].hr });
    }
  }
  if (clean.length < MIN_POINTS) return null;

  // Second passage : fit propre.
  const fit = linearFit(
    clean.map((c) => c.speed),
    clean.map((c) => c.hr)
  );
  // La FC doit croître avec la vitesse : une pente négative ou nulle
  // signale des données inexploitables.
  if (!Number.isFinite(fit.slope) || fit.slope <= 1 || fit.r2 < MIN_R2) return null;

  // L'extrapolation au-delà de la plus grande vitesse observée est bridée
  // à +5 % : au-delà, la linéarité FC-vitesse n'est plus garantie.
  const maxSpeed = Math.max(...clean.map((c) => c.speed));
  const csSpeed = Math.min(1000 / csPace, maxSpeed * 1.05);

  const hrAt = (speed: number) => round(fit.slope * speed + fit.intercept);

  const lt2Hr = Math.min(hrAt(csSpeed), maxHr ?? 200);
  // LT1 : FC à 88 % du seuil (ratio physiologique standard), allure à 87 %
  // de la vitesse critique. L'allure LT1 ne sort PAS de la régression : la
  // relation allure→FC globale est trop bruitée (côtes, dérive cardiaque)
  // pour être fiable aux allures lentes.
  const lt1Hr = Math.min(round(lt2Hr * LT1_HR_FRACTION), lt2Hr - 2);
  const lt1Speed = (1000 / csPace) * LT1_SPEED_FRACTION;
  if (lt1Hr >= lt2Hr || lt1Speed <= 0.5) return null;

  const lt2Pace = round(1000 / csSpeed);
  const lt1Pace = round(1000 / lt1Speed);
  const z3High = round(lt2Hr * 1.04);
  const z4High = round(lt2Hr * 1.08);

  const zones: PersonalZone[] = [
    { key: "z1", name: "Z1 · Récup", color: "rgb(var(--sage))", hrLow: 0, hrHigh: lt1Hr, paceCeil: Infinity },
    { key: "z2", name: "Z2 · Endurance", color: "rgb(var(--slate))", hrLow: lt1Hr, hrHigh: lt2Hr, paceCeil: lt1Pace },
    { key: "z3", name: "Z3 · Seuil", color: "rgb(var(--ochre))", hrLow: lt2Hr, hrHigh: z3High, paceCeil: lt2Pace },
    { key: "z4", name: "Z4 · VO2max", color: "rgb(var(--clay))", hrLow: z3High, hrHigh: z4High, paceCeil: round(lt2Pace / 1.04) },
    { key: "z5", name: "Z5 · Vitesse", color: "rgb(var(--rust))", hrLow: z4High, hrHigh: Infinity, paceCeil: round(lt2Pace / 1.08) },
  ];

  return {
    lt1Hr,
    lt2Hr,
    lt1Pace,
    lt2Pace,
    csPace,
    points: clean.length,
    r2: round(fit.r2, 2),
    zones,
  };
}

/** Zone correspondant à une FC donnée. */
export function zoneForHr(t: PersonalThresholds, hr: number): PersonalZone {
  return (
    t.zones.find((z) => hr >= z.hrLow && hr < z.hrHigh) ?? t.zones[t.zones.length - 1]
  );
}

/** Estimation générique du seuil (85-90 % de FC max), pour la comparaison. */
export function genericLt2Hr(maxHr: number): number {
  return round(maxHr * 0.87);
}
