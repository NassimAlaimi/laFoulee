/**
 * En-têtes de sécurité HTTP — fonctions pures (utilisées par le middleware
 * et next.config).
 *
 * CSP à nonce : chaque réponse HTML reçoit un nonce aléatoire ; seuls les
 * scripts qui le portent s'exécutent (Next l'appose à ses propres scripts,
 * le layout à son script de thème). `strict-dynamic` laisse ces scripts
 * charger leurs morceaux. Un script injecté (XSS) n'a pas le nonce : bloqué.
 */
export function buildCsp(nonce: string, opts: { dev: boolean; https?: boolean }): string {
  const script = [`'self'`, `'nonce-${nonce}'`, `'strict-dynamic'`];
  // Turbopack / React Refresh évaluent du code en développement.
  if (opts.dev) script.push(`'unsafe-eval'`);
  return [
    `default-src 'self'`,
    `script-src ${script.join(" ")}`,
    // Attributs style={{…}} de React (positions de graphiques) : inline requis.
    `style-src 'self' 'unsafe-inline'`,
    // Photos de profil Strava (CDN tiers) ; tout le reste est local ou en data:.
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self'${opts.dev ? " ws: wss:" : ""}`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    // Le formulaire « Connect with Strava » aboutit (par redirection) chez Strava.
    `form-action 'self' https://www.strava.com`,
    // Seulement si l'instance est servie en HTTPS : sinon, en HTTP simple,
    // le navigateur chercherait des ressources https:// inexistantes.
    ...(opts.https && !opts.dev ? [`upgrade-insecure-requests`] : []),
  ].join("; ");
}

/** En-têtes fixes, valables pour toutes les réponses (fichiers statiques compris). */
export function staticSecurityHeaders(opts: { https: boolean }): Array<{ key: string; value: string }> {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ...(opts.https ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
  ];
}

/** Nonce base64 de 128 bits (Web Crypto : disponible sur le runtime Edge). */
export function makeNonce(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}
