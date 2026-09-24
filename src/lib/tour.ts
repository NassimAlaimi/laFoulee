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
};
/** Les textes vivent dans les messages i18n : `tour.steps.<id>.{title,body}`. */
export const TOUR_STEPS: TourStep[] = [
  { id: "today", path: "/", anchor: '[data-tour="today"]' },
  { id: "preparation", path: "/", anchor: '[data-tour="preparation"]' },
  { id: "activities", path: "/activities", anchor: '[data-tour="activities"]' },
  { id: "plan", path: "/training", anchor: '[data-tour="plan"]' },
  { id: "analyse", path: "/analysis", anchor: '[data-tour="forme"]' },
  { id: "objectifs", path: "/goals", anchor: '[data-tour="objectifs"]' },
  { id: "corps", path: "/corps", anchor: '[data-tour="corps"]' },
  { id: "fin", path: "", anchor: "" },
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
