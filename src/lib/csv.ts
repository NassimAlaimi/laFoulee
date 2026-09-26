/** Cellule CSV (RFC 4180) protégée contre l'injection de formules. */
export function csvCell(v: unknown): string {
  if (v == null) return "";
  let s = String(v);
  // Injection de formule : un nom d'activité « =HYPERLINK(…) » serait exécuté
  // par le tableur. On neutralise tout texte qui commence comme une formule.
  if (typeof v === "string" && /^[=+@\t\r]|^-(?![\d.])/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
