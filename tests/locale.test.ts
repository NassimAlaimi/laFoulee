import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { negotiateLocale, safeNextPath } from "../src/lib/locale.ts";

const SUP = ["fr", "en", "es"] as const;

describe("négociation Accept-Language", () => {
  it("prend la langue primaire préférée", () => {
    assert.equal(negotiateLocale("en-GB,en;q=0.9,fr;q=0.8", SUP), "en");
    assert.equal(negotiateLocale("es-ES", SUP), "es");
  });
  it("respecte les poids q plutôt que l'ordre", () => {
    assert.equal(negotiateLocale("de;q=0.9,fr;q=0.5,es;q=0.7", SUP), "es");
  });
  it("saute les langues non prises en charge et q=0", () => {
    assert.equal(negotiateLocale("de-DE,de;q=0.9,en;q=0,fr;q=0.3", SUP), "fr");
  });
  it("null quand rien ne correspond ou en-tête absent", () => {
    assert.equal(negotiateLocale("de,ja", SUP), null);
    assert.equal(negotiateLocale("*", SUP), null);
    assert.equal(negotiateLocale(null, SUP), null);
    assert.equal(negotiateLocale("", SUP), null);
  });
});

describe("chemin de retour sûr", () => {
  it("accepte un chemin interne", () => {
    assert.equal(safeNextPath("/login?mode=signup"), "/login?mode=signup");
  });
  it("refuse les redirections ouvertes", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "evil", "", null, "/\nx"]) {
      assert.equal(safeNextPath(bad), "/");
    }
  });
});
