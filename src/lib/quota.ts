/**
 * Garde-fous d'une instance ouverte au public — fonctions pures.
 *
 * Un compte ne doit pas pouvoir remplir le disque ni monopoliser le serveur :
 * plafond d'activités stockées, nombre d'imports par heure. Largement au-delà
 * d'un usage réel (20 ans de course quotidienne ≈ 7 300 activités).
 */
export const MAX_ACTIVITIES_PER_USER = 20_000;
export const MAX_IMPORTS_PER_HOUR = 12;

export type ImportRefusal = "quota" | "rate";

export function importAllowed(input: {
  activityCount: number;
  importsLastHour: number;
}): ImportRefusal | null {
  if (input.activityCount >= MAX_ACTIVITIES_PER_USER) return "quota";
  if (input.importsLastHour >= MAX_IMPORTS_PER_HOUR) return "rate";
  return null;
}

/** Nombre d'activités encore acceptées avant le plafond. */
export function activitiesRoom(activityCount: number): number {
  return Math.max(0, MAX_ACTIVITIES_PER_USER - activityCount);
}

/**
 * Adresse IP du client pour le freinage. Derrière Caddy (déploiement
 * recommandé, serveur Next lié à 127.0.0.1), `X-Forwarded-For` est réécrit
 * par le proxy : sa première valeur est fiable. Sans proxy, l'en-tête pourrait
 * être forgé — le freinage par email reste alors le rempart principal.
 */
export function clientIp(headers: { get(name: string): string | null }): string {
  const xff = headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip")?.trim() || "unknown";
}
