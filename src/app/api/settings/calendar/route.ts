import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Active l'abonnement agenda, ou régénère le jeton (l'ancienne URL cesse de marcher). */
export async function POST() {
  const { userId, error } = await authed();
  if (error) return error;
  const token = randomBytes(24).toString("base64url");
  await prisma.user.update({ where: { id: userId }, data: { calendarToken: token } });
  return NextResponse.json({ ok: true, token });
}

/** Désactive l'abonnement : l'URL renvoie 404. */
export async function DELETE() {
  const { userId, error } = await authed();
  if (error) return error;
  await prisma.user.update({ where: { id: userId }, data: { calendarToken: null } });
  return NextResponse.json({ ok: true });
}
