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

/** Erreur dont le message est sûr à montrer à l'utilisateur. Le `code`
 *  (facultatif) permet à l'interface d'afficher sa propre traduction. */
export class UserFacingError extends Error {
  constructor(
    message: string,
    readonly code?: string
  ) {
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
    message: string,
    code?: string
  ) {
    super(message, code);
    this.name = "UpstreamError";
  }
}

const GENERIC = "Une erreur est survenue. Réessaie dans un instant.";

/**
 * Rapporteur branché au démarrage du serveur (instrumentation.ts → journal
 * des erreurs en base). Absent dans les tests : ce module reste pur.
 */
let reporter: ((source: string, err: unknown) => void) | null = null;
export function setErrorReporter(fn: (source: string, err: unknown) => void): void {
  reporter = fn;
}

/**
 * Quota Strava « athlètes connectés » atteint (403 « Limit of connected
 * athletes exceeded »). Le message invite à libérer une place ou à importer
 * des fichiers. Le callback OAuth la traite à part (éviction automatique).
 */
export class AthleteLimitError extends UserFacingError {
  constructor() {
    super(
      "La limite d'athlètes connectés à cette application Strava est atteinte (10). Un compte doit se déconnecter pour libérer une place, ou utilise l'import de fichiers (FIT/GPX/TCX) sans Strava."
    );
    this.name = "AthleteLimitError";
  }
}

/** Codes d'erreur de synchronisation, traduits par l'interface (`syncErrors.*`). */
export const SYNC_ERROR_CODES = ["no-account", "expired", "rate-limit", "unavailable", "busy", "generic"] as const;
export type SyncErrorCode = (typeof SYNC_ERROR_CODES)[number];

/** Code traduisible d'une erreur ; `generic` pour tout ce qui n'est pas prévu. */
export function errorCode(err: unknown): SyncErrorCode {
  const c = err instanceof UserFacingError ? err.code : undefined;
  return (SYNC_ERROR_CODES as readonly string[]).includes(c ?? "") ? (c as SyncErrorCode) : "generic";
}

/**
 * Message sûr à afficher pour l'utilisateur.
 * - `UserFacingError` (et ses sous-classes) → son message ;
 * - toute autre erreur → journalisée en détail côté serveur, remplacée par un
 *   message générique. La cause réelle ne traverse jamais l'API.
 */
export function toSafeMessage(err: unknown, source = "api"): string {
  if (err instanceof UserFacingError) return err.message;
  reporter?.(source, err);
  if (err instanceof Error) {
    console.error(`[api] ${err.name}: ${err.message}\n${err.stack ?? ""}`);
  } else {
    console.error("[api]", err);
  }
  return GENERIC;
}
