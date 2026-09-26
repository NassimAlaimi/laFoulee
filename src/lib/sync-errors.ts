/**
 * Clé de traduction d'une erreur de synchro renvoyée par l'API (code). Module
 * sans dépendance serveur : importable par les composants client.
 */
const KNOWN = ["no-account", "expired", "rate-limit", "unavailable", "busy", "generic"] as const;
export type SyncErrorKey = (typeof KNOWN)[number];

export function syncErrorKey(code: unknown): SyncErrorKey {
  return (KNOWN as readonly unknown[]).includes(code) ? (code as SyncErrorKey) : "generic";
}
