import { NextRequest, NextResponse } from "next/server";
import { buildAuthorizeUrl, isStravaConfigured } from "@/lib/strava";
import { currentUser, inviteCode } from "@/lib/auth";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * Départ vers Strava. Sert à la fois de connexion et de rattachement.
 * Le code d'invitation éventuel voyage dans `state` : Strava nous le rend tel
 * quel, ce qui évite un cookie temporaire.
 */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  const target = user ? "/settings" : "/login";

  if (!isStravaConfigured()) {
    return NextResponse.redirect(
      new URL(`${target}?error=strava-unconfigured`, APP_URL)
    );
  }

  const invite = req.nextUrl.searchParams.get("invite")?.trim() ?? "";
  if (!user && inviteCode() && !invite) {
    return NextResponse.redirect(
      new URL("/login?error=invite-required", APP_URL)
    );
  }

  const state = new URLSearchParams({ v: "1" });
  if (invite) state.set("invite", invite);

  return NextResponse.redirect(buildAuthorizeUrl(state.toString()));
}
