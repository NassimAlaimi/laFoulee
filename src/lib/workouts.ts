/**
 * Bibliothèque de séances.
 *
 * Une séance n'est pas « 8 km » : c'est une intention (fondamental, seuil,
 * VO2max…), une structure (échauffement / blocs / récup) et une allure cible
 * dérivée du VDOT. Ce module fabrique ces séances ; `training.ts` décide
 * lesquelles poser dans la semaine et à quel volume.
 *
 * Tout est pur : aucune dépendance base de données, testable directement.
 */

import { fmtPace } from "./format";
import { danielsPaces, vmaFromVdot } from "./vdot";

// ---------------------------------------------------------------- Types

export type SessionKind =
  | "rest"
  | "recovery"
  | "easy"
  | "long"
  | "tempo"
  | "threshold"
  | "intervals"
  | "hills"
  | "fartlek"
  | "strides"
  | "race"
  | "strength"
  | "cross"
  | "mobility";

export type StepKind = "warmup" | "work" | "recovery" | "cooldown" | "block";

export type Step = {
  kind: StepKind;
  label: string;
  repeat?: number;
  distanceM?: number;
  durationMin?: number;
  /** Allure cible en s/km, null = libre */
  pace?: number | null;
};

export type Workout = {
  kind: SessionKind;
  title: string;
  tagline: string;
  /** Distance course à pied, km (0 pour renfo / repos) */
  km: number;
  /** Durée estimée, minutes */
  minutes: number;
  /** 1 = très facile … 5 = maximal */
  intensity: number;
  steps: Step[];
  paceTarget: number | null;
  paceFast: number | null;
  /** Charge relative estimée, utilisée pour équilibrer la semaine */
  load: number;
};

/** Jeu d'allures d'entraînement, en s/km. */
export type PaceSet = {
  easy: number;
  easyFast: number;
  marathon: number;
  threshold: number;
  interval: number;
  repetition: number;
  vma: number; // km/h
  /** true si dérivé d'un VDOT réel, false si estimé depuis l'allure moyenne */
  derived: boolean;
};

/** Libellés de type de séance — clés i18n `common.kind.*`. */
export const KIND_LABELS: Record<SessionKind, string> = {
  rest: "common.kind.rest",
  recovery: "common.kind.recovery",
  easy: "common.kind.easy",
  long: "common.kind.long",
  tempo: "common.kind.tempo",
  threshold: "common.kind.threshold",
  intervals: "common.kind.intervals",
  hills: "common.kind.hills",
  fartlek: "common.kind.fartlek",
  strides: "common.kind.strides",
  race: "common.kind.race",
  strength: "common.kind.strength",
  cross: "common.kind.cross",
  mobility: "common.kind.mobility",
};

/** Les séances qui comptent comme « qualité » (intensité ≥ 3). */
export const QUALITY_KINDS: SessionKind[] = [
  "tempo",
  "threshold",
  "intervals",
  "hills",
  "fartlek",
  "race",
];

export const RUN_KINDS: SessionKind[] = [
  "recovery",
  "easy",
  "long",
  "tempo",
  "threshold",
  "intervals",
  "hills",
  "fartlek",
  "strides",
  "race",
];

export function isQuality(kind: SessionKind): boolean {
  return QUALITY_KINDS.includes(kind);
}

export function isRun(kind: SessionKind): boolean {
  return RUN_KINDS.includes(kind);
}

// ---------------------------------------------------------------- Allures

/**
 * Construit le jeu d'allures.
 * - Si un VDOT est disponible → allures de Daniels, précises.
 * - Sinon → dérivation grossière depuis l'allure moyenne récente, pour ne pas
 *   bloquer un utilisateur sans record exploitable (les allures sont alors
 *   marquées `derived: false` et l'interface le signale).
 */
