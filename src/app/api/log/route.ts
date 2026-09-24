import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Carnet quotidien — une ligne par jour (upsert sur userId + date locale).
 * Les champs absents sont laissés tels quels : on peut remplir le sommeil le
 * matin et le ressenti le soir, en deux passages.
 */

const LogSchema = z.object({
  /** YYYY-MM-DD, jour local concerné */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sleepHours: z.number().min(0).max(16).nullable().optional(),
  sleepQuality: z.number().int().min(1).max(5).nullable().optional(),
  hrv: z.number().min(0).max(300).nullable().optional(),
  restHr: z.number().int().min(30).max(120).nullable().optional(),
  weightKg: z.number().min(20).max(250).nullable().optional(),
  rpe: z.number().int().min(1).max(10).nullable().optional(),
  fatigue: z.number().int().min(1).max(5).nullable().optional(),
  mood: z.number().int().min(1).max(5).nullable().optional(),
  painLevel: z.number().int().min(0).max(3).optional(),
  painArea: z.string().max(60).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export async function POST(req: Request) {
  const { userId, error } = await authed();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = LogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "entrée invalide" },
      { status: 400 }
    );
  }

  // Minuit local du jour concerné
  const [y, m, d] = parsed.data.date.split("-").map(Number);
  const date = new Date(y, m - 1, d, 0, 0, 0, 0);
  const { date: _ignored, ...fields } = parsed.data;

  // Champs explicitement fournis seulement (null = effacer, absent = ne pas toucher)
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) data[key] = value;
  }

  const log = await prisma.dailyLog.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, ...data },
    update: data,
  });

  return NextResponse.json({ ok: true, id: log.id });
}
