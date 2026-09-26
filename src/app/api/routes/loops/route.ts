import { NextResponse } from "next/server";
import { z } from "zod";
import { authed } from "@/lib/api";
import { generateLoops } from "@/lib/route-store";
import { encodePolyline } from "@/lib/polyline";

export const dynamic = "force-dynamic";

const Body = z.object({
  distanceM: z.number().min(500).max(300_000),
  explore: z.number().min(0).max(1).default(0.5),
  startLat: z.number().min(-90).max(90).nullable().optional(),
  startLng: z.number().min(-180).max(180).nullable().optional(),
});

/** Jusqu'à trois boucles distinctes de distance cible (vraies rues, sinon réseau personnel). */
export async function POST(req: Request) {
  const { userId, error } = await authed();
  if (error) return error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  const ref: [number, number] = parsed.data.startLat != null && parsed.data.startLng != null ? [parsed.data.startLat, parsed.data.startLng] : [0, 0];
  const { loops, source } = await generateLoops(userId, {
    targetMeters: parsed.data.distanceM,
    explore: parsed.data.explore,
    start: parsed.data.startLat != null ? { x: 0, y: 0 } : null,
    ref,
  });
  return NextResponse.json({
    ok: true,
    source,
    loops: loops.map((l) => ({
      polyline: encodePolyline(l.points),
      meters: l.meters,
      score: Math.round(l.score * 100) / 100,
      novelty: l.novelty,
      direction: l.direction,
    })),
  });
}
