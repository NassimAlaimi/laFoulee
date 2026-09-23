/**
 * Musculation — bibliothèque d'exercices et calculs.
 *
 * Fonctions pures, testées dans tests/strength.test.ts. Aucune dépendance à
 * la base : les pages passent des séries déjà chargées.
 *
 * Choix de modélisation :
 * - 1RM estimé = moyenne Epley / Brzycki, fiable jusqu'à ~10 répétitions.
 *   Les répétitions en réserve (RIR) sont ajoutées aux répétitions faites :
 *   8 reps à RIR 2 valent un 10RM, pas un 8RM.
 * - « Série dure » = série de travail à RIR ≤ 4 (ou RIR non renseigné).
 *   C'est l'unité de volume la plus robuste en littérature (Schoenfeld,
 *   Baz-Valle) — le tonnage, lui, favorise mécaniquement les exercices lourds.
 * - Un groupe secondaire compte pour une demi-série.
 */

import { addDays, startOfWeek } from "./stats";

export type Muscle =
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "hips"
  | "core"
  | "back"
  | "chest"
  | "shoulders"
  | "arms";

export const MUSCLE_LABELS: Record<Muscle, string> = {
  quads: "Quadriceps",
  hamstrings: "Ischio-jambiers",
  glutes: "Fessiers",
  calves: "Mollets",
  hips: "Hanches · adducteurs",
  core: "Gainage · tronc",
  back: "Dos",
  chest: "Pectoraux",
  shoulders: "Épaules",
  arms: "Bras",
};

/** Ordre d'affichage : chaîne du coureur d'abord. */
export const MUSCLE_ORDER: Muscle[] = [
  "glutes",
  "quads",
  "hamstrings",
  "calves",
  "hips",
  "core",
  "back",
  "chest",
  "shoulders",
  "arms",
];

export type Exercise = {
  slug: string;
  name: string;
  primary: Muscle[];
  secondary?: Muscle[];
  /** reps : répétitions · seconds : durée tenue (gainage) */
  unit?: "reps" | "seconds";
  /** Charge corporelle par défaut (pompes, tractions, gainage) */
  bodyweight?: boolean;
  /** Pas d'incrément de charge suggéré, en kg */
  step?: number;
  /** Utile au coureur, et pourquoi (affiché dans le sélecteur) */
  runner?: string;
};

