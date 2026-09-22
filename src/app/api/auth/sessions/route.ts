import { NextResponse } from "next/server";
import { clearSessionCookie, currentUserId, destroyAllSessions } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Déconnecte tous les appareils — utile si un téléphone est perdu. */
export async function DELETE() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  await destroyAllSessions(userId);
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