export function paceSet(vdot: number, fallbackAvgPace?: number | null): PaceSet {
  if (vdot > 0) {
    const d = danielsPaces(vdot);
    const by = (key: string) => d.find((p) => p.key === key)!;
    return {
      easy: by("easy").pace,
      easyFast: by("easy").paceFast,
      marathon: by("marathon").pace,
      threshold: by("threshold").pace,
      interval: by("interval").pace,
      repetition: by("repetition").pace,
      vma: vmaFromVdot(vdot),
      derived: true,
    };
  }

  // Sans VDOT : on part de l'allure moyenne observée, supposée « endurance ».
  const easy = fallbackAvgPace && fallbackAvgPace > 0 ? fallbackAvgPace : 360;
  return {
    easy,
    easyFast: easy * 0.94,
    marathon: easy * 0.88,
    threshold: easy * 0.83,
    interval: easy * 0.76,
    repetition: easy * 0.71,
    vma: 3600 / (easy * 0.76), // ≈ vitesse VO2max en km/h
    derived: false,
  };
}

// ---------------------------------------------------------------- Fabrique

export type WorkoutContext = {
  /** Kilométrage alloué à la séance */
  km: number;
  paces: PaceSet;
  /** base | build | peak | deload | taper | race */
  phase: string;
  /** Numéro de semaine dans le plan, sert à faire varier les séances */
  weekNumber: number;
  /** Distance de l'objectif en km, si plan de course */
  raceKm?: number | null;
  /** Interdit toute intensité (douleur, reprise…) */
  noIntensity?: boolean;
  /** Dénivelé souhaité (trail) */
  hilly?: boolean;
  /** Allure visée le jour de la course (s/km), si un chrono est défini */
  racePace?: number | null;
  /** Nom de la course, pour l'afficher sur la séance du jour J */
  raceName?: string | null;
};

/**
 * Fabrique la séance d'un `kind` donné, calibrée sur `km`.
 * Le kilométrage demandé est respecté à ±10 % : les blocs sont ajustés,
 * pas le total — sinon le volume hebdomadaire planifié ne tomberait jamais juste.
 */
