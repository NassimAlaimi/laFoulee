/**
 * Bibliothèque de séances fondamentales, calibrées sur le VDOT de l'athlète.
 *
 * Les 12 séances classiques de la préparation sur route : seuil, VO2max,
 * allure spécifique, côtes, fartlek, étalonnage. Chaque séance expose :
 *
 * - **pourquoi** : le bénéfice physiologique, en une phrase ;
 * - **étapes** : échauffement, blocs de travail avec allure, récupération,
 *   retour au calme — les allures viennent du `PaceSet` (Daniels si un VDOT
 *   est connu, estimation depuis l'allure moyenne sinon) ;
 * - **profil** : les distances de course auxquelles la séance prépare.
 *
 * Module pur : aucune lecture de base, aucune date. La page qui l'utilise
 * fournit le `PaceSet` courant de l'athlète.
 */

import type { PaceSet } from "./workouts";
import { round } from "./stats";

export type LibraryTarget =
  | "universel"
  | "5k-10k"
  | "semi"
  | "marathon"
  | "trail";

export const TARGET_LABEL: Record<LibraryTarget, string> = {
  universel: "Toutes distances",
  "5k-10k": "5 km · 10 km",
  semi: "Semi-marathon",
  marathon: "Marathon",
  trail: "Trail",
};

export type LibraryStep = {
  kind: "warmup" | "work" | "recovery" | "cooldown";
  label: string;
  /** Allure en s/km, si la nature de l'étape en a une */
  pace?: number;
  paceFast?: number;
  /** Distance du bloc (répétitions comprises) */
  distanceM?: number;
  /** Nombre de répétitions du bloc */
  repeat?: number;
  note?: string;
};

export type LibrarySession = {
  id: string;
  name: string;
  /** Famille de la séance, pour la vignette */
  family: string;
  target: LibraryTarget;
  /** Bénéfice physiologique, en une phrase */
  why: string;
  /** Km total estimé (0 si la séance est en minutes) */
  km: number;
  /** Durée estimée en minutes (échauffement + blocs + récup) */
  minutes: number;
  /** 1 = très facile … 5 = maximal */
  intensity: number;
  steps: LibraryStep[];
};

function w(pace: number, label: string, distanceM: number): LibraryStep {
  return { kind: "warmup", label, pace, distanceM };
}

function run(
  label: string,
  distanceM: number,
  pace: number,
  note?: string,
  repeat = 1
): LibraryStep {
  return { kind: "work", label, pace, distanceM: distanceM * repeat, repeat, note };
}

function rec(label: string, distanceM: number, pace: number, repeat = 1): LibraryStep {
  return { kind: "recovery", label, pace, distanceM: distanceM * repeat, repeat };
}

function cd(pace: number, label: string, distanceM: number): LibraryStep {
  return { kind: "cooldown", label, pace, distanceM };
}

function totalKm(steps: LibraryStep[]): number {
  return round(
    steps.reduce((a, s) => a + (s.distanceM ?? 0), 0) / 1000
  );
}

/**
 * Construit les 12 séances de la bibliothèque avec les allures de `paces`.
 * Les km totaux s'ajustent d'eux-mêmes à la structure des blocs.
 */
