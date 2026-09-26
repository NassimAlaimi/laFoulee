/**
 * Empreinte d'une erreur serveur — pure, pour regrouper les occurrences.
 *
 * Les parties variables (identifiants, nombres, UUID, cuid, chemins de
 * fichiers temporaires) sont neutralisées : « activité 123 introuvable » et
 * « activité 456 introuvable » sont la même panne.
 */
export function normalizeErrorMessage(message: string): string {
  return message
    .split("\n")[0]
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>")
    .replace(/\bc[a-z0-9]{24}\b/g, "<id>")
    .replace(/\d+(\.\d+)?/g, "<n>")
    .trim()
    .slice(0, 300);
}

export function errorFingerprint(source: string, message: string): string {
  const s = `${source}|${normalizeErrorMessage(message)}`;
  // FNV-1a 32 bits, en hexadécimal : court, stable, suffisant pour regrouper.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${source.slice(0, 60)}:${(h >>> 0).toString(16).padStart(8, "0")}`;
}
