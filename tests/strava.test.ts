import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { leastActiveCandidates } from "../src/lib/strava.ts";

describe("leastActiveCandidates", () => {
  it("exclut les admins et trie du moins actif au plus actif", () => {
    const now = new Date().getTime();
    const conns = [
      { userId: "a", role: "admin", lastSyncAt: new Date(now - 100_000) },
      { userId: "b", role: "user", lastSyncAt: new Date(now - 1_000) }, // récent
      { userId: "c", role: "user", lastSyncAt: null }, // jamais synchronisé
      { userId: "d", role: "user", lastSyncAt: new Date(now - 500_000) }, // ancien
    ];
    assert.deepEqual(leastActiveCandidates(conns), ["c", "d", "b"]);
  });

  it("retourne [] quand il n'y a que des admins", () => {
    assert.deepEqual(
      leastActiveCandidates([{ userId: "a", role: "admin", lastSyncAt: null }]),
      []
    );
  });

  it("ne renvoie jamais un admin", () => {
    const conns = [
      { userId: "admin1", role: "admin", lastSyncAt: null },
      { userId: "u1", role: "user", lastSyncAt: new Date() },
    ];
    assert.deepEqual(leastActiveCandidates(conns), ["u1"]);
  });
});
