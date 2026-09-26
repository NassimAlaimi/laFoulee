import { NextRequest } from "next/server";
import { z } from "zod";
import {
  createSession,
  findLocalCredentials,
  pruneExpiredSessions,
  setSessionCookie,
} from "@/lib/auth";
import { LoginThrottle } from "@/lib/login-throttle";
import { dummyHash, normalizeEmail, verifyPassword } from "@/lib/password";
import { backToLogin, redirectTo, sameOrigin } from "../credentials";

export const dynamic = "force-dynamic";

const throttle = new LoginThrottle();

const Body = z.object({
  email: z.string().max(254),
  password: z.string().max(400),
  next: z.string().max(500).optional(),
});

/** Connexion par email + mot de passe (comptes sans Strava). */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return backToLogin("signin", "origin");
  const parsed = Body.safeParse(Object.fromEntries(await req.formData()));
  if (!parsed.success) return backToLogin("signin", "invalid");

  const email = normalizeEmail(parsed.data.email);
  if (throttle.blocked(email)) return backToLogin("signin", "throttled");

  const creds = await findLocalCredentials(email);
  // Email inconnu : on vérifie quand même (contre un hachage factice) pour
  // que la durée de la réponse ne dise pas si le compte existe.
  const ok = await verifyPassword(parsed.data.password, creds?.passwordHash ?? (await dummyHash()));
  if (!creds || !ok) {
    throttle.fail(email);
    return backToLogin("signin", "credentials");
  }
  throttle.succeed(email);

  const { token, expiresAt } = await createSession(creds.id, req.headers.get("user-agent"));
  await setSessionCookie(token, expiresAt);
  void pruneExpiredSessions();
  return redirectTo(parsed.data.next ?? "/");
}
