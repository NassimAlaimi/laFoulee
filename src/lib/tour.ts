/**
 * Visite guidée — étapes et placement des bulles.
 *
 * Le tour traverse les six pôles : chaque étape pointe une ancre (`anchor`,
 * un sélecteur `data-tour`) sur sa page, avec repli sur le `h1` si l'ancre
 * n'existe pas (état vide, plan absent…).
 *
 * `bubblePosition` est la géométrie pure du positionnement : la bulle se
 * place sous l'ancre quand il y a la place, bascule au-dessus, puis à droite
 * ou à gauche, et reste toujours entièrement dans la fenêtre. Testée
 * indépendamment du rendu React.
 */

export const TOUR_STORAGE_KEY = "foulee:tour:v1";

export type TourStep = {
  id: string;
  path: string;
  anchor: string;
  title: string;
  body: string;
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: "today",
    path: "/",
    anchor: '[data-tour="today"]',
    title: "Ton tableau de bord du matin",
    body: "La séance du jour, ta fraîcheur du moment et les chiffres de la semaine. Chaque page de l'app s'ouvre ainsi : un grand chiffre qui dit l'essentiel.",
  },
  {
    id: "preparation",
    path: "/",
    anchor: '[data-tour="preparation"]',
    title: "Le score de préparation",
    body: "Sommeil, fatigue, douleurs : dix secondes par jour dans le mini-carnet, et le score 0-100 se calcule tout seul. L'historique et la tendance vivent dans le Carnet.",
  },
  {
    id: "activities",
    path: "/activities",
    anchor: '[data-tour="activities"]',
    title: "Tout ce que tu as couru",
    body: "Chaque sortie a sa fiche : parcours, courbe cardiaque, intervalles repérés automatiquement, découplage aérobie. Clique une ligne pour l'ouvrir.",
  },
  {
    id: "plan",
    path: "/training",
    anchor: '[data-tour="plan"]',
    title: "Ton plan, semaine par semaine",
    body: "Le plan se recale chaque semaine sur tes check-ins (douleur, fatigue, disponibilité). La section Conformité colore ce que tu as réellement exécuté.",
  },
  {
    id: "analyse",
    path: "/analysis",
    anchor: '[data-tour="forme"]',
    title: "La science derrière tes jambes",
    body: "Condition, fatigue et fraîcheur (le modèle des équipes pro), tes seuils personnalisés et ta vitesse critique — tout est calculé depuis tes sorties.",
  },
  {
    id: "objectifs",
    path: "/goals",
    anchor: '[data-tour="objectifs"]',
    title: "Prépare une course",
    body: "Un objectif ouvre le plan d'entraînement, le compte à rebours et le plan de course : importe le GPX du parcours, les allures s'ajustent à la pente.",
  },
  {
    id: "corps",
    path: "/corps",
    anchor: '[data-tour="corps"]',
    title: "La force et le matériel",
    body: "La musculation du coureur (avec garde-fou de charge) et le kilométrage de tes chaussures. Le socle qui rend le plan soutenable.",
  },
  {
    id: "fin",
    path: "",
    anchor: "",
    title: "C'est parti",
    body: "L'app se remplit au fil des synchronisations Strava. Remplis le carnet ce soir, et reviens demain matin : la page Aujourd'hui aura changé.",
  },
];

export type Rect = { top: number; left: number; width: number; height: number };

export type BubblePos = {
  left: number;
  top: number;
  /** Côté de la bulle d'où part la flèche (elle pointe vers l'ancre) */
  arrow: "top" | "bottom" | "left" | "right";
  /** Décalage horizontal de la flèche depuis le bord gauche de la bulle */
  arrowOffset: number;
};

const BUBBLE_WIDTH = 360;

/** Bulle générique « fin de tour » : centrée, sans flèche. */
export function centeredBubble(
  viewport: { width: number; height: number },
  bubbleHeight: number
): BubblePos {
  return {
    left: Math.max(12, (viewport.width - BUBBLE_WIDTH) / 2),
    top: Math.max(12, (viewport.height - bubbleHeight) / 2),
    arrow: "bottom",
    arrowOffset: BUBBLE_WIDTH / 2,
  };
}

/**
 * Positionne la bulle autour de l'ancre, sans jamais sortir de la fenêtre.
 * Priorité : dessous → dessus → à droite → à gauche.
 */
export function bubblePosition(
  anchor: Rect,
  bubble: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = 14
): BubblePos {
  const width = Math.min(bubble.width, viewport.width - 2 * margin);
  const centerX = anchor.left + anchor.width / 2;
  const left = Math.min(
    Math.max(centerX - width / 2, margin),
    viewport.width - width - margin
  );
  const arrowOffset = Math.min(
    Math.max(centerX - left, 24),
    width - 24
  );

  // Dessous ?
  if (anchor.top + anchor.height + margin + bubble.height <= viewport.height - margin) {
    return { left, top: anchor.top + anchor.height + margin, arrow: "top", arrowOffset };
  }
  // Dessus ?
  if (anchor.top - margin - bubble.height >= margin) {
    return { left, top: anchor.top - margin - bubble.height, arrow: "bottom", arrowOffset };
  }
  // À droite ?
  if (anchor.left + anchor.width + margin + width <= viewport.width - margin) {
    const top = Math.min(
      Math.max(anchor.top + anchor.height / 2 - bubble.height / 2, margin),
      viewport.height - bubble.height - margin
    );
    return { left: anchor.left + anchor.width + margin, top, arrow: "left", arrowOffset: bubble.height / 2 };
  }
  // À gauche, sinon.
  return {
    left: Math.max(margin, anchor.left - margin - width),
    top: Math.min(
      Math.max(anchor.top + anchor.height / 2 - bubble.height / 2, margin),
      viewport.height - bubble.height - margin
    ),
    arrow: "right",
    arrowOffset: bubble.height / 2,
  };
}
