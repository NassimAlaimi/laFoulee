import { NextRequest, NextResponse } from "next/server";
import { safeNextPath } from "@/lib/locale";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Codes d'erreur traduits par la page de connexion (clés `login.errors.*`). */
export type CredentialError =
  | "invalid"
  | "credentials"
  | "throttled"
  | "email-taken"
  | "email-invalid"
  | "password-short"
  | "password-long"
  | "name-missing"
  | "not-allowed"
  | "bad-invite"
  | "origin"
  | "consent";

/** Retour à l'écran de connexion (303 : le POST devient un GET). */
export function backToLogin(mode: "signin" | "signup", error: CredentialError) {
  const q = new URLSearchParams({ mode, error });
  return NextResponse.redirect(new URL(`/login?${q}`, APP_URL), 303);
}

export function redirectTo(path: string) {
  return NextResponse.redirect(new URL(safeNextPath(path), APP_URL), 303);
}

/**
 * Un formulaire d'identifiants ne s'accepte que depuis notre propre origine :
 * sinon un site tiers pourrait connecter un visiteur à *son* compte à lui
 * (CSRF de connexion — SameSite=Lax ne couvre pas ce cas).
 */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // navigateurs anciens / clients sans Origin
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
