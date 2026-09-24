/**
 * Moteur de statistiques course à pied.
 * Toutes les entrées sont en unités SI : distance (m), temps (s), vitesse (m/s).
 */

import { pacePerKm, speedToPace } from "./format";

export type ActivityLike = {
  id: string;
  name: string;
  type: string;
  startDate: Date;
  distance: number;
  movingTime: number;
  elapsedTime: number;
  totalElevation: number;
  averageSpeed: number | null;
  maxSpeed: number | null;
  averageHr: number | null;
  maxHr: number | null;
  sufferScore: number | null;
  averageCadence: number | null;
  isRace: boolean;
};

// ---------------------------------------------------------------- Dates

/** Lundi 00:00 de la semaine contenant `date`. */
export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = dimanche
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Jours calendaires entre deux dates (minuit à minuit) : mercredi 21 h →
 * lundi 0 h donne 5, là où `daysBetween` arrondirait à 4.
 */
export function calendarDaysBetween(a: Date, b: Date): number {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

/**
 * Clé de jour en heure LOCALE (AAAA-MM-JJ). Jamais `toISOString()` pour ça :
 * minuit à Paris est la veille en UTC, et une clé UTC décale d'un jour tout
 * ce qui est rangé par jour ou par semaine.
 */
export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isoWeekKey(date: Date): string {
  return localDayKey(startOfWeek(date));
}

// ---------------------------------------------------------------- Volume

export type WeeklySummary = {
  weekStart: Date;
  label: string;
  km: number;
  elevation: number;
  timeHours: number;
  sessions: number;
  avgPace: number; // s/km
  avgHr: number | null;
  load: number; // charge d'entraînement cumulée
};

/** Agrège les activités par semaine (lundi → dimanche) sur `weeks` semaines glissantes. */
export function weeklyVolume(
  activities: ActivityLike[],
  weeks = 12,
  now = new Date()
): WeeklySummary[] {
  const currentMonday = startOfWeek(now);
  const buckets = new Map<string, ActivityLike[]>();
  const mondays = new Map<string, Date>();

  for (let i = weeks - 1; i >= 0; i--) {
    const monday = addDays(currentMonday, -7 * i);
    buckets.set(localDayKey(monday), []);
    mondays.set(localDayKey(monday), monday);
  }

  for (const a of activities) {
    const key = isoWeekKey(a.startDate);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(a);
  }

  return [...buckets.entries()].map(([key, acts]) => {
    const distance = sum(acts, (a) => a.distance);
    const time = sum(acts, (a) => a.movingTime);
    const hrActs = acts.filter((a) => a.averageHr);

    return {
      weekStart: mondays.get(key)!,
      label: shortWeekLabel(mondays.get(key)!),
      km: round(distance / 1000, 1),
      elevation: Math.round(sum(acts, (a) => a.totalElevation)),
      timeHours: round(time / 3600, 1),
      sessions: acts.length,
      avgPace: distance > 0 ? pacePerKm(distance, time) : 0,
      avgHr: hrActs.length
        ? round(sum(hrActs, (a) => a.averageHr ?? 0) / hrActs.length, 0)
        : null,
      load: round(sum(acts, (a) => trainingLoad(a)), 0),
    };
  });
}

function shortWeekLabel(monday: Date): string {
  return monday.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

// ---------------------------------------------------------------- Charge

/**
 * Charge d'une séance.
 * Si FC dispo → TRIMP simplifié (durée × intensité FC).
 * Sinon → proxy basé sur distance + dénivelé (équivalent-km).
 */
export function trainingLoad(
  a: ActivityLike,
  opts: { maxHr?: number; restHr?: number } = {}
): number {
  const minutes = a.movingTime / 60;

  if (a.averageHr && opts.maxHr && opts.restHr) {
    const hrr = (a.averageHr - opts.restHr) / (opts.maxHr - opts.restHr);
    const clamped = Math.max(0, Math.min(1, hrr));
    // Banister TRIMP, coefficient homme
    return minutes * clamped * 0.64 * Math.exp(1.92 * clamped);
  }

  if (a.sufferScore) return a.sufferScore;

  // Fallback : équivalent-km (100 m D+ ≈ 1 km plat)
  const equivKm = a.distance / 1000 + a.totalElevation / 100;
  return equivKm * 10;
}

export type LoadPoint = {
  date: Date;
  label: string;
  acute: number; // moyenne 7 j
  chronic: number; // moyenne 28 j
  ratio: number; // ACWR — 0 tant que `ready` est false
  zone: "insufficient" | "detraining" | "optimal" | "caution" | "danger";
  /**
   * L'ACWR compare une fenêtre de 7 j à une fenêtre de 28 j. Tant qu'on ne
   * dispose pas de 28 jours d'historique AVANT le point, la charge chronique
   * est artificiellement basse et le ratio explose (valeurs à 3-4 sans aucun
   * sens). On marque ces points comme non exploitables plutôt que d'afficher
   * une fausse alerte au surentraînement.
   */
  ready: boolean;
};

/**
 * ACWR (Acute:Chronic Workload Ratio).
 * < 0.8 = désentraînement · 0.8-1.3 = optimal · 1.3-1.5 = prudence · > 1.5 = risque de blessure.
 */
export function acwrSeries(
  activities: ActivityLike[],
  days = 90,
  now = new Date()
): LoadPoint[] {
  const daily = new Map<string, number>();
  for (const a of activities) {
    const key = localDayKey(a.startDate);
    daily.set(key, (daily.get(key) ?? 0) + trainingLoad(a));
  }

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const points: LoadPoint[] = [];

  const firstActivity = activities.length
    ? activities.reduce(
        (min, a) => (a.startDate < min ? a.startDate : min),
        activities[0].startDate
      )
    : null;

  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(today, -i);
    const acute = avgLoadOverWindow(daily, day, 7);
    const chronic = avgLoadOverWindow(daily, day, 28);

    const ready =
      firstActivity !== null &&
      chronic > 0 &&
      daysBetween(firstActivity, day) >= 28;

    const ratio = ready ? acute / chronic : 0;

    points.push({
      date: day,
      label: day.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
      acute: round(acute, 1),
      chronic: round(chronic, 1),
      ratio: round(ratio, 2),
      zone: ready ? acwrZone(ratio) : "insufficient",
      ready,
    });
  }
  return points;
}

function avgLoadOverWindow(
  daily: Map<string, number>,
  end: Date,
  window: number
): number {
  let total = 0;
  for (let i = 0; i < window; i++) {
    const key = localDayKey(addDays(end, -i));
    total += daily.get(key) ?? 0;
  }
  return total / window;
}

export function acwrZone(ratio: number): LoadPoint["zone"] {
  if (ratio === 0) return "detraining";
  if (ratio < 0.8) return "detraining";
  if (ratio <= 1.3) return "optimal";
  if (ratio <= 1.5) return "caution";
  return "danger";
}

/** Libellés de zone ACWR — clés i18n `common.acwr.*`. */
export const ACWR_LABELS: Record<LoadPoint["zone"], string> = {
  insufficient: "acwr.insufficient",
  detraining: "acwr.detraining",
  optimal: "acwr.optimal",
  caution: "acwr.caution",
  danger: "acwr.danger",
};

// ---------------------------------------------------------------- Zones FC

export type HrZone = {
  index: number;
  name: string;
  min: number;
  max: number;
  seconds: number;
  percent: number;
  color: string;
};

/** Zones classiques en % de FC max. */
export function hrZones(
  activities: ActivityLike[],
  maxHr: number
): HrZone[] {
  const defs = [
    { index: 1, name: "Z1 · Récup", lo: 0.5, hi: 0.6, color: "#64748b" },
    { index: 2, name: "Z2 · Endurance", lo: 0.6, hi: 0.7, color: "#22c55e" },
    { index: 3, name: "Z3 · Tempo", lo: 0.7, hi: 0.8, color: "#eab308" },
    { index: 4, name: "Z4 · Seuil", lo: 0.8, hi: 0.9, color: "#f97316" },
    { index: 5, name: "Z5 · VO2max", lo: 0.9, hi: 1.05, color: "#ef4444" },
  ];

  const zones: HrZone[] = defs.map((d) => ({
    index: d.index,
    name: d.name,
    min: Math.round(d.lo * maxHr),
    max: Math.round(d.hi * maxHr),
    seconds: 0,
    percent: 0,
    color: d.color,
  }));

  // Approximation : la séance entière est imputée à la zone de sa FC moyenne.
  for (const a of activities) {
    if (!a.averageHr) continue;
    const pct = a.averageHr / maxHr;
    const idx = defs.findIndex((d) => pct >= d.lo && pct < d.hi);
    const target = zones[idx >= 0 ? idx : pct >= 1 ? 4 : 0];
    target.seconds += a.movingTime;
  }

  const total = zones.reduce((acc, z) => acc + z.seconds, 0);
  for (const z of zones) {
    z.percent = total > 0 ? round((z.seconds / total) * 100, 1) : 0;
  }
  return zones;
}

/** FC max estimée si non renseignée : max observé, sinon formule de Tanaka. */
export function estimateMaxHr(
  activities: ActivityLike[],
  birthYear?: number | null
): number {
  const observed = Math.max(0, ...activities.map((a) => a.maxHr ?? 0));
  if (observed > 120) return Math.round(observed);
  if (birthYear) {
    const age = new Date().getFullYear() - birthYear;
    return Math.round(208 - 0.7 * age); // Tanaka
  }
  return 190;
}

// ---------------------------------------------------------------- Tendances

export type Trend = {
  current: number;
  previous: number;
  delta: number;
  percent: number;
  direction: "up" | "down" | "flat";
};

export function compareTrend(current: number, previous: number): Trend {
  const delta = current - previous;
  const percent = previous > 0 ? (delta / previous) * 100 : 0;
  return {
    current: round(current, 1),
    previous: round(previous, 1),
    delta: round(delta, 1),
    percent: round(percent, 1),
    direction: Math.abs(percent) < 1 ? "flat" : delta > 0 ? "up" : "down",
  };
}

export type PeriodStats = {
  sessions: number;
  km: number;
  elevation: number;
  timeHours: number;
  avgPace: number;
  avgHr: number | null;
  longestRunKm: number;
  load: number;
};

export function periodStats(activities: ActivityLike[]): PeriodStats {
  const distance = sum(activities, (a) => a.distance);
  const time = sum(activities, (a) => a.movingTime);
  const hrActs = activities.filter((a) => a.averageHr);

  return {
    sessions: activities.length,
    km: round(distance / 1000, 1),
    elevation: Math.round(sum(activities, (a) => a.totalElevation)),
    timeHours: round(time / 3600, 1),
    avgPace: distance > 0 ? pacePerKm(distance, time) : 0,
    avgHr: hrActs.length
      ? round(sum(hrActs, (a) => a.averageHr ?? 0) / hrActs.length, 0)
      : null,
    longestRunKm: round(Math.max(0, ...activities.map((a) => a.distance)) / 1000, 1),
    load: round(sum(activities, (a) => trainingLoad(a)), 0),
  };
}

/** Nuage de points allure × FC pour visualiser l'efficience. */
export function paceHrScatter(activities: ActivityLike[]) {
  return activities
    .filter((a) => a.averageHr && a.averageSpeed && a.distance > 1000)
    .map((a) => ({
      id: a.id,
      name: a.name,
      date: a.startDate,
      pace: round(speedToPace(a.averageSpeed!), 0),
      hr: Math.round(a.averageHr!),
      km: round(a.distance / 1000, 1),
      // Indice d'efficience : m parcourus par battement
      efficiency: round((a.averageSpeed! * 60) / a.averageHr!, 2),
    }));
}

/** Série de progression : allure moyenne glissante par mois. */
export function monthlyProgression(activities: ActivityLike[], months = 12, now = new Date()) {
  const buckets = new Map<string, ActivityLike[]>();
  // Clé de mois en heure LOCALE : via toISOString (UTC), le 1er du mois à
  // minuit à Paris tombait la veille, et tout l'axe glissait d'un mois.
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  for (let i = months - 1; i >= 0; i--) {
    buckets.set(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)), []);
  }

  for (const a of activities) {
    buckets.get(monthKey(a.startDate))?.push(a);
  }

  return [...buckets.entries()].map(([key, acts]) => {
    const distance = sum(acts, (a) => a.distance);
    const time = sum(acts, (a) => a.movingTime);
    const hrActs = acts.filter((a) => a.averageHr);
    const [y, m] = key.split("-");
    return {
      month: key,
      label: new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("fr-FR", {
        month: "short",
        year: "2-digit",
      }),
      km: round(distance / 1000, 1),
      sessions: acts.length,
      avgPace: distance > 0 ? round(pacePerKm(distance, time), 0) : null,
      avgHr: hrActs.length
        ? round(sum(hrActs, (a) => a.averageHr ?? 0) / hrActs.length, 0)
        : null,
    };
  });
}

// ---------------------------------------------------------------- Objectifs
//
// La lecture d'un objectif de course (préparation, chrono projeté, plan) vit
// désormais dans `goal.ts` + `prediction.ts` + `training.ts`. Ce module ne
// garde que les mesures brutes : deux moteurs parallèles produisaient deux
// chronos différents pour la même course.

// ---------------------------------------------------------------- Utils

function sum<T>(arr: T[], fn: (item: T) => number): number {
  return arr.reduce((acc, item) => acc + (fn(item) || 0), 0);
}

export function round(n: number, digits = 1): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

/**
 * Retire les points vides en tête d'une série temporelle : un graphique sur
 * 12 mois dont les 7 premiers sont vides écrase les données dans un coin.
 * Garde toujours au moins `keep` points.
 */
export function trimLeadingEmpty<T>(rows: T[], isEmpty: (r: T) => boolean, keep = 2): T[] {
  const first = rows.findIndex((r) => !isEmpty(r));
  if (first < 0) return rows.slice(-keep);
  return rows.slice(Math.min(first, Math.max(0, rows.length - keep)));
}