export const EXERCISES: Exercise[] = [
  // --------------------------------------------------------- Bas du corps
  { slug: "back-squat", name: "Squat", primary: ["quads", "glutes"], secondary: ["core", "hamstrings"], step: 5, runner: "force de poussée, économie de course" },
  { slug: "front-squat", name: "Squat avant", primary: ["quads"], secondary: ["glutes", "core"], step: 2.5 },
  { slug: "goblet-squat", name: "Goblet squat", primary: ["quads", "glutes"], secondary: ["core"], step: 2 },
  { slug: "deadlift", name: "Soulevé de terre", primary: ["hamstrings", "glutes", "back"], secondary: ["core"], step: 5 },
  { slug: "rdl", name: "Soulevé de terre roumain", primary: ["hamstrings", "glutes"], secondary: ["back"], step: 5, runner: "ischios : prévention des claquages" },
  { slug: "single-leg-rdl", name: "Soulevé roumain unilatéral", primary: ["hamstrings", "glutes"], secondary: ["hips", "core"], step: 2, runner: "stabilité de hanche, proprioception" },
  { slug: "hip-thrust", name: "Hip thrust", primary: ["glutes"], secondary: ["hamstrings"], step: 5, runner: "extension de hanche, propulsion" },
  { slug: "glute-bridge", name: "Pont fessier", primary: ["glutes"], secondary: ["hamstrings", "core"], bodyweight: true, step: 2.5 },
  { slug: "bulgarian-split-squat", name: "Fente bulgare", primary: ["quads", "glutes"], secondary: ["hips"], step: 2, runner: "force unilatérale, déséquilibres gauche/droite" },
  { slug: "lunge", name: "Fentes", primary: ["quads", "glutes"], secondary: ["hips"], step: 2 },
  { slug: "step-up", name: "Step-up", primary: ["quads", "glutes"], secondary: ["calves"], step: 2, runner: "spécifique côtes et trail" },
  { slug: "leg-press", name: "Presse à cuisses", primary: ["quads", "glutes"], step: 10 },
  { slug: "leg-extension", name: "Leg extension", primary: ["quads"], step: 5 },
  { slug: "leg-curl", name: "Leg curl", primary: ["hamstrings"], step: 5 },
  { slug: "nordic-curl", name: "Nordic curl", primary: ["hamstrings"], bodyweight: true, step: 0, runner: "excentrique ischios : −50 % de blessures en littérature" },
  { slug: "calf-raise", name: "Mollets debout", primary: ["calves"], step: 5, runner: "tendon d'Achille, raideur du pied" },
  { slug: "single-leg-calf-raise", name: "Mollets unilatéral", primary: ["calves"], bodyweight: true, step: 2, runner: "tendon d'Achille, raideur du pied" },
  { slug: "seated-calf-raise", name: "Mollets assis (soléaire)", primary: ["calves"], step: 5, runner: "soléaire : encaisse jusqu'à 8× le poids du corps en course" },
  { slug: "copenhagen", name: "Copenhague (adducteurs)", primary: ["hips"], secondary: ["core"], bodyweight: true, unit: "seconds", step: 0, runner: "adducteurs, pubalgie" },
  { slug: "hip-abduction", name: "Abduction de hanche", primary: ["hips"], secondary: ["glutes"], step: 2.5, runner: "moyen fessier : genou et bassin stables" },
  { slug: "box-jump", name: "Box jump", primary: ["quads", "glutes"], secondary: ["calves"], bodyweight: true, step: 0, runner: "pliométrie : réactivité, économie de course" },
  { slug: "pogo-jumps", name: "Pogo jumps", primary: ["calves"], bodyweight: true, step: 0, runner: "raideur de cheville, retour élastique" },
  // --------------------------------------------------------- Tronc
  { slug: "plank", name: "Gainage ventral", primary: ["core"], bodyweight: true, unit: "seconds", step: 0 },
  { slug: "side-plank", name: "Gainage latéral", primary: ["core"], secondary: ["hips"], bodyweight: true, unit: "seconds", step: 0, runner: "stabilité du bassin en appui unipodal" },
  { slug: "dead-bug", name: "Dead bug", primary: ["core"], bodyweight: true, step: 0 },
  { slug: "pallof-press", name: "Pallof press", primary: ["core"], step: 2.5 },
  { slug: "hanging-leg-raise", name: "Relevé de jambes suspendu", primary: ["core"], bodyweight: true, step: 0 },
  // --------------------------------------------------------- Haut du corps
  { slug: "bench-press", name: "Développé couché", primary: ["chest"], secondary: ["shoulders", "arms"], step: 2.5 },
  { slug: "incline-db-press", name: "Développé incliné haltères", primary: ["chest", "shoulders"], secondary: ["arms"], step: 2 },
  { slug: "push-up", name: "Pompes", primary: ["chest"], secondary: ["shoulders", "arms", "core"], bodyweight: true, step: 0 },
  { slug: "overhead-press", name: "Développé militaire", primary: ["shoulders"], secondary: ["arms", "core"], step: 2.5 },
  { slug: "pull-up", name: "Tractions", primary: ["back"], secondary: ["arms"], bodyweight: true, step: 2.5 },
  { slug: "barbell-row", name: "Rowing barre", primary: ["back"], secondary: ["arms"], step: 2.5 },
  { slug: "db-row", name: "Rowing haltère", primary: ["back"], secondary: ["arms"], step: 2 },
  { slug: "lat-pulldown", name: "Tirage vertical", primary: ["back"], secondary: ["arms"], step: 5 },
  { slug: "face-pull", name: "Face pull", primary: ["shoulders", "back"], step: 2.5 },
  { slug: "lateral-raise", name: "Élévations latérales", primary: ["shoulders"], step: 1 },
  { slug: "biceps-curl", name: "Curl biceps", primary: ["arms"], step: 1 },
  { slug: "triceps-extension", name: "Extension triceps", primary: ["arms"], step: 2.5 },
  { slug: "dips", name: "Dips", primary: ["chest", "arms"], secondary: ["shoulders"], bodyweight: true, step: 2.5 },
];

