/** Helpers de formatage — unités SI en entrée (m, s, m/s). */

export function fmtDistance(meters: number, digits = 1): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(digits)} km`;
}

export function fmtKm(meters: number, digits = 1): number {
  return Number((meters / 1000).toFixed(digits));
}

/** 3725 → "1h02'05"  |  185 → "3'05"" */
export function fmtDuration(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}'${String(sec).padStart(2, "0")}`;
  return `${m}'${String(sec).padStart(2, "0")}"`;
}

/** 3725 → "01:02:05" */
export function fmtClock(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":");
}

/** Allure en s/km à partir d'une vitesse m/s */
export function speedToPace(metersPerSecond: number): number {
  if (!metersPerSecond || metersPerSecond <= 0) return 0;
  return 1000 / metersPerSecond;
}

export function paceToSpeed(secondsPerKm: number): number {
  if (!secondsPerKm || secondsPerKm <= 0) return 0;
  return 1000 / secondsPerKm;
}

/** 285 s/km → "4'45"/km" */
export function fmtPace(secondsPerKm: number, suffix = "/km"): string {
  if (!secondsPerKm || !isFinite(secondsPerKm) || secondsPerKm <= 0) return "—";
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  if (s === 60) return `${m + 1}'00"${suffix}`;
  return `${m}'${String(s).padStart(2, "0")}"${suffix}`;
}

/** Allure directement depuis distance (m) + temps (s) */
export function pacePerKm(distanceMeters: number, seconds: number): number {
  if (!distanceMeters) return 0;
  return seconds / (distanceMeters / 1000);
}

export function fmtElevation(meters: number): string {
  return `${Math.round(meters)} m D+`;
}

export function fmtHr(hr?: number | null): string {
  return hr ? `${Math.round(hr)} bpm` : "—";
}

export function fmtDate(date: Date | string, locale = "fr-FR"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fmtDateShort(date: Date | string, locale = "fr-FR"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(locale, { day: "2-digit", month: "short" });
}

export function fmtSigned(n: number, digits = 1, unit = ""): string {
  const v = n.toFixed(digits);
  return `${n > 0 ? "+" : ""}${v}${unit}`;
}