export function librarySessions(paces: PaceSet): LibrarySession[] {
  const P = paces;
  const sessions: LibrarySession[] = [
    {
      id: "footing",
      name: "Footing + lignes droites",
      family: "Endurance",
      target: "universel",
      why: "Volume facile et rappel de la foulée : les lignes droites éveillent le geste sans coût énergétique.",
      intensity: 2,
      minutes: 55,
      steps: [
        w(P.easy, "Footing d'échauffement 15 min", 2500),
        run("100 m en accélération progressive", 100, P.repetition, "8 × — retour en trottinant", 8),
        cd(P.easy, "Retour au calme 10 min", 1600),
      ],
      km: 0,
    },
    {
      id: "longue-endurance",
      name: "Sortie longue endurance",
      family: "Endurance",
      target: "marathon",
      why: "Le pilier du marathon : densité capillaire, stockage du glycogène, confiance sur la durée.",
      intensity: 2,
      minutes: 120,
      steps: [
        w(P.easy, "Départ 20 min, jambes légères", 3300),
        run("Bloc central en aisance (conversation possible)", 14000, P.easy),
        run("Derniers 20 min en progression douce", 3300, P.easyFast),
        cd(P.easy, "Marche 5 min", 0),
      ],
      km: 0,
    },
    {
      id: "longue-progressive",
      name: "Sortie longue progressive",
      family: "Endurance",
      target: "semi",
      why: "Apprendre à finir vite sur jambes fatiguées : la spécificité du semi et du marathon.",
      intensity: 3,
      minutes: 100,
      steps: [
        w(P.easy, "Échauffement 20 min", 3200),
        run("2 × 30 min en aisance", 5000, P.easy, "récup 5 min de trot", 2),
        run("20 min à allure marathon", 4000, P.marathon),
        cd(P.easy, "Retour au calme 10 min", 1500),
      ],
      km: 0,
    },
    {
      id: "allure-marathon",
      name: "Allure marathon · 2 × 6 km",
      family: "Allure course",
      target: "marathon",
      why: "Le corps mémorise l'allure du jour J à jeun de fatigue : économie de course spécifique.",
      intensity: 4,
      minutes: 90,
      steps: [
        w(P.easy, "Échauffement 20 min", 3200),
        run("6 km à allure marathon", 6000, P.marathon, "2 × — récup 1 km trot", 2),
        cd(P.easy, "Retour au calme 10 min", 1500),
      ],
      km: 0,
    },
    {
      id: "seuil-2x20",
      name: "Seuil · 2 × 20 min",
      family: "Seuil",
      target: "universel",
      why: "La séance signature : repousse le seuil lactique, le plafond de l'allure soutenable.",
      intensity: 4,
      minutes: 70,
      steps: [
        w(P.easy, "Échauffement 15 min", 2400),
        run("20 min au seuil (parler par bribes)", 4600, P.threshold, "2 × — récup 3 min trot", 2),
        cd(P.easy, "Retour au calme 10 min", 1500),
      ],
      km: 0,
    },
    {
      id: "seuil-fractionne",
      name: "Seuil fractionné · 6 × 5 min",
      family: "Seuil",
      target: "5k-10k",
      why: "Le volume de seuil sans la monotonie du bloc long, avec des récupérations courtes.",
      intensity: 4,
      minutes: 65,
      steps: [
        w(P.easy, "Échauffement 15 min", 2400),
        run("5 min au seuil", 1150, P.threshold, "6 × — récup 90 s trot", 6),
        cd(P.easy, "Retour au calme 10 min", 1500),
      ],
      km: 0,
    },
    {
      id: "vo2max-1000",
      name: "VO2max · 6 × 1 000 m",
      family: "VO2max",
      target: "5k-10k",
      why: "Développe la cylindrée cardiaque : c'est la séance qui fait monter le VDOT.",
      intensity: 5,
      minutes: 60,
      steps: [
        w(P.easy, "Échauffement 20 min + 3 accélérations", 3500),
        run("1 000 m à allure VO2max", 1000, P.interval, "6 × — récup 400 m trot", 6),
        cd(P.easy, "Retour au calme 10 min", 1500),
      ],
      km: 0,
    },
    {
      id: "vo2max-3min",
      name: "VO2max · 5 × 3 min",
      family: "VO2max",
      target: "5k-10k",
      why: "Même cylindrée que le 1 000 m, avec des fractions plus courtes pour revenir en forme.",
      intensity: 5,
      minutes: 55,
      steps: [
        w(P.easy, "Échauffement 15 min", 2400),
        run("3 min à allure VO2max", 700, P.interval, "5 × — récup 2 min trot", 5),
        cd(P.easy, "Retour au calme 10 min", 1500),
      ],
      km: 0,
    },
    {
      id: "vitesse-300",
      name: "Vitesse · 10 × 300 m",
      family: "Vitesse",
      target: "5k-10k",
      why: "Mécanique et économie de course : le pied se pose plus vite sans que ça coûte plus cher.",
      intensity: 4,
      minutes: 55,
      steps: [
        w(P.easy, "Échauffement 20 min + gammes", 3200),
        run("300 m rapide", 300, P.repetition, "10 × — récup 200 m trot", 10),
        cd(P.easy, "Retour au calme 10 min", 1500),
      ],
      km: 0,
    },
    {
      id: "fartlek-suedois",
      name: "Fartlek suédois",
      family: "Fartlek",
      target: "universel",
      why: "L'intensité par le ressenti : 60 min de variations qui travaillent tout le spectre.",
      intensity: 3,
      minutes: 60,
      steps: [
        w(P.easy, "Échauffement 10 min", 1600),
        run("Bloc 60 s rapide / 60 s trot", 230, P.interval, "10 × — le « rapide » se court au ressenti, sans montre", 10),
        cd(P.easy, "Retour au calme 10 min", 1500),
      ],
      km: 0,
    },
    {
      id: "cotes",
      name: "Côtes · 8 × 45 s",
      family: "Côtes",
      target: "trail",
      why: "Force et posture en montée : la puissance spécifique qui manque sur le plat.",
      intensity: 4,
      minutes: 60,
      steps: [
        w(P.easy, "Échauffement 20 min sur plat", 3000),
        { kind: "work", label: "45 s en côte (8-10 %), fort mais pas à fond", repeat: 8, note: "8 × — descente en récupération" },
        cd(P.easy, "Retour au calme 10 min", 1500),
      ],
      km: 0,
    },
    {
      id: "mixte-competition",
      name: "Bloc compétition · 2000 + 1000",
      family: "Mixte",
      target: "semi",
      why: "Simule la course : du seuil vers le VO2max, le passage de témoin de la compétition.",
      intensity: 5,
      minutes: 70,
      steps: [
        w(P.easy, "Échauffement 20 min", 3200),
        run("2 000 m au seuil", 2000, P.threshold, "3 × — enchaîné avec le 1 000 m", 3),
        run("1 000 m à VO2max", 1000, P.interval, "3 × — récup 2 min trot", 3),
        cd(P.easy, "Retour au calme 10 min", 1500),
      ],
      km: 0,
    },
    {
      id: "test-vdot",
      name: "Test d'étalonnage · 5 km",
      family: "Étalonnage",
      target: "universel",
      why: "Le meilleur signal de forme : un 5 km à fond recale ton VDOT et donc toutes tes allures.",
      intensity: 5,
      minutes: 45,
      steps: [
        w(P.easy, "Échauffement 20 min + 3 accélérations", 3200),
        run("5 km à fond, régulier, négatif si possible", 5000, P.interval * 0.97),
        cd(P.easy, "Retour au calme 10 min", 1500),
      ],
      km: 0,
    },
  ];

  return sessions.map((s) => ({ ...s, km: totalKm(s.steps) }));
}

/** Filtre la bibliothèque par profil de course. */
export function filterLibrary(
  sessions: LibrarySession[],
  target: LibraryTarget | "tous"
): LibrarySession[] {
  if (target === "tous") return sessions;
  return sessions.filter((s) => s.target === target || s.target === "universel");
}
