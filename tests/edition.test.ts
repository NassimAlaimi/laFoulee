import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { editionFor } from "../src/lib/edition.ts";

const base = { nextRaceDays: null, lastRaceDays: null, phase: null, aRaceDays: null };

describe("editionFor", () => {
  it("jour de course l'emporte sur le lendemain de course", () => {
    assert.equal(editionFor({ ...base, nextRaceDays: 0, lastRaceDays: 1 }), "raceDay");
  });
  it("lendemain de course avant la veille de la suivante", () => {
    assert.equal(editionFor({ ...base, lastRaceDays: 1, nextRaceDays: 2 }), "raceAfter");
  });
  it("veille de course (1-3 jours)", () => {
    assert.equal(editionFor({ ...base, nextRaceDays: 3 }), "raceEve");
    assert.equal(editionFor({ ...base, nextRaceDays: 4 }), "daily");
  });
  it("affûtage et hors saison", () => {
    assert.equal(editionFor({ ...base, phase: "taper" }), "taper");
    assert.equal(editionFor({ ...base, phase: "base" }), "daily");
    assert.equal(editionFor(base), "offseason");
  });
});
