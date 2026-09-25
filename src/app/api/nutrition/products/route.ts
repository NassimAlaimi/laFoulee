import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/api";

export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().trim().min(1).max(40),
  carbsG: z.number().min(0).max(200),
  sodiumMg: z.number().min(0).max(3000).default(0),
  caffeineMg: z.number().min(0).max(400).default(0),
  fluidMl: z.number().min(0).max(1500).default(0),
});

/** Ajoute un produit de ravitaillement personnel. */
export async function POST(req: Request) {
  const { userId, error } = await authed();
  if (error) return error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  const p = await prisma.nutritionProduct.create({ data: { userId, ...parsed.data } });
  return NextResponse.json({ ok: true, id: p.id });
}

export async function DELETE(req: Request) {
  const { userId, error } = await authed();
  if (error) return error;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  await prisma.nutritionProduct.deleteMany({ where: { id, userId } });
  return NextResponse.json({ ok: true });
}
