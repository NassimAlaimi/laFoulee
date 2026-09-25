import { prisma } from "./prisma";
import { decryptIfNeeded, encryptSecret, secretKeyFromEnv } from "./crypto";

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
    throw new Error(
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
    throw new Error(`Échange du code Strava échoué (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

/**
 * Renvoie un access token valide pour un utilisateur, en le rafraîchissant si
 * nécessaire. Chaque utilisateur a ses propres tokens : le quota Strava de
 * l'application est partagé, mais les identités ne le sont jamais.
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const account = await prisma.stravaAccount.findUnique({ where: { userId } });
  if (!account) {
    throw new Error("Aucun compte Strava connecté. Va sur /settings pour te connecter.");
  }

  const key = secretKeyFromEnv();
  const now = Math.floor(Date.now() / 1000);
  // Marge de 2 minutes avant expiration
  if (account.expiresAt > now + 120) return decryptIfNeeded(account.accessToken, key);

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
    throw new Error(`Refresh du token Strava échoué (${res.status}): ${await res.text()}`);
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

async function stravaFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${STRAVA_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (res.status === 429) {
    throw new Error(
      "Limite de requêtes Strava atteinte (100 / 15 min). Réessaie dans quelques minutes."
    );
  }
  if (!res.ok) {
    throw new Error(`Strava ${path} → ${res.status}: ${await res.text()}`);
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
