/**
 * Données de bien-être de l'export Garmin (sommeil, FC de repos, VFC) →
 * carnet quotidien. Les formats JSON de l'export varient selon les années :
 * on lit de façon tolérante tout objet portant une `calendarDate` et des
 * champs connus, sans supposer de structure de fichier.
 *
 * Fonctions pures, testées dans tests/wellness-import.test.ts.
 */

export type WellnessDay = {
  /** YYYY-MM-DD (jour local de l'export) */
  date: string;
  sleepHours: number | null;
  restHr: number | null;
  hrv: number | null;
};

type Obj = Record<string, unknown>;
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function visit(node: unknown, fn: (o: Obj) => void, depth = 0) {
  if (depth > 6 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const x of node) visit(x, fn, depth + 1);
    return;
  }
  fn(node as Obj);
  for (const v of Object.values(node as Obj)) if (typeof v === "object") visit(v, fn, depth + 1);
}

export function extractWellness(json: unknown): WellnessDay[] {
  const days = new Map<string, WellnessDay>();
  visit(json, (node) => {
    let o = node;
    const date = typeof o.calendarDate === "string" ? o.calendarDate.slice(0, 10) : null;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    // Les valeurs peuvent être rangées un niveau plus bas (hrvSummary, …).
    for (const v of Object.values(o)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        for (const [k, x] of Object.entries(v as Obj)) if (!(k in o)) o = { ...o, [k]: x };
      }
    }
    const d = days.get(date) ?? { date, sleepHours: null, restHr: null, hrv: null };
    const deep = n(o.deepSleepSeconds);
    const light = n(o.lightSleepSeconds);
    const rem = n(o.remSleepSeconds);
    if (deep !== null || light !== null || rem !== null) {
      const s = (deep ?? 0) + (light ?? 0) + (rem ?? 0);
      if (s > 3600) d.sleepHours = Math.round((s / 3600) * 10) / 10;
    } else if (n(o.sleepTimeSeconds) !== null && n(o.sleepTimeSeconds)! > 3600) {
      d.sleepHours = Math.round((n(o.sleepTimeSeconds)! / 3600) * 10) / 10;
    }
    const rhr = n(o.restingHeartRate) ?? n(o.currentDayRestingHeartRate);
    if (rhr !== null && rhr >= 30 && rhr <= 120) d.restHr = Math.round(rhr);
    const hrv = n(o.avgOvernightHrv) ?? n(o.lastNightAvg) ?? n(o.hrvValue);
    if (hrv !== null && hrv > 0 && hrv < 300) d.hrv = Math.round(hrv);
    if (d.sleepHours !== null || d.restHr !== null || d.hrv !== null) days.set(date, d);
  });
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
