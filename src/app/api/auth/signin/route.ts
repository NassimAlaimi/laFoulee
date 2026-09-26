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
import { clientIp } from "@/lib/quota";
import { backToLogin, redirectTo, sameOrigin } from "../credentials";

export const dynamic = "force-dynamic";

/** Par email : 5 échecs / 15 min. Par IP : 30 échecs / 15 min (bourrage
 *  d'identifiants sur de nombreux emails depuis une même machine). */
const throttle = new LoginThrottle();
const ipThrottle = new LoginThrottle({ maxFailures: 30, windowMs: 15 * 60_000 });

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
  const ip = clientIp(req.headers);
  if (throttle.blocked(email) || ipThrottle.blocked(ip)) return backToLogin("signin", "throttled");

  const creds = await findLocalCredentials(email);
  // Email inconnu : on vérifie quand même (contre un hachage factice) pour
  // que la durée de la réponse ne dise pas si le compte existe.
  const ok = await verifyPassword(parsed.data.password, creds?.passwordHash ?? (await dummyHash()));
  if (!creds || !ok) {
    throttle.fail(email);
    ipThrottle.fail(ip);
    return backToLogin("signin", "credentials");
  }
  throttle.succeed(email);

  const { token, expiresAt } = await createSession(creds.id, req.headers.get("user-agent"));
  await setSessionCookie(token, expiresAt);
  void pruneExpiredSessions();
  return redirectTo(parsed.data.next ?? "/");
}
