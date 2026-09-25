import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authed, notFound } from "@/lib/api";
import { analyse, userPaces } from "@/lib/custom-workout-store";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  dsl: z.string().trim().min(1).max(600).optional(),
  notes: z.string().max(1000).nullable().optional(),
  favorite: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, error } = await authed();
  if (error) return error;
  const owned = await prisma.customWorkout.findFirst({ where: { id, userId }, select: { id: true } });
  if (!owned) return notFound();
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;
  if (parsed.data.favorite !== undefined) data.favorite = parsed.data.favorite;
  if (parsed.data.dsl !== undefined) {
    const a = analyse(parsed.data.dsl, await userPaces(userId));
    if (!a.ok) return NextResponse.json({ ok: false, error: a.error, at: a.at }, { status: 400 });
    data.dsl = a.dsl;
    data.structure = JSON.stringify(a.steps);
    data.kind = a.kind;
  }
  await prisma.customWorkout.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, error } = await authed();
  if (error) return error;
  await prisma.customWorkout.deleteMany({ where: { id, userId } });
  return NextResponse.json({ ok: true });
}
