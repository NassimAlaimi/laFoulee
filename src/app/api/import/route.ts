import { NextResponse } from "next/server";
import { authed } from "@/lib/api";
import { importFiles } from "@/lib/import-store";
import { prisma } from "@/lib/prisma";
import { importAllowed } from "@/lib/quota";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Taille maximale acceptée par envoi (export Garmin compris). */
const MAX_BYTES = 250 * 1024 * 1024;

/**
 * Import de fichiers d'activité (FIT, GPX, TCX) ou d'un export complet en
 * .zip. Multipart : champ `files` répété. L'utilisateur vient de la session.
 */
export async function POST(req: Request) {
  const { userId, error } = await authed();
  if (error) return error;
  const [activityCount, importsLastHour] = await Promise.all([
    prisma.activity.count({ where: { userId } }),
    prisma.importBatch.count({ where: { userId, createdAt: { gt: new Date(Date.now() - 3600_000) } } }),
  ]);
  const refusal = importAllowed({ activityCount, importsLastHour });
  if (refusal) return NextResponse.json({ ok: false, error: refusal }, { status: 429 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "form" }, { status: 400 });
  const files: Array<{ name: string; bytes: Uint8Array }> = [];
  let total = 0;
  for (const v of form.getAll("files")) {
    if (typeof v === "string") continue;
    total += v.size;
    if (total > MAX_BYTES) return NextResponse.json({ ok: false, error: "tooLarge" }, { status: 413 });
    files.push({ name: v.name.slice(0, 200), bytes: new Uint8Array(await v.arrayBuffer()) });
  }
  if (!files.length) return NextResponse.json({ ok: false, error: "empty" }, { status: 400 });
  const result = await importFiles(userId, files);
  return NextResponse.json({ ok: true, ...result });
}
