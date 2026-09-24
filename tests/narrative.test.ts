import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { seasonSentence } from "../src/lib/narrative.ts";
import type { ActivityLike } from "../src/lib/stats.ts";

const run = (daysAgo: number, hour: number, km: number): ActivityLike => {
  const d = new Date(2026, 8, 23, hour);
  d.setDate(d.getDate() - daysAgo);
  return {
    id: `${daysAgo}-${hour}`,
    name: "",
    type: "Run",
    startDate: d,
    distance: km * 1000,
    movingTime: km * 360,
    elapsedTime: km * 360,
    totalElevation: 0,
    averageSpeed: 1000 / 360,
    maxSpeed: null,
    averageHr: null,
    maxHr: null,
    sufferScore: null,
    averageCadence: null,
    isRace: false,
  };
};

describe("seasonSentence", () => {
  const now = new Date(2026, 8, 23, 12);

  it("renvoie null avec moins de 4 sorties récentes", () => {
    assert.equal(seasonSentence([run(1, 8, 5), run(3, 8, 6), run(5, 8, 4)], now), null);
  });

  it("dit le rythme, le moment et le volume", () => {
    const acts = [
      run(1, 18, 8), run(3, 19, 6), run(6, 18, 10), run(8, 7, 5),
      run(10, 18, 7), run(13, 19, 6), run(15, 18, 5), run(17, 8, 12),
    ];
    const s = seasonSentence(acts, now)!;
    const keys = s.map((p) => p.key);
    assert.ok(keys.some((k) => /youRun/.test(k)), keys.join(", "));
    assert.ok(keys.includes("season.slot4"), keys.join(", "));
    assert.ok(keys.includes("season.km"), keys.join(", "));
    assert.ok(s.some((p) => p.key === "season.km" && p.params && p.params.km), "paramètre km");
  });

  it("signale la série de jours d'affilée", () => {
    const acts = [run(1, 8, 5), run(2, 8, 5), run(3, 8, 5), run(4, 8, 5), run(5, 8, 5), run(6, 8, 5)];
    const streak = seasonSentence(acts, now)!.find((p) => p.key === "season.streak");
    assert.ok(streak, "fragment série manquant");
    assert.equal(streak!.params!.days, 6);
  });

  it("compare au trimestre précédent", () => {
    const acts = [
      run(1, 8, 5), run(4, 8, 5), run(8, 8, 5), run(12, 8, 5),
      run(95, 8, 20), run(110, 8, 20), run(130, 8, 20), run(150, 8, 20),
    ];
    const delta = seasonSentence(acts, now)!.find((p) => p.key === "season.deltaDown");
    assert.ok(delta, "fragment delta manquant");
    assert.ok(delta!.params && Number(delta!.params.pct) > 0);
  });

  it("met une virgule française et un multiplicateur pour les grands écarts", () => {
    const acts = [
      run(1, 8, 5.2), run(4, 8, 5.2), run(8, 8, 5.2), run(12, 8, 5.2),
      run(95, 8, 1.1), run(110, 8, 1.1), run(130, 8, 1.1), run(150, 8, 1.1),
    ];
    const s = seasonSentence(acts, now)!;
    const kmPart = s.find((p) => p.key === "season.km");
    assert.equal(kmPart!.params!.km, "20,8");
    const big = s.find((p) => p.key === "season.deltaBig");
    assert.ok(big, "multiplicateur attendu");
    assert.ok(Number((big!.params!.x as string).replace(",", ".")) > 4);
  });
});
