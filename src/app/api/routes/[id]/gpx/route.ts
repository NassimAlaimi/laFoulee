import { prisma } from "@/lib/prisma";
import { authed, notFound } from "@/lib/api";
import { polylineToGpx } from "@/lib/route-store";

export const dynamic = "force-dynamic";

/** Téléchargement du parcours en GPX, pour la montre. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, error } = await authed();
  if (error) return error;
  const r = await prisma.route.findFirst({ where: { id, userId } });
  if (!r) return notFound();
  const gpx = polylineToGpx(r.name, r.polyline);
  const file = r.name.normalize("NFD").replace(/[^\w-]+/g, "_").slice(0, 40) || "parcours";
  return new Response(gpx, { headers: { "Content-Type": "application/gpx+xml", "Content-Disposition": `attachment; filename="${file}.gpx"` } });
}
