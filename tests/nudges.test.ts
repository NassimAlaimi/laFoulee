import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickNudges, type NudgeInput } from "../src/lib/nudges.ts";

const now = new Date(2026, 8, 15);
const base: NudgeInput = { now, nextRace: null, recentRuns: [], shoes: [], logDaysLast7: 3, logDaysEver: 10 };
const race = { id: "g1", name: "Semi de Lyon", distance: 21097, hasRacePlan: false, hasPlan: true };

describe("pickNudges", () => {
  it("rien quand tout va bien", () => {
    assert.deepEqual(pickNudges(base), []);
  });
  it("plan de course à moins de 8 semaines", () => {
    const n = pickNudges({ ...base, nextRace: { ...race, date: new Date(2026, 9, 20) } });
    assert.equal(n[0].key, "racePlan");
    assert.equal(n[0].href, "/goals/g1/race-plan");
  });
  it("pas de rappel de plan de course s'il existe", () => {
    const n = pickNudges({ ...base, nextRace: { ...race, hasRacePlan: true, date: new Date(2026, 9, 20) } });
    assert.equal(n.length, 0);
  });
  it("plan d'entraînement manquant pour une course lointaine", () => {
    const n = pickNudges({ ...base, nextRace: { ...race, hasPlan: false, date: new Date(2027, 0, 20) } });
    assert.equal(n[0].key, "plan");
  });
  it("sensations non notées", () => {
    const n = pickNudges({ ...base, recentRuns: [{ id: "a", feeling: null }, { id: "b", feeling: null }, { id: "c", feeling: null }, { id: "d", feeling: 4 }] });
    assert.equal(n[0].key, "feeling");
    assert.equal(n[0].href, "/activities/a");
  });
  it("chaussures usées, rétrospective en début de mois, carnet oublié", () => {
    const n = pickNudges({ ...base, now: new Date(2026, 9, 2), shoes: [{ name: "Pegasus", km: 690, retireAtKm: 700 }], logDaysLast7: 0 });
    assert.deepEqual(n.map((x) => x.key), ["gear", "recap", "log"]);
  });
});
