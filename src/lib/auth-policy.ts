/**
 * Politique d'accès de l'instance — fonctions pures, sans base ni cookies.
 *
 * Isolées dans leur propre module pour être testables directement et
 * utilisables côté Edge : `auth.ts` les réexporte.
 */
import { timingSafeEqual } from "node:crypto";

/** Identifiants athlète autorisés. Liste vide = instance ouverte. */
export function allowedAthletes(): bigint[] {
  return (process.env.ALLOWED_ATHLETES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      try {
        return BigInt(s);
      } catch {
        return null;
      }
    })
    .filter((v): v is bigint => v !== null);
}

export function inviteCode(): string | null {
  const code = (process.env.INVITE_CODE ?? "").trim();
  return code.length > 0 ? code : null;
}

/** Comparaison à temps constant : un code d'invitation ne se devine pas à la milliseconde. */
export function checkInviteCode(provided: string | null | undefined): boolean {
  const expected = inviteCode();
  if (!expected) return true;
  const a = Buffer.from(String(provided ?? ""));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type AccessDecision =
  | { ok: true }
  | { ok: false; reason: "not-allowed" | "bad-invite" };

/**
 * Peut-on créer un compte pour cet athlète ?
 *
 * Un utilisateur déjà inscrit passe toujours : restreindre la liste plus tard
 * ne doit pas enfermer dehors quelqu'un qui a déjà ses données dans l'instance.
 */
export function canRegister(
  athleteId: bigint,
  invite?: string | null
): AccessDecision {
  const allow = allowedAthletes();
  if (allow.length > 0 && !allow.includes(athleteId)) {
    return { ok: false, reason: "not-allowed" };
  }
  if (!checkInviteCode(invite)) return { ok: false, reason: "bad-invite" };
  return { ok: true };
}

/**
 * Peut-on créer un compte email (sans Strava) ?
 *
 * Une liste d'athlètes autorisés rend l'instance privée : sans code
 * d'invitation pour ouvrir une porte, l'inscription par email y est fermée
 * (on ne peut pas vérifier l'identité Strava d'un compte qui n'en a pas).
 */
export function canRegisterLocal(invite?: string | null): AccessDecision {
  if (allowedAthletes().length > 0 && !inviteCode()) {
    return { ok: false, reason: "not-allowed" };
  }
  if (!checkInviteCode(invite)) return { ok: false, reason: "bad-invite" };
  return { ok: true };
}

export function displayName(user: {
  firstname?: string | null;
  lastname?: string | null;
  athleteId?: bigint | number | null;
}): string {
  const name = [user.firstname, user.lastname].filter(Boolean).join(" ").trim();
  return name || `Athlète ${user.athleteId ?? ""}`.trim();
}
