/**
 * Codes d'erreur des parcours de connexion (formulaires email, OAuth
 * Strava), traduits par l'interface (`login.errors.<code>`).
 *
 * Jamais de texte libre dans l'URL : `/login?error=…` ne doit pas pouvoir
 * afficher un message arbitraire (hameçonnage « ton compte est suspendu,
 * appelle ce numéro »). Un code inconnu devient une erreur générique.
 */
export const AUTH_ERROR_CODES = [
  "invalid",
  "credentials",
  "throttled",
  "email-taken",
  "email-invalid",
  "password-short",
  "password-long",
  "name-missing",
  "not-allowed",
  "bad-invite",
  "origin",
  "consent",
  "invite-required",
  "strava-denied",
  "strava-scope",
  "strava-taken",
  "strava-not-allowed",
  "strava-limit",
  "strava-unconfigured",
  "strava-failed",
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export function authErrorCode(raw: string | null | undefined): AuthErrorCode | "generic" | null {
  if (!raw) return null;
  return (AUTH_ERROR_CODES as readonly string[]).includes(raw) ? (raw as AuthErrorCode) : "generic";
}
