/**
 * Comptes sans Strava — identifiants email + mot de passe.
 *
 * Aucune dépendance : `scrypt` de node:crypto (fonction de dérivation lente,
 * résistante au GPU). Le hachage est auto-descriptif
 * (`scrypt$N$r$p$sel$empreinte`) pour pouvoir durcir les paramètres plus tard
 * sans invalider les comptes existants.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

function scrypt(pw: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(pw, salt, keylen, { ...opts, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key)
    )
  );
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

/** Vérifie un mot de passe ; `false` pour tout hachage mal formé. */
export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  if (![n, r, p].every((v) => Number.isInteger(v) && v > 0)) return false;
  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  if (expected.length === 0) return false;
  try {
    const key = await scrypt(pw.normalize("NFKC"), salt, expected.length, { N: n, r, p });
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

/**
 * Hachage factice, calculé une fois : quand l'email est inconnu on vérifie
 * quand même contre lui, pour que le temps de réponse ne trahisse pas
 * l'existence d'un compte.
 */
let dummy: Promise<string> | null = null;
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(12).toString("hex"));
  return dummy;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Validation volontairement souple : un « @ », un domaine avec un point. */
export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export type PasswordIssue = "too-short" | "too-long" | null;

export function passwordIssue(pw: string): PasswordIssue {
  const len = [...pw].length;
  if (len < PASSWORD_MIN) return "too-short";
  if (len > PASSWORD_MAX) return "too-long";
  return null;
}
