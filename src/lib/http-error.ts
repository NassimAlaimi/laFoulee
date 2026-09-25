/**
 * Gestion des erreurs exposées à l'utilisateur.
 *
 * Règle de sécurité : un utilisateur ne voit **jamais** la cause réelle d'une
 * erreur — ni corps de réponse d'une API tierce (Strava, Overpass, DeepSeek),
 * ni pile, ni erreur Prisma/SQL. Toute erreur « inconnue » est journalisée
 * côté serveur (console) et remplacée par un message générique.
 *
 * Pour montrer un message précis et utile (ex. « reconnecte-toi à Strava »),
 * on lève une `UserFacingError` : son `message` est réputé sûr à afficher.
 */

/** Erreur dont le message est sûr à montrer à l'utilisateur. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

/**
 * Erreur d'une API tierce. Le message reste sûr (aucun corps de réponse),
 * mais le code HTTP est conservé pour la logique de contrôle (quota, 404…).
 */
export class UpstreamError extends UserFacingError {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

const GENERIC = "Une erreur est survenue. Réessaie dans un instant.";

/**
 * Message sûr à afficher pour l'utilisateur.
 * - `UserFacingError` (et ses sous-classes) → son message ;
 * - toute autre erreur → journalisée en détail côté serveur, remplacée par un
 *   message générique. La cause réelle ne traverse jamais l'API.
 */
export function toSafeMessage(err: unknown): string {
  if (err instanceof UserFacingError) return err.message;
  if (err instanceof Error) {
    console.error(`[api] ${err.name}: ${err.message}\n${err.stack ?? ""}`);
  } else {
    console.error("[api]", err);
  }
  return GENERIC;
}
