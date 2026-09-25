import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { adviceOfTheDay, sessionWhy } from "../src/lib/coach.ts";

describe("sessionWhy", () => {
  it("un bloc dur se saute à regret, un footing jamais", () => {
    assert.equal(sessionWhy({ kind: "intervals", phase: "build", intensity: 4, durationMin: 60, distanceKm: 10 }).whyKey, "why.intervals");
    assert.equal(sessionWhy({ kind: "intervals", phase: "build", intensity: 4, durationMin: 60, distanceKm: 10 }).skipKey, "skip.quality");
    assert.equal(sessionWhy({ kind: "easy", phase: "base", intensity: 1, durationMin: 45, distanceKm: 8 }).skipKey, "skip.easy");
    assert.equal(sessionWhy({ kind: "easy", phase: "peak", intensity: 1, durationMin: 45, distanceKm: 8 }).placeKey, "place.peak");
  });
});

describe("adviceOfTheDay", () => {
  const base = { tsb: 0, acwr: 1.0, logDays: 4, feelingMissing: 0, nextRace: null, phase: "build", pain: 0 };
  it("la douleur passe avant tout", () => {
    assert.equal(adviceOfTheDay({ ...base, pain: 2 })!.key, "pain");
  });
  it("surcharge avant course proche", () => {
    assert.equal(adviceOfTheDay({ ...base, acwr: 1.6 })!.key, "overreach");
  });
  it("semaine de course", () => {
    assert.equal(adviceOfTheDay({ ...base, nextRace: { days: 5, distanceKm: 21, hasRacePlan: true } })!.key, "raceWeek");
  });
  it("plan de course manquant à moins de 8 semaines", () => {
    assert.equal(adviceOfTheDay({ ...base, nextRace: { days: 40, distanceKm: 42, hasRacePlan: false } })!.key, "racePlan");
  });
  it("carnet oublié, ressentis, forme fraîche", () => {
    assert.equal(adviceOfTheDay({ ...base, logDays: 0 })!.key, "log");
    assert.equal(adviceOfTheDay({ ...base, feelingMissing: 4 })!.key, "feeling");
    assert.equal(adviceOfTheDay({ ...base, tsb: 15 })!.key, "fresh");
  });
  it("rien de pressant → base", () => {
    assert.equal(adviceOfTheDay(base)!.key, "base");
  });
});
