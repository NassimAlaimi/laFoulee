import { NextRequest, NextResponse } from "next/server";
import { locales } from "@/i18n/routing";
import { safeNextPath } from "@/lib/locale";

export const dynamic = "force-dynamic";

/**
 * Pose le cookie NEXT_LOCALE puis revient d'où on venait.
 *
 * Le layout racine ne peut pas écrire de cookie (interdit hors Server Action /
 * Route Handler) : quand le profil et le cookie divergent (changement
 * d'appareil, première visite), il redirige ici, le cookie est posé, et la
 * page se re-rend dans la bonne langue. Sert aussi de sélecteur de langue sur
 * l'écran de connexion, avant toute session.
 */
export async function GET(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("lang");
  const next = req.nextUrl.searchParams.get("next");
  if (!lang || !(locales as readonly string[]).includes(lang)) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  // Route publique (sélecteur de l'écran de connexion) : jamais de
  // redirection hors du site.
  const target = safeNextPath(next);
  const res = NextResponse.redirect(new URL(target, req.url));
  res.cookies.set("NEXT_LOCALE", lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
