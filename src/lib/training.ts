/**
 * Moteur d'entraînement : faisabilité, progression, composition des semaines,
 * réadaptation.
 *
 * Trois principes tiennent tout le fichier :
 *
 * 1. **On part toujours d'où on est.** La semaine 1 vaut le volume actuel,
 *    jamais le volume « nécessaire » pour l'objectif. Un coureur à 35 km/sem
 *    qui vise 100 km commence à 35, pas à 80.
 *
 * 2. **La progression est plafonnée.** +8 %/semaine au maximum, et jamais plus
 *    de +8 km d'un coup, décharge toutes les 3-4 semaines. Le pic du plan est
 *    donc *calculé*, pas décrété : si la date ne laisse pas le temps
 *    d'atteindre le volume idéal, le plan vise ce qui est atteignable et le dit
 *    en une ligne, avec des chiffres.
 *
 * 3. **Le plan se corrige en route.** Douleur, fatigue, semaines ratées,
 *    disponibilité : chaque signal module le volume et l'intensité des semaines
 *    suivantes plutôt que de laisser dériver un plan théorique.
 */

import { pacePerKm } from "./format";
import { addDays, daysBetween, round, startOfWeek, type ActivityLike } from "./stats";
import {
  buildWorkout,
  clamp,
  isQuality,
  isRun,
  paceSet,
  type PaceSet,
  type SessionKind,
  type Workout,
} from "./workouts";

// ---------------------------------------------------------------- Constantes

/** Progression hebdomadaire maximale par défaut (fraction). */
export const DEFAULT_RAMP = 0.08;
/** Marche absolue maximale entre deux semaines, en km. */
export const MAX_STEP_KM = 8;
/** Une semaine sur `DELOAD_EVERY` est allégée. */
export const DELOAD_EVERY = 4;
export const DELOAD_FACTOR = 0.72;

export type Phase = "base" | "build" | "peak" | "deload" | "taper" | "race";

export const PHASE_LABELS: Record<Phase, string> = {
  base: "Base",
  build: "Développement",
  peak: "Spécifique",
  deload: "Décharge",
  taper: "Affûtage",
  race: "Course",
};

/** Couleur de chaque phase, partagée par tous les graphiques de plan. */
export const PHASE_COLOR: Record<string, string> = {
  base: "rgb(var(--slate))",
  build: "rgb(var(--sage))",
  peak: "rgb(var(--clay))",
  deload: "rgb(var(--hair-strong))",
  taper: "rgb(var(--ochre))",
  race: "rgb(var(--rust))",
};

// ---------------------------------------------------------------- Forme actuelle

export type CurrentFitness = {
  /** Volume hebdo de référence (km) — médiane haute des 6 dernières semaines */
  weeklyKm: number;
  /** Moyenne brute des 4 dernières semaines, pour comparaison */
  weeklyKm4w: number;
  longestRunKm: number;
  sessionsPerWeek: number;
  /** Semaines avec au moins une sortie sur les 8 dernières */
  consistency: number;
  avgPace: number | null;
  weeklyHistory: number[];
  /** true si moins de 3 semaines de données exploitables */
  thin: boolean;
};

/**
 * Photographie de la forme actuelle.
 *
 * On ne prend pas la moyenne brute : une semaine à 0 (maladie, vacances) tire
 * la référence vers le bas et le plan repartirait trop bas. On prend la
 * médiane des 6 dernières semaines en ignorant les semaines vides, ce qui
 * reflète mieux « ce que je fais quand je m'entraîne ».
 */
export function currentFitness(
  runs: ActivityLike[],
  now = new Date(),
  weeks = 6
): CurrentFitness {
  const monday = startOfWeek(now);
  const history: number[] = [];

  // On exclut la semaine en cours : elle est incomplète par construction.
  for (let i = weeks; i >= 1; i--) {
    const start = addDays(monday, -7 * i);
    const end = addDays(start, 7);
    const km =
      runs
        .filter((r) => r.startDate >= start && r.startDate < end)
        .reduce((a, r) => a + r.distance, 0) / 1000;
    history.push(round(km, 1));
  }

  const active = history.filter((k) => k > 0.5);
  const weeklyKm = active.length ? round(median(active), 1) : 0;

  const last4 = history.slice(-4);
  const weeklyKm4w = round(last4.reduce((a, b) => a + b, 0) / Math.max(1, last4.length), 1);

  const last8w = runs.filter((r) => daysBetween(r.startDate, now) <= 56);
  const longestRunKm = round(Math.max(0, ...last8w.map((r) => r.distance)) / 1000, 1);

  const activeWeeks = history.filter((k) => k > 0.5).length;
  const sessionsPerWeek = activeWeeks
    ? round(
        runs.filter((r) => daysBetween(r.startDate, now) <= weeks * 7).length / activeWeeks,
        1
      )
    : 0;

  const totalM = last8w.reduce((a, r) => a + r.distance, 0);
  const totalS = last8w.reduce((a, r) => a + r.movingTime, 0);

  return {
    weeklyKm,
    weeklyKm4w,
    longestRunKm,
    sessionsPerWeek,
    consistency: round((activeWeeks / weeks) * 100, 0),
    avgPace: totalM > 1000 ? round(pacePerKm(totalM, totalS), 0) : null,
    weeklyHistory: history,
    thin: active.length < 3,
  };
}

// ---------------------------------------------------------------- Cibles par distance

type VolumeTarget = { km: number; min: number; ideal: number; longRun: number };

/**
 * Volume hebdomadaire et sortie longue de référence par distance de course.
 * `min` = plancher pour finir correctement, `ideal` = pour performer.
 * Valeurs de terrain, interpolées linéairement entre les points.
 */
const VOLUME_TABLE: VolumeTarget[] = [
  { km: 5, min: 25, ideal: 45, longRun: 12 },
  { km: 10, min: 30, ideal: 55, longRun: 16 },
  { km: 21.1, min: 40, ideal: 70, longRun: 22 },
  { km: 42.2, min: 55, ideal: 85, longRun: 32 },
  { km: 60, min: 65, ideal: 95, longRun: 38 },
  { km: 100, min: 80, ideal: 115, longRun: 45 },
  { km: 160, min: 95, ideal: 130, longRun: 50 },
];

export function volumeTargetFor(raceKm: number): VolumeTarget {
  const t = VOLUME_TABLE;
  if (raceKm <= t[0].km) return { ...t[0], km: raceKm };
  if (raceKm >= t[t.length - 1].km) return { ...t[t.length - 1], km: raceKm };
  for (let i = 0; i < t.length - 1; i++) {
    const a = t[i];
    const b = t[i + 1];
    if (raceKm >= a.km && raceKm <= b.km) {
      const f = (raceKm - a.km) / (b.km - a.km);
      return {
        km: raceKm,
        min: round(a.min + (b.min - a.min) * f, 0),
        ideal: round(a.ideal + (b.ideal - a.ideal) * f, 0),
        longRun: round(a.longRun + (b.longRun - a.longRun) * f, 0),
      };
    }
  }
  return { ...t[0], km: raceKm };
}