const BY_SLUG = new Map(EXERCISES.map((e) => [e.slug, e]));

/** Exercice de la bibliothèque, ou exercice libre saisi par l'utilisateur. */
export function exerciseInfo(slugOrName: string): Exercise {
  return (
    BY_SLUG.get(slugOrName) ?? {
      slug: slugOrName,
      name: slugOrName,
      primary: [],
      step: 2.5,
    }
  );
}

// ------------------------------------------------------------------ Séries

/** Formes échangées avec le carnet de saisie (client). */
export type LoggedSet = { reps: number; weightKg: number; rir: number | null; isWarmup: boolean };
export type Block = { exercise: string; sets: LoggedSet[] };
export type ExerciseMemo = {
  lastDate: string;
  lastSets: LoggedSet[];
  bestE1rm: number | null;
  suggestion: { weightKg: number; reps: number; sets: number; reason: string } | null;
};

export type SetLike = {
  exercise: string;
  reps: number;
  weightKg: number;
  rir?: number | null;
  isWarmup?: boolean;
};

export type WorkoutLike = {
  id: string;
  date: Date;
  sets: SetLike[];
};

/**
 * 1RM estimé : moyenne Epley / Brzycki sur les répétitions « possibles »
 * (faites + en réserve). Null au-delà de 12 : les formules divergent et le
 * chiffre n'aurait plus de sens. Null aussi sans charge.
 */
export function estimate1RM(weightKg: number, reps: number, rir?: number | null): number | null {
  const r = reps + Math.max(0, rir ?? 0);
  if (!(weightKg > 0) || reps < 1 || r > 12) return null;
  if (r === 1) return weightKg;
  const epley = weightKg * (1 + r / 30);
  const brzycki = (weightKg * 36) / (37 - r);
  return Math.round(((epley + brzycki) / 2) * 10) / 10;
}

export function isWorkSet(s: SetLike): boolean {
  return !s.isWarmup && s.reps > 0;
}

/** Série dure : série de travail proche de l'échec (RIR ≤ 4 ou non renseigné). */
export function isHardSet(s: SetLike): boolean {
  return isWorkSet(s) && (s.rir == null || s.rir <= 4);
}

/** Tonnage : Σ reps × charge, séries de travail en répétitions uniquement. */
export function tonnage(sets: SetLike[]): number {
  return sets
    .filter((s) => isWorkSet(s) && exerciseInfo(s.exercise).unit !== "seconds")
    .reduce((a, s) => a + s.reps * s.weightKg, 0);
}

/** Séries dures par groupe musculaire (secondaire = ½). */
export function setsByMuscle(sets: SetLike[]): Record<Muscle, number> {
  const out = Object.fromEntries(MUSCLE_ORDER.map((m) => [m, 0])) as Record<Muscle, number>;
  for (const s of sets) {
    if (!isHardSet(s)) continue;
    const ex = exerciseInfo(s.exercise);
    for (const m of ex.primary) out[m] += 1;
    for (const m of ex.secondary ?? []) out[m] += 0.5;
  }
  return out;
}

/** Meilleur 1RM estimé d'un ensemble de séries d'un même exercice. */
export function best1RM(sets: SetLike[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    if (!isWorkSet(s)) continue;
    const e = estimate1RM(s.weightKg, s.reps, s.rir);
    if (e != null && (best == null || e > best)) best = e;
  }
  return best;
}

