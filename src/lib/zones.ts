/**
 * Zones d'intensité — source unique pour toute l'app.
 *
 * Avant, trois systèmes cohabitaient (% de FC max génériques sur l'accueil,
 * seuils LT1/LT2 personnels dans l'analyse, règle 80/20 dans le lexique) et la
 * même séance recevait trois verdicts. Ici, un seul modèle, ancré sur le
 * **seuil** (LT2) :
 *
 * - **Cardio** — bornes en % de la FC au seuil (LTHR), grille de Friel :
 *   Z1 < 85 %, Z2 85-89 %, Z3 90-94 %, Z4 95-99 %, Z5 ≥ 100 %.
 * - **Allure** — bornes en multiple de l'allure seuil (temps au km) :
 *   Z1 > 1,29×, Z2 1,14-1,29×, Z3 1,06-1,14×, Z4 0,99-1,06×, Z5 < 0,99×.
 *
 * Les deux grilles sont cohérentes avec la lecture polarisée en 3 zones :
 * « facile » = Z1+Z2 (sous LT1 ≈ 88 % LTHR ≈ 1,15× l'allure seuil),
 * « intermédiaire » = Z3+Z4, « intense » = Z5 (au-dessus du seuil).
 *
 * Cascade d'ancrage (toujours affichée à l'utilisateur) :
 * 1. seuils personnels mesurés (lib/thresholds) ;
 * 2. sinon FC de réserve (Karvonen 85 % de la réserve ≈ LT2) et allure seuil
 *    tirée du VDOT ;
 * 3. sinon rien pour la dimension concernée.
 *
 * Répartition : on compte le **temps passé** dans chaque zone, pas la zone de
 * la FC moyenne. Meilleure source disponible par séance : courbe à la seconde,
 * sinon splits kilométriques, sinon moyenne de séance (signalée).
 *
 * Fonctions pures, testées dans tests/zones.test.ts.
 */

import type { HrStreamData } from "./cardio";

export type ZoneKey = "z1" | "z2" | "z3" | "z4" | "z5";
export const ZONE_KEYS: ZoneKey[] = ["z1", "z2", "z3", "z4", "z5"];

/** Couleurs (tokens du thème) du plus calme au plus intense. */
export const ZONE_COLORS: Record<ZoneKey, string> = {
  z1: "rgb(var(--slate))",
  z2: "rgb(var(--sage))",
  z3: "rgb(var(--ochre))",
  z4: "rgb(var(--clay))",
  z5: "rgb(var(--rust))",
};

export type PolarKey = "low" | "mid" | "high";
export const POLAR_OF: Record<ZoneKey, PolarKey> = {
  z1: "low",
  z2: "low",
  z3: "mid",
  z4: "mid",
  z5: "high",
};
export const POLAR_COLORS: Record<PolarKey, string> = {
  low: "rgb(var(--sage))",
  mid: "rgb(var(--ochre))",
  high: "rgb(var(--clay))",
};

/** Fractions de LTHR (bornes basses de Z2..Z5). */
export const HR_EDGES = [0.85, 0.9, 0.95, 1.0];
/** Multiples de l'allure seuil (bornes « lentes » de Z2..Z5, en temps au km). */
export const PACE_EDGES = [1.29, 1.14, 1.06, 0.99];

export type ZoneSource = "personal" | "reserve" | "vdot" | "none";

export type Band = {
  key: ZoneKey;
  /** bpm (inclus) ou s/km côté lent (exclu) selon la dimension */
  low: number;
  high: number;
};

export type ZoneModel = {
  hrSource: ZoneSource;
  paceSource: ZoneSource;
  /** FC au seuil (bpm), null si aucune ancre cardio */
  lthr: number | null;
  /** allure seuil (s/km), null si aucune ancre d'allure */
  thresholdPace: number | null;
  /** bandes cardio : low ≤ hr < high */
  hr: Band[] | null;
  /** bandes d'allure en s/km : low (rapide) < pace ≤ high (lent) */
  pace: Band[] | null;
};

export type ZoneModelInput = {
  /** seuils personnels, si lib/thresholds a pu conclure */
  personal?: { lt2Hr: number; lt2Pace: number } | null;
  maxHr?: number | null;
  restHr?: number | null;
  /** allure seuil tirée du VDOT (s/km) */
  vdotThresholdPace?: number | null;
};

/** LTHR par la FC de réserve : repos + 85 % de (max − repos). */
export function reserveLthr(maxHr: number, restHr: number): number {
  return Math.round(restHr + 0.85 * (maxHr - restHr));
}