// ---------------------------------------------------------------- Volumes hebdo

export type WeekVolume = {
  weekNumber: number;
  weekStart: Date;
  phase: Phase;
  km: number;
  /** Volume de référence de la dernière semaine de charge (hors décharge) */
  buildKm: number;
};

export type VolumeOptions = {
  startKm: number;
  /** Pic visé ; la fonction ne le dépassera jamais mais peut rester en dessous */
  targetPeakKm: number;
  weeks: number;
  startMonday: Date;
  rampPct?: number;
  maxStepKm?: number;
  deloadEvery?: number;
  /** Nombre de semaines d'affûtage (0 pour un plan sans course) */
  taperWeeks?: number;
  /** Plafond absolu voulu par l'athlète (0 = aucun) */
  ceilingKm?: number;
};

/**
 * Série de volumes hebdomadaires.
 *
 * C'est *la* fonction qui empêche le plan de sauter de 35 à 80 km : chaque
 * semaine est bornée par la précédente (+ramp %, +maxStep km), donc le pic
 * réellement atteignable est une conséquence du temps disponible.
 */
export function weeklyVolumes(opts: VolumeOptions): WeekVolume[] {
  const ramp = opts.rampPct ?? DEFAULT_RAMP;
  const maxStep = opts.maxStepKm ?? MAX_STEP_KM;
  const deloadEvery = opts.deloadEvery ?? DELOAD_EVERY;
  const taperWeeks = opts.taperWeeks ?? 0;
  const ceiling = opts.ceilingKm && opts.ceilingKm > 0 ? opts.ceilingKm : Infinity;

  const weeks = Math.max(1, Math.round(opts.weeks));
  const hardCap = Math.min(opts.targetPeakKm, ceiling);

  const out: WeekVolume[] = [];
  let buildKm = Math.max(1, opts.startKm);
  let peakSoFar = buildKm;

  for (let i = 0; i < weeks; i++) {
    const weekNumber = i + 1;
    const weekStart = addDays(opts.startMonday, i * 7);
    const weeksToEnd = weeks - weekNumber; // 0 = dernière semaine

    let phase: Phase;
    let km: number;

    if (taperWeeks > 0 && weeksToEnd < taperWeeks) {
      // Affûtage : on redescend depuis le pic atteint, pas depuis un idéal.
      const stepsFromEnd = weeksToEnd; // 0 = semaine de course
      phase = stepsFromEnd === 0 ? "race" : "taper";
      const taperCurve = [0.35, 0.6, 0.75, 0.85];
      km = peakSoFar * (taperCurve[Math.min(stepsFromEnd, taperCurve.length - 1)] ?? 0.85);
    } else if (i > 0 && weekNumber % deloadEvery === 0) {
      phase = "deload";
      km = buildKm * DELOAD_FACTOR;
    } else {
      if (i === 0) {
        km = buildKm;
      } else {
        const byRamp = buildKm * (1 + ramp);
        const byStep = buildKm + maxStep;
        km = Math.min(byRamp, byStep, hardCap);
      }
      buildKm = km;
      peakSoFar = Math.max(peakSoFar, km);
      const progress = weeks > 1 ? weekNumber / Math.max(1, weeks - taperWeeks) : 1;
      phase = progress <= 0.4 ? "base" : progress <= 0.75 ? "build" : "peak";
    }

    out.push({
      weekNumber,
      weekStart,
      phase,
      km: round(km, 1),
      buildKm: round(buildKm, 1),
    });
  }

  return out;
}

/** Pic réellement atteignable en `weeks` semaines depuis `startKm`. */
export function reachablePeak(
  startKm: number,
  weeks: number,
  opts: { rampPct?: number; maxStepKm?: number; deloadEvery?: number; taperWeeks?: number } = {}
): number {
  const series = weeklyVolumes({
    startKm,
    targetPeakKm: Infinity,
    weeks,
    startMonday: new Date(),
    ...opts,
  });
  return round(Math.max(...series.map((w) => w.km)), 1);
}

/** Nombre de semaines nécessaires pour passer de `startKm` à `targetKm`. */
export function weeksToReach(
  startKm: number,
  targetKm: number,
  opts: { rampPct?: number; maxStepKm?: number; deloadEvery?: number } = {}
): number {
  if (targetKm <= startKm) return 1;
  for (let w = 1; w <= 260; w++) {
    if (reachablePeak(startKm, w, { ...opts, taperWeeks: 0 }) >= targetKm) return w;
  }
  return 260;
}

/**
 * Cadence de progression "juste assez rapide".
 *
 * Monter au maximum autorisé quand on a un an devant soi n'a aucun intérêt :
 * on atteindrait le pic au bout de quatre mois puis on stagnerait. On calcule
 * donc le taux qui fait arriver au pic quelques semaines avant l'affûtage,
 * borné par le plafond de sécurité.
 */
export function paceRamp(opts: {
  startKm: number;
  targetPeakKm: number;
  weeks: number;
  taperWeeks: number;
  maxRamp: number;
}): number {
  const { startKm, targetPeakKm, weeks, taperWeeks, maxRamp } = opts;
  if (!isFinite(targetPeakKm) || targetPeakKm <= startKm || startKm <= 0) {
    return Math.min(maxRamp, 0.04);
  }
  // Semaines o\u00f9 le volume monte réellement : hors affûtage, hors décharges,
  // et en gardant 4 semaines de plateau spécifique avant l'affûtage.
  const plateau = Math.min(5, Math.max(0, Math.floor((weeks - taperWeeks) * 0.15)));
  const rising = Math.max(1, (weeks - taperWeeks - plateau) * (1 - 1 / DELOAD_EVERY));
  const needed = Math.pow(targetPeakKm / startKm, 1 / rising) - 1;
  return clamp(needed, 0.005, maxRamp);
}

// ---------------------------------------------------------------- Faisabilité

export type FeasibilityLevel =
  | "comfortable"
  | "realistic"
  | "demanding"
  | "hard"
  | "unreachable";

export type Feasibility = {
  level: FeasibilityLevel;
  label: string;
  /** 0 → 1+ : marge de temps disponible vs temps nécessaire */
  ratio: number;
  currentWeeklyKm: number;
  /** Volume hebdo de référence pour tenir la distance */
  requiredPeakKm: number;
  /** Volume idéal pour performer (pas seulement finir) */
  idealPeakKm: number;
  /** Ce que la progression permet réellement d'atteindre d'ici la date */
  reachablePeakKm: number;
  availableWeeks: number;
  /** Semaines nécessaires pour atteindre `requiredPeakKm` + affûtage */
  neededWeeks: number;
  /** Progression hebdo moyenne qu'impose l'objectif (%) */
  requiredRampPct: number;
  /** Date à laquelle l'objectif deviendrait « réaliste » */
  comfortableDate: Date | null;
  /** Sortie longue de référence */
  requiredLongRunKm: number;
  currentLongRunKm: number;
  /** Le plan vise moins que l'idéal parce que le temps manque */
  capped: boolean;
  /** 2-4 lignes factuelles, chiffrées, sans commentaire moral */
  facts: string[];
};

