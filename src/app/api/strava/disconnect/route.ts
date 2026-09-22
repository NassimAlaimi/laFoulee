import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Détache le compte Strava de l'utilisateur. Les activités importées restent. */
export async function POST() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  await prisma.stravaAccount.deleteMany({ where: { userId } });
  return NextResponse.json({ ok: true });
}
