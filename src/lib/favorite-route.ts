/**
 * Parcours fétiche — le tracé le plus couru, et sa progression dans le temps.
 *
 * Un parcours se reconnaît par sa signature (voir polyline.ts) : deux sorties
 * au tracé proche et à distance comparable sont « le même parcours ». Ici on
 * isole le parcours le plus fréquenté de tout l'historique et on raconte sa
 * progression (allure, cardio) occurrence par occurrence.
 *
 * Fonctions pures, testées dans tests/favorite-route.test.ts.
 */

import { pacePerKm } from "./format";
import { groupRoutes } from "./polyline";

/** Une sortie sur le parcours, réduite à ce qui compte pour le récit. */
export type RouteOccurrence = {
  id: string;
  date: Date;
  /** Allure en s/km. */
  pace: number;
  /** Fréquence cardiaque moyenne en bpm, si mesurée. */
  hr: number | null;
  distance: number; // m
  isRace: boolean;
};

/** Le parcours le plus couru (au moins 2 sorties), ou null. */
export function favoriteRoute<
  T extends { polyline: string | null; distance: number }
>(items: T[]): { lead: T; items: T[] } | null {
  const group = groupRoutes(items)[0];
  return group && group.items.length >= 2 ? group : null;
}

/** Les occurrences d'un parcours, de la plus ancienne à la plus récente. */
export function routeTimeline<
  T extends {
    id: string;
    startDate: Date;
    distance: number;
    movingTime: number;
    averageHr: number | null;
    isRace: boolean;
  }
>(items: T[]): RouteOccurrence[] {
  return [...items]
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
    .map((r) => ({
      id: r.id,
      date: r.startDate,
      pace: pacePerKm(r.distance, r.movingTime),
      hr: r.averageHr,
      distance: r.distance,
      isRace: r.isRace,
    }));
}

/**
 * Pente de l'allure, en s/km **par an** (régression linéaire sur les jours
 * écoulés). Une valeur négative signifie « tu vas plus vite » : −8 s/km/an.
 * `null` si moins de 2 occurrences ou si toutes sont le même jour.
 */
export function paceTrend(occ: RouteOccurrence[]): number | null {
  if (occ.length < 2) return null;
  const x0 = occ[0].date.getTime();
  const xs = occ.map((o) => (o.date.getTime() - x0) / 86_400_000);
  const ys = occ.map((o) => o.pace);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  return (num / den) * 365;
}

export type FavoriteSummary = {
  count: number;
  /** Distance moyenne du parcours, en km. */
  km: number;
  first: Date;
  last: Date;
  /** Jours entre la première et la dernière sortie. */
  spanDays: number;
  /** Meilleure allure observée (s/km). */
  bestPace: number;
  /** Allure de la dernière sortie (s/km). */
  recentPace: number;
  /** Pente en s/km par an (négatif = progrès), null si pas de tendance lisible. */
  trend: number | null;
  /** Au moins une sortie a un cardio. */
  hr: boolean;
};

/**
 * En dessous de ce recul, une pente « par an » est du bruit : deux mois de
 * sorties très variables extrapolés sur un an donnent des chiffres absurdes
 * (« +2 736 s/km/an » sur 9 jours). On ne raconte une tendance qu'au-delà.
 */
export const MIN_TREND_SPAN_DAYS = 60;

export function favoriteRouteSummary(tl: RouteOccurrence[]): FavoriteSummary {
  const best = tl.reduce((a, b) => (b.pace < a.pace ? b : a));
  const first = tl[0].date;
  const last = tl[tl.length - 1].date;
  const spanDays = Math.round((last.getTime() - first.getTime()) / 86_400_000);
  const raw = paceTrend(tl);
  return {
    count: tl.length,
    km: tl.reduce((a, o) => a + o.distance, 0) / tl.length / 1000,
    first,
    last,
    spanDays,
    bestPace: best.pace,
    recentPace: tl[tl.length - 1].pace,
    trend: spanDays >= MIN_TREND_SPAN_DAYS ? raw : null,
    hr: tl.some((o) => o.hr != null),
  };
}