const LEVEL_LABELS: Record<FeasibilityLevel, string> = {
  comfortable: "Large",
  realistic: "Réaliste",
  demanding: "Exigeant",
  hard: "Très exigeant",
  unreachable: "Hors délai",
};

/**
 * Évalue la difficulté d'un objectif — en chiffres.
 *
 * Volontairement sans sermon : l'athlète sait qu'un 100 km est dur. Ce qui
 * l'intéresse, c'est le delta entre son volume actuel et celui qu'il faudrait,
 * le temps disponible, et la date à laquelle ça deviendrait confortable.
 */
export function assessFeasibility(input: {
  raceKm: number;
  raceDate: Date;
  fitness: CurrentFitness;
  now?: Date;
  rampPct?: number;
  ceilingKm?: number;
}): Feasibility {
  const now = input.now ?? new Date();
  const ramp = input.rampPct ?? DEFAULT_RAMP;
  const target = volumeTargetFor(input.raceKm);

  const availableWeeks = Math.max(
    0,
    Math.floor(daysBetween(now, input.raceDate) / 7)
  );
  const startKm = Math.max(5, input.fitness.weeklyKm || input.fitness.weeklyKm4w || 10);

  const taper = input.raceKm >= 30 ? 3 : 2;
  const requiredPeak = target.min;
  const idealPeak = target.ideal;

  const reachable =
    availableWeeks > 0
      ? Math.min(
          reachablePeak(startKm, availableWeeks, { rampPct: ramp, taperWeeks: taper }),
          input.ceilingKm && input.ceilingKm > 0 ? input.ceilingKm : idealPeak
        )
      : startKm;

  // Le temps nécessaire ne se résume pas à la montée en volume : la sortie
  // longue progresse plus lentement (~+1,5 km/sem décharges déduites), et il
  // faut ensuite tenir le volume cible quelques semaines pour que l'adaptation
  // serve à quelque chose. Un plan qui atteint le pic la veille de la course
  // n'a préparé personne.
  const rampWeeks = weeksToReach(startKm, requiredPeak, { rampPct: ramp });
  const longRunWeeks = Math.max(
    0,
    Math.ceil((target.longRun - Math.max(5, input.fitness.longestRunKm)) / 1.5)
  );
  const consolidation =
    input.raceKm >= 60 ? 10 : input.raceKm >= 42 ? 8 : input.raceKm >= 21 ? 6 : 4;

  const neededWeeks = Math.max(rampWeeks, longRunWeeks) + consolidation + taper;
  const ratio = neededWeeks > 0 ? round(availableWeeks / neededWeeks, 2) : 0;

  const level: FeasibilityLevel =
    availableWeeks < 2
      ? "unreachable"
      : ratio >= 1.5
        ? "comfortable"
        : ratio >= 1.05
          ? "realistic"
          : ratio >= 0.82
            ? "demanding"
            : ratio >= 0.58
              ? "hard"
              : "unreachable";

  // Progression hebdo moyenne qu'imposerait l'objectif
  const buildWeeks = Math.max(1, availableWeeks - taper);
  const requiredRamp =
    startKm > 0 && buildWeeks > 0
      ? (Math.pow(requiredPeak / startKm, 1 / buildWeeks) - 1) * 100
      : 0;

  const comfortableDate =
    availableWeeks < neededWeeks
      ? addDays(startOfWeek(now), neededWeeks * 7)
      : null;

  const facts: string[] = [];
  facts.push(
    `${round(startKm, 0)} → ${requiredPeak} km/sem en ${availableWeeks} semaines · +${round(requiredRamp, 1)} %/sem (plafond ${round(ramp * 100, 0)} %)`
  );
  facts.push(
    `Temps nécessaire estimé : ${neededWeeks} semaines — montée en volume ${rampWeeks}, spécifique ${consolidation}, affûtage ${taper}`
  );
  facts.push(
    `Sortie longue : ${input.fitness.longestRunKm} km aujourd'hui, ${target.longRun} km à terme`
  );
  if (reachable < requiredPeak) {
    facts.push(
      `Volume atteignable d'ici là : ${reachable} km/sem — le plan vise ce chiffre, pas ${requiredPeak}`
    );
  } else if (reachable < idealPeak) {
    facts.push(`Atteignable : ${reachable} km/sem (confort de performance à ${idealPeak})`);
  }
  if (comfortableDate) {
    facts.push(
      `Même préparation sans compression : ${comfortableDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`
    );
  }

  return {
    level,
    label: LEVEL_LABELS[level],
    ratio,
    currentWeeklyKm: round(startKm, 1),
    requiredPeakKm: requiredPeak,
    idealPeakKm: idealPeak,
    reachablePeakKm: reachable,
    availableWeeks,
    neededWeeks,
    requiredRampPct: round(requiredRamp, 1),
    comfortableDate,
    requiredLongRunKm: target.longRun,
    currentLongRunKm: input.fitness.longestRunKm,
    capped: reachable < idealPeak,
    facts,
  };
}

// ---------------------------------------------------------------- Plans libres

export type OpenFocus = "base" | "endurance" | "speed" | "maintain" | "comeback" | "hills";

export type FocusPreset = {
  key: OpenFocus;
  name: string;
  /** Une phrase : ce que ça développe, concrètement */
  intent: string;
  /** Progression hebdo (fraction) */
  ramp: number;
  /** Plafond de volume relatif au volume de départ */
  ceilingFactor: number;
  /** Séances de qualité par semaine selon la phase */
  quality: { base: number; build: number; peak: number };
  /** Part du volume dans la sortie longue */
  longShare: number;
  /** Types de qualité privilégiés, dans l'ordre de préférence */
  qualityKinds: SessionKind[];
  /** Renforcement conseillé par semaine */
  strength: number;
};

export const FOCUS_PRESETS: Record<OpenFocus, FocusPreset> = {
  base: {
    key: "base",
    name: "Construire la base",
    intent: "Plus de volume facile, une touche de qualité. La fondation de tout le reste.",
    ramp: 0.06,
    ceilingFactor: 1.7,
    quality: { base: 1, build: 1, peak: 2 },
    longShare: 0.28,
    qualityKinds: ["strides", "fartlek", "threshold", "hills"],
    strength: 1,
  },
  endurance: {
    key: "endurance",
    name: "Allonger la sortie longue",
    intent: "La sortie longue grandit chaque semaine, le reste sert à la digérer.",
    ramp: 0.07,
    ceilingFactor: 1.8,
    quality: { base: 1, build: 1, peak: 2 },
    longShare: 0.34,
    qualityKinds: ["tempo", "threshold", "hills", "fartlek"],
    strength: 1,
  },
  speed: {
    key: "speed",
    name: "Gagner en vitesse",
    intent: "Volume stable, deux séances de qualité : seuil et VO2max.",
    ramp: 0.03,
    ceilingFactor: 1.25,
    quality: { base: 1, build: 2, peak: 2 },
    longShare: 0.24,
    qualityKinds: ["intervals", "threshold", "hills", "fartlek"],
    strength: 1,
  },
  maintain: {
    key: "maintain",
    name: "Entretien",
    intent: "Garder le niveau avec le minimum : volume plat, une séance de rappel.",
    ramp: 0,
    ceilingFactor: 1.05,
    quality: { base: 1, build: 1, peak: 1 },
    longShare: 0.3,
    qualityKinds: ["fartlek", "threshold", "strides"],
    strength: 1,
  },
  comeback: {
    key: "comeback",
    name: "Reprise",
    intent: "Retour progressif après coupure ou blessure. Aucune intensité avant 3 semaines.",
    ramp: 0.1,
    ceilingFactor: 2.2,
    quality: { base: 0, build: 1, peak: 1 },
    longShare: 0.26,
    qualityKinds: ["strides", "fartlek"],
    strength: 2,
  },
  hills: {
    key: "hills",
    name: "Dénivelé / trail",
    intent: "Côtes, sorties longues vallonnées, force spécifique.",
    ramp: 0.06,
    ceilingFactor: 1.6,
    quality: { base: 1, build: 2, peak: 2 },
    longShare: 0.32,
    qualityKinds: ["hills", "tempo", "fartlek", "threshold"],
    strength: 2,
  },
};

