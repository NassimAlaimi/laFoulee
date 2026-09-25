import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { composeBrief, sanitizeBrief } from "../src/lib/agent.ts";

const ctx = {
  week: { km: 42, sessions: 5, goalKm: 40, easyShare: 0.8 },
  prevKm: 38,
  acwr: 1.1,
  nextWeek: { km: 45, sessions: 5, key: ["Seuil 3×10'", "Sortie longue 1h45", "Footing"] },
  nextRace: { name: "Semi de Paris", days: 30, distanceKm: 21 },
  advice: "Forme au rendez-vous.",
  pain: 0,
  bestRun: { name: "Sortie longue", distanceKm: 18, pace: 320 },
};

describe("composeBrief", () => {
  it("interprète, sans markdown", () => {
    const b = composeBrief(ctx);
    assert.ok(!b.includes("#"), "pas de titre markdown");
    assert.ok(!b.includes("- "), "pas de puce markdown");
    assert.ok(b.includes("42 km en 5 sorties"));
    assert.ok(b.includes("4 km de plus"));
    assert.ok(b.includes("Semi de Paris dans 30 jours"));
    assert.ok(b.includes("5'20\"/km"));
  });
  it("relève les footings trop rapides", () => {
    const b = composeBrief({ ...ctx, week: { ...ctx.week, easyShare: 0.5 } });
    assert.ok(b.includes("footings sont un peu rapides"));
  });
  it("signale la douleur et une charge élevée", () => {
    const b = composeBrief({ ...ctx, pain: 2, acwr: 1.6 });
    assert.ok(b.includes("Douleur signalée"));
    assert.ok(b.includes("Charge aiguë élevée"));
  });
  it("sans objectif ni sortie marquante, reste lisible", () => {
    const b = composeBrief({ ...ctx, nextRace: null, bestRun: null, prevKm: 0 });
    assert.ok(b.includes("La semaine prochaine"));
  });
});

describe("sanitizeBrief", () => {
  it("retire titres et puces", () => {
    const out = sanitizeBrief("# Bilan\n\n- 33 km\n\n# Conseil\n\nRemplis ton carnet.");
    assert.ok(!out.includes("#"));
    assert.ok(!out.includes("- 33"));
    assert.ok(out.includes("Remplis ton carnet."));
  });
});
