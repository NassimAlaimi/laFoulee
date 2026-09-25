/**
 * Nutrition de course — repères de la nutrition sportive d'endurance
 * (consensus ACSM / ISSN / IOC), ramenés à un plan concret.
 *
 * - **Glucides / heure** selon la durée : rien d'obligatoire sous ~1 h ;
 *   30-60 g/h jusqu'à ~2 h 30 ; 60-90 g/h au-delà (90 seulement avec un
 *   intestin entraîné et un mélange glucose/fructose).
 * - **Hydratation** d'après le taux de sudation mesuré : compenser une partie
 *   des pertes, **jamais davantage** (risque d'hyponatrémie).
 * - **Sodium** ~ la moitié des pertes (≈ 900 mg/L de sueur, plus si « salé »).
 * - **Caféine** 3 mg/kg, optionnelle.
 * - **Calendrier de prise** calé sur le *temps* (pas les km), décalé hors
 *   des montées raides, aimanté aux ravitaillements pour boire.
 *
 * Repères généraux, pas un avis médical ou diététique. Fonctions pures,
 * testées dans tests/nutrition.test.ts.
 */

export type Product = {
  id: string;
  name: string;
  carbsG: number;
  sodiumMg: number;
  caffeineMg: number;
  /** volume de liquide apporté (boisson), ml */
  fluidMl: number;
};

/** Produits génériques proposés par défaut (identifiants stables). */
export const DEFAULT_PRODUCTS: Product[] = [
  { id: "gel", name: "gel", carbsG: 25, sodiumMg: 50, caffeineMg: 0, fluidMl: 0 },
  { id: "gel-caf", name: "gelCaf", carbsG: 25, sodiumMg: 50, caffeineMg: 75, fluidMl: 0 },
  { id: "drink", name: "drink", carbsG: 30, sodiumMg: 300, caffeineMg: 0, fluidMl: 500 },
  { id: "bar", name: "bar", carbsG: 25, sodiumMg: 100, caffeineMg: 0, fluidMl: 0 },
  { id: "compote", name: "compote", carbsG: 20, sodiumMg: 10, caffeineMg: 0, fluidMl: 0 },
];

export function carbsPerHour(durationSec: number, gutTrained = false): { low: number; high: number; target: number } {
  const h = durationSec / 3600;
  if (h < 1) return { low: 0, high: 30, target: 0 };
  if (h <= 2.5) return { low: 30, high: 60, target: 45 };
  return { low: 60, high: 90, target: gutTrained ? 90 : 70 };
}

/** Taux de sudation (L/h) : perte de poids + boisson bue − urine, sur la durée. */
export function sweatRate(input: { before: number; after: number; drankMl: number; urineMl?: number; minutes: number }): number | null {
  if (input.minutes < 20 || input.before <= 0 || input.after <= 0) return null;
  const lossL = input.before - input.after + input.drankMl / 1000 - (input.urineMl ?? 0) / 1000;
  const rate = lossL / (input.minutes / 60);
  return rate > 0 && rate < 4 ? Math.round(rate * 100) / 100 : null;
}

/**
 * Boisson visée (ml/h) : 60-70 % des pertes si le taux est connu, plafonné à
 * 800 ml/h ; sinon un repère selon la chaleur. Jamais au-delà des pertes.
 */
export function fluidPerHour(rateLh: number | null, tempC: number | null): number {
  if (rateLh !== null) return Math.round(Math.min(800, rateLh * 1000 * 0.65) / 50) * 50;
  const t = tempC ?? 15;
  return t >= 25 ? 650 : t >= 18 ? 500 : 400;
}

export function sodiumPerHour(rateLh: number | null, salty = false): number {
  const perL = salty ? 1400 : 900;
  const rate = rateLh ?? 0.8;
  return Math.round((rate * perL * 0.5) / 50) * 50;
}

/** Caféine : 3 mg/kg (bornée 100-300 mg), en option. */
export function caffeineDose(weightKg: number | null): number {
  const w = weightKg ?? 70;
  return Math.max(100, Math.min(300, Math.round((w * 3) / 25) * 25));
}

/** Recharge glucidique et petit-déjeuner, selon la durée de course. */
export function preRace(weightKg: number | null, durationSec: number): { loadingGPerDay: number | null; loadingDays: number; breakfastG: number; breakfastHoursBefore: number } {
  const w = weightKg ?? 70;
  const long = durationSec >= 90 * 60;
  return {
    loadingGPerDay: long ? Math.round(w * 9) : null,
    loadingDays: long ? 2 : 0,
    breakfastG: Math.round(w * (long ? 2 : 1)),
    breakfastHoursBefore: 3,
  };
}

