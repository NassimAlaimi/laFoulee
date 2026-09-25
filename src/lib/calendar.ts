/**
 * Calendrier d'entraînement (heatmap semaine × jour) — données pures.
 *
 * Une colonne par semaine (lundi local), une case par jour. Le passé porte
 * le volume couru, le futur les séances planifiées. Les clés de jour sont en
 * heure LOCALE (leçon n° 3 d'AGENTS.md : `toISOString` décale d'un jour).
 *
 * Testé dans tests/calendar.test.ts.
 */

import { addDays, localDayKey, startOfWeek } from "./stats";

export type CalendarRun = {
  id: string;
  name: string;
  startDate: Date;
  distance: number;
  isRace: boolean;
};

export type CalendarPlanned = { date: Date; kind: string; title: string; distanceKm: number };

export type CalendarDay = {
  date: Date;
  key: string;
  km: number;
  count: number;
  names: string[];
  /** activité à ouvrir au clic (la plus longue du jour) */
  id: string | null;
  isRace: boolean;
  /** plus de 1,6 × la médiane des sorties de la période et ≥ 12 km */
  isLong: boolean;
  /** palier d'intensité 0 (repos) … 4 */
  level: number;
  future: boolean;
  today: boolean;
  planned: CalendarPlanned | null;
};

export type CalendarWeek = { monday: Date; days: CalendarDay[]; km: number; newMonth: boolean };

export type CalendarGrid = {
  weeks: CalendarWeek[];
  maxKm: number;
  maxWeekKm: number;
  totalKm: number;
  activeDays: number;
  /** semaines consécutives actives (la semaine en cours compte si active) */
  streak: number;
};

/** Palier de 1 à 4 selon la part du jour le plus chargé. */
export function levelFor(km: number, maxKm: number): number {
  if (km <= 0) return 0;
  const r = km / Math.max(1, maxKm);
  return r > 0.66 ? 4 : r > 0.4 ? 3 : r > 0.18 ? 2 : 1;
}

export function calendarGrid(opts: {
  runs: CalendarRun[];
  planned?: CalendarPlanned[];
  /** semaines passées, semaine courante incluse */
  weeks: number;
  /** semaines futures ajoutées à droite */
  futureWeeks?: number;
  now: Date;
}): CalendarGrid {
  const { runs, weeks, now } = opts;
  const futureWeeks = opts.futureWeeks ?? 0;
  const lastMonday = startOfWeek(now);
  const first = addDays(lastMonday, -7 * (weeks - 1));
  const end = addDays(lastMonday, 7 * (futureWeeks + 1));
  const todayKey = localDayKey(now);

  const byDay = new Map<string, { km: number; count: number; names: string[]; id: string; best: number; isRace: boolean }>();
  const inRange = runs.filter((r) => r.startDate >= first && r.startDate < end);
  for (const r of inRange) {
    const key = localDayKey(r.startDate);
    const km = r.distance / 1000;
    const prev = byDay.get(key);
    if (prev) {
      prev.km += km;
      prev.count++;
      prev.names.push(r.name);
      prev.isRace ||= r.isRace;
      if (km > prev.best) {
        prev.best = km;
        prev.id = r.id;
      }
    } else byDay.set(key, { km, count: 1, names: [r.name], id: r.id, best: km, isRace: r.isRace });
  }
  const plannedBy = new Map<string, CalendarPlanned>();
  for (const p of opts.planned ?? []) {
    const k = localDayKey(p.date);
    if (!plannedBy.has(k) && p.kind !== "rest") plannedBy.set(k, p);
  }

  const kms = [...byDay.values()].map((d) => d.km).sort((a, b) => a - b);
  const median = kms.length ? kms[Math.floor(kms.length / 2)] : 0;
  const maxKm = Math.max(1, ...kms);

  const out: CalendarWeek[] = [];
  for (let w = 0; w < weeks + futureWeeks; w++) {
    const monday = addDays(first, 7 * w);
    const days: CalendarDay[] = [];
    let weekKm = 0;
    for (let d = 0; d < 7; d++) {
      const date = addDays(monday, d);
      const key = localDayKey(date);
      const e = byDay.get(key);
      const future = key > todayKey;
      weekKm += e?.km ?? 0;
      days.push({
        date,
        key,
        km: e ? Math.round(e.km * 10) / 10 : 0,
        count: e?.count ?? 0,
        names: e?.names ?? [],
        id: e?.id ?? null,
        isRace: e?.isRace ?? false,
        isLong: Boolean(e && e.km >= 12 && e.km >= median * 1.6),
        level: e ? levelFor(e.km, maxKm) : 0,
        future,
        today: key === todayKey,
        planned: key >= todayKey && !e ? plannedBy.get(key) ?? null : null,
      });
    }
    const prev = out[out.length - 1];
    out.push({
      monday,
      days,
      km: Math.round(weekKm * 10) / 10,
      newMonth: !prev || prev.monday.getMonth() !== monday.getMonth(),
    });
  }

  // Série : on remonte depuis la semaine courante ; une semaine courante
  // encore vide n'interrompt pas la série (elle n'est pas finie).
  let streak = 0;
  const past = out.slice(0, weeks);
  for (let i = past.length - 1; i >= 0; i--) {
    const active = past[i].days.some((d) => d.count > 0);
    if (!active) {
      if (i === past.length - 1) continue;
      break;
    }
    streak++;
  }

  return {
    weeks: out,
    maxKm,
    maxWeekKm: Math.max(1, ...out.map((w) => w.km)),
    totalKm: Math.round(inRange.reduce((a, r) => a + r.distance, 0) / 1000),
    activeDays: [...byDay.keys()].filter((k) => k <= todayKey).length,
    streak,
  };
}
