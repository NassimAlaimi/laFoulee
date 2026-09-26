import { prisma } from "./prisma";
import { decryptIfNeeded, encryptSecret, secretKeyFromEnv } from "./crypto";
import { AthleteLimitError, UpstreamError, UserFacingError } from "./http-error";

const STRAVA_API = "https://www.strava.com/api/v3";
const STRAVA_OAUTH = "https://www.strava.com/oauth";

/** Scopes nécessaires : lecture de toutes les activités (y compris privées). */
export const STRAVA_SCOPE = "read,activity:read_all,profile:read_all";

export function stravaConfig() {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const redirectUri =
    process.env.STRAVA_REDIRECT_URI ??
    "http://localhost:3000/api/strava/callback";

  if (!clientId || !clientSecret) {
    throw new UserFacingError(
      "STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET manquants. Renseigne-les dans .env (voir .env.example)."
    );
  }
  return { clientId, clientSecret, redirectUri };
}

export function isStravaConfigured() {
  return Boolean(
    process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET
  );
}

/** URL de consentement Strava. */
export function buildAuthorizeUrl(state = "sport-tracker") {
  const { clientId, redirectUri } = stravaConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: STRAVA_SCOPE,
    state,
  });
  return `${STRAVA_OAUTH}/authorize?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
  athlete?: StravaAthlete;
};

export type StravaAthlete = {
  id: number;
  firstname?: string;
  lastname?: string;
  profile?: string;
  city?: string;
  country?: string;
  weight?: number;
};

/**
 * Détecte le quota d'athlètes connectés atteint : Strava renvoie alors
 * `403 : Limit of connected athletes exceeded`. C'est le plafond de
 * l'application (10 athlètes en Standard Tier hors review).
 */
function isAthleteLimit(body: string): boolean {
  return /limit of connected athletes|connected athletes/i.test(body);
}

/** Échange le code d'autorisation contre des tokens. */
export async function exchangeCodeForToken(
  code: string
): Promise<TokenResponse> {
  const { clientId, clientSecret } = stravaConfig();
  const res = await fetch(`${STRAVA_OAUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    // Le corps de la réponse reste dans les logs serveur, jamais côté client.
    const body = await res.text().catch(() => "");
    console.error("[strava] échange du code", res.status, body);
    if (isAthleteLimit(body)) {
      throw new AthleteLimitError();
    }
    throw new UpstreamError(res.status, "Strava a refusé la connexion. Réessaie.");
  }
  return res.json();
}

/**
 * Renvoie un access token valide pour un utilisateur, en le rafraîchissant si
 * nécessaire. Chaque utilisateur a ses propres tokens : le quota Strava de
 * l'application est partagé, mais les identités ne le sont jamais.
 */
/** Rafraîchissements en cours, par utilisateur : un seul à la fois par
 *  processus (les appels concurrents attendent le même résultat). */
const refreshing = new Map<string, Promise<string>>();

export async function getValidAccessToken(userId: string): Promise<string> {
  const account = await prisma.stravaAccount.findUnique({ where: { userId } });
  if (!account) {
    throw new UserFacingError("Aucun compte Strava connecté. Va sur /settings pour te connecter.", "no-account");
  }

  const key = secretKeyFromEnv();
  const now = Math.floor(Date.now() / 1000);
  // Marge de 2 minutes avant expiration
  if (account.expiresAt > now + 120) return decryptIfNeeded(account.accessToken, key);

  const pending = refreshing.get(userId);
  if (pending) return pending;
  const p = refreshAccessToken(account, key).finally(() => refreshing.delete(userId));
  refreshing.set(userId, p);
  return p;
}

