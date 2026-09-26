/**
 * Webhook Strava (push subscriptions) — interprétation pure des événements.
 *
 * Deux obligations de la politique API Strava motivent ce webhook :
 * - §7.4 : quand un athlète révoque l'accès depuis strava.com, supprimer ses
 *   données Strava (30 jours max) ;
 * - §6.3 : une activité supprimée sur Strava doit disparaître de l'app sous 48 h.
 *
 * Les événements ne sont pas signés par Strava : l'appelant doit *vérifier*
 * auprès de l'API avant d'effacer quoi que ce soit (voir la route).
 */
export type StravaEvent = {
  object_type?: unknown;
  object_id?: unknown;
  aspect_type?: unknown;
  owner_id?: unknown;
  subscription_id?: unknown;
  updates?: unknown;
};

export type WebhookAction =
  | { kind: "deauth"; athleteId: bigint }
  | { kind: "activity-delete"; athleteId: bigint; activityId: bigint }
  | { kind: "ignore" };

function asId(v: unknown): bigint | null {
  if (typeof v === "number" && Number.isSafeInteger(v) && v > 0) return BigInt(v);
  if (typeof v === "string" && /^\d{1,19}$/.test(v)) return BigInt(v);
  return null;
}

export function classifyStravaEvent(evt: StravaEvent, expectedSubscription?: string | null): WebhookAction {
  if (expectedSubscription && String(evt.subscription_id) !== expectedSubscription) return { kind: "ignore" };
  const owner = asId(evt.owner_id);
  if (!owner) return { kind: "ignore" };
  const updates = (evt.updates && typeof evt.updates === "object" ? evt.updates : {}) as Record<string, unknown>;
  if (evt.object_type === "athlete" && evt.aspect_type === "update" && String(updates.authorized) === "false") {
    return { kind: "deauth", athleteId: owner };
  }
  if (evt.object_type === "activity" && evt.aspect_type === "delete") {
    const id = asId(evt.object_id);
    if (id) return { kind: "activity-delete", athleteId: owner, activityId: id };
  }
  return { kind: "ignore" };
}

/** Réponse à la vérification d'abonnement (GET `hub.*`). `null` = refus. */
export function verifySubscription(
  params: URLSearchParams,
  verifyToken: string | undefined
): { "hub.challenge": string } | null {
  if (!verifyToken) return null;
  if (params.get("hub.mode") !== "subscribe") return null;
  if (params.get("hub.verify_token") !== verifyToken) return null;
  const challenge = params.get("hub.challenge");
  return challenge ? { "hub.challenge": challenge } : null;
}
