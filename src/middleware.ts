import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-shared";
import { buildCsp, makeNonce } from "@/lib/security-headers";

/**
 * Garde d'entrée.
 *
 * Le middleware tourne sur le runtime Edge : il ne peut pas interroger Prisma.
 * Il ne fait donc qu'un filtrage sur la *présence* du cookie — la validité
 * réelle de la session est vérifiée côté serveur par `requireUser()`. Un
 * cookie forgé ne donne accès à rien, il fait juste perdre un aller-retour.
 */
// Le flux agenda est public par nature (un agenda n'envoie pas de cookie) :
// il est protégé par le jeton secret de son URL, vérifié dans la route.
// Connexion par email et choix de la langue : accessibles avant toute session.
const PUBLIC_PREFIXES = [
  "/login",
  "/api/strava/connect",
  "/api/strava/callback",
  "/api/strava/webhook",
  "/api/calendar",
  "/api/auth/signin",
  "/api/auth/signup",
  "/api/lang-sync",
];

/**
 * Laisse passer la requête avec une CSP à nonce : le nonce est transmis au
 * rendu (en-tête de requête `x-nonce`, lu par le layout ; Next le repère
 * aussi dans la CSP de la requête pour l'apposer à ses propres scripts).
 */
function pass(req: NextRequest) {
  const nonce = makeNonce();
  const csp = buildCsp(nonce, {
    dev: process.env.NODE_ENV !== "production",
    https: (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://"),
  });
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("content-security-policy", csp);
  return res;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return pass(req);
  }

  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (hasSession) return pass(req);

  // Les routes API répondent en JSON : une redirection HTML y serait illisible.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Tout sauf les ressources statiques et le manifeste.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest).*)"],
};