async function refreshAccessToken(
  account: { id: number; userId: string; refreshToken: string },
  key: ReturnType<typeof secretKeyFromEnv>
): Promise<string> {
  const { clientId, clientSecret } = stravaConfig();
  const res = await fetch(`${STRAVA_OAUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: decryptIfNeeded(account.refreshToken, key),
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    // Un autre processus a peut-être rafraîchi entre-temps avec ce même
    // refresh token (qui n'est alors plus valable) : on relit la base avant
    // de conclure à une session morte.
    const fresh = await prisma.stravaAccount.findUnique({ where: { userId: account.userId } });
    if (
      fresh &&
      fresh.refreshToken !== account.refreshToken &&
      fresh.expiresAt > Math.floor(Date.now() / 1000) + 120
    ) {
      return decryptIfNeeded(fresh.accessToken, key);
    }
    console.error("[strava] refresh token", res.status, await res.text().catch(() => ""));
    throw new UpstreamError(res.status, "Session Strava expirée — reconnecte-toi dans les réglages.", "expired");
  }

  const data: TokenResponse = await res.json();
  await prisma.stravaAccount.update({
    where: { id: account.id },
    data: {
      accessToken: encryptSecret(data.access_token, key),
      refreshToken: encryptSecret(data.refresh_token, key),
      expiresAt: data.expires_at,
    },
  });
  return data.access_token;
}

/**
 * Révoque l'autorisation Strava de l'utilisateur.
 *
 * Supprimer les tokens en base ne suffit pas : côté Strava le grant reste
 * actif et l'athlète continue d'occuper un des sièges de l'application (quota
 * « athletes currently connected »). Seul `/oauth/deauthorize` le libère.
 *
 * Ne lève jamais : la déconnexion locale doit aboutir même si Strava est
 * injoignable ou si le token est déjà mort. Le booléen permet à l'appelant de
 * signaler à l'utilisateur qu'une révocation manuelle reste nécessaire.
 */
export async function deauthorize(userId: string): Promise<boolean> {
  try {
    const token = await getValidAccessToken(userId);
    const res = await fetch(`${STRAVA_OAUTH}/deauthorize`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Connexion Strava vue pour le choix du candidat à évincer. */
export type StravaConnection = {
  userId: string;
  role: string;
  lastSyncAt: Date | null;
};

/**
 * Candidats à évincer, du moins récemment actif au plus actif, en excluant
 * les administrateurs (jamais évincés). Pure : testable sans réseau ni DB.
 */
export function leastActiveCandidates(
  connections: StravaConnection[]
): string[] {
  return connections
    .filter((c) => c.role !== "admin")
    .sort(
      (a, b) =>
        (a.lastSyncAt?.getTime() ?? 0) - (b.lastSyncAt?.getTime() ?? 0) ||
        (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0)
    )
    .map((c) => c.userId);
}

/**
 * Libère un siège Strava quand la limite d'athlètes connectés est atteinte :
 * déconnecte le membre non-admin le moins récemment actif (révocation côté
 * Strava, sinon le siège ne se libère pas), supprime ses tokens locaux et
 * marque l'éviction pour qu'il en soit informé à son prochain passage.
 *
 * Renvoie `true` si un siège a réellement été libéré.
 */
export async function evictLeastActiveStravaUser(): Promise<boolean> {
  const accounts = await prisma.stravaAccount.findMany({
    select: { userId: true, lastSyncAt: true, user: { select: { role: true } } },
  });
  const candidates = leastActiveCandidates(
    accounts.map((a) => ({ userId: a.userId, role: a.user.role, lastSyncAt: a.lastSyncAt }))
  );
  for (const userId of candidates) {
    const revoked = await deauthorize(userId);
    if (!revoked) continue; // token mort → ce candidat ne libérerait pas de siège
    await prisma.stravaAccount.deleteMany({ where: { userId } });
    await prisma.user.update({
      where: { id: userId },
      data: { stravaEvictedAt: new Date() },
    });
    return true;
  }
  return false;
}

async function stravaFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${STRAVA_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (res.status === 429) {
    throw new UpstreamError(
      429,
      "Limite de requêtes Strava atteinte (100 / 15 min). Réessaie dans quelques minutes.",
      "rate-limit"
    );
  }
  if (!res.ok) {
    console.error("[strava]", path, res.status, await res.text().catch(() => ""));
    throw new UpstreamError(res.status, "Strava est indisponible pour le moment.", "unavailable");
  }
  return res.json();
}

export type StravaSummaryActivity = {
  id: number;
  name: string;
  type: string;
  sport_type?: string;
  start_date: string;
  start_date_local: string;
  timezone?: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  average_speed?: number;
  max_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  has_heartrate?: boolean;
  suffer_score?: number;
  average_cadence?: number;
  kilojoules?: number;
  calories?: number;
  workout_type?: number | null;
  commute?: boolean;
  trainer?: boolean;
  gear_id?: string | null;
  map?: { summary_polyline?: string | null };
};

export type StravaDetailedActivity = StravaSummaryActivity & {
  calories?: number;
  description?: string | null;
  best_efforts?: Array<{
    name: string;
    distance: number;
    moving_time: number;
    elapsed_time: number;
    start_date: string;
    pr_rank: number | null;
  }>;
  splits_metric?: Array<{
    split: number;
    distance: number;
    moving_time: number;
    elapsed_time: number;
    elevation_difference: number;
    average_speed: number;
    average_heartrate?: number;
  }>;
};

export async function fetchAthlete(token: string): Promise<StravaAthlete> {
  return stravaFetch<StravaAthlete>("/athlete", token);
}

/**
 * Récupère les activités par pages.
 * @param after epoch seconds — ne récupère que les activités postérieures
 */
export async function fetchActivities(
  token: string,
  opts: { after?: number; maxPages?: number; perPage?: number } = {}
): Promise<StravaSummaryActivity[]> {
  const perPage = opts.perPage ?? 100;
  const maxPages = opts.maxPages ?? 20;
  const all: StravaSummaryActivity[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });
    if (opts.after) params.set("after", String(opts.after));

    const batch = await stravaFetch<StravaSummaryActivity[]>(
      `/athlete/activities?${params.toString()}`,
      token
    );
    all.push(...batch);
    if (batch.length < perPage) break;
  }
  return all;
}

export type StravaGear = {
  id: string;
  name: string;
  brand_name?: string | null;
  model_name?: string | null;
  distance?: number;
  retired?: boolean;
  primary?: boolean;
};

export async function fetchGear(
  token: string,
  gearId: string
): Promise<StravaGear> {
  return stravaFetch<StravaGear>(`/gear/${gearId}`, token);
}

export async function fetchActivityDetail(
  token: string,
  id: number | bigint
): Promise<StravaDetailedActivity> {
  return stravaFetch<StravaDetailedActivity>(
    `/activities/${id}?include_all_efforts=true`,
    token
  );
}

export type StravaStreams = {
  time?: { data: number[] };
  heartrate?: { data: number[] };
  velocity_smooth?: { data: number[] };
};

/** Courbes brutes d'une activité (échantillonnage ~1 s). */
export async function fetchActivityStreams(
  token: string,
  id: number | bigint
): Promise<StravaStreams> {
  return stravaFetch<StravaStreams>(
    `/activities/${id}/streams?keys=time,heartrate,velocity_smooth&key_by_type=true`,
    token
  );
}

/** Types Strava considérés comme de la course à pied. */
export const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);

/** Types Strava considérés comme de la musculation. */
export const STRENGTH_TYPES = new Set([
  "WeightTraining",
  "Workout",
  "Crossfit",
  "HighIntensityIntervalTraining",
]);