// ---------------------------------------------------------------- Layout semaine

export type DayRole = "quality" | "long" | "easy" | "recovery" | "rest";

/**
 * Répartit les jours d'entraînement de la semaine.
 * Règles : jamais deux qualités consécutives, jamais de qualité la veille de
 * la sortie longue, repos placé après la séance la plus dure.
 */
export function weekLayout(
  daysPerWeek: number,
  longRunDay: number,
  qualityCount: number
): DayRole[] {
  const days = clamp(daysPerWeek, 2, 7);
  const longDay = clamp(longRunDay, 0, 6);

  const patterns: Record<number, number[]> = {
    2: [1, 5],
    3: [1, 3, 5],
    4: [1, 3, 5, 6],
    5: [1, 2, 4, 5, 6],
    6: [0, 1, 2, 3, 5, 6],
    7: [0, 1, 2, 3, 4, 5, 6],
  };

  const active = new Set(patterns[days] ?? patterns[4]);
  active.add(longDay);
  // Si l'ajout du jour de sortie longue déborde, on retire le jour le plus proche.
  while (active.size > days) {
    const candidates = [...active].filter((d) => d !== longDay);
    candidates.sort(
      (a, b) => circularDist(a, longDay) - circularDist(b, longDay)
    );
    active.delete(candidates[0]);
  }

  const roles: DayRole[] = Array.from({ length: 7 }, () => "rest");
  for (const d of active) roles[d] = "easy";
  roles[longDay] = "long";

  // Placement des qualités : on privilégie les jours les plus éloignés de la
  // sortie longue, puis on vérifie l'espacement entre elles.
  const candidates = [...active]
    .filter((d) => d !== longDay)
    .sort((a, b) => circularDist(b, longDay) - circularDist(a, longDay));

  const placed: number[] = [];
  for (const d of candidates) {
    if (placed.length >= qualityCount) break;
    const tooClose = placed.some((p) => circularDist(p, d) < 2);
    const dayBeforeLong = circularDist(d, longDay) === 1 && d < longDay;
    if (tooClose || dayBeforeLong) continue;
    placed.push(d);
    roles[d] = "quality";
  }

  // Lendemain de sortie longue : récupération si le jour est actif.
  const dayAfterLong = (longDay + 1) % 7;
  if (roles[dayAfterLong] === "easy") roles[dayAfterLong] = "recovery";

  return roles;
}

function circularDist(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 7 - d);
}

/**
 * Volume de départ à partir des semaines déclarées.
 *
 * On prend la médiane des semaines actives, pas la moyenne : une semaine de
 * coupure ou une semaine exceptionnelle ne doit pas décider du point de départ.
 * On borne ensuite par la dernière semaine + 15 %, sinon un athlète qui revient
 * de blessure repart du volume d'avant la blessure.
 */
export function startFromPriorWeeks(weeks: number[]): number | null {
  const active = weeks.filter((k) => k > 0.5);
  if (active.length === 0) return null;
  const sorted = [...active].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const med = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const last = weeks[weeks.length - 1];
  return round(last > 0.5 ? Math.min(med, last * 1.15) : med, 1);
}

/**
 * Crée un plan et matérialise toutes ses séances.
 *
 * Le plan démarre **lundi prochain** : commencer un plan un jeudi produit une
 * première semaine tronquée qui fausse toutes les comparaisons cible/réalisé.
 */

/**
 * Pic de volume à viser pour une course.
 *
 * Deux garde-fous : on ne vise jamais plus que ce qui est réellement
 * atteignable dans le temps disponible, et on ne se contente du plancher que
 * si le temps manque. Avec un an devant soi, viser le minimum syndical serait
 * aussi absurde que viser 100 km/sem dans six semaines.
 */
export function targetPeakFor(f: Feasibility, startKm: number): number {
  const span = Math.max(0, f.idealPeakKm - f.requiredPeakKm);
  // ratio 1.0 → plancher · ratio ≥ 1.8 → volume de performance
  const generosity = clamp((f.ratio - 1) / 0.8, 0, 1);
  const wanted = f.requiredPeakKm + span * generosity;
  return round(Math.max(Math.min(wanted, f.reachablePeakKm), startKm * 1.05), 1);
}

// ---------------------------------------------------------------- Jours auto

/**
 * Nombre de sorties cohérent avec un volume hebdomadaire.
 *
 * On ne choisit pas un nombre de jours puis un volume : c'est le volume qui
 * impose le nombre de sorties. En dessous de 6 km une sortie n'apporte presque
 * rien, au-dessus de ~20 km de moyenne elle devient trop lourde — la table
 * garde la sortie moyenne dans la fourchette 8-13 km.
 */
export function autoDays(weeklyKm: number): number {
  if (weeklyKm < 16) return 3;
  if (weeklyKm < 28) return 4;
  if (weeklyKm < 46) return 5;
  return 6;
}

/**
 * Nombre de sorties de départ : le volume décide, l'historique tempère.
 * Passer de 3 sorties observées à 6 d'un coup est le meilleur moyen de se blesser.
 */
export function suggestDaysPerWeek(f: {
  weeklyKm: number;
  sessionsPerWeek: number;
}): number {
  const byVolume = autoDays(f.weeklyKm);
  const observed = Math.round(f.sessionsPerWeek || 0);
  if (observed <= 0) return byVolume;
  return clamp(byVolume, Math.max(3, observed - 1), observed + 1);
}

/** Jours d'une semaine donnée en mode auto : suit le volume, sans bond. */
export function daysForWeek(weekKm: number, startDays: number): number {
  return clamp(autoDays(weekKm), startDays, Math.min(6, startDays + 2));
}

/** Lecture humaine du réglage auto : « 4 sorties, 5 à partir de la semaine 9 ». */
export function daysSchedule(
  weeks: Array<{ weekNumber: number; km: number }>,
  startDays: number
): Array<{ days: number; fromWeek: number }> {
  // Une décharge ne doit pas créer un faux palier : on ne retient que les
  // hausses durables, en gardant le maximum atteint jusqu'ici.
  const out: Array<{ days: number; fromWeek: number }> = [];
  let peak = 0;
  for (const w of weeks) {
    const d = daysForWeek(w.km, startDays);
    if (d > peak) {
      peak = d;
      out.push({ days: d, fromWeek: w.weekNumber });
    }
  }
  return out;
}

