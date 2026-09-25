import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exchangeCodeForToken } from "@/lib/strava";
import { encryptSecret, secretKeyFromEnv } from "@/lib/crypto";
import {
  canRegister,
  createSession,
  currentUser,
  pruneExpiredSessions,
  setSessionCookie,
  upsertUserFromStrava,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function fail(target: string, message: string) {
  return NextResponse.redirect(
    new URL(`${target}?error=${encodeURIComponent(message)}`, APP_URL)
  );
}

/**
 * Retour d'OAuth Strava. Deux usages en un :
 *
 * - visiteur non connecté → c'est une **connexion** : on crée ou retrouve le
 *   compte, puis on ouvre une session ;
 * - utilisateur déjà connecté → c'est un **rattachement** de compte Strava
 *   depuis les réglages (ou un renouvellement de tokens).
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const scope = req.nextUrl.searchParams.get("scope") ?? "";
  // `state` transporte le code d'invitation et la page d'origine.
  const state = new URLSearchParams(req.nextUrl.searchParams.get("state") ?? "");
  const invite = state.get("invite");

  const session = await currentUser();
  const back = session ? "/settings" : "/login";

  if (error || !code) {
    return fail(back, error ?? "Code d'autorisation manquant");
  }
  if (!scope.includes("activity:read")) {
    return fail(
      back,
      "Permission « activités » non accordée. Reconnecte-toi en cochant toutes les cases."
    );
  }

  try {
    const token = await exchangeCodeForToken(code);
    const athlete = token.athlete;
    if (!athlete) throw new Error("Profil athlète absent de la réponse Strava");

    const athleteId = BigInt(athlete.id);

    // Un compte Strava ne peut alimenter qu'un seul utilisateur : sinon deux
    // comptes importeraient les mêmes activités sans savoir qui est qui.
    const owner = await prisma.user.findUnique({ where: { athleteId } });
    if (session && owner && owner.id !== session.id) {
      return fail(
        "/settings",
        "Ce compte Strava est déjà rattaché à un autre utilisateur de cette instance."
      );
    }

    if (!session && !owner) {
      const decision = canRegister(athleteId, invite);
      if (!decision.ok) {
        return fail(
          "/login",
          decision.reason === "not-allowed"
            ? "Cette instance est privée : ton compte Strava n'est pas dans la liste d'accès."
            : "Code d'invitation invalide."
        );
      }
    }

    const { user, created } = session
      ? { user: session, created: false }
      : await upsertUserFromStrava(athlete);

    const data = {
      athleteId,
      firstname: athlete.firstname ?? null,
      lastname: athlete.lastname ?? null,
      profileUrl: athlete.profile ?? null,
      city: athlete.city ?? null,
      country: athlete.country ?? null,
      weightKg: athlete.weight ?? null,
      accessToken: encryptSecret(token.access_token, secretKeyFromEnv()),
      refreshToken: encryptSecret(token.refresh_token, secretKeyFromEnv()),
      expiresAt: token.expires_at,
      scope,
    };

    await prisma.stravaAccount.upsert({
      where: { userId: user.id },
      create: { ...data, userId: user.id },
      update: data,
    });

    if (!session) {
      const { token: sessionToken, expiresAt } = await createSession(
        user.id,
        req.headers.get("user-agent")
      );
      await setSessionCookie(sessionToken, expiresAt);
      void pruneExpiredSessions();
      // Un compte tout neuf n'a aucune donnée : on l'envoie synchroniser.
      return NextResponse.redirect(
        new URL(created ? "/settings?welcome=1" : "/", APP_URL)
      );
    }

    return NextResponse.redirect(new URL("/settings?connected=1", APP_URL));
  } catch (e) {
    return fail(back, e instanceof Error ? e.message : "Erreur inconnue");
  }
}