export type ExerciseHistory = {
  exercise: string;
  sessions: Array<{
    workoutId: string;
    date: Date;
    e1rm: number | null;
    topWeight: number;
    topReps: number;
    tonnage: number;
    sets: SetLike[];
  }>;
  bestE1rm: number | null;
  bestWeight: number;
  bestReps: number;
  lastDate: Date;
};

/** Historique par exercice, séances les plus anciennes d'abord. */
export function exerciseHistories(workouts: WorkoutLike[]): ExerciseHistory[] {
  const map = new Map<string, ExerciseHistory>();
  const chrono = [...workouts].sort((a, b) => a.date.getTime() - b.date.getTime());
  for (const w of chrono) {
    const byEx = new Map<string, SetLike[]>();
    for (const s of w.sets) {
      if (!byEx.has(s.exercise)) byEx.set(s.exercise, []);
      byEx.get(s.exercise)!.push(s);
    }
    for (const [exercise, sets] of byEx) {
      const work = sets.filter(isWorkSet);
      if (!work.length) continue;
      const top = work.reduce((a, b) => (b.weightKg > a.weightKg || (b.weightKg === a.weightKg && b.reps > a.reps) ? b : a));
      const h =
        map.get(exercise) ??
        ({ exercise, sessions: [], bestE1rm: null, bestWeight: 0, bestReps: 0, lastDate: w.date } as ExerciseHistory);
      const e1rm = best1RM(work);
      h.sessions.push({
        workoutId: w.id,
        date: w.date,
        e1rm,
        topWeight: top.weightKg,
        topReps: top.reps,
        tonnage: tonnage(work),
        sets,
      });
      if (e1rm != null && (h.bestE1rm == null || e1rm > h.bestE1rm)) h.bestE1rm = e1rm;
      h.bestWeight = Math.max(h.bestWeight, top.weightKg);
      h.bestReps = Math.max(h.bestReps, ...work.map((s) => s.reps));
      h.lastDate = w.date;
      map.set(exercise, h);
    }
  }
  return [...map.values()].sort((a, b) => b.lastDate.getTime() - a.lastDate.getTime());
}

export type PR = { exercise: string; kind: "e1rm" | "weight" | "reps"; value: number; previous: number | null };

/**
 * Records battus par une séance, comparés à toutes les séances antérieures.
 * Un premier passage sur un exercice n'est pas un « record » : il n'y a rien
 * à battre, l'annoncer serait du bruit.
 */
export function workoutPRs(workout: WorkoutLike, previous: WorkoutLike[]): PR[] {
  const before = previous.filter((w) => w.date < workout.date || (w.date.getTime() === workout.date.getTime() && w.id < workout.id));
  const prs: PR[] = [];
  const exercises = [...new Set(workout.sets.filter(isWorkSet).map((s) => s.exercise))];
  for (const ex of exercises) {
    const past = before.flatMap((w) => w.sets.filter((s) => s.exercise === ex && isWorkSet(s)));
    if (!past.length) continue;
    const now = workout.sets.filter((s) => s.exercise === ex && isWorkSet(s));
    const info = exerciseInfo(ex);

    const e1Now = best1RM(now);
    const e1Past = best1RM(past);
    if (e1Now != null && e1Past != null && e1Now > e1Past + 0.05) {
      prs.push({ exercise: ex, kind: "e1rm", value: e1Now, previous: e1Past });
      continue;
    }
    const wNow = Math.max(...now.map((s) => s.weightKg));
    const wPast = Math.max(...past.map((s) => s.weightKg));
    if (wNow > wPast && wNow > 0) {
      prs.push({ exercise: ex, kind: "weight", value: wNow, previous: wPast });
      continue;
    }
    // Poids du corps / gainage : on progresse en répétitions ou en durée
    if (info.bodyweight || wNow === 0) {
      const rNow = Math.max(...now.filter((s) => s.weightKg === wNow).map((s) => s.reps));
      const rPast = Math.max(0, ...past.filter((s) => s.weightKg === wNow).map((s) => s.reps));
      if (rPast > 0 && rNow > rPast) prs.push({ exercise: ex, kind: "reps", value: rNow, previous: rPast });
    }
  }
  return prs;
}

