import { NextRequest } from "next/server";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import {
  canRegisterLocal,
  createLocalUser,
  createSession,
  setSessionCookie,
} from "@/lib/auth";
import { hashPassword, isValidEmail, normalizeEmail, passwordIssue } from "@/lib/password";
import { backToLogin, redirectTo, sameOrigin } from "../credentials";

export const dynamic = "force-dynamic";

const Body = z.object({
  firstname: z.string().max(80),
  email: z.string().max(254),
  password: z.string().max(400),
  invite: z.string().max(200).optional(),
});

/** Création d'un compte sans Strava. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return backToLogin("signup", "origin");
  const parsed = Body.safeParse(Object.fromEntries(await req.formData()));
  if (!parsed.success) return backToLogin("signup", "invalid");

  const { password, invite } = parsed.data;
  const firstname = parsed.data.firstname.trim();
  const email = normalizeEmail(parsed.data.email);

  const access = canRegisterLocal(invite?.trim() ?? null);
  if (!access.ok) return backToLogin("signup", access.reason);
  if (!firstname) return backToLogin("signup", "name-missing");
  if (!isValidEmail(email)) return backToLogin("signup", "email-invalid");
  const issue = passwordIssue(password);
  if (issue) return backToLogin("signup", issue === "too-short" ? "password-short" : "password-long");

  const user = await createLocalUser({
    email,
    firstname,
    passwordHash: await hashPassword(password),
    language: await getLocale(),
  });
  if (!user) return backToLogin("signup", "email-taken");

  const { token, expiresAt } = await createSession(user.id, req.headers.get("user-agent"));
  await setSessionCookie(token, expiresAt);
  return redirectTo("/settings?welcome=1");
}
