/**
 * Calcul express, tapé en langage naturel dans la palette de commandes.
 *
 *   « 5k 24:30 »          → VDOT, allure, chronos équivalents
 *   « semi en 1h45 »      → idem
 *   « 4'50/km »           → vitesse, temps de passage sur les distances de référence
 *   « 12,5 km/h »         → allure, idem
 *
 * Fonctions pures, sans dépendance au DOM : testées dans tests/quick-calc.test.ts.
 */
import { timeFromVdot, vdotFromPerformance } from "./vdot";

export type QuickResult =
  | {
      kind: "performance";
      meters: number;
      seconds: number;
      pace: number; // s/km
      vdot: number;
      equivalents: Array<{ label: string; meters: number; seconds: number }>;
    }
  | {
      kind: "pace";
      pace: number; // s/km
      kmh: number;
      splits: Array<{ label: string; meters: number; seconds: number }>;
    };

const NAMED: Array<[RegExp, number, string]> = [
  [/\bmarathon\b/, 42195, "Marathon"],
  [/\b(semi|half)(-?marathon)?\b/, 21097.5, "Semi"],
  [/\bmile\b/, 1609.34, "Mile"],
];

export const REFERENCE = [
  { label: "1 km", meters: 1000 },
  { label: "5 km", meters: 5000 },
  { label: "10 km", meters: 10000 },
  { label: "Semi", meters: 21097.5 },
  { label: "Marathon", meters: 42195 },
];

function num(s: string): number {
  return Number(s.replace(",", "."));
}

/** Distance en mètres, ou null. */
export function parseDistance(input: string): number | null {
  const s = input.toLowerCase();
  for (const [re, m] of NAMED) if (re.test(s)) return m;
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*(km|k|m)\b(?!\s*\/)/);
  if (!m) return null;
  const v = num(m[1]);
  if (m[2] === "m") return v >= 100 ? v : null; // « 5m » est ambigu : on l'ignore
  return v * 1000;
}

/** Durée en secondes : 24:30, 1:45:00, 1h45, 1h45'30, 45min, 24'30". */
export function parseDuration(input: string): number | null {
  const s = input.toLowerCase().replace(/\s+/g, " ");
  let m = s.match(/\b(\d{1,2}):(\d{2}):(\d{2})\b/);
  if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3];
  m = s.match(/\b(\d{1,2})\s*h\s*(\d{1,2})?(?:\s*['m:]\s*(\d{1,2}))?/);
  if (m) return +m[1] * 3600 + (m[2] ? +m[2] * 60 : 0) + (m[3] ? +m[3] : 0);
  // mm:ss ou mm'ss — mais pas une allure (suivie de /km)
  m = s.match(/\b(\d{1,3})\s*[:']\s*(\d{2})\s*(?:"|'')?(?!\s*\/)/);
  if (m && !/\/\s*km/.test(s.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 4))) {
    return +m[1] * 60 + +m[2];
  }
  m = s.match(/\b(\d{1,3})\s*min\b/);
  if (m) return +m[1] * 60;
  return null;
}

/** Allure en s/km : « 4'50/km », « 4:50 /km », « 12 km/h ». */
export function parsePace(input: string): number | null {
  const s = input.toLowerCase();
  let m = s.match(/(\d{1,2})\s*[:']\s*(\d{2})\s*(?:"|'')?\s*\/\s*km/);
  if (m) return +m[1] * 60 + +m[2];
  m = s.match(/(\d{1,2}(?:[.,]\d+)?)\s*km\s*\/\s*h/);
  if (m) {
    const kmh = num(m[1]);
    return kmh > 0 ? 3600 / kmh : null;
  }
  return null;
}

export function quickCalc(input: string): QuickResult | null {
  if (!input || input.trim().length < 2) return null;

  const pace = parsePace(input);
  if (pace && pace >= 120 && pace <= 1200) {
    return {
      kind: "pace",
      pace,
      kmh: Math.round((3600 / pace) * 10) / 10,
      splits: REFERENCE.map((r) => ({ ...r, seconds: (pace * r.meters) / 1000 })),
    };
  }

  const meters = parseDistance(input);
  const seconds = parseDuration(input);
  if (!meters || !seconds) return null;
  const p = seconds / (meters / 1000);
  // Bornes de plausibilité : de 2'00 à 20'00 /km
  if (p < 120 || p > 1200) return null;

  const vdot = vdotFromPerformance(meters, seconds);
  return {
    kind: "performance",
    meters,
    seconds,
    pace: p,
    vdot,
    equivalents:
      vdot > 0
        ? REFERENCE.filter((r) => r.meters !== 1000).map((r) => ({
            ...r,
            seconds: Math.abs(r.meters - meters) < 1 ? seconds : timeFromVdot(vdot, r.meters),
          }))
        : [],
  };
}
