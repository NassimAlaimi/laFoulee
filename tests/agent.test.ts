import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { composeBrief } from "../src/lib/agent.ts";

const ctx = {
  week: { km: 42, sessions: 5, goalKm: 40, easyShare: 0.8 },
  form: { tsb: 5, zone: "optimal" },
  acwr: 1.1,
  nextWeek: { km: 45, sessions: 5, key: ["Seuil 3×10'", "Sortie longue 1h45", "Footing"] },
  nextRace: { name: "Semi de Paris", days: 30, distanceKm: 21 },
  advice: "Forme au rendez-vous.",
  pain: 0,
  bestRun: { name: "Sortie longue", distanceKm: 18, pace: 320 },
};

describe("composeBrief", () => {
  it("résume la semaine et la suivante avec les chiffres exacts", () => {
    const b = composeBrief(ctx);
    assert.ok(b.includes("42 km en 5 sorties"));
    assert.ok(b.includes("80 % du temps"));
    assert.ok(b.includes("Semi de Paris dans 30 jours"));
    assert.ok(b.includes("5'20\"/km"));
  });
  it("signale une douleur", () => {
    assert.ok(composeBrief({ ...ctx, pain: 2 }).includes("Douleur signalée"));
  });
  it("sans objectif ni forme, reste lisible", () => {
    const b = composeBrief({ ...ctx, nextRace: null, form: null, acwr: null, bestRun: null });
    assert.ok(b.includes("Semaine à venir"));
  });
});