export function buildWorkout(kind: SessionKind, ctx: WorkoutContext): Workout {
  const { paces } = ctx;
  const km = Math.max(0, round1(ctx.km));

  switch (kind) {
    case "rest":
      return nonRun("rest", "Repos", "Jour off. C'est là que l'adaptation se fait.", 0, 1);

    case "mobility":
      return nonRun(
        "mobility",
        "Mobilité",
        "20 min : hanches, chevilles, chaîne postérieure.",
        20,
        1
      );

    case "strength":
      return nonRun(
        "strength",
        "Renforcement",
        "Gainage, fentes, mollets, ischios. 30 min.",
        30,
        2,
        [
          { kind: "warmup", label: "Activation 5 min", durationMin: 5 },
          { kind: "block", label: "3 × (gainage 45 s · fentes 12/jambe · pont fessier 15)", repeat: 3 },
          { kind: "block", label: "3 × 15 extensions mollets (excentrique lent)", repeat: 3 },
          { kind: "cooldown", label: "Étirements doux 5 min", durationMin: 5 },
        ]
      );

    case "cross":
      return nonRun(
        "cross",
        "Cross-training",
        "Vélo, rameur ou elliptique en aisance respiratoire. 45 min.",
        45,
        2,
        [{ kind: "block", label: "45 min à intensité modérée, sans impact", durationMin: 45 }]
      );

    case "recovery":
      return runWorkout({
        kind: "recovery",
        title: "Footing de récup",
        tagline: "Très lent. Si tu hésites, ralentis encore.",
        km,
        pace: paces.easy * 1.06,
        paceFast: paces.easy,
        intensity: 1,
        steps: [
          {
            kind: "block",
            label: `${round1(km)} km très souples`,
            distanceM: km * 1000,
            pace: paces.easy * 1.06,
          },
        ],
      });

    case "easy": {
      const withStrides = !ctx.noIntensity && ctx.weekNumber % 2 === 1 && km >= 6;
      const steps: Step[] = [
        {
          kind: "block",
          label: `${round1(km)} km en aisance (conversation possible)`,
          distanceM: km * 1000,
          pace: paces.easy,
        },
      ];
      if (withStrides) {
        steps.push({
          kind: "work",
          label: "4 × 20 s en accélération progressive, récup 1 min marche",
          repeat: 4,
          pace: paces.repetition,
        });
      }
      return runWorkout({
        kind: "easy",
        title: "Endurance fondamentale",
        tagline: withStrides
          ? "Le socle. Termine par quelques lignes droites."
          : "Le socle : 80 % de ton volume doit ressembler à ça.",
        km,
        pace: paces.easy,
        paceFast: paces.easyFast,
        intensity: 2,
        steps,
      });
    }

    case "strides":
      return runWorkout({
        kind: "strides",
        title: "Footing + lignes droites",
        tagline: "Entretien de la foulée sans coût de fatigue.",
        km,
        pace: paces.easy,
        paceFast: paces.easyFast,
        intensity: 2,
        steps: [
          {
            kind: "block",
            label: `${round1(Math.max(0, km - 1))} km en endurance`,
            distanceM: Math.max(0, km - 1) * 1000,
            pace: paces.easy,
          },
          {
            kind: "work",
            label: "6 × 100 m rapides (r = retour marche)",
            repeat: 6,
            distanceM: 100,
            pace: paces.repetition,
          },
        ],
      });

    case "long": {
      const finishFast =
        !ctx.noIntensity &&
        (ctx.phase === "build" || ctx.phase === "peak") &&
        km >= 14 &&
        ctx.weekNumber % 2 === 0;
      const fastKm = finishFast ? Math.min(6, Math.round(km * 0.25)) : 0;
      const steps: Step[] = [
        {
          kind: "block",
          label: `${round1(km - fastKm)} km en endurance`,
          distanceM: (km - fastKm) * 1000,
          pace: paces.easy,
        },
      ];
      if (fastKm > 0) {
        steps.push({
          kind: "work",
          label: `${fastKm} km finaux à allure marathon`,
          distanceM: fastKm * 1000,
          pace: paces.marathon,
        });
      }
      return runWorkout({
        kind: "long",
        title: finishFast ? "Sortie longue à finish rapide" : "Sortie longue",
        tagline: finishFast
          ? "Fatigue accumulée puis allure spécifique : le vrai test."
          : "Endurance pure. Le temps passé compte plus que l'allure.",
        km,
        pace: paces.easy,
        paceFast: finishFast ? paces.marathon : paces.easyFast,
        intensity: finishFast ? 3 : 2,
        steps,
      });
    }

    case "tempo": {
      const tempoKm = clamp(round1(km * 0.45), 3, 12);
      const rest = round1(km - tempoKm);
      return runWorkout({
        kind: "tempo",
        title: `Tempo ${tempoKm} km`,
        tagline: "Effort « confortablement dur », soutenu, sans coupure.",
        km,
        pace: paces.threshold * 1.03,
        paceFast: paces.threshold,
        intensity: 3,
        steps: [
          { kind: "warmup", label: `${round1(rest * 0.55)} km échauffement`, distanceM: rest * 550, pace: paces.easy },
          {
            kind: "work",
            label: `${tempoKm} km en continu à ${fmtPace(paces.threshold * 1.03)}`,
            distanceM: tempoKm * 1000,
            pace: paces.threshold * 1.03,
          },
          { kind: "cooldown", label: `${round1(rest * 0.45)} km retour au calme`, distanceM: rest * 450, pace: paces.easy },
        ],
      });
    }

    case "threshold": {
      // Alterne les formats d'une semaine à l'autre : le corps s'habitue vite.
      const variants = [
        { reps: 3, minutes: 8, rec: 2 },
        { reps: 4, minutes: 6, rec: 90 / 60 },
        { reps: 2, minutes: 12, rec: 3 },
        { reps: 5, minutes: 5, rec: 1 },
      ];
      const v = variants[ctx.weekNumber % variants.length];
      const workKm = (v.reps * v.minutes * 60) / paces.threshold;
      const rest = Math.max(2, km - workKm);
      return runWorkout({
        kind: "threshold",
        title: `Seuil ${v.reps} × ${v.minutes} min`,
        tagline: "Repousse le seuil lactique. Allure tenable ~1 h en course.",
        km,
        pace: paces.threshold,
        paceFast: paces.threshold * 0.98,
        intensity: 4,
        steps: [
          { kind: "warmup", label: `${round1(rest * 0.55)} km échauffement + 3 lignes droites`, distanceM: rest * 550, pace: paces.easy },
          {
            kind: "work",
            label: `${v.reps} × ${v.minutes} min à ${fmtPace(paces.threshold)}`,
            repeat: v.reps,
            durationMin: v.minutes,
            pace: paces.threshold,
          },
          {
            kind: "recovery",
            label: `récup ${Math.round(v.rec)} min trot entre les blocs`,
            durationMin: Math.round(v.rec),
            pace: null,
          },
          { kind: "cooldown", label: `${round1(rest * 0.45)} km retour au calme`, distanceM: rest * 450, pace: paces.easy },
        ],
      });
    }

    case "intervals": {
      const variants = [
        { reps: 5, label: "3 min", minutes: 3, rec: "2 min trot" },
        { reps: 6, label: "1000 m", minutes: 1000 / 1000 * (paces.interval / 60), rec: "2 min trot" },
        { reps: 8, label: "400 m", minutes: 400 / 1000 * (paces.interval / 60), rec: "1 min trot" },
        { reps: 4, label: "4 min", minutes: 4, rec: "3 min trot" },
      ];
      const v = variants[ctx.weekNumber % variants.length];
      const workKm = (v.reps * v.minutes * 60) / paces.interval;
      const rest = Math.max(2, km - workKm);
      return runWorkout({
        kind: "intervals",
        title: `VO2max ${v.reps} × ${v.label}`,
        tagline: "Développe la cylindrée. Dur, mais court.",
        km,
        pace: paces.interval,
        paceFast: paces.interval * 0.97,
        intensity: 5,
        steps: [
          { kind: "warmup", label: `${round1(rest * 0.6)} km échauffement + gammes`, distanceM: rest * 600, pace: paces.easy },
          {
            kind: "work",
            label: `${v.reps} × ${v.label} à ${fmtPace(paces.interval)}`,
            repeat: v.reps,
            pace: paces.interval,
          },
          { kind: "recovery", label: `récup ${v.rec}`, pace: null },
          { kind: "cooldown", label: `${round1(rest * 0.4)} km retour au calme`, distanceM: rest * 400, pace: paces.easy },
        ],
      });
    }

    case "hills": {
      const reps = clamp(Math.round(km * 0.9), 6, 14);
      const rest = Math.max(2, km * 0.72);
      return runWorkout({
        kind: "hills",
        title: `Côtes ${reps} × 45 s`,
        tagline: "Force spécifique sans traumatisme d'allure. Pente 5-8 %.",
        km,
        pace: paces.interval,
        paceFast: paces.repetition,
        intensity: 4,
        steps: [
          { kind: "warmup", label: `${round1(rest * 0.55)} km échauffement`, distanceM: rest * 550, pace: paces.easy },
          {
            kind: "work",
            label: `${reps} × 45 s en montée, effort contrôlé`,
            repeat: reps,
            durationMin: 0.75,
            pace: null,
          },
          { kind: "recovery", label: "descente en trot = récup", pace: null },
          { kind: "cooldown", label: `${round1(rest * 0.45)} km retour au calme`, distanceM: rest * 450, pace: paces.easy },
        ],
      });
    }

    case "fartlek": {
      const variants = [
        "10 × 1 min vite / 1 min lent",
        "6 × 2 min vite / 90 s lent",
        "Pyramide 1-2-3-2-1 min, récup = durée du bloc",
        "15 × 30 s vite / 30 s lent",
      ];
      const v = variants[ctx.weekNumber % variants.length];
      return runWorkout({
        kind: "fartlek",
        title: "Fartlek",
        tagline: "Intensité au feeling, sans piste ni chrono.",
        km,
        pace: paces.threshold,
        paceFast: paces.interval,
        intensity: 3,
        steps: [
          { kind: "warmup", label: `${round1(km * 0.3)} km échauffement`, distanceM: km * 300, pace: paces.easy },
          { kind: "work", label: v, pace: paces.interval },
          { kind: "cooldown", label: `${round1(km * 0.25)} km retour au calme`, distanceM: km * 250, pace: paces.easy },
        ],
      });
    }

    case "race": {
      const target = ctx.racePace ?? null;
      // Échauffement inversement proportionnel à la distance : on ne s'échauffe
      // pas 20 min avant un marathon, on s'échauffe 20 min avant un 5 km.
      const warm = km <= 10 ? 20 : km <= 21.1 ? 12 : 8;
      const steps: Step[] = [
        {
          kind: "warmup",
          label:
            km <= 10
              ? `${warm} min en aisance + 4 lignes droites`
              : `${warm} min de mise en route, mobilité`,
          durationMin: warm,
        },
      ];

      if (target && km >= 10) {
        // Négatif léger : premier tiers 2 % plus lent, dernier tiers 2 % plus vite.
        steps.push(
          {
            kind: "work",
            label: `Premier tiers (${round1(km / 3)} km) — contrôle`,
            distanceM: (km / 3) * 1000,
            pace: target * 1.02,
          },
          {
            kind: "work",
            label: `Deuxième tiers — allure cible`,
            distanceM: (km / 3) * 1000,
            pace: target,
          },
          {
            kind: "work",
            label: `Dernier tiers — ce qu'il reste`,
            distanceM: (km / 3) * 1000,
            pace: target * 0.98,
          }
        );
      } else {
        steps.push({
          kind: "work",
          label: target
            ? `${round1(km)} km à ${fmtPaceShort(target)}`
            : `${round1(km)} km — course`,
          distanceM: km * 1000,
          pace: target ?? undefined,
        });
      }

      return runWorkout({
        kind: "race",
        title: ctx.raceName ? `Course — ${ctx.raceName}` : "Jour de course",
        tagline: target
          ? `Objectif ${fmtPaceShort(target)} · tout ce qui précède se juge aujourd'hui.`
          : "Tout ce qui précède se juge aujourd'hui.",
        km,
        pace: target,
        paceFast: target ? target * 0.98 : null,
        intensity: 5,
        steps,
      });
    }
  }
}

