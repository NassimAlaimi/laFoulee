/**
 * Aide & accueil des nouveaux — données pures.
 *
 * - **PAGE_HELP** : « cette page en trois phrases » + raccourcis, pour le
 *   bouton « ? » des en-têtes de page (PageHelp).
 * - **LEXIQUE** : les termes du sport de haut niveau traduits en langage
 *   courant, affichés sur /lexique.
 * - **onboardingSteps** : le parcours « Bien démarrer » de l'accueil —
 *   quatre étapes vérifiées sur des données réelles, pas sur un clic.
 */

export type HelpEntry = {
  /** Préfixe de chemin auquel cette aide s'applique */
  path: string;
  title: string;
  lines: string[];
  links?: Array<{ href: string; label: string }>;
};

export const PAGE_HELP: HelpEntry[] = [
  {
    path: "/",
    title: "Aujourd'hui",
    lines: [
      "La page du matin : la séance du jour, ta fraîcheur (TSB) et le mini-carnet pour alimenter ton score de préparation.",
      "Les chiffres viennent de tes sorties synchronisées — plus tu cours, plus cette page parle.",
    ],
    links: [
      { href: "/training", label: "Voir le plan" },
      { href: "/log", label: "Carnet complet" },
    ],
  },
  {
    path: "/log",
    title: "Le carnet",
    lines: [
      "Sommeil, fatigue, moral, douleurs : une ligne par jour, autant de passes que tu veux.",
      "Le score de préparation (0-100) se calcule par pénalités transparentes — chaque retrait est expliqué.",
      "La corrélation avec ta charge (ATL) dit si ta forme du matin répond à l'entraînement.",
    ],
    links: [{ href: "/", label: "Retour à Aujourd'hui" }],
  },
  {
    path: "/activities",
    title: "Tes activités",
    lines: [
      "Tout ce que tu as couru, importé de Strava. Clique une sortie pour sa fiche : parcours, courbe cardiaque, intervalles repérés.",
      "Les notes privées et le ressenti ne sont jamais écrasés par la synchronisation.",
    ],
  },
  {
    path: "/training",
    title: "Ton plan d'entraînement",
    lines: [
      "Le plan se recale chaque semaine sur tes check-ins : douleur, fatigue, jours disponibles.",
      "La section Conformité compare ce qui était prévu à ce qui a été fait, semaine par semaine.",
      "Marque les séances « fait » pour nourrir les deux.",
    ],
    links: [
      { href: "/workouts", label: "Bibliothèque de séances" },
      { href: "/goals", label: "Objectifs" },
    ],
  },
  {
    path: "/workouts",
    title: "La bibliothèque de séances",
    lines: [
      "Les séances fondamentales de la préparation, avec tes allures calculées depuis ton VDOT.",
      "Un 5 km couru à fond recale toutes les allures — c'est la séance « Test d'étalonnage ».",
    ],
  },
  {
    path: "/goals",
    title: "Tes objectifs de course",
    lines: [
      "Un objectif ouvre le compte à rebours, le plan d'entraînement et le plan de course.",
      "Dans le plan de course, importe le GPX du parcours : les allures s'ajustent à la pente.",
    ],
  },
  {
    path: "/analysis",
    title: "Forme & charge",
    lines: [
      "Condition (CTL), fatigue (ATL), fraîcheur (TSB) : le modèle qu'utilisent les équipes pro.",
      "La répartition de l'intensité vérifie la règle des 80 % faciles / 20 % intenses.",
    ],
    links: [
      { href: "/analysis/modeles", label: "Modèles & seuils" },
      { href: "/analysis/seances", label: "Séances passées" },
    ],
  },
  {
    path: "/analysis/modeles",
    title: "Modèles & seuils",
    lines: [
      "Vitesse critique, prédictions potentiel/réaliste, seuils LT1/LT2 : tes capacités mesurées.",
      "Les seuils sont lus dans ta relation allure → fréquence cardiaque réelle, pas dans des % génériques.",
    ],
  },
  {
    path: "/analysis/seances",
    title: "Séances passées",
    lines: [
      "Les intervalles sont repérés automatiquement dans tes kilomètres, avec régularité et fatigue.",
      "Le découplage aérobie (< 5 % = bon) et l'efficience (EF) racontent ton développement d'endurance.",
    ],
  },
  {
    path: "/records",
    title: "Performance",
    lines: [
      "Tes records, ton niveau (VDOT) et tes prédictions par distance.",
      "Le VDOT monte quand un record tombe — c'est lui qui calibre toutes les allures de l'app.",
    ],
    links: [{ href: "/calculator", label: "Calculateur express" }],
  },
  {
    path: "/calculator",
    title: "Le calculateur",
    lines: [
      "Entre une performance récente (une course, un 5 km à fond) : l'app en déduit ton niveau et toutes tes allures.",
      "Pré-rempli avec ta meilleure performance réelle.",
    ],
  },
  {
    path: "/corps",
    title: "Corps",
    lines: [
      "La musculation du coureur (avec garde-fou de charge) et le kilométrage de tes chaussures.",
      "Le renforcement rend le plan soutenable : c'est le socle, pas l'annexe.",
    ],
    links: [
      { href: "/strength", label: "Musculation" },
      { href: "/gear", label: "Matériel" },
    ],
  },
  {
    path: "/strength",
    title: "Musculation",
    lines: [
      "Séances, 1RM, force relative, objectifs de force et garde-fou de charge (ACWR muscu).",
      "Épingle tes exercices favoris pour les retrouver en premier.",
    ],
  },
  {
    path: "/gear",
    title: "Matériel",
    lines: [
      "Le kilométrage de chaque paire et son seuil de remplacement.",
      "Marque une paire « principale » : elle apparaît sur le hub Corps.",
    ],
  },
  {
    path: "/plus",
    title: "Plus",
    lines: [
      "La rétrospective annuelle imprimable, l'agenda iCal, l'export de tes données et les réglages.",
      "C'est aussi ici que vit la visite guidée, si tu veux la refaire.",
    ],
    links: [{ href: "/lexique", label: "Lexique des termes" }],
  },
  {
    path: "/settings",
    title: "Réglages",
    lines: [
      "Connexion Strava, synchronisation, profil athlète (FC, poids…) et préférences.",
      "Les champs du profil alimentent les modèles : plus ils sont renseignés, plus les chiffres sont précis.",
    ],
    links: [{ href: "/lexique", label: "Lexique des termes" }],
  },
  {
    path: "/recap",
    title: "La rétrospective",
    lines: [
      "L'année en un coup d'œil : kilomètres, courses, records, régularité. Imprimable.",
      "Toute l'année sur une frise — idéale pour mesurer le chemin parcouru.",
    ],
  },
  {
    path: "/lexique",
    title: "Le lexique",
    lines: [
      "Tous les termes de l'app traduits en langage courant.",
      "CTL, VDOT, seuils, efficience : reviens ici quand un chiffre te résiste.",
    ],
  },
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

export type LexiqueEntry = { term: string; abbr?: string; def: string };

export const LEXIQUE: LexiqueEntry[] = [
  { term: "CTL", def: "Condition. Moyenne de ta charge sur 42 jours — ta « caisse » : elle monte lentement et se perd lentement." },
  { term: "ATL", def: "Fatigue. Moyenne de ta charge sur 7 jours — ce que tu as encaissé récemment." },
  { term: "TSB", def: "Fraîcheur = condition − fatigue. Négative en période de charge, positive quand tu es affûté. C'est le chiffre du pic de forme." },
  { term: "ACWR", def: "Rapport charge aiguë (7 j) / charge chronique (28 j). Au-dessus de 1,5, la montée en charge est rapide : risque de blessure." },
  { term: "TRIMP", def: "Charge d'entraînement d'une séance, calculée depuis sa durée et ta fréquence cardiaque (ou un équivalent kilométrique)." },
  { term: "VDOT", def: "Ton niveau de forme en un nombre (≈ VO2max effectif), déduit de ta meilleure performance. Il calibre toutes les allures de l'app." },
  { term: "VMA", def: "Vitesse maximale aérobie — l'allure à laquelle tu consommes ton maximum d'oxygène, tenable ~6 minutes." },
  { term: "Vitesse critique", abbr: "CS", def: "L'allure que tu peux tenir longtemps (~45-60 min). Calculée sur tes efforts de 2 à 20 minutes." },
  { term: "D′", def: "Réserve anaérobie : la distance que tu peux courir au-dessus de ta vitesse critique avant d'exploser. Un D′ faible = profil diesel." },
  { term: "LT1", def: "Seuil aérobie : la frontière entre l'endurance facile et le travail soutenu. En dessous, tu peux parler." },
  { term: "LT2", def: "Seuil anaérobie : l'allure la plus rapide que tu peux tenir sans accumuler de lactate. Proche de ta vitesse critique." },
  { term: "Efficience", abbr: "EF", def: "Mètres par minute par battement de cœur. Elle monte quand le même cœur produit plus de vitesse : le marqueur de ta base aérobie." },
  { term: "Découplage aérobie", def: "Perte d'efficience entre la première et la seconde moitié d'une sortie. Sous 5 %, l'endurance tient la distance." },
  { term: "Polarisation", def: "La répartition de ton volume : ~80 % facile, ~20 % intense. Éviter la « zone grise » entre les deux." },
  { term: "Exposant de fatigue", def: "Comment ton allure se dégrade quand la distance double (référence : +4,2 %). Mesuré sur tes propres performances." },
  { term: "Split négatif", def: "Finir plus vite qu'on a commencé — la stratégie de course la plus fiable sur longue distance." },
  { term: "1RM", def: "Répétition maximale : la charge que tu peux soulever une seule fois, estimée depuis tes séries de musculation." },
  { term: "RPE", def: "Effort perçu, noté de 1 à 10. Complète les chiffres quand la montre ne suffit pas." },
];

export type OnboardingInput = {
  stravaConnected: boolean;
  hasRuns: boolean;
  hasGoal: boolean;
  /** Nombre de jours de carnet renseignés */
  logDays: number;
};

export type OnboardingStep = { id: string; label: string; href: string; done: boolean };

/**
 * Le parcours « Bien démarrer » : quatre étapes vérifiées sur des données.
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
      label: "Connecter ton compte Strava",
      href: "/settings",
      done: input.stravaConnected,
    },
    {
      id: "sync",
      label: "Synchroniser tes activités",
      href: "/settings",
      done: input.hasRuns,
    },
    {
      id: "goal",
      label: "Créer un objectif de course",
      href: "/goals",
      done: input.hasGoal,
    },
    {
      id: "log",
      label: "Remplir le carnet 3 jours de suite",
      href: "/log",
      done: input.logDays >= 3,
    },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return { steps, done, total: steps.length };
}
