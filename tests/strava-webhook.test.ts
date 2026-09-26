import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyStravaEvent, verifySubscription } from "../src/lib/strava-webhook.ts";

describe("événements du webhook Strava", () => {
  it("révocation depuis strava.com", () => {
    assert.deepEqual(
      classifyStravaEvent({ object_type: "athlete", aspect_type: "update", owner_id: 42, object_id: 42, updates: { authorized: "false" } }),
      { kind: "deauth", athleteId: 42n }
    );
  });
  it("suppression d'activité", () => {
    assert.deepEqual(
      classifyStravaEvent({ object_type: "activity", aspect_type: "delete", owner_id: 42, object_id: 9876543210 }),
      { kind: "activity-delete", athleteId: 42n, activityId: 9876543210n }
    );
  });
  it("ignore le reste et les charges malformées", () => {
    for (const e of [
      { object_type: "activity", aspect_type: "create", owner_id: 42, object_id: 1 },
      { object_type: "athlete", aspect_type: "update", owner_id: 42, updates: { title: "x" } },
      { object_type: "activity", aspect_type: "delete", owner_id: "abc", object_id: 1 },
      { object_type: "activity", aspect_type: "delete", owner_id: 42, object_id: -3 },
      {},
    ]) {
      assert.deepEqual(classifyStravaEvent(e), { kind: "ignore" });
    }
  });
  it("ignore un abonnement qui n'est pas le nôtre", () => {
    const e = { object_type: "athlete", aspect_type: "update", owner_id: 42, updates: { authorized: "false" }, subscription_id: 7 };
    assert.equal(classifyStravaEvent(e, "8").kind, "ignore");
    assert.equal(classifyStravaEvent(e, "7").kind, "deauth");
  });
});

describe("vérification d'abonnement", () => {
  const q = (s: string) => new URLSearchParams(s);
  it("renvoie le challenge avec le bon jeton", () => {
    assert.deepEqual(verifySubscription(q("hub.mode=subscribe&hub.verify_token=t&hub.challenge=abc"), "t"), { "hub.challenge": "abc" });
  });
  it("refuse mauvais jeton, jeton non configuré, mode inconnu", () => {
    assert.equal(verifySubscription(q("hub.mode=subscribe&hub.verify_token=x&hub.challenge=abc"), "t"), null);
    assert.equal(verifySubscription(q("hub.mode=subscribe&hub.verify_token=t&hub.challenge=abc"), undefined), null);
    assert.equal(verifySubscription(q("hub.mode=other&hub.verify_token=t&hub.challenge=abc"), "t"), null);
  });
});
