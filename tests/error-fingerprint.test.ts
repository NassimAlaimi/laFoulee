import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { errorFingerprint, normalizeErrorMessage } from "../src/lib/error-fingerprint.ts";

describe("empreinte d'erreur", () => {
  it("regroupe les messages qui ne diffèrent que par des identifiants", () => {
    assert.equal(
      errorFingerprint("GET /activities/[id]", "Activité cmufwcnq10003uhdgxj1hkzsu introuvable (412 ms)"),
      errorFingerprint("GET /activities/[id]", "Activité cmud2vjpo0000uh4k8oe2jcxd introuvable (90 ms)")
    );
  });
  it("distingue la source et le fond du message", () => {
    assert.notEqual(errorFingerprint("a", "x"), errorFingerprint("b", "x"));
    assert.notEqual(errorFingerprint("a", "x"), errorFingerprint("a", "y"));
  });
  it("ne garde que la première ligne, tronquée", () => {
    assert.equal(normalizeErrorMessage("Boom 42\n    at foo (bar.ts:1:2)"), "Boom <n>");
    assert.equal(normalizeErrorMessage("x".repeat(500)).length, 300);
  });
});