export function hrBands(lthr: number): Band[] {
  const edges = [0, ...HR_EDGES.map((f) => Math.round(f * lthr)), Infinity];
  return ZONE_KEYS.map((key, i) => ({ key, low: edges[i], high: edges[i + 1] }));
}

export function paceBands(thresholdPace: number): Band[] {
  // Du plus lent au plus rapide : Z1 va de l'infini (arrêt) à 1,29×.
  const edges = [Infinity, ...PACE_EDGES.map((m) => Math.round(m * thresholdPace)), 0];
  return ZONE_KEYS.map((key, i) => ({ key, low: edges[i + 1], high: edges[i] }));
}

export function zoneModel(input: ZoneModelInput): ZoneModel {
  let lthr: number | null = null;
  let hrSource: ZoneSource = "none";
  if (input.personal && input.personal.lt2Hr > 0) {
    lthr = Math.round(input.personal.lt2Hr);
    hrSource = "personal";
  } else if (input.maxHr && input.maxHr > 120) {
    lthr = reserveLthr(input.maxHr, input.restHr ?? 55);
    hrSource = "reserve";
  }

  let thresholdPace: number | null = null;
  let paceSource: ZoneSource = "none";
  if (input.personal && input.personal.lt2Pace > 0) {
    thresholdPace = Math.round(input.personal.lt2Pace);
    paceSource = "personal";
  } else if (input.vdotThresholdPace && input.vdotThresholdPace > 0) {
    thresholdPace = Math.round(input.vdotThresholdPace);
    paceSource = "vdot";
  }

  return {
    hrSource,
    paceSource,
    lthr,
    thresholdPace,
    hr: lthr ? hrBands(lthr) : null,
    pace: thresholdPace ? paceBands(thresholdPace) : null,
  };
}

export function hrZoneIndex(bands: Band[], hr: number): number {
  for (let i = bands.length - 1; i >= 0; i--) if (hr >= bands[i].low) return i;
  return 0;
}

export function paceZoneIndex(bands: Band[], pace: number): number {
  // La bande i couvre ]low, high], du plus lent (Z1) au plus rapide (Z5).
  for (let i = 0; i < bands.length; i++) if (pace > bands[i].low) return i;
  return bands.length - 1;
}

// ---------------------------------------------------------------- Répartition

export type ActivityForZones = {
  movingTime: number;
  averageHr: number | null;
  averageSpeed: number | null;
  stream?: HrStreamData | null;
  splits?: Array<{ movingTime: number; averageHr: number | null; averageSpeed: number | null }>;
};

export type Coverage = { stream: number; splits: number; average: number; noHr: number };

export type ZoneDistribution = {
  /** secondes par zone cardio (Z1..Z5) */
  hr: number[];
  /** secondes par zone d'allure (Z1..Z5) */
  pace: number[];
  /** combien de séances ont été lues à la seconde, au km, à la moyenne, sans cardio */
  coverage: Coverage;
  sessions: number;
};

export function emptyDistribution(): ZoneDistribution {
  return {
    hr: [0, 0, 0, 0, 0],
    pace: [0, 0, 0, 0, 0],
    coverage: { stream: 0, splits: 0, average: 0, noHr: 0 },
    sessions: 0,
  };
}

/** Vitesse en dessous de laquelle on considère l'arrêt (≈ 16:40/km). */
const STOP_SPEED = 1.0;
/** Au-delà de cet écart entre deux échantillons, on ne compte pas (pause montre). */
const MAX_GAP = 30;

/** Ajoute une séance à une répartition (mutation de `into`, renvoyée). */
export function addActivity(
  into: ZoneDistribution,
  a: ActivityForZones,
  model: ZoneModel
): ZoneDistribution {
  into.sessions++;
  const s = a.stream;
  const hasHr = Boolean(a.averageHr && a.averageHr > 0);

  if (s && s.time.length > 10) {
    into.coverage.stream++;
    for (let i = 1; i < s.time.length; i++) {
      const dt = s.time[i] - s.time[i - 1];
      if (dt <= 0 || dt > MAX_GAP) continue;
      if (model.hr && s.hr[i] > 0) into.hr[hrZoneIndex(model.hr, s.hr[i])] += dt;
      if (model.pace && s.speed[i] >= STOP_SPEED) {
        into.pace[paceZoneIndex(model.pace, 1000 / s.speed[i])] += dt;
      }
    }
    return into;
  }

  const splits = (a.splits ?? []).filter((x) => x.movingTime > 0);
  if (splits.length >= 2) {
    if (hasHr) into.coverage.splits++;
    else into.coverage.noHr++;
    for (const sp of splits) {
      if (model.hr && sp.averageHr && sp.averageHr > 0) {
        into.hr[hrZoneIndex(model.hr, sp.averageHr)] += sp.movingTime;
      }
      if (model.pace && sp.averageSpeed && sp.averageSpeed >= STOP_SPEED) {
        into.pace[paceZoneIndex(model.pace, 1000 / sp.averageSpeed)] += sp.movingTime;
      }
    }
    return into;
  }

  if (hasHr) into.coverage.average++;
  else into.coverage.noHr++;
  if (model.hr && hasHr) into.hr[hrZoneIndex(model.hr, a.averageHr!)] += a.movingTime;
  if (model.pace && a.averageSpeed && a.averageSpeed >= STOP_SPEED) {
    into.pace[paceZoneIndex(model.pace, 1000 / a.averageSpeed)] += a.movingTime;
  }
  return into;
}

