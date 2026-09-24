import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/api";
import { locales } from "@/i18n/routing";

export const dynamic = "force-dynamic";

const schema = z.object({ language: z.enum([...locales]) });

/** Change la langue de l'interface : profil (persistant entre appareils) +
 *  cookie NEXT_LOCALE (consommé à chaque requête par l'i18n). */
export async function PATCH(req: Request) {
  const { userId, error } = await authed();
  if (error) return error;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Langue invalide" }, { status: 400 });
  }
  await prisma.user.update({
    where: { id: userId },
    data: { language: parsed.data.language },
  });
  const res = NextResponse.json({ ok: true });
  res.cookies.set("NEXT_LOCALE", parsed.data.language, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
