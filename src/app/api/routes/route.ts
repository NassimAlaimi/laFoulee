import { NextResponse } from "next/server";
import { z } from "zod";
import { authed } from "@/lib/api";
import { deleteRoute, saveRoute } from "@/lib/route-store";

export const dynamic = "force-dynamic";

const Create = z.object({
  name: z.string().trim().min(1).max(80),
  polyline: z.string().min(10).max(2_000_000),
  distance: z.number().min(100).max(500_000),
  tags: z.string().max(120).nullable().optional(),
});

/** Enregistre un parcours dessiné ou généré. */
export async function POST(req: Request) {
  const { userId, error } = await authed();
  if (error) return error;
  const parsed = Create.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  const r = await saveRoute(userId, parsed.data);
  if (!r) return NextResponse.json({ ok: false, error: "vide" }, { status: 400 });
  return NextResponse.json({ ok: true, id: r.id });
}

export async function DELETE(req: Request) {
  const { userId, error } = await authed();
  if (error) return error;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  await deleteRoute(userId, id);
  return NextResponse.json({ ok: true });
}