// ---------------------------------------------------------------- Composition

export type PlannedSessionSpec = Workout & {
  date: Date;
  weekStart: Date;
  weekNumber: number;
  phase: Phase;
  adapted: boolean;
  adaptReason: string | null;
};

export type ComposeOptions = {
  week: WeekVolume;
  paces: PaceSet;
  daysPerWeek: number;
  longRunDay: number;
  focus?: FocusPreset;
  raceKm?: number | null;
  /** Sortie longue maximale autorisée (km) */
  longRunCapKm?: number;
  strengthPerWeek?: number;
  adaptation?: Adaptation | null;
  /** Jour de la course, si la semaine contient la course */
  raceDate?: Date | null;
  /** Allure visée le jour J (s/km) */
  racePace?: number | null;
  raceName?: string | null;
};

/**
 * Compose une semaine complète, séance par séance.
 *
 * Le volume hebdo est réparti : sortie longue (part fixée par le focus),
 * séances de qualité (volume total de la séance, échauffement compris),
 * puis le reste en endurance sur les jours restants.
 */
export function composeWeek(opts: ComposeOptions): PlannedSessionSpec[] {
  const { week, paces } = opts;
  const focus = opts.focus ?? FOCUS_PRESETS.base;
  const adapt = opts.adaptation ?? null;

  // La semaine de course ne se compose pas comme les autres : la course elle-même
  // EST la séance, et son kilométrage doit compter dans le volume de la semaine.
  if (opts.raceDate) {
    const idx = dayIndexInWeek(week.weekStart, opts.raceDate);
    if (idx >= 0) return composeRaceWeek(opts, idx);
  }

  const phaseKey: "base" | "build" | "peak" =
    week.phase === "peak" || week.phase === "taper" ? "peak" : week.phase === "build" ? "build" : "base";

  let qualityCount = focus.quality[phaseKey];
  if (week.phase === "deload") qualityCount = Math.min(1, qualityCount);
  if (week.phase === "race") qualityCount = 0;
  if (adapt) qualityCount = Math.min(qualityCount, adapt.qualityCap);

  const days = adapt?.daysOverride ?? opts.daysPerWeek;
  const roles = weekLayout(days, opts.longRunDay, qualityCount);

  const totalKm = week.km;
  const noIntensity = adapt?.dropIntensity ?? false;

  // --- Sortie longue
  // La part du volume consacrée à la sortie longue monte avec la distance visée
  // (jusqu'à 45 % sur ultra) mais reste bornée par la progression autorisée :
  // c'est le plafond `longRunCapKm` qui décide en dernier ressort.
  const ultra = (opts.raceKm ?? 0) >= 55;
  const baseShare = ultra ? Math.max(focus.longShare, 0.45) : focus.longShare;
  const longShare =
    week.phase === "taper" || week.phase === "deload" ? baseShare * 0.85 : baseShare;
  let longKm = totalKm * longShare;
  if (opts.longRunCapKm) longKm = Math.min(longKm, opts.longRunCapKm);
  longKm = Math.max(0, round(longKm, 1));

  // --- Enchaîné sur ultra : une deuxième sortie sur jambes fatiguées vaut mieux
  // qu'une sortie longue unique démesurée.
  const backToBack =
    ultra &&
    (week.phase === "build" || week.phase === "peak") &&
    !adapt?.dropIntensity &&
    opts.daysPerWeek >= 5 &&
    week.weekNumber % 2 === 0;
  const b2bDay = backToBack ? (opts.longRunDay + 1) % 7 : -1;
  const b2bKm = backToBack && roles[b2bDay] !== "rest" ? round(longKm * 0.5, 1) : 0;

  // --- Qualité
  const qualityDays = roles.filter((r) => r === "quality").length;
  const qualityKm = qualityDays > 0 ? (totalKm - longKm - b2bKm) * 0.34 : 0;
  const perQualityKm = qualityDays > 0 ? qualityKm / qualityDays : 0;

  // --- Reste en endurance
  const easyDays = roles.filter(
    (r, i) => (r === "easy" || r === "recovery") && !(b2bKm > 0 && i === b2bDay)
  ).length;
  const easyKm = Math.max(0, totalKm - longKm - b2bKm - qualityKm);
  const perEasyKm = easyDays > 0 ? easyKm / easyDays : 0;

  const specs: PlannedSessionSpec[] = [];
  let qIndex = 0;

  for (let d = 0; d < 7; d++) {
    const role = roles[d];
    const date = addDays(week.weekStart, d);

    if (role === "rest") continue;

    let kind: SessionKind;
    let km: number;

    if (opts.raceDate && sameDay(date, opts.raceDate)) {
      kind = "race";
      km = opts.raceKm ?? 0;
    } else if (role === "long") {
      kind = "long";
      km = longKm;
    } else if (b2bKm > 0 && d === b2bDay) {
      kind = "long";
      km = b2bKm;
    } else if (role === "quality") {
      kind = pickQuality(focus, week, qIndex, noIntensity, opts.raceKm ?? null);
      km = perQualityKm;
      qIndex++;
    } else if (role === "recovery") {
      kind = "recovery";
      km = perEasyKm * 0.8;
    } else {
      kind = "easy";
      km = perEasyKm;
    }

    if (km < 2 && isRun(kind) && kind !== "race") continue;

    const workout = buildWorkout(kind, {
      km,
      paces,
      phase: week.phase,
      weekNumber: week.weekNumber,
      raceKm: opts.raceKm,
      noIntensity,
    });

    specs.push({
      ...workout,
      date,
      weekStart: week.weekStart,
      weekNumber: week.weekNumber,
      phase: week.phase,
      adapted: Boolean(adapt),
      adaptReason: adapt?.reasons[0] ?? null,
    });
  }

  // --- Renforcement : posé sur les jours sans course ou après une qualité
  const strengthCount = adapt?.dropIntensity
    ? Math.max(opts.strengthPerWeek ?? 0, focus.strength)
    : opts.strengthPerWeek ?? 0;

  if (strengthCount > 0) {
    // Priorité aux vrais jours off : le renfo y coûte le moins cher.
    const restDays = roles
      .map((r, i) => ({ r, i }))
      .filter(({ r, i }) => (r === "rest" || r === "easy") && circularDist(i, opts.longRunDay) > 1)
      .sort((a, b) => (a.r === "rest" ? 0 : 1) - (b.r === "rest" ? 0 : 1))
      .map(({ i }) => i);
    for (let i = 0; i < Math.min(strengthCount, restDays.length); i++) {
      const d = restDays[i];
      const w = buildWorkout("strength", {
        km: 0,
        paces,
        phase: week.phase,
        weekNumber: week.weekNumber,
      });
      specs.push({
        ...w,
        date: addDays(week.weekStart, d),
        weekStart: week.weekStart,
        weekNumber: week.weekNumber,
        phase: week.phase,
        adapted: false,
        adaptReason: null,
      });
    }
  }

  // Si la douleur impose une mise au repos partielle, on remplace une séance
  // de course par du cross-training plutôt que de supprimer la journée.
  if (adapt?.crossTrain) {
    const idx = specs.findIndex((s) => s.kind === "easy");
    if (idx >= 0) {
      const w = buildWorkout("cross", {
        km: 0,
        paces,
        phase: week.phase,
        weekNumber: week.weekNumber,
      });
      specs[idx] = { ...specs[idx], ...w, adapted: true, adaptReason: adapt.reasons[0] ?? null };
    }
  }

  return specs.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function pickQuality(
  focus: FocusPreset,
  week: WeekVolume,
  index: number,
  noIntensity: boolean,
  raceKm: number | null
): SessionKind {
  if (noIntensity) return "easy";

  let pool = [...focus.qualityKinds];

  // Spécificité course : plus on approche, plus la qualité ressemble à la course.
  if (raceKm) {
    if (raceKm <= 10) pool = ["intervals", "threshold", "hills", "fartlek"];
    else if (raceKm <= 21.1) pool = ["threshold", "intervals", "tempo", "hills"];
    else pool = ["tempo", "threshold", "hills", "fartlek"];
    if (week.phase === "peak" || week.phase === "taper") {
      pool = raceKm >= 30 ? ["tempo", "threshold"] : ["threshold", "intervals"];
    }
    if (week.phase === "base") pool = ["strides", "fartlek", "hills", "threshold"];
  }

  if (week.phase === "deload") pool = pool.filter((k) => k !== "intervals");
  if (pool.length === 0) pool = ["fartlek"];

  // Rotation stable : la séance change d'une semaine à l'autre sans aléatoire
  // (un plan doit être reproductible).
  return pool[(week.weekNumber + index) % pool.length];
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ---------------------------------------------------------------- Réadaptation

export type Checkin = {
  /** 0 = rien · 1 = gêne · 2 = douleur qui gêne la course · 3 = douleur qui empêche */
  painLevel: number;
  painArea?: string | null;
  /** 1 = frais … 5 = vidé */
  fatigue: number;
  /** 1 = aucune envie … 5 = à fond */
  motivation: number;
  /** 1 = très mauvais … 5 = excellent */
  sleep: number;
  availableDays?: number | null;
};

export type Adaptation = {
  /** Multiplicateur appliqué au volume des semaines suivantes */
  volumeFactor: number;
  /** Nombre maximal de séances de qualité */
  qualityCap: number;
  /** Aucune intensité du tout */
  dropIntensity: boolean;
  /** Gèle la progression : la semaine suivante ne monte pas */
  holdProgression: boolean;
  /** Remplace une séance de course par du cross-training */
  crossTrain: boolean;
  /** Force un nombre de jours différent */
  daysOverride: number | null;
  tone: "push" | "normal" | "ease" | "hold" | "stop";
  /** Explications courtes, factuelles */
  reasons: string[];
  /** Résumé en une ligne pour l'interface */
  headline: string;
};

export const NEUTRAL_ADAPTATION: Adaptation = {
  volumeFactor: 1,
  qualityCap: 9,
  dropIntensity: false,
  holdProgression: false,
  crossTrain: false,
  daysOverride: null,
  tone: "normal",
  reasons: [],
  headline: "Semaine inchangée",
};

/**
 * Décide de l'ajustement de la semaine à venir.
 *
 * L'ordre compte : la douleur prime sur tout, la fatigue ensuite, l'assiduité
 * en dernier. Et une semaine parfaitement réalisée avec un bon ressenti permet
 * d'aller un peu plus vite que le plan initial — l'adaptation marche dans les
 * deux sens.
 */
export function planAdaptation(input: {
  checkin?: Checkin | null;
  /** Ratio km réalisés / km planifiés la semaine écoulée (1 = pile) */
  compliance?: number | null;
  /** ACWR courant, si disponible */
  acwr?: number | null;
  /** Douleurs signalées en fin de séance sur les 10 derniers jours */
  recentPainFlags?: number;
}): Adaptation {
  const a: Adaptation = { ...NEUTRAL_ADAPTATION, reasons: [] };
  const c = input.checkin;

  // --- Douleur
  if (c) {
    if (c.painLevel >= 3) {
      a.volumeFactor = 0.45;
      a.qualityCap = 0;
      a.dropIntensity = true;
      a.crossTrain = true;
      a.holdProgression = true;
      a.tone = "stop";
      a.reasons.push(
        `Douleur bloquante${c.painArea ? ` (${c.painArea})` : ""} — volume −55 %, intensité retirée, une séance remplacée par du cross`
      );
    } else if (c.painLevel === 2) {
      a.volumeFactor = 0.7;
      a.qualityCap = 0;
      a.dropIntensity = true;
      a.holdProgression = true;
      a.tone = "ease";
      a.reasons.push(
        `Douleur à la course${c.painArea ? ` (${c.painArea})` : ""} — volume −30 %, intensité retirée`
      );
    } else if (c.painLevel === 1) {
      a.volumeFactor = 0.9;
      a.qualityCap = 1;
      a.holdProgression = true;
      a.tone = "ease";
      a.reasons.push(
        `Gêne signalée${c.painArea ? ` (${c.painArea})` : ""} — volume −10 %, une seule séance de qualité`
      );
    }

    // --- Fatigue / sommeil
    if (c.painLevel < 2) {
      if (c.fatigue >= 5) {
        a.volumeFactor = Math.min(a.volumeFactor, 0.75);
        a.qualityCap = Math.min(a.qualityCap, 1);
        a.holdProgression = true;
        a.tone = a.tone === "normal" ? "ease" : a.tone;
        a.reasons.push("Fatigue élevée — volume −25 %, qualité limitée à 1");
      } else if (c.fatigue === 4) {
        a.volumeFactor = Math.min(a.volumeFactor, 0.88);
        a.qualityCap = Math.min(a.qualityCap, 1);
        a.tone = a.tone === "normal" ? "ease" : a.tone;
        a.reasons.push("Fatigue marquée — volume −12 %");
      }
      if (c.sleep <= 2) {
        a.qualityCap = Math.min(a.qualityCap, 1);
        a.reasons.push("Sommeil dégradé — une séance dure de moins");
      }
    }

    // --- Motivation : on garde la fréquence, on raccourcit
    if (c.motivation <= 2 && c.painLevel < 2) {
      a.volumeFactor = Math.min(a.volumeFactor, 0.85);
      a.reasons.push("Motivation basse — séances raccourcies, fréquence conservée");
    }

    // --- Disponibilité
    if (c.availableDays && c.availableDays > 0) {
      a.daysOverride = clamp(c.availableDays, 2, 7);
      a.reasons.push(`${c.availableDays} jours disponibles — semaine redistribuée`);
    }
  }

  // --- Assiduité mesurée
  const compliance = input.compliance;
  if (compliance !== null && compliance !== undefined) {
    if (compliance < 0.6) {
      a.volumeFactor = Math.min(a.volumeFactor, 0.85);
      a.holdProgression = true;
      a.tone = a.tone === "normal" ? "hold" : a.tone;
      a.reasons.push(
        `${Math.round(compliance * 100)} % du volume prévu réalisé — progression gelée, cible ramenée au réel`
      );
    } else if (compliance < 0.85) {
      a.holdProgression = true;
      a.tone = a.tone === "normal" ? "hold" : a.tone;
      a.reasons.push(
        `${Math.round(compliance * 100)} % du volume prévu — on reste au même volume une semaine de plus`
      );
    } else if (
      compliance >= 0.97 &&
      c &&
      c.painLevel === 0 &&
      c.fatigue <= 2 &&
      c.motivation >= 4
    ) {
      a.volumeFactor = 1.04;
      a.tone = "push";
      a.reasons.push("Semaine bouclée, ressenti frais — +4 % sur le volume");
    }
  }

  // --- Charge aiguë/chronique
  if (input.acwr && input.acwr > 1.45 && a.tone !== "stop") {
    a.volumeFactor = Math.min(a.volumeFactor, 0.85);
    a.holdProgression = true;
    a.tone = a.tone === "normal" || a.tone === "push" ? "ease" : a.tone;
    a.reasons.push(`Charge aiguë à ${input.acwr.toFixed(2)} × la charge chronique — volume −15 %`);
  }

  if (input.recentPainFlags && input.recentPainFlags >= 2 && a.volumeFactor > 0.85) {
    a.volumeFactor = 0.85;
    a.qualityCap = Math.min(a.qualityCap, 1);
    a.reasons.push(`${input.recentPainFlags} séances terminées avec une douleur — volume −15 %`);
  }

  a.headline = buildHeadline(a);
  return a;
}

function buildHeadline(a: Adaptation): string {
  if (a.reasons.length === 0) return "Semaine inchangée";
  const delta = Math.round((a.volumeFactor - 1) * 100);
  const bits: string[] = [];
  // Le signe moins typographique (−) pour rester cohérent avec les raisons
  if (delta !== 0) bits.push(`${delta > 0 ? "+" : "−"}${Math.abs(delta)} % de volume`);
  if (a.dropIntensity) bits.push("sans intensité");
  else if (a.qualityCap <= 1) bits.push("1 séance de qualité");
  if (a.holdProgression && delta === 0) bits.push("progression en pause");
  return bits.length ? bits.join(" · ") : "Ajustement mineur";
}

export const TONE_STYLE: Record<Adaptation["tone"], string> = {
  push: "text-sage",
  normal: "text-ink2",
  ease: "text-ochre",
  hold: "text-slate",
  stop: "text-rust",
};

// ---------------------------------------------------------------- Assiduité

export type Compliance = {
  plannedKm: number;
  doneKm: number;
  ratio: number;
  sessionsPlanned: number;
  sessionsDone: number;
  sessionsSkipped: number;
};

export function weekCompliance(
  sessions: Array<{ distanceKm: number; status: string; kind: string }>,
  actualKm: number
): Compliance {
  const runs = sessions.filter((s) => isRun(s.kind as SessionKind));
  const plannedKm = round(runs.reduce((a, s) => a + s.distanceKm, 0), 1);
  const done = runs.filter((s) => s.status === "done").length;
  const skipped = runs.filter((s) => s.status === "skipped").length;

  return {
    plannedKm,
    doneKm: round(actualKm, 1),
    ratio: plannedKm > 0 ? round(actualKm / plannedKm, 2) : 1,
    sessionsPlanned: runs.length,
    sessionsDone: done,
    sessionsSkipped: skipped,
  };
}

// ---------------------------------------------------------------- Plan complet

export type PlanBlueprint = {
  weeks: WeekVolume[];
  sessions: PlannedSessionSpec[];
  peakKm: number;
  totalKm: number;
  /** Progression de la sortie longue, semaine par semaine */
  longRunPeakKm: number;
  /** Sorties/semaine au démarrage */
  daysStart: number;
  /** true si le nombre de sorties suit automatiquement le volume */
  daysAuto: boolean;
  /** Paliers d'augmentation du nombre de sorties (mode auto) */
  daysSteps: Array<{ days: number; fromWeek: number }>;
};

export type BlueprintInput = {
  mode: "race" | "open";
  focus: OpenFocus;
  startMonday: Date;
  weeks: number;
  startWeeklyKm: number;
  targetPeakKm: number;
  daysPerWeek: number;
  longRunDay: number;
  strengthPerWeek?: number;
  ceilingKm?: number;
  rampPct?: number;
  vdot?: number;
  fallbackPace?: number | null;
  raceKm?: number | null;
  raceDate?: Date | null;
  /** Allure visée le jour J (s/km), déduite du chrono objectif */
  racePace?: number | null;
  raceName?: string | null;
  /** Séances/semaine réellement observées, pour calibrer le mode auto */
  observedSessionsPerWeek?: number;
  /** Sortie longue de départ, pour ne pas la faire bondir non plus */
  currentLongRunKm?: number;
  adaptation?: Adaptation | null;
};

/**
 * Construit le plan complet, semaine par semaine puis séance par séance.
 * Fonction pure : la persistance est gérée dans `plan-store.ts`.
 */
export function buildBlueprint(input: BlueprintInput): PlanBlueprint {
  const focus = FOCUS_PRESETS[input.focus] ?? FOCUS_PRESETS.base;
  const maxRamp = input.rampPct ?? focus.ramp ?? DEFAULT_RAMP;
  const adapt = input.adaptation ?? null;

  const taperWeeks =
    input.mode === "race" ? (input.raceKm && input.raceKm >= 30 ? 3 : 2) : 0;

  const ceiling =
    input.ceilingKm && input.ceilingKm > 0
      ? input.ceilingKm
      : input.mode === "open"
        ? input.startWeeklyKm * focus.ceilingFactor
        : 0;

  const ramp = paceRamp({
    startKm: input.startWeeklyKm,
    targetPeakKm: Math.min(
      input.targetPeakKm,
      ceiling > 0 ? ceiling : Number.POSITIVE_INFINITY
    ),
    weeks: input.weeks,
    taperWeeks,
    maxRamp,
  });

  const weeks = weeklyVolumes({
    startKm: input.startWeeklyKm,
    targetPeakKm: input.targetPeakKm,
    weeks: input.weeks,
    startMonday: input.startMonday,
    rampPct: adapt?.holdProgression ? 0 : ramp,
    taperWeeks,
    ceilingKm: ceiling,
  });

  // Application du facteur d'adaptation : il ne touche que les 1-2 premières
  // semaines, puis le plan reprend sa trajectoire. Sinon une mauvaise semaine
  // écraserait tout le plan.
  const adjusted = weeks.map((w, i) => {
    if (!adapt || adapt.volumeFactor === 1) return w;
    const decay = i === 0 ? 1 : i === 1 ? 0.5 : 0;
    const factor = 1 + (adapt.volumeFactor - 1) * decay;
    return { ...w, km: round(w.km * factor, 1) };
  });

  const paces = paceSet(input.vdot ?? 0, input.fallbackPace ?? null);

  // Plafond de sortie longue : progression propre, +2 km/semaine maximum,
  // et jamais plus que la cible de la distance visée.
  const target = input.raceKm ? volumeTargetFor(input.raceKm) : null;
  const longCapMax = target
    ? target.longRun
    : Math.max(22, input.targetPeakKm * 0.45);
  let longCap = Math.max(input.currentLongRunKm ?? 8, 8);

  // daysPerWeek = 0 → automatique : le nombre de sorties suit le volume.
  const autoMode = !input.daysPerWeek || input.daysPerWeek <= 0;
  const startDays = autoMode
    ? suggestDaysPerWeek({
        weeklyKm: input.startWeeklyKm,
        sessionsPerWeek: input.observedSessionsPerWeek ?? 0,
      })
    : input.daysPerWeek;

  const sessions: PlannedSessionSpec[] = [];
  for (const [i, week] of adjusted.entries()) {
    if (week.phase !== "deload" && week.phase !== "taper" && week.phase !== "race" && i > 0) {
      longCap = Math.min(longCap + 2, longCapMax);
    }
    sessions.push(
      ...composeWeek({
        week,
        paces,
        daysPerWeek: autoMode ? daysForWeek(week.km, startDays) : startDays,
        longRunDay: input.longRunDay,
        focus,
        raceKm: input.raceKm,
        longRunCapKm: longCap,
        strengthPerWeek: input.strengthPerWeek ?? focus.strength,
        adaptation: i <= 1 ? adapt : null,
        // On passe toujours la date de course : c'est `composeWeek` qui décide
        // si elle tombe dans la semaine, pas la phase calculée.
        raceDate: input.raceDate ?? null,
        racePace: input.racePace ?? null,
        raceName: input.raceName ?? null,
      })
    );
  }

  const longRunPeak = Math.max(0, ...sessions.filter((s) => s.kind === "long").map((s) => s.km));

  // Les volumes réels sont ceux des séances : la semaine de course inclut la
  // course elle-même, ce que la courbe de volume seule ne savait pas.
  const byWeek = new Map<number, number>();
  for (const s of sessions) {
    byWeek.set(s.weekNumber, (byWeek.get(s.weekNumber) ?? 0) + s.km);
  }
  const final = adjusted.map((w) => ({
    ...w,
    km: round(byWeek.get(w.weekNumber) ?? w.km, 1),
  }));

  return {
    weeks: final,
    sessions,
    daysStart: startDays,
    daysAuto: autoMode,
    daysSteps: autoMode ? daysSchedule(final, startDays) : [],
    peakKm: round(
      Math.max(...final.filter((w) => w.phase !== "race").map((w) => w.km), 0),
      1
    ),
    totalKm: round(final.reduce((a, w) => a + w.km, 0), 0),
    longRunPeakKm: round(longRunPeak, 1),
  };
}

/** Index 0-6 du jour `date` dans la semaine commençant `weekStart`, -1 si hors semaine. */
export function dayIndexInWeek(weekStart: Date, date: Date): number {
  const d = Math.floor(
    (startOfDay(date).getTime() - startOfDay(weekStart).getTime()) / 86_400_000
  );
  return d >= 0 && d < 7 ? d : -1;
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/**
 * Semaine de course.
 *
 * Trois règles : la course est posée le jour J avec SA distance, le volume de la
 * semaine inclut la course, et les jours qui précèdent servent uniquement à
 * arriver frais (activation la veille, rien de long, aucune intensité).
 */
function composeRaceWeek(opts: ComposeOptions, raceIdx: number): PlannedSessionSpec[] {
  const { week, paces } = opts;
  const raceKm = Math.max(0, opts.raceKm ?? 0);

  const specs: PlannedSessionSpec[] = [];
  const push = (date: Date, kind: SessionKind, km: number) => {
    const workout = buildWorkout(kind, {
      km,
      paces,
      phase: week.phase,
      weekNumber: week.weekNumber,
      raceKm: opts.raceKm,
      racePace: kind === "race" ? opts.racePace ?? null : null,
      raceName: kind === "race" ? opts.raceName ?? null : null,
      noIntensity: true,
    });
    specs.push({
      ...workout,
      date,
      weekStart: week.weekStart,
      weekNumber: week.weekNumber,
      phase: week.phase,
      adapted: false,
      adaptReason: null,
    });
  };

  // Le volume de la semaine ne peut pas être inférieur à la course elle-même.
  const total = Math.max(week.km, raceKm + Math.min(12, raceKm * 0.35));
  let remaining = Math.max(0, total - raceKm);

  // Veille : activation courte avec lignes droites (sauf course le lundi).
  const eve = raceIdx - 1;
  if (eve >= 0 && remaining > 3) {
    const km = Math.min(5, Math.max(3, remaining * 0.25));
    push(addDays(week.weekStart, eve), raceKm <= 21.1 ? "strides" : "easy", round(km, 1));
    remaining -= km;
  }

  // Sorties faciles en début de semaine, espacées. Aucune ne dépasse 8 km :
  // la semaine de course ne sert pas à gagner de la forme, seulement à la garder.
  const slots = [raceIdx - 3, raceIdx - 5, raceIdx - 6].filter((d) => d >= 0);
  const used = Math.min(slots.length, remaining > 8 ? 2 : remaining > 3 ? 1 : 0);
  for (let i = 0; i < used; i++) {
    const km = round(Math.min(8, remaining / (used - i)), 1);
    push(addDays(week.weekStart, slots[i]), "easy", km);
    remaining -= km;
  }

  push(addDays(week.weekStart, raceIdx), "race", round(raceKm, 1));

  // Lendemain : récupération active si la semaine continue après la course.
  if (raceIdx < 6 && raceKm <= 21.1) {
    push(addDays(week.weekStart, raceIdx + 2 <= 6 ? raceIdx + 2 : 6), "recovery", 4);
  }

  return specs.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ---------------------------------------------------------------- Répartition

/** Part du volume passée en facile vs en intensité (règle des 80/20). */
export function intensityBalance(
  sessions: Array<{ distanceKm: number; kind: string }>
): { easyPct: number; hardPct: number; verdict: string } {
  const runs = sessions.filter((s) => isRun(s.kind as SessionKind));
  const total = runs.reduce((a, s) => a + s.distanceKm, 0);
  if (total <= 0) return { easyPct: 0, hardPct: 0, verdict: "—" };

  const hard = runs
    .filter((s) => isQuality(s.kind as SessionKind))
    .reduce((a, s) => a + s.distanceKm * 0.55, 0); // hors échauffement/retour au calme

  const hardPct = round((hard / total) * 100, 0);
  const easyPct = 100 - hardPct;
  const verdict =
    hardPct > 25 ? "Trop d'intensité" : hardPct < 8 ? "Peu d'intensité" : "Équilibré";
  return { easyPct, hardPct, verdict };
}

// ---------------------------------------------------------------- Utils

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export const DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
export const DAY_SHORT = ["L", "M", "M", "J", "V", "S", "D"];
