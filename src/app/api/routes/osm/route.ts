import { NextResponse } from "next/server";
import { z } from "zod";
import { authed } from "@/lib/api";
import { getOsmRoads } from "@/lib/route-store";

export const dynamic = "force-dynamic";

const Query = z
  .object({
    minLat: z.coerce.number().min(-90).max(90),
    maxLat: z.coerce.number().min(-90).max(90),
    minLon: z.coerce.number().min(-180).max(180),
    maxLon: z.coerce.number().min(-180).max(180),
    detail: z.enum(["streets", "all"]).optional(),
  })
  // Zone bornée (~25 km) : au-delà, la requête Overpass n'aboutirait pas.
  .refine((b) => b.maxLat > b.minLat && b.maxLon > b.minLon && b.maxLat - b.minLat < 0.25 && b.maxLon - b.minLon < 0.4);

/**
 * Fond de rues OpenStreetMap d'une tuile, chargé après l'affichage de la carte
 * (la page ne bloque plus sur Overpass). Cache par utilisateur et par tuile.
 */
export async function GET(req: Request) {
  const { userId, error } = await authed();
  if (error) return error;
  const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  const { detail, ...bbox } = parsed.data;
  const roads = await getOsmRoads(userId, bbox, new Date(), { detail });
  return NextResponse.json({ ok: roads !== null, roads: roads ?? [] });
}
