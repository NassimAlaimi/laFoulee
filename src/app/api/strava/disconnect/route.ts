import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { deauthorize } from "@/lib/strava";
import { purgeStravaData } from "@/lib/strava-purge";

export const dynamic = "force-dynamic";

/**
 * Détache le compte Strava de l'utilisateur et efface ses données Strava
 * (politique API Strava §7.4). Les fichiers importés, le carnet, les objectifs
 * et les plans restent.
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
  const purged = await purgeStravaData(userId);

  return NextResponse.json({ ok: true, revoked, purged });
}
