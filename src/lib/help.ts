/**
 * Aide & accueil des nouveaux — données pures.
 *
 * - **PAGE_HELP** : « cette page en trois phrases » + raccourcis, pour le
 *   bouton « ? » des en-têtes de page (PageHelp). Les textes vivent dans les
 *   messages i18n (`help.<key>`), la lib ne porte que la structure et le
 *   routage par préfixe.
 * - **LEXIQUE_IDS** : les termes du sport de haut niveau, affichés sur
 *   /lexique (`lexique.terms.<id>` dans les messages).
 * - **onboardingSteps** : le parcours « Bien démarrer » de l'accueil —
 *   quatre étapes vérifiées sur des données réelles, pas sur un clic.
 */

export type HelpEntry = {
  /** Préfixe de chemin auquel cette aide s'applique */
  path: string;
  /** Clé des messages i18n : `help.<key>.{title,lines,links}` */
  key: string;
};

export const PAGE_HELP: HelpEntry[] = [
  { path: "/", key: "today" },
  { path: "/log", key: "log" },
  { path: "/activities", key: "activities" },
  { path: "/training", key: "training" },
  { path: "/workouts", key: "workouts" },
  { path: "/goals", key: "goals" },
  { path: "/analysis", key: "analysis" },
  { path: "/analysis/modeles", key: "modeles" },
  { path: "/analysis/seances", key: "seances" },
  { path: "/records", key: "records" },
  { path: "/calculator", key: "calculator" },
  { path: "/corps", key: "corps" },
  { path: "/strength", key: "strength" },
  { path: "/gear", key: "gear" },
  { path: "/plus", key: "plus" },
  { path: "/settings", key: "settings" },
  { path: "/recap", key: "recap" },
  { path: "/lexique", key: "lexique" },
];

/** Aide correspondant au chemin, par préfixe le plus long. */
export function helpFor(pathname: string): HelpEntry | null {
  let best: HelpEntry | null = null;
  for (const entry of PAGE_HELP) {
    const matches =
      pathname === entry.path ||
      (entry.path !== "/" && pathname.startsWith(`${entry.path}/`));
    if (matches && (!best || entry.path.length > best.path.length)) best = entry;
  }
  return best;
}

/** Identifiants des termes du lexique — `lexique.terms.<id>` dans les messages. */
export const LEXIQUE_IDS = [
  "ctl",
  "atl",
  "tsb",
  "acwr",
  "trimp",
  "vdot",
  "vma",
  "cs",
  "dprime",
  "lt1",
  "lt2",
  "ef",
  "decoupling",
  "polarization",
  "fatigueExponent",
  "negativeSplit",
  "oneRm",
  "rpe",
] as const;

export type OnboardingInput = {
  stravaConnected: boolean;
  hasRuns: boolean;
  hasGoal: boolean;
  /** Nombre de jours de carnet renseignés */
  logDays: number;
};

export type OnboardingStep = { id: string; href: string; done: boolean };

/**
 * Le parcours « Bien démarrer » : quatre étapes vérifiées sur des données.
 * Les libellés sont `home.onboarding.steps.<id>` dans les messages.
 * Renvoie null quand tout est fait — la carte disparaît d'elle-même.
 */
export function onboardingSteps(input: OnboardingInput): {
  steps: OnboardingStep[];
  done: number;
  total: number;
} | null {
  const steps: OnboardingStep[] = [
    {
      id: "strava",
      href: "/settings",
      done: input.stravaConnected,
    },
    {
      id: "sync",
      href: "/settings",
      done: input.hasRuns,
    },
    {
      id: "goal",
      href: "/goals",
      done: input.hasGoal,
    },
    {
      id: "log",
      href: "/log",
      done: input.logDays >= 3,
    },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return { steps, done, total: steps.length };
}