// ---------------------------------------------------------------- Helpers

function fmtPaceShort(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

function runWorkout(w: {
  kind: SessionKind;
  title: string;
  tagline: string;
  km: number;
  pace: number | null;
  paceFast: number | null;
  intensity: number;
  steps: Step[];
}): Workout {
  const refPace = w.pace ?? 360;
  const minutes = Math.round((w.km * refPace) / 60);
  return {
    kind: w.kind,
    title: w.title,
    tagline: w.tagline,
    km: round1(w.km),
    minutes,
    intensity: w.intensity,
    steps: w.steps.filter((s) => (s.distanceM ?? 1) > 0),
    paceTarget: w.pace,
    paceFast: w.paceFast,
    load: round1(minutes * intensityWeight(w.intensity)),
  };
}

function nonRun(
  kind: SessionKind,
  title: string,
  tagline: string,
  minutes: number,
  intensity: number,
  steps: Step[] = []
): Workout {
  return {
    kind,
    title,
    tagline,
    km: 0,
    minutes,
    intensity,
    steps,
    paceTarget: null,
    paceFast: null,
    load: round1(minutes * intensityWeight(intensity) * 0.6),
  };
}

function intensityWeight(i: number): number {
  return [0, 0.6, 1, 1.5, 2.1, 2.8][clamp(Math.round(i), 0, 5)];
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Résumé d'une séance en une ligne, pour les listes compactes. */
export function summarize(w: Workout): string {
  if (!isRun(w.kind)) return `${w.minutes} min`;
  const pace = w.paceTarget ? ` · ${fmtPace(w.paceTarget)}` : "";
  return `${w.km} km · ~${w.minutes} min${pace}`;
}
