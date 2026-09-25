import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  zoneModel,
  hrZoneIndex,
  paceZoneIndex,
  zoneDistribution,
  percents,
  polarized,
  polarVerdict,
  robustMaxHr,
  sustainedMaxHr,
  compareRow,
  isEasyComparable,
  reserveLthr,
} from "../src/lib/zones.ts";

const personal = zoneModel({ personal: { lt2Hr: 170, lt2Pace: 250 } });

describe("zoneModel — cascade", () => {
  it("privilégie les seuils personnels", () => {
    assert.equal(personal.hrSource, "personal");
    assert.equal(personal.paceSource, "personal");
    assert.equal(personal.lthr, 170);
  });
  it("replie sur la FC de réserve et le VDOT", () => {
    const m = zoneModel({ maxHr: 190, restHr: 50, vdotThresholdPace: 260 });
    assert.equal(m.hrSource, "reserve");
    assert.equal(m.lthr, reserveLthr(190, 50));
    assert.equal(m.lthr, 169);
    assert.equal(m.paceSource, "vdot");
  });
  it("sans ancre, pas de bandes", () => {
    const m = zoneModel({});
    assert.equal(m.hr, null);
    assert.equal(m.pace, null);
  });
});

describe("indices de zone", () => {
  it("cardio : bornes en % de LTHR", () => {
    const b = personal.hr!;
    assert.equal(hrZoneIndex(b, 120), 0); // < 85 %
    assert.equal(hrZoneIndex(b, 145), 1); // 85 % = 144.5 → 145
    assert.equal(hrZoneIndex(b, 155), 2);
    assert.equal(hrZoneIndex(b, 165), 3);
    assert.equal(hrZoneIndex(b, 175), 4);
  });
  it("allure : footing lent en Z1, allure seuil en Z4, plus vite en Z5", () => {
    const b = personal.pace!;
    assert.equal(paceZoneIndex(b, 360), 0); // 6:00 > 1.29 × 4:10
    assert.equal(paceZoneIndex(b, 300), 1); // 1.2×
    assert.equal(paceZoneIndex(b, 270), 2); // 1.08×
    assert.equal(paceZoneIndex(b, 250), 3); // seuil
    assert.equal(paceZoneIndex(b, 230), 4);
  });
});

describe("zoneDistribution — temps passé, pas la moyenne", () => {
  it("un fractionné se répartit sur plusieurs zones", () => {
    // 20 min faciles à 130 bpm, 10 min à 176 bpm
    const time: number[] = [];
    const hr: number[] = [];
    const speed: number[] = [];
    for (let t = 0; t <= 1800; t++) {
      time.push(t);
      hr.push(t < 1200 ? 130 : 176);
      speed.push(t < 1200 ? 3 : 4.4);
    }
    const d = zoneDistribution(
      [{ movingTime: 1800, averageHr: 145, averageSpeed: 3.4, stream: { time, hr, speed } }],
      personal
    );
    const p = percents(d.hr);
    assert.equal(p[0], 67);
    assert.equal(p[4], 33);
    // l'ancienne méthode aurait tout mis en Z2 (moyenne 145)
    assert.equal(d.hr[1], 0);
    assert.equal(d.coverage.stream, 1);
  });

  it("repli sur les splits puis sur la moyenne", () => {
    const d = zoneDistribution(
      [
        {
          movingTime: 600,
          averageHr: 150,
          averageSpeed: 3.5,
          splits: [
            { movingTime: 300, averageHr: 130, averageSpeed: 3 },
            { movingTime: 300, averageHr: 172, averageSpeed: 4.2 },
          ],
        },
        { movingTime: 1000, averageHr: 130, averageSpeed: 3 },
        { movingTime: 1000, averageHr: null, averageSpeed: 3 },
      ],
      personal
    );
    assert.deepEqual(d.coverage, { stream: 0, splits: 1, average: 1, noHr: 1 });
    assert.equal(d.hr[0], 1300);
    assert.equal(d.hr[4], 300);
    // la séance sans cardio compte quand même en allure
    assert.equal(d.pace.reduce((a, b) => a + b, 0), 2600);
  });

  it("ignore les pauses de montre", () => {
    const d = zoneDistribution(
      [{ movingTime: 20, averageHr: 130, averageSpeed: 3, stream: { time: [0, ...Array.from({ length: 11 }, (_, i) => 600 + i)], hr: Array(12).fill(130), speed: Array(12).fill(3) } }],
      personal
    );
    assert.equal(d.hr[0], 10);
  });
});

