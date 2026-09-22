/**
 * Constantes d'authentification utilisables partout — y compris sur le runtime
 * Edge du middleware, qui ne peut ni charger Prisma ni `next/headers`.
 */
export const SESSION_COOKIE = "foulee_session";
export const SESSION_DAYS = 90;
