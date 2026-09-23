/**
 * Repères temporels pour les graphiques : les courses et les jours de record.
 *
 * Poser un trait vertical au jour d'une course (ou d'un record personnel) sur
 * la courbe de forme ou de charge raconte « tes courses expliquent les creux
 * de forme » sans section séparée. Le label doit utiliser exactement le même
 * format que l'axe du graphique visé, pour que le repère s'aligne sur un point.
 *
 * Fonctions pures, testées dans tests/race-marks.test.ts.
 */

export type MarkKind = "race" | "pr";

export type ChartMark = {
  /** Position sur l'axe du temps — même format que les points du graphique. */
  label: string;
  kind: MarkKind;
  /** Date d'origine, pour le tri et la déduplication. */
  date: Date;
};

/** « 14 sept. » — le format de l'axe du PMC (formSeries). */
export function dayMonthLabel(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

/**
 * Jours à marquer dans une fenêtre `[now − windowDays, now]`.
 *
 * - une course (`isRace`) marque en `"race"` ;
 * - un jour de record personnel marque en `"pr"`, sauf si une course tombe
 *   le même jour (la course prime).
 *
 * Le futur (projeté) n'est pas inclus : les courses à venir se marquent à la
 * main depuis la page objectif.
 */
export function activityMarks(opts: {
  races: Array<{ startDate: Date; isRace: boolean }>;
  records: Array<{ date: Date | null }>;
  now?: Date;
  windowDays?: number;
  label?: (d: Date) => string;
}): ChartMark[] {
  const now = opts.now ?? new Date();
  const windowDays = opts.windowDays ?? 180;
  const label = opts.label ?? dayMonthLabel;
  const from = new Date(now);
  from.setDate(from.getDate() - windowDays);

  const byDay = new Map<string, ChartMark>();

  for (const r of opts.races) {
    if (!r.isRace) continue;
    const d = r.startDate;
    if (d < from || d > now) continue;
    byDay.set(label(d), { label: label(d), kind: "race", date: d });
  }

  for (const rec of opts.records) {
    if (!rec.date) continue;
    const d = rec.date;
    if (d < from || d > now) continue;
    const l = label(d);
    if (!byDay.has(l)) byDay.set(l, { label: l, kind: "pr", date: d });
  }

  return [...byDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}
