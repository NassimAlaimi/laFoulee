import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aerobicPaceSeries,
  aerobicSummary,
  comparableSplits,
  paceAtHr,
  referenceHr,
  type AerobicSplit,
} from "../src/lib/aerobic-pace.ts";

let seed = 7;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648 - 0.5;
};

/** Sorties synthétiques : vitesse = base + 0.03 × (FC − 140). */
function runs(from: Date, count: number, base: number, everyDays = 3): AerobicSplit[] {
  const out: AerobicSplit[] = [];
  for (let r = 0; r < count; r++) {
    const date = new Date(from.getTime() + r * everyDays * 86400000);
    for (let i = 0; i < 10; i++) {
      const hr = 125 + ((i * 7 + r * 3) % 35);
      const speed = base + 0.03 * (hr - 140) + rand() * 0.05;
      out.push({ activityId: `r${date.getTime()}`, date, index: i, distance: 1000, movingTime: 1000 / speed, averageHr: hr, elevationDiff: 0, type: "Run", isRace: false });
    }
  }
  return out;
}

describe("comparableSplits", () => {
  it("écarte course, trail, côtes et premier km", () => {
    const d = new Date(2026, 0, 1);
    const base = { activityId: "a", date: d, index: 2, distance: 1000, movingTime: 330, averageHr: 145, elevationDiff: 0, type: "Run", isRace: false };
    assert.equal(comparableSplits([base]).length, 1);
    assert.equal(comparableSplits([{ ...base, isRace: true }]).length, 0);
    assert.equal(comparableSplits([{ ...base, type: "TrailRun" }]).length, 0);
    assert.equal(comparableSplits([{ ...base, elevationDiff: 30 }]).length, 0);
    assert.equal(comparableSplits([{ ...base, index: 0 }]).length, 0);
  });
});

describe("paceAtHr", () => {
  it("retrouve l'allure à FC fixe", () => {
    const clean = comparableSplits(runs(new Date(2026, 0, 1), 8, 3.0));
    const est = paceAtHr(clean, 140)!;
    assert.ok(est);
    assert.ok(Math.abs(est.pace - 333) <= 4, `pace=${est.pace}`);
    assert.ok(est.paceFast <= est.pace && est.pace <= est.paceSlow);
  });
  it("refuse sous 4 sorties", () => {
    const clean = comparableSplits(runs(new Date(2026, 0, 1), 3, 3.0));
    assert.equal(paceAtHr(clean, 140), null);
  });
});

describe("referenceHr", () => {
  it("≈ 85 % de la FC seuil quand c'est dans la zone facile réelle", () => {
    const clean = comparableSplits(runs(new Date(2026, 0, 1), 8, 3.0));
    assert.equal(referenceHr(clean, 170), 145);
  });
  it("seuil trop haut (coureur qui ne descend jamais) → quartile bas, jamais sous la plage", () => {
    const clean = comparableSplits(runs(new Date(2026, 0, 1), 8, 3.0));
    const q25 = [...clean].map((c) => c.hr).sort((a, b) => a - b)[Math.floor(clean.length * 0.25)];
    const ref = referenceHr(clean, 250)!;
    assert.equal(ref, Math.round(q25 / 5) * 5);
    assert.ok(ref >= Math.min(...clean.map((c) => c.hr)));
  });
  it("trop peu de points → null", () => {
    const clean = comparableSplits(runs(new Date(2026, 0, 1), 1, 3.0));
    assert.equal(referenceHr(clean, 170), null);
  });
});

describe("série et résumé", () => {
  it("détecte une progression significative", () => {
    const now = new Date(2026, 5, 30);
    const splits = [
      ...runs(new Date(2026, 0, 5), 20, 2.9), // janv.-févr. : plus lent
      ...runs(new Date(2026, 4, 1), 20, 3.2), // mai-juin : plus rapide
    ];
    const series = aerobicPaceSeries(splits, { lthr: 170, now, weeks: 30 });
    assert.equal(series.refHr, 145);
    const sum = aerobicSummary(series, now)!;
    assert.ok(sum);
    assert.ok(sum.delta! < -15, `delta=${sum.delta}`);
    assert.equal(sum.significant, true);
  });
  it("rien si le dernier point est trop ancien", () => {
    const series = aerobicPaceSeries(runs(new Date(2026, 0, 5), 10, 3), { lthr: 170, now: new Date(2026, 5, 30), weeks: 30 });
    assert.equal(aerobicSummary(series, new Date(2026, 5, 30)), null);
  });
});
