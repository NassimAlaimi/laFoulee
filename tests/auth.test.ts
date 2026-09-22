import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

/**
 * Les règles d'accès sont testées sans base ni serveur : ce sont des fonctions
 * pures qui décident *qui* a le droit d'entrer. Le reste (sessions, cookies)
 * est vérifié par le smoke test multi-compte documenté dans le README.
 */
const ENV_KEYS = ["ALLOWED_ATHLETES", "INVITE_CODE"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/** Import dynamique : la politique lit process.env à chaque appel. */
async function policy() {
  return import("../src/lib/auth-policy.ts");
}

describe("liste d'accès", () => {
  it("instance ouverte quand la liste est vide", async () => {
    process.env.ALLOWED_ATHLETES = "";
    const { canRegister } = await policy();
    assert.deepEqual(canRegister(123n), { ok: true });
  });

  it("laisse entrer un athlète listé", async () => {
    process.env.ALLOWED_ATHLETES = "111, 222 ,333";
    const { canRegister } = await policy();
    assert.equal(canRegister(222n).ok, true);
  });

  it("refuse un athlète absent de la liste", async () => {
    process.env.ALLOWED_ATHLETES = "111,222";
    const { canRegister } = await policy();
    const d = canRegister(999n);
    assert.equal(d.ok, false);
    assert.equal(d.ok === false && d.reason, "not-allowed");
  });

  it("ignore les entrées non numériques plutôt que de tout bloquer", async () => {
    process.env.ALLOWED_ATHLETES = "111,,abc, 222";
    const { allowedAthletes } = await policy();
    assert.deepEqual(allowedAthletes(), [111n, 222n]);
  });
});

describe("code d'invitation", () => {
  it("accepte tout quand aucun code n'est configuré", async () => {
    process.env.INVITE_CODE = "";
    const { checkInviteCode } = await policy();
    assert.equal(checkInviteCode(null), true);
    assert.equal(checkInviteCode("peu importe"), true);
  });

  it("exige le code exact", async () => {
    process.env.INVITE_CODE = "foulee-2026";
    const { checkInviteCode } = await policy();
    assert.equal(checkInviteCode("foulee-2026"), true);
    assert.equal(checkInviteCode("foulee-2025"), false);
    assert.equal(checkInviteCode(""), false);
    assert.equal(checkInviteCode(null), false);
    assert.equal(checkInviteCode(undefined), false);
  });

  it("ne se laisse pas avoir par une longueur différente", async () => {
    process.env.INVITE_CODE = "abc";
    const { checkInviteCode } = await policy();
    assert.equal(checkInviteCode("abcd"), false);
    assert.equal(checkInviteCode("ab"), false);
  });

  it("combine liste d'accès et invitation", async () => {
    process.env.ALLOWED_ATHLETES = "42";
    process.env.INVITE_CODE = "secret";
    const { canRegister } = await policy();

    assert.equal(canRegister(42n, "secret").ok, true);
    const bad = canRegister(42n, "autre");
    assert.equal(bad.ok === false && bad.reason, "bad-invite");
    // La liste d'accès prime : inutile de révéler qu'un code existe.
    const out = canRegister(7n, "secret");
    assert.equal(out.ok === false && out.reason, "not-allowed");
  });
});

describe("nom affiché", () => {
  it("assemble prénom et nom", async () => {
    const { displayName } = await policy();
    assert.equal(displayName({ firstname: "Nassim", lastname: "A" }), "Nassim A");
  });

  it("retombe sur l'identifiant athlète sans nom", async () => {
    const { displayName } = await policy();
    assert.equal(displayName({ firstname: null, lastname: null, athleteId: 42n }), "Athlète 42");
  });

  it("gère un prénom seul", async () => {
    const { displayName } = await policy();
    assert.equal(displayName({ firstname: "Nassim", lastname: null }), "Nassim");
  });
});
