import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/auth";
import { deauthorize } from "@/lib/strava";

export const dynamic = "force-dynamic";

/**
 * Détache le compte Strava de l'utilisateur. Les activités importées restent.
 *
 * La révocation côté Strava vient *avant* la suppression locale : une fois les
 * tokens effacés, plus aucun appel authentifié n'est possible et l'athlète
 * resterait décompté du quota de l'application jusqu'à une révocation manuelle
 * depuis strava.com/settings/apps.
 */
export async function POST() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const revoked = await deauthorize(userId);
  await prisma.stravaAccount.deleteMany({ where: { userId } });

  return NextResponse.json({ ok: true, revoked });
}
