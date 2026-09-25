import { NextResponse } from "next/server";
import { z } from "zod";
import { authed } from "@/lib/api";
import { addPoi, deletePoi } from "@/lib/route-store";

export const dynamic = "force-dynamic";

const Body = z.object({ kind: z.enum(["fountain", "toilet", "car", "bakery", "lit", "danger", "track"]), lat: z.number(), lng: z.number(), note: z.string().max(80).nullable().optional() });

export async function POST(req: Request) {
  const { userId, error } = await authed();
  if (error) return error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  const p = await addPoi(userId, parsed.data);
  return NextResponse.json({ ok: true, id: p.id });
}

export async function DELETE(req: Request) {
  const { userId, error } = await authed();
  if (error) return error;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  await deletePoi(userId, id);
  return NextResponse.json({ ok: true });
}
