/**
 * Authentification — sessions adossées à Strava ou à un compte email.
 *
 * Deux portes d'entrée : Strava (OAuth, aucun secret stocké chez nous) ou un
 * compte email + mot de passe pour qui n'a pas Strava (empreinte scrypt,
 * lib/password.ts ; l'email n'est pas vérifié — il sert d'identifiant).
 *
 * Le cookie ne contient qu'un token aléatoire ; la base ne stocke que son
 * empreinte SHA-256. Une fuite de la base ne permet donc pas de rejouer une
 * session.
 */
// `next/headers` rend déjà ce module inutilisable côté client : pas besoin du
// paquet server-only.
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { SESSION_COOKIE, SESSION_DAYS } from "./auth-shared";

export { SESSION_COOKIE, SESSION_DAYS };
export {
  allowedAthletes,
  canRegister,
  canRegisterLocal,
  checkInviteCode,
  displayName,
  inviteCode,
  type AccessDecision,
} from "./auth-policy";
/** Au-delà de ce seuil, on rafraîchit `lastUsed` (évite une écriture par requête) */
const TOUCH_AFTER_MS = 6 * 60 * 60 * 1000;

/**
 * Le cookie de session ne porte `Secure` que si l'instance est réellement
 * servie en HTTPS.
 *
 * Se fier à NODE_ENV ne marche pas : une instance de production exposée en
 * clair (http://host:3000) enverrait un cookie `Secure` que le navigateur
 * refuse de stocker — connexion réussie, puis retour immédiat sur /login, en
 * boucle. En dérivant le flag de l'URL publique, le passage à HTTPS le
 * réactive tout seul.
 */
function useSecureCookie(): boolean {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://");
}

export type SessionUser = {
  id: string;
  athleteId: bigint | null;
  firstname: string | null;
  lastname: string | null;
  avatarUrl: string | null;
  role: string;
  language: string;
  stravaEvictedAt: Date | null;
};

const SESSION_USER_SELECT = {
  id: true,
  athleteId: true,
  firstname: true,
  lastname: true,
  avatarUrl: true,
  role: true,
  language: true,
  stravaEvictedAt: true,
} as const;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ---------------------------------------------------------------- Sessions

/** Crée une session et renvoie le token à déposer en cookie. */
export async function createSession(
  userId: string,
  userAgent?: string | null
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      userAgent: userAgent?.slice(0, 200) ?? null,
      expiresAt,
    },
  });
  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: useSecureCookie(),
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Supprime la session courante côté base *et* côté navigateur. */
export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  jar.delete(SESSION_COOKIE);
}

/** Déconnecte tous les appareils d'un utilisateur. */
export async function destroyAllSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}

/**
 * Utilisateur de la requête en cours, ou null.
 *
 * Volontairement silencieux : les pages publiques (login) l'appellent aussi.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      lastUsed: true,
      user: {
        select: SESSION_USER_SELECT,
      },
    },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  if (Date.now() - session.lastUsed.getTime() > TOUCH_AFTER_MS) {
    await prisma.session
      .update({ where: { id: session.id }, data: { lastUsed: new Date() } })
      .catch(() => {});
    await prisma.user
      .update({ where: { id: session.user.id }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
  }

  return session.user;
}

/** Identifiant de l'utilisateur courant, ou `null`. */
export async function currentUserId(): Promise<string | null> {
  return (await currentUser())?.id ?? null;
}

/**
 * Utilisateur courant obligatoire, pour les pages et les composants serveur.
 *
 * Redirige vers /login plutôt que de lever : une session expirée entre deux
 * navigations ne doit pas produire une page d'erreur 500, mais un retour
 * naturel à l'écran de connexion. Les routes API, elles, passent par
 * `authed()` (lib/api.ts) qui répond 401 en JSON.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireUserId(): Promise<string> {
  return (await requireUser()).id;
}

/** Purge les sessions expirées (appelée à la connexion, sans bloquer). */
export async function pruneExpiredSessions() {
  await prisma.session
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch(() => {});
}

// ---------------------------------------------------------------- Création de compte

/**
 * Trouve ou crée l'utilisateur correspondant à un athlète Strava.
 *
 * Le premier compte de l'instance devient admin : sans ça, une instance
 * fraîchement déployée n'aurait aucun administrateur.
 */
export async function upsertUserFromStrava(athlete: {
  id: number | bigint;
  firstname?: string | null;
  lastname?: string | null;
  profile?: string | null;
}, language: string = "fr"): Promise<{ user: SessionUser; created: boolean }> {
  const athleteId = BigInt(athlete.id);
  const existing = await prisma.user.findUnique({ where: { athleteId } });

  if (existing) {
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        firstname: athlete.firstname ?? existing.firstname,
        lastname: athlete.lastname ?? existing.lastname,
        avatarUrl: athlete.profile ?? existing.avatarUrl,
        lastSeenAt: new Date(),
      },
      select: SESSION_USER_SELECT,
    });
    return { user, created: false };
  }

  const isFirst = (await prisma.user.count()) === 0;
  const user = await prisma.user.create({
    data: {
      athleteId,
      firstname: athlete.firstname ?? null,
      lastname: athlete.lastname ?? null,
      avatarUrl: athlete.profile ?? null,
      role: isFirst ? "admin" : "user",
      // La langue choisie sur l'écran de connexion devient celle du profil :
      // sinon le profil (« fr » par défaut) la réécraserait au premier rendu.
      language,
      lastSeenAt: new Date(),
      // Les réglages par défaut sont créés tout de suite : aucune page n'a
      // alors à gérer le cas « pas encore de réglages ».
      settings: { create: {} },
    },
    select: SESSION_USER_SELECT,
  });
  return { user, created: true };
}

/**
 * Crée un compte email (sans Strava). `null` si l'email est déjà pris.
 * Mêmes règles que Strava : le premier compte de l'instance est admin.
 */
export async function createLocalUser(input: {
  email: string;
  passwordHash: string;
  firstname: string;
  language: string;
}): Promise<SessionUser | null> {
  const taken = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (taken) return null;
  const isFirst = (await prisma.user.count()) === 0;
  try {
    return await prisma.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        firstname: input.firstname,
        language: input.language,
        role: isFirst ? "admin" : "user",
        lastSeenAt: new Date(),
        settings: { create: {} },
      },
      select: SESSION_USER_SELECT,
    });
  } catch {
    // Course entre deux inscriptions simultanées : l'index unique tranche.
    return null;
  }
}

/** Identifiants d'un compte email, pour la vérification du mot de passe. */
export async function findLocalCredentials(
  email: string
): Promise<{ id: string; passwordHash: string } | null> {
  const u = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });
  return u?.passwordHash ? { id: u.id, passwordHash: u.passwordHash } : null;
}
