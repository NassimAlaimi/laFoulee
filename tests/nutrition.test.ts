import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { caffeineDose, carbsPerHour, DEFAULT_PRODUCTS, fluidPerHour, fuelPlan, preRace, sodiumPerHour, sweatRate } from "../src/lib/nutrition.ts";

describe("repères", () => {
  it("glucides selon la durée", () => {
    assert.equal(carbsPerHour(45 * 60).target, 0);
    assert.equal(carbsPerHour(100 * 60).target, 45);
    assert.equal(carbsPerHour(4 * 3600).target, 70);
    assert.equal(carbsPerHour(4 * 3600, true).target, 90);
  });
  it("taux de sudation", () => {
    assert.equal(sweatRate({ before: 70, after: 69, drankMl: 500, minutes: 60 }), 1.5);
    assert.equal(sweatRate({ before: 70, after: 69, drankMl: 0, minutes: 10 }), null);
  });
  it("boisson plafonnée, jamais au-delà des pertes", () => {
    assert.equal(fluidPerHour(1.5, 20), 800);
    assert.equal(fluidPerHour(0.6, 20), 400);
    assert.equal(fluidPerHour(null, 28), 650);
  });
  it("sodium, caféine, avant-course", () => {
    assert.equal(sodiumPerHour(1, false), 450);
    assert.ok(sodiumPerHour(1, true) > 450);
    assert.equal(caffeineDose(70), 200);
    assert.equal(caffeineDose(20), 100);
    const pr = preRace(70, 3 * 3600);
    assert.equal(pr.loadingGPerDay, 630);
    assert.equal(preRace(70, 40 * 60).loadingGPerDay, null);
  });
});

describe("fuelPlan", () => {
  // 3 h à 10 km/h, montée raide entre 60 et 65 min
  const base = {
    durationSec: 3 * 3600,
    kmAt: (s: number) => (s / 3600) * 10000,
    gradeAt: (s: number) => (s >= 3600 && s < 3900 ? 8 : 0),
    products: DEFAULT_PRODUCTS,
    mainId: "gel",
    aidKms: [10, 20],
  };
  it("une prise toutes les ~21 min pour 70 g/h de gels de 25 g", () => {
    const p = fuelPlan(base);
    assert.equal(p.carbsPerHour, 70);
    assert.ok(p.stops.length >= 7 && p.stops.length <= 8, `n=${p.stops.length}`);
    assert.ok(p.stops.every((s) => s.minute <= 165));
    assert.ok(Math.abs(p.totals.carbsG / 3 - 70) < 12);
  });
  it("décale hors de la montée raide", () => {
    const p = fuelPlan(base);
    const moved = p.stops.filter((s) => s.shifted);
    for (const s of moved) assert.ok(s.minute * 60 >= 3900 || s.minute * 60 < 3600);
  });
  it("caféine en seconde moitié, sans dépasser la dose", () => {
    const p = fuelPlan({ ...base, caffeineId: "gel-caf", weightKg: 60 });
    const caf = p.stops.filter((s) => s.caffeineMg > 0);
    assert.ok(caf.length > 0);
    assert.ok(caf.every((s) => s.minute >= 90));
    assert.ok(p.totals.caffeineMg <= caffeineDose(60));
  });
  it("à porter entre deux ravitos, et alerte si on boit plus qu'on ne perd", () => {
    const p = fuelPlan({ ...base, sweatRateLh: 0.3 });
    assert.ok(p.carryMax >= 2);
    assert.equal(p.overDrinking, false); // 65 % des pertes
    const course = fuelPlan({ ...base, durationSec: 40 * 60 });
    assert.equal(course.stops.length, 0);
  });
});
