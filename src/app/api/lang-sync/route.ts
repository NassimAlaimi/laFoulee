import { NextRequest, NextResponse } from "next/server";
import { locales } from "@/i18n/routing";

export const dynamic = "force-dynamic";

/**
 * Pose le cookie NEXT_LOCALE puis revient d'où on venait.
 *
 * Le layout racine ne peut pas écrire de cookie (interdit hors Server Action /
 * Route Handler) : quand le profil et le cookie divergent (changement
 * d'appareil, première visite), il redirige ici, le cookie est posé, et la
 * page se re-rend dans la bonne langue.
 */
export async function GET(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("lang");
  const next = req.nextUrl.searchParams.get("next");
  if (!lang || !(locales as readonly string[]).includes(lang)) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  const target = next && next.startsWith("/") ? next : "/";
  const res = NextResponse.redirect(new URL(target, req.url));
  res.cookies.set("NEXT_LOCALE", lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
