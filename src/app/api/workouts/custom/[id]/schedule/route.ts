import { NextResponse } from "next/server";
import { z } from "zod";
import { authed, notFound } from "@/lib/api";
import { scheduleCustom } from "@/lib/custom-workout-store";

export const dynamic = "force-dynamic";

const Body = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

/** Pose la séance perso dans le plan actif, à la date donnée (jour local). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, error } = await authed();
  if (error) return error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  const [y, m, d] = parsed.data.date.split("-").map(Number);
  const r = await scheduleCustom(userId, id, new Date(y, m - 1, d));
  if (!r.ok && r.error === "notFound") return notFound();
  if (!r.ok) return NextResponse.json(r, { status: 409 });
  return NextResponse.json(r);
}