export function zoneDistribution(list: ActivityForZones[], model: ZoneModel): ZoneDistribution {
  const d = emptyDistribution();
  for (const a of list) addActivity(d, a, model);
  return d;
}

/** Pourcentages entiers qui somment à 100 (méthode du plus fort reste). */
export function percents(seconds: number[]): number[] {
  const total = seconds.reduce((a, b) => a + b, 0);
  if (total <= 0) return seconds.map(() => 0);
  const raw = seconds.map((s) => (s / total) * 100);
  const floor = raw.map(Math.floor);
  let rest = 100 - floor.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - floor[i], i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    floor[i]++;
    rest--;
  }
  return floor;
}

/** Regroupement polarisé : facile / intermédiaire / intense. */
export function polarized(seconds: number[]): Record<PolarKey, number> {
  const out: Record<PolarKey, number> = { low: 0, mid: 0, high: 0 };
  ZONE_KEYS.forEach((k, i) => (out[POLAR_OF[k]] += seconds[i] ?? 0));
  return out;
}

/** Verdict 80/20 à partir des secondes par zone. */
export type PolarVerdict = "balanced" | "tooMuchMid" | "tooHard" | "allEasy" | "thin";
export function polarVerdict(seconds: number[], sessions: number): PolarVerdict {
  const total = seconds.reduce((a, b) => a + b, 0);
  if (sessions < 4 || total < 3 * 3600) return "thin";
  const p = polarized(seconds);
  const low = p.low / total;
  const mid = p.mid / total;
  if (mid > 0.25) return "tooMuchMid";
  if (low < 0.7) return "tooHard";
  if (low > 0.95) return "allEasy";
  return "balanced";
}

// ---------------------------------------------------------------- FC max robuste

/**
 * FC max plausible à partir des maxima de séance : on écarte les pics isolés
 * (capteur optique qui accroche la cadence). Une valeur est retenue si une
 * autre séance l'approche à 4 bpm près ; sinon la deuxième plus haute.
 */
export function robustMaxHr(maxima: Array<number | null | undefined>): number | null {
  const v = maxima
    .filter((x): x is number => typeof x === "number" && x > 120 && x < 230)
    .sort((a, b) => b - a);
  if (v.length === 0) return null;
  if (v.length === 1) return Math.round(v[0]);
  for (let i = 0; i < v.length - 1; i++) {
    if (v[i] - v[i + 1] <= 4) return Math.round(v[i]);
  }
  return Math.round(v[1]);
}

/**
 * FC maximale soutenue au moins `minSeconds` dans une courbe : le plus haut
 * niveau atteint et tenu, pas un échantillon parasite.
 */
export function sustainedMaxHr(stream: HrStreamData, minSeconds = 30): number | null {
  const { time, hr } = stream;
  if (time.length < 2) return null;
  let best = 0;
  // Fenêtre glissante : minimum de la FC sur [t, t + minSeconds].
  let j = 0;
  const dq: number[] = []; // indices, FC croissante (minimum en tête)
  for (let i = 0; i < time.length; i++) {
    while (dq.length && hr[dq[dq.length - 1]] >= hr[i]) dq.pop();
    dq.push(i);
    while (time[i] - time[j] > minSeconds) {
      if (dq[0] === j) dq.shift();
      j++;
    }
    if (time[i] - time[j] >= minSeconds * 0.9 && hr[dq[0]] > best) best = hr[dq[0]];
  }
  return best > 0 ? Math.round(best) : null;
}

// ---------------------------------------------------------------- Comparatif

export type CompareDirection = "up" | "down" | "neutral";

