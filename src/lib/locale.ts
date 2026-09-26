/**
 * Choix de la langue avant toute connexion — fonctions pures.
 */

/**
 * Négociation `Accept-Language` : renvoie la première langue prise en charge,
 * par ordre de préférence (q), en ne regardant que la langue primaire
 * (« en-GB » → « en »). `null` si rien ne correspond.
 */
export function negotiateLocale(
  header: string | null | undefined,
  supported: readonly string[]
): string | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { lang: tag.trim().toLowerCase().split("-")[0], weight, index };
    })
    .filter((x) => x.lang && x.lang !== "*" && Number.isFinite(x.weight) && x.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  return ranked.find((x) => supported.includes(x.lang))?.lang ?? null;
}

/**
 * Chemin de retour sûr après une redirection : uniquement un chemin interne
 * (« /… »), jamais « //hôte » ni « /\hôte » que les navigateurs traitent
 * comme une URL absolue — sinon redirection ouverte.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}