/**
 * Suggestion pour la prochaine séance — double progression :
 * - toutes les séries de travail ont atteint le nombre de répétitions de la
 *   première, avec de la marge (RIR ≥ 2 ou non renseigné) → on monte d'un pas
 *   de charge, mêmes répétitions ;
 * - sinon → même charge, une répétition de plus sur la série la plus faible.
 * Au poids du corps : +1 répétition (ou +5 s en gainage).
 */
export function nextSuggestion(last: SetLike[]): { weightKg: number; reps: number; sets: number; reason: string } | null {
  const work = last.filter(isWorkSet);
  if (!work.length) return null;
  const info = exerciseInfo(work[0].exercise);
  const topW = Math.max(...work.map((s) => s.weightKg));
  const atTop = work.filter((s) => s.weightKg === topW);
  const target = atTop[0].reps;
  const minReps = Math.min(...atTop.map((s) => s.reps));
  const margin = atTop.every((s) => s.rir == null || s.rir >= 2);
  const step = info.step ?? 2.5;
  const seconds = info.unit === "seconds";

  if (topW === 0 || step === 0) {
    const inc = seconds ? 5 : 1;
    return {
      weightKg: topW,
      reps: Math.max(...atTop.map((s) => s.reps)) + inc,
      sets: atTop.length,
      reason: seconds ? "+5 s sur chaque série" : "+1 répétition sur chaque série",
    };
  }
  if (minReps >= target && margin) {
    return {
      weightKg: Math.round((topW + step) * 4) / 4,
      reps: target,
      sets: atTop.length,
      reason: `toutes les séries à ${target} reps avec de la marge : +${step} kg`,
    };
  }
  return {
    weightKg: topW,
    reps: Math.min(target, minReps + 1),
    sets: atTop.length,
    reason: minReps < target ? `consolider ${target} reps à ${topW} kg` : "même charge, viser plus de marge",
  };
}

/**
 * Fourchettes hebdomadaires de séries dures, pour un coureur qui fait du
 * renforcement en complément (et non un pratiquant de musculation pur) :
 * assez pour progresser en force, sans empiéter sur la récupération course.
 */
export const RUNNER_WEEKLY_SETS: Partial<Record<Muscle, [number, number]>> = {
  glutes: [4, 10],
  quads: [3, 8],
  hamstrings: [3, 8],
  calves: [4, 10],
  hips: [2, 6],
  core: [3, 9],
};

// ------------------------------------------------------------------ Modèles

export type TemplateSet = { exercise: string; sets: number; reps: number; weightKg?: number };
export type Template = { key: string; name: string; note: string; items: TemplateSet[] };

export const TEMPLATES: Template[] = [
  {
    key: "runner-a",
    name: "Renfo coureur · A",
    note: "Force bas du corps + mollets. 40 min, 2 à 3 RIR.",
    items: [
      { exercise: "back-squat", sets: 3, reps: 6 },
      { exercise: "rdl", sets: 3, reps: 8 },
      { exercise: "bulgarian-split-squat", sets: 2, reps: 8 },
      { exercise: "seated-calf-raise", sets: 3, reps: 12 },
      { exercise: "side-plank", sets: 2, reps: 40 },
    ],
  },
  {
    key: "runner-b",
    name: "Renfo coureur · B",
    note: "Chaîne postérieure, hanches, pliométrie légère.",
    items: [
      { exercise: "hip-thrust", sets: 3, reps: 8 },
      { exercise: "single-leg-rdl", sets: 3, reps: 8 },
      { exercise: "step-up", sets: 2, reps: 10 },
      { exercise: "single-leg-calf-raise", sets: 3, reps: 15 },
      { exercise: "copenhagen", sets: 2, reps: 25 },
      { exercise: "pogo-jumps", sets: 3, reps: 20 },
    ],
  },
  {
    key: "prevention",
    name: "Prévention express",
    note: "20 min au poids du corps, n'importe où.",
    items: [
      { exercise: "nordic-curl", sets: 2, reps: 5 },
      { exercise: "single-leg-calf-raise", sets: 3, reps: 15 },
      { exercise: "glute-bridge", sets: 3, reps: 15 },
      { exercise: "side-plank", sets: 2, reps: 45 },
      { exercise: "dead-bug", sets: 2, reps: 10 },
    ],
  },
  {
    key: "upper",
    name: "Haut du corps",
    note: "Posture et bras : utile en fin de course et en côte.",
    items: [
      { exercise: "pull-up", sets: 3, reps: 6 },
      { exercise: "bench-press", sets: 3, reps: 8 },
      { exercise: "db-row", sets: 3, reps: 10 },
      { exercise: "overhead-press", sets: 2, reps: 8 },
      { exercise: "face-pull", sets: 2, reps: 15 },
    ],
  },
];

