import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearSessionCookie, currentUserId } from "@/lib/auth";
import { deauthorize } from "@/lib/strava";

export const dynamic = "force-dynamic";

/**
 * Suppression définitive du compte.
 *
 * Tout est en cascade depuis User : activités, objectifs, plans, séances,
 * réglages, matériel, sessions. Rien ne survit à l'appel.
 *
 * L'autorisation Strava est révoquée d'abord : sans ça, le compte disparaît de
 * l'instance mais l'athlète resterait décompté du quota de l'application.
 */
export async function DELETE() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  await deauthorize(userId);
  await prisma.user.delete({ where: { id: userId } });
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
