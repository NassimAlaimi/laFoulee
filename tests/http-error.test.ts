import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  UserFacingError,
  UpstreamError,
  toSafeMessage,
} from "../src/lib/http-error.ts";

const realError = console.error;
const logged: string[] = [];
beforeEach(() => {
  logged.length = 0;
  console.error = (...args: unknown[]) => {
    logged.push(args.join(" "));
  };
});
afterEach(() => {
  console.error = realError;
});

describe("toSafeMessage", () => {
  it("laisse passer les messages sûrs", () => {
    assert.equal(toSafeMessage(new UserFacingError("Conseil utile")), "Conseil utile");
    assert.equal(toSafeMessage(new UpstreamError(429, "Limite atteinte")), "Limite atteinte");
    assert.equal(logged.length, 0);
  });

  it("masque la cause réelle (et la journalise côté serveur)", () => {
    const out = toSafeMessage(new Error("refresh_token invalid: 40-caractères-secrets"));
    assert.ok(!out.includes("refresh_token"));
    assert.ok(!out.includes("40-caractères"));
    assert.ok(out.includes("Une erreur"));
    assert.equal(logged.length, 1);
    assert.ok(logged[0].includes("refresh_token invalid"));
  });

  it("gère les erreurs non-Error", () => {
    assert.ok(toSafeMessage("panne inconnue").includes("Une erreur"));
    assert.equal(logged.length, 1);
  });
});
