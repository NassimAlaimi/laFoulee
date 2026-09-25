import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/api";
import { analyse, userPaces } from "@/lib/custom-workout-store";

export const dynamic = "force-dynamic";

const CustomSchema = z.object({
  name: z.string().trim().min(1).max(80),
  dsl: z.string().trim().min(1).max(600),
  notes: z.string().max(1000).nullable().optional(),
  favorite: z.boolean().optional(),
});

/** Création d'une séance personnalisée (le texte est ré-analysé ici). */
export async function POST(req: Request) {
  const { userId, error } = await authed();
  if (error) return error;
  const parsed = CustomSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });

  const a = analyse(parsed.data.dsl, await userPaces(userId));
  if (!a.ok) return NextResponse.json({ ok: false, error: a.error, at: a.at }, { status: 400 });

  const w = await prisma.customWorkout.create({
    data: {
      userId,
      name: parsed.data.name,
      dsl: a.dsl,
      structure: JSON.stringify(a.steps),
      kind: a.kind,
      notes: parsed.data.notes ?? null,
      favorite: parsed.data.favorite ?? false,
    },
  });
  return NextResponse.json({ ok: true, id: w.id });
}