// ------------------------------------------------------- Force relative

/**
 * Force relative : 1RM estimé divisé par le poids de corps. C'est la métrique
 * qui parle à un coureur — « je squatte 1,3× mon poids » — bien plus qu'un
 * chiffre absolu. `null` sans l'une des deux données.
 */
export function relativeStrength(oneRM: number | null, bodyweightKg: number | null): number | null {
  if (oneRM == null || oneRM <= 0) return null;
  if (bodyweightKg == null || bodyweightKg <= 0) return null;
  return Math.round((oneRM / bodyweightKg) * 10) / 10;
}

/** Famille d'exercice, d'après le muscle principal (premier `primary`). */
export type LiftClass = "lower" | "upper";

const LOWER: Muscle[] = ["quads", "glutes", "hamstrings", "calves", "hips"];
const UPPER: Muscle[] = ["chest", "shoulders", "arms", "back"];

export function liftClass(exercise: Exercise): LiftClass | null {
  const m = exercise.primary[0];
  if (!m) return null;
  if (LOWER.includes(m)) return "lower";
  if (UPPER.includes(m)) return "upper";
  return null;
}

/**
 * Repère qualitatif du ratio force/poids. Les levées de bas du corps se jugent
 * sur une échelle plus haute (1,5× au squat = solide), celles du haut sur une
 * échelle plus basse (1× au développé couché = solide).
 */
export function relativeLevel(ratio: number, exercise: Exercise): string | null {
  const cls = liftClass(exercise);
  if (cls === "lower") {
    if (ratio >= 2) return "élite";
    if (ratio >= 1.5) return "avancé";
    if (ratio >= 1) return "intermédiaire";
    return "débutant";
  }
  if (cls === "upper") {
    if (ratio >= 1.25) return "élite";
    if (ratio >= 0.9) return "avancé";
    if (ratio >= 0.6) return "intermédiaire";
    return "débutant";
  }
  return null;
}

// ------------------------------------------------------- Garde-fou de charge

export type StrengthAcwr = {
  /** Séries dures des 7 derniers jours. */
  acute: number;
  /** Moyenne hebdomadaire de séries dures sur 28 jours. */
  chronic: number;
  /** acute / chronic, null si aucune donnée sur 28 jours. */
  ratio: number | null;
  zone: "insufficient" | "optimal" | "caution" | "danger";
};

/**
 * Charge de renforcement, sur le modèle de l'ACWR course : les séries dures
 * de la semaine contre la moyenne des 4 dernières semaines. Une montée trop
 * rapide (> 1,5) signale un risque de blessure, exactement comme en course.
 */