describe("percents & polarisation", () => {
  it("somme à 100", () => {
    const p = percents([1, 1, 1]);
    assert.equal(p.reduce((a, b) => a + b, 0), 100);
  });
  it("regroupe facile / intermédiaire / intense", () => {
    assert.deepEqual(polarized([10, 20, 5, 5, 3]), { low: 30, mid: 10, high: 3 });
  });
  it("verdicts", () => {
    const h = 3600;
    assert.equal(polarVerdict([h, h, 0, 0, 0], 2), "thin");
    assert.equal(polarVerdict([6 * h, 2 * h, 0.3 * h, 0.3 * h, 0.5 * h], 8), "balanced");
    assert.equal(polarVerdict([3 * h, 1 * h, 2 * h, 1 * h, 0], 8), "tooMuchMid");
  });
});

describe("FC max robuste", () => {
  it("écarte un pic isolé", () => {
    assert.equal(robustMaxHr([205, 186, 184, 179]), 186);
  });
  it("garde un maximum corroboré", () => {
    assert.equal(robustMaxHr([192, 190, 170]), 192);
  });
  it("vide → null", () => {
    assert.equal(robustMaxHr([null, 90]), null);
  });
  it("FC soutenue 30 s, pas l'échantillon parasite", () => {
    const time = Array.from({ length: 120 }, (_, i) => i);
    const hr = time.map((t) => (t === 50 ? 215 : t >= 60 && t < 100 ? 182 : 150));
    assert.equal(sustainedMaxHr({ time, hr, speed: time.map(() => 3) }), 182);
  });
});

describe("comparatif", () => {
  it("pas d'évolution sous 4 séances", () => {
    const r = compareRow("km", 50, 20, "up", { now: 5, was: 2 });
    assert.equal(r.deltaPct, null);
    assert.equal(r.tone, "flat");
  });
  it("allure : baisser est bon", () => {
    const r = compareRow("pace", 320, 340, "down", { now: 6, was: 6 });
    assert.equal(r.tone, "good");
  });
  it("écart faible = stable", () => {
    assert.equal(compareRow("km", 101, 100, "up", { now: 6, was: 6 }).tone, "flat");
  });
  it("séance facile comparable", () => {
    const base = { type: "Run", isRace: false, distance: 8000, averageSpeed: 1000 / 340 };
    assert.equal(isEasyComparable(base, personal), true);
    assert.equal(isEasyComparable({ ...base, isRace: true }, personal), false);
    assert.equal(isEasyComparable({ ...base, type: "TrailRun" }, personal), false);
    assert.equal(isEasyComparable({ ...base, averageSpeed: 4 }, personal), false);
  });
});

import { weeklyZones } from "../src/lib/zones.ts";
describe("weeklyZones", () => {
  it("range chaque séance dans sa semaine locale, semaines vides incluses", () => {
    const now = new Date(2026, 8, 24, 12); // jeudi
    const runs = [
      { startDate: new Date(2026, 8, 21, 7), movingTime: 1000, averageHr: 130, averageSpeed: 3 },
      { startDate: new Date(2026, 8, 14, 0, 30), movingTime: 500, averageHr: 176, averageSpeed: 4.5 },
    ];
    const w = weeklyZones(runs, personal, 4, now);
    assert.equal(w.length, 4);
    assert.equal(w[3].weekStart.getDate(), 21);
    assert.equal(w[3].hr[0], 1000);
    assert.equal(w[2].hr[4], 500);
    assert.equal(w[0].sessions, 0);
  });
});

import { monthlyPolar } from "../src/lib/zones.ts";
describe("monthlyPolar", () => {
  it("pourcentages par mois local, au temps", () => {
    const now = new Date(2026, 8, 24);
    const runs = [
      { startDate: new Date(2026, 8, 1, 0, 30), movingTime: 3000, averageHr: null, averageSpeed: 1000 / 360 },
      { startDate: new Date(2026, 8, 3), movingTime: 1000, averageHr: null, averageSpeed: 1000 / 230 },
    ];
    const m = monthlyPolar(runs, personal, 2, now);
    assert.equal(m.length, 2);
    assert.equal(m[0].hours, 0);
    assert.equal(m[1].easy, 75);
    assert.equal(m[1].hard, 25);
  });
});
