/**
 * « La Une » — l'accueil n'est pas une grille de cartes, c'est le journal du
 * coureur : son **édition** change selon la situation. Ce module choisit
 * l'édition du jour à partir de l'état (prochaine course, dernière course,
 * phase du plan). L'édition « Quotidienne » est l'accueil actuel ; les
 * éditions de course viennent en Une quand elles comptent.
 *
 * Fonctions pures, testées dans tests/edition.test.ts.
 */

export type EditionKey = "daily" | "raceEve" | "raceDay" | "raceAfter" | "taper" | "offseason";

export type EditionInput = {
  /** jours avant la prochaine course (0 = aujourd'hui), null si aucune */
  nextRaceDays: number | null;
  /** jours depuis la dernière course courue (0 = aujourd'hui), null si aucune */
  lastRaceDays: number | null;
  /** phase du plan actif, null si aucun */
  phase: string | null;
  /** jours jusqu'à la prochaine course de priorité A */
  aRaceDays: number | null;
};

export function editionFor(input: EditionInput): EditionKey {
  // 1. Jour de course.
  if (input.nextRaceDays !== null && input.nextRaceDays === 0) return "raceDay";
  // 2. Lendemain de course (on digère, on récupère, on débrieffe).
  if (input.lastRaceDays !== null && input.lastRaceDays >= 0 && input.lastRaceDays <= 2) return "raceAfter";
  // 3. Veille de course.
  if (input.nextRaceDays !== null && input.nextRaceDays >= 1 && input.nextRaceDays <= 3) return "raceEve";
  // 4. Semaine d'affûtage.
  if (input.phase === "taper") return "taper";
  // 5. Hors saison : rien devant.
  if (input.nextRaceDays === null && input.phase === null) return "offseason";
  return "daily";
}

/** La manchette (grande phrase) de l'édition — clé i18n `edition.manchette.*`. */
export function editionHeadline(key: EditionKey, params: { name?: string; days?: number; km?: number } = {}): { key: string; params: Record<string, string | number> } {
  switch (key) {
    case "raceDay":
      return { key: "raceDay", params: { name: params.name ?? "" } };
    case "raceEve":
      return { key: "raceEve", params: { days: params.days ?? 1 } };
    case "raceAfter":
      return { key: "raceAfter", params: { name: params.name ?? "" } };
    case "taper":
      return { key: "taper", params: {} };
    case "offseason":
      return { key: "offseason", params: {} };
    default:
      return { key: "daily", params: {} };
  }
}