export function strengthAcwr(workouts: WorkoutLike[], now = new Date()): StrengthAcwr {
  const DAY = 86_400_000;
  const hard = (w: WorkoutLike) => w.sets.filter(isHardSet).length;
  let acute = 0;
  let chronicTotal = 0;
  for (const w of workouts) {
    const age = now.getTime() - w.date.getTime();
    if (age < 0) continue;
    const n = hard(w);
    if (age <= 7 * DAY) acute += n;
    if (age <= 28 * DAY) chronicTotal += n;
  }
  const chronic = chronicTotal / 4;
  // Sans au moins deux semaines de recul, un ratio serait trompeur : une
  // première séance isolée donnerait un faux « risque » (acute / 0,5).
  const hasHistory = workouts.some((w) => now.getTime() - w.date.getTime() >= 14 * DAY);
  const ratio = chronic > 0 && hasHistory ? Math.round((acute / chronic) * 100) / 100 : null;
  const zone: StrengthAcwr["zone"] =
    ratio == null ? "insufficient" : ratio >= 1.5 ? "danger" : ratio >= 1.3 ? "caution" : ratio < 0.8 ? "insufficient" : "optimal";
  return { acute, chronic: Math.round(chronic * 10) / 10, ratio, zone };
}

// ------------------------------------------- Chaîne du coureur, semaine à semaine

export type MuscleWeek = {
  start: Date;
  byMuscle: Record<Muscle, number>;
};

/** Séries dures par muscle, semaine après semaine (du lundi au dimanche). */
export function muscleSeries(workouts: WorkoutLike[], weeks = 12, now = new Date()): MuscleWeek[] {
  const monday = startOfWeek(now);
  const out: MuscleWeek[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(monday, -7 * i);
    const end = addDays(start, 7);
    const sets = workouts.filter((w) => w.date >= start && w.date < end).flatMap((w) => w.sets);
    out.push({ start, byMuscle: setsByMuscle(sets) });
  }
  return out;
}

// ------------------------------------------------------- Objectif de force

export type StrengthGoalProgress = {
  current: number;
  target: number;
  /** 0..100, plafonné. */
  percent: number;
  /** "kg" (cible absolue) ou "×" (cible relative au poids de corps). */
  unit: "kg" | "×";
  done: boolean;
};

/**
 * Progression vers une cible de force : soit un 1RM absolu (« 100 kg »), soit
 * une cible relative (« 1,5 × ton poids »). Null sans la donnée nécessaire
 * (record 1RM pour l'absolu ; record + poids de corps pour le relatif).
 */
export function strengthGoalProgress(opts: {
  targetKg: number | null;
  targetRel: number | null;
  bestE1rm: number | null;
  bodyweightKg: number | null;
}): StrengthGoalProgress | null {
  const { targetKg, targetRel, bestE1rm, bodyweightKg } = opts;
  if (targetKg != null && targetKg > 0) {
    if (bestE1rm == null || bestE1rm <= 0) return null;
    return {
      current: bestE1rm,
      target: targetKg,
      percent: Math.min(100, Math.round((bestE1rm / targetKg) * 100)),
      unit: "kg",
      done: bestE1rm >= targetKg,
    };
  }
  if (targetRel != null && targetRel > 0) {
    if (bestE1rm == null || bestE1rm <= 0 || bodyweightKg == null || bodyweightKg <= 0) return null;
    const rel = bestE1rm / bodyweightKg;
    return {
      current: Math.round(rel * 10) / 10,
      target: targetRel,
      percent: Math.min(100, Math.round((rel / targetRel) * 100)),
      unit: "×",
      done: rel >= targetRel,
    };
  }
  return null;
}

// ------------------------------------------------------- RPE × charge

export type RpePoint = {
  date: Date;
  rpe: number;
  hardSets: number;
  tonnage: number;
};

/**
 * Séances avec RPE renseigné et au moins une série dure, pour corréler
 * l'effort perçu à la charge. Triées de la plus ancienne à la plus récente.
 */
export function rpeLoad(workouts: Array<WorkoutLike & { rpe?: number | null }>): RpePoint[] {
  return workouts
    .filter((w) => w.rpe != null && w.sets.some(isHardSet))
    .map((w) => ({
      date: w.date,
      rpe: w.rpe as number,
      hardSets: w.sets.filter(isHardSet).length,
      tonnage: Math.round(tonnage(w.sets)),
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}