export type CompareRow = {
  key: string;
  now: number | null;
  was: number | null;
  /** écart relatif en %, null si non significatif */
  deltaPct: number | null;
  /** sens souhaitable de la métrique */
  better: CompareDirection;
  /** évaluation de l'écart : bon, mauvais, neutre */
  tone: "good" | "bad" | "flat";
};

/** Seuil minimum de séances par période pour afficher une évolution. */
export const MIN_COMPARE_SESSIONS = 4;

export function compareRow(
  key: string,
  now: number | null,
  was: number | null,
  better: CompareDirection,
  sessions: { now: number; was: number },
  flatPct = 3
): CompareRow {
  let deltaPct: number | null = null;
  if (
    now !== null &&
    was !== null &&
    was !== 0 &&
    sessions.now >= MIN_COMPARE_SESSIONS &&
    sessions.was >= MIN_COMPARE_SESSIONS
  ) {
    deltaPct = Math.round(((now - was) / Math.abs(was)) * 100);
  }
  let tone: CompareRow["tone"] = "flat";
  if (deltaPct !== null && Math.abs(deltaPct) >= flatPct && better !== "neutral") {
    const up = deltaPct > 0;
    tone = (better === "up") === up ? "good" : "bad";
  }
  return { key, now, was, deltaPct, better, tone };
}

/**
 * Séance « facile comparable » : ni course, ni trail, 3-25 km, allure moyenne
 * en Z1-Z2 d'allure. Sert à comparer des allures qui ont un sens (l'allure
 * moyenne de tout le mois baisse dès qu'on fait plus de trail).
 */
export function isEasyComparable(
  a: { type: string; isRace: boolean; distance: number; averageSpeed: number | null },
  model: ZoneModel
): boolean {
  if (a.isRace || a.type !== "Run") return false;
  if (a.distance < 3000 || a.distance > 25000 || !a.averageSpeed) return false;
  if (!model.pace) return true;
  return paceZoneIndex(model.pace, 1000 / a.averageSpeed) <= 1;
}

// ---------------------------------------------------------------- Par semaine

export type WeekZones = { weekStart: Date; hr: number[]; pace: number[]; sessions: number };

/**
 * Répartition semaine par semaine (lundi local), les `weeks` dernières
 * semaines jusqu'à celle de `now` incluse. Les semaines vides restent
 * présentes : un trou est une information.
 */
export function weeklyZones(
  runs: Array<ActivityForZones & { startDate: Date }>,
  model: ZoneModel,
  weeks: number,
  now: Date
): WeekZones[] {
  const monday = (d: Date) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  };
  const last = monday(now);
  const out: WeekZones[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = new Date(last);
    ws.setDate(ws.getDate() - 7 * i);
    out.push({ weekStart: ws, hr: [0, 0, 0, 0, 0], pace: [0, 0, 0, 0, 0], sessions: 0 });
  }
  for (const r of runs) {
    const key = monday(r.startDate).getTime();
    const w = out.find((x) => x.weekStart.getTime() === key);
    if (!w) continue;
    const d = addActivity(emptyDistribution(), r, model);
    for (let z = 0; z < 5; z++) {
      w.hr[z] += d.hr[z];
      w.pace[z] += d.pace[z];
    }
    w.sessions++;
  }
  return out;
}

/**
 * Répartition polarisée mois par mois (mois local), en % du temps, pour une
 * dimension donnée. Les mois sans données valent 0 partout (`hours` = 0).
 */
export function monthlyPolar(
  runs: Array<ActivityForZones & { startDate: Date }>,
  model: ZoneModel,
  months: number,
  now: Date,
  dim: "hr" | "pace" = "pace"
): Array<{ monthStart: Date; easy: number; moderate: number; hard: number; hours: number }> {
  const out: Array<{ monthStart: Date; seconds: number[] }> = [];
  for (let i = months - 1; i >= 0; i--) {
    out.push({ monthStart: new Date(now.getFullYear(), now.getMonth() - i, 1), seconds: [0, 0, 0, 0, 0] });
  }
  for (const r of runs) {
    const m = out.find(
      (x) => x.monthStart.getFullYear() === r.startDate.getFullYear() && x.monthStart.getMonth() === r.startDate.getMonth()
    );
    if (!m) continue;
    const d = addActivity(emptyDistribution(), r, model);
    for (let z = 0; z < 5; z++) m.seconds[z] += d[dim][z];
  }
  return out.map((m) => {
    const p = polarized(m.seconds);
    const [easy, moderate, hard] = percents([p.low, p.mid, p.high]);
    const total = m.seconds.reduce((a, b) => a + b, 0);
    return { monthStart: m.monthStart, easy, moderate, hard, hours: Math.round((total / 3600) * 10) / 10 };
  });
}