export type FuelStop = {
  /** minutes depuis le départ */
  minute: number;
  km: number;
  productId: string;
  carbsG: number;
  sodiumMg: number;
  caffeineMg: number;
  /** boire à ce moment (ml) */
  drinkMl: number;
  /** aimanté à un ravitaillement officiel */
  atAid: boolean;
  /** décalé pour éviter une montée raide */
  shifted: boolean;
};

export type FuelPlan = {
  carbsPerHour: number;
  fluidPerHour: number;
  sodiumPerHour: number;
  stops: FuelStop[];
  totals: { carbsG: number; sodiumMg: number; caffeineMg: number; fluidMl: number };
  /** à porter sur soi entre deux ravitaillements (max sur la course) */
  carryMax: number;
  /** avertissement hyponatrémie : boisson visée > pertes estimées */
  overDrinking: boolean;
};

export type FuelInput = {
  durationSec: number;
  /** temps cumulé (s) → distance (m), depuis la courbe du plan */
  kmAt: (seconds: number) => number;
  /** pente (%) au temps donné, pour éviter les montées raides */
  gradeAt?: (seconds: number) => number;
  products: Product[];
  /** produit principal et, en option, caféiné pour la 2e moitié */
  mainId: string;
  caffeineId?: string | null;
  aidKms: number[];
  gutTrained?: boolean;
  sweatRateLh?: number | null;
  tempC?: number | null;
  salty?: boolean;
  weightKg?: number | null;
};

export function fuelPlan(input: FuelInput): FuelPlan {
  const cph = carbsPerHour(input.durationSec, input.gutTrained).target;
  const fph = fluidPerHour(input.sweatRateLh ?? null, input.tempC ?? null);
  const sph = sodiumPerHour(input.sweatRateLh ?? null, input.salty);
  const main = input.products.find((p) => p.id === input.mainId) ?? input.products[0];
  const caf = input.caffeineId ? input.products.find((p) => p.id === input.caffeineId) ?? null : null;
  const stops: FuelStop[] = [];
  const totalMin = input.durationSec / 60;

  if (cph > 0 && main && main.carbsG > 0) {
    const every = Math.max(12, Math.round((main.carbsG / cph) * 60));
    // Première prise à 30-40 min, dernière au moins 15 min avant l'arrivée.
    const cafBudget = caf ? caffeineDose(input.weightKg ?? null) : 0;
    let cafUsed = 0;
    for (let m = Math.min(40, every); m <= totalMin - 15; m += every) {
      let minute = m;
      let shifted = false;
      if (input.gradeAt) {
        for (let k = 0; k < 6 && input.gradeAt(minute * 60) > 6; k++) {
          minute += 1;
          shifted = true;
        }
      }
      const km = input.kmAt(minute * 60) / 1000;
      const aid = input.aidKms.find((a) => Math.abs(a - km) <= 1.2);
      const late = minute >= totalMin / 2;
      const useCaf = caf && late && cafUsed + caf.caffeineMg <= cafBudget;
      const p = useCaf ? caf! : main;
      if (useCaf) cafUsed += caf!.caffeineMg;
      stops.push({
        minute: Math.round(minute),
        km: Math.round(km * 10) / 10,
        productId: p.id,
        carbsG: p.carbsG,
        sodiumMg: p.sodiumMg,
        caffeineMg: p.caffeineMg,
        drinkMl: Math.round((fph * every) / 60 / 50) * 50,
        atAid: aid !== undefined,
        shifted,
      });
    }
  }

  // Porter : nombre maximal de prises entre deux ravitaillements (ou toutes, sans ravito).
  const aids = [0, ...input.aidKms.slice().sort((a, b) => a - b), Infinity];
  let carryMax = 0;
  for (let i = 0; i < aids.length - 1; i++) {
    carryMax = Math.max(carryMax, stops.filter((s) => s.km > aids[i] && s.km <= aids[i + 1] && s.productId !== "drink").length);
  }

  const totals = stops.reduce(
    (a, s) => ({ carbsG: a.carbsG + s.carbsG, sodiumMg: a.sodiumMg + s.sodiumMg, caffeineMg: a.caffeineMg + s.caffeineMg, fluidMl: a.fluidMl + s.drinkMl }),
    { carbsG: 0, sodiumMg: 0, caffeineMg: 0, fluidMl: 0 }
  );
  const lossMlH = (input.sweatRateLh ?? 0) * 1000;
  return {
    carbsPerHour: cph,
    fluidPerHour: fph,
    sodiumPerHour: sph,
    stops,
    totals,
    carryMax,
    overDrinking: lossMlH > 0 && fph > lossMlH,
  };
}
