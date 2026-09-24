import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aerobicDecoupling,
  decodeStream,
  efficiencyTrend,
  encodeStream,
  timeInZones,
} from "../src/lib/cardio.ts";

/** Séance synthétique : n secondes, FC constante par moitié, vitesse constante. */
function stream(n: number, hrFirst: number, hrSecond: number, speed = 3): ReturnType<typeof decodeStream> {
  const time: number[] = [];
  const hr: number[] = [];
  const sp: number[] = [];
  for (let i = 0; i < n; i++) {
    time.push(i);
    hr.push(i < n / 2 ? hrFirst : hrSecond);
    sp.push(speed);
  }
  return { time, hr, speed: sp };
}

describe("encode/decode", () => {
  it("aller-retour sans perte", () => {
    const s = stream(300, 140, 150, 3.2);
    const back = decodeStream(encodeStream(s));
    assert.deepEqual(back.time, s.time);
    assert.deepEqual(back.hr, s.hr);
    assert.deepEqual(back.speed, s.speed);
  });

  it("chaîne vide pour séance vide", () => {
    assert.equal(encodeStream({ time: [], hr: [], speed: [] }), "");
    assert.deepEqual(decodeStream("").hr, []);
  });

  it("plus compact que le JSON brut", () => {
    const s = stream(3600, 140, 150);
    const encoded = encodeStream(s);
    assert.ok(encoded.length < 20000, `encodé en ${encoded.length} caractères`);
  });

  it("tolère les lignes malformées", () => {
    assert.deepEqual(decodeStream("0,120,300;1,2;x,y,z").hr, [120, 122]);
  });
});

describe("aerobicDecoupling", () => {
  it("dérive positive quand la FC monte à vitesse constante", () => {
    const r = aerobicDecoupling(stream(1000, 140, 150));
    assert.ok(r);
    // EF première moitié = 180/140, seconde = 180/150 → drift ≈ 6.7 %
    assert.ok(r!.drift > 5 && r!.drift < 8, `drift=${r!.drift}`);
    assert.equal(r!.avgHr, 145);
    assert.equal(r!.efficiency, 1.24); // 180 / 145 = 1.241…
  });

  it("dérive nulle à FC constante", () => {
    const r = aerobicDecoupling(stream(1000, 140, 140));
    assert.equal(r!.drift, 0);
  });

  it("dérive négative quand la FC baisse", () => {
    const r = aerobicDecoupling(stream(1000, 150, 140));
    assert.ok(r!.drift < 0);
  });

  it("refuse les séances trop courtes", () => {
    assert.equal(aerobicDecoupling(stream(5, 140, 140)), null);
  });
});

describe("timeInZones", () => {
  const zones = [
    { key: "z1", name: "Z1", hrLow: 0, hrHigh: 150 },
    { key: "z2", name: "Z2", hrLow: 150, hrHigh: 170 },
    { key: "z3", name: "Z3", hrLow: 170, hrHigh: Infinity },
  ];

  it("répartit le temps entre les zones", () => {
    // 300 s : 100 s < 150, 100 s entre 150-170, 100 s ≥ 170
    const time: number[] = [];
    const hr: number[] = [];
    for (let i = 0; i < 300; i++) {
      time.push(i);
      hr.push(i < 100 ? 140 : i < 200 ? 160 : 180);
    }
    const zt = timeInZones({ time, hr, speed: time.map(() => 3) }, zones);
    assert.deepEqual(zt.map((z) => z.minutes), [1.7, 1.7, 1.7]);
    assert.deepEqual(zt.map((z) => z.percent), [33, 33, 33]);
  });

  it("séance vide : zéros", () => {
    const zt = timeInZones({ time: [], hr: [], speed: [] }, zones);
    assert.deepEqual(zt.map((z) => z.minutes), [0, 0, 0]);
  });
});

describe("efficiencyTrend", () => {
  it("moyenne glissante sur fenêtre", () => {
    const points = [1, 2, 3, 4].map((e, i) => ({
      date: new Date(2026, 0, i + 1),
      efficiency: e,
    }));
    const t = efficiencyTrend(points, 3);
    assert.equal(t.length, 4);
    assert.equal(t[0].efficiency, 1); // fenêtre [1]
    assert.equal(t[2].efficiency, 2); // fenêtre [1,2,3]
    assert.equal(t[3].efficiency, 3); // fenêtre [2,3,4]
  });
});
