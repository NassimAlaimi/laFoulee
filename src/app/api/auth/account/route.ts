import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearSessionCookie, currentUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Suppression définitive du compte.
 *
 * Tout est en cascade depuis User : activités, objectifs, plans, séances,
 * réglages, matériel, sessions. Rien ne survit à l'appel.
 */
export async function DELETE() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  await prisma.user.delete({ where: { id: userId } });
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
