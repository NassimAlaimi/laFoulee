import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchActivityDetail, fetchAthlete, getValidAccessToken } from "@/lib/strava";
import { forgetStravaActivity, purgeStravaData } from "@/lib/strava-purge";
import { classifyStravaEvent, verifySubscription, type StravaEvent } from "@/lib/strava-webhook";
import { UpstreamError } from "@/lib/http-error";

export const dynamic = "force-dynamic";

/** Validation de l'abonnement par Strava (une fois, à la création). */
export async function GET(req: NextRequest) {
  const ok = verifySubscription(req.nextUrl.searchParams, process.env.STRAVA_WEBHOOK_VERIFY_TOKEN);
  return ok ? NextResponse.json(ok) : NextResponse.json({ error: "forbidden" }, { status: 403 });
}

/**
 * Événements Strava. Réponse immédiate (Strava exige < 2 s), traitement après.
 * Rien n'est effacé sur la seule foi de l'événement (non signé) : on vérifie
 * auprès de Strava que l'accès est bien révoqué / l'activité bien supprimée.
 */
export async function POST(req: NextRequest) {
  const evt = (await req.json().catch(() => null)) as StravaEvent | null;
  if (!evt || typeof evt !== "object") return NextResponse.json({ ok: true });
  const action = classifyStravaEvent(evt, process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID || null);
  if (action.kind === "ignore") return NextResponse.json({ ok: true });

  after(async () => {
    const user = await prisma.user.findUnique({ where: { athleteId: action.athleteId }, select: { id: true } });
    if (!user) return;
    try {
      if (action.kind === "deauth") {
        if (!(await accessRevoked(user.id))) return;
        const report = await purgeStravaData(user.id);
        console.info("[strava:webhook] révocation — données Strava effacées", user.id, report);
      } else {
        if (!(await activityGone(user.id, action.activityId))) return;
        await forgetStravaActivity(user.id, action.activityId);
      }
    } catch (e) {
      console.error("[strava:webhook]", action.kind, e);
    }
  });
  return NextResponse.json({ ok: true });
}

const gone = (e: unknown) => e instanceof UpstreamError && [400, 401, 403].includes(e.status);

/** Vrai si Strava refuse désormais nos jetons pour cet utilisateur. */
async function accessRevoked(userId: string): Promise<boolean> {
  const hasAccount = await prisma.stravaAccount.findUnique({ where: { userId }, select: { id: true } });
  if (!hasAccount) return true; // déjà déconnecté chez nous : on termine l'effacement
  try {
    await fetchAthlete(await getValidAccessToken(userId));
    return false; // l'accès fonctionne : événement forgé ou périmé
  } catch (e) {
    return gone(e);
  }
}

/** Vrai si l'activité n'existe plus côté Strava (404). */
async function activityGone(userId: string, id: bigint): Promise<boolean> {
  try {
    await fetchActivityDetail(await getValidAccessToken(userId), id);
    return false;
  } catch (e) {
    return e instanceof UpstreamError && e.status === 404;
  }
}
