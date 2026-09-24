import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  estimateThresholds,
  genericLt2Hr,
  zoneForHr,
  MIN_POINTS,
} from "../src/lib/thresholds.ts";

/** Points synthétiques : FC = 80 + 15 × vitesse (m/s), bruit gaussien léger. */
function syntheticPoints(n: number, noise = 0, seed = 42): Array<{ pace: number; hr: number }> {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return (s / 2147483648 - 0.5) * 2;
  };
  const points = [];
  for (let i = 0; i < n; i++) {
    const speed = 2.4 + (i / Math.max(1, n - 1)) * 2.4; // 2.4 → 4.8 m/s
    const hr = 80 + 15 * speed + rand() * noise;
    points.push({ pace: 1000 / speed, hr });
  }
  return points;
}

// Vitesse critique de référence : 4.2 m/s → pace 238 s/km
const CS_PACE = 238;

describe("estimateThresholds", () => {
  it("retrouve le seuil sur des données linéaires propres", () => {
    const t = estimateThresholds(syntheticPoints(60, 2), CS_PACE);
    assert.ok(t, "seuils estimés");
    // LT2 attendu : 80 + 15 × 4.2 = 143
    assert.ok(Math.abs(t!.lt2Hr - 143) <= 4, `lt2=${t!.lt2Hr}`);
    // LT1 attendu : 88 % de 143 ≈ 126
    assert.ok(Math.abs(t!.lt1Hr - 126) <= 4, `lt1=${t!.lt1Hr}`);
    assert.ok(t!.lt1Hr < t!.lt2Hr);
    assert.ok(t!.r2 > 0.9, `r2=${t!.r2}`);
  });

  it("élimine les points aberrants au second passage", () => {
    const clean = syntheticPoints(50, 2);
    // 8 splits aberrants : côtes très pentues, FC gonflée de 35 bpm
    const polluted = [
      ...clean,
      ...Array.from({ length: 8 }, (_, i) => ({ pace: 300 + i * 10, hr: 210 })),
    ];
    const t = estimateThresholds(polluted, CS_PACE);
    assert.ok(t);
    assert.ok(Math.abs(t!.lt2Hr - 143) <= 5, `lt2=${t!.lt2Hr}`);
  });

  it("refuse avec trop peu de points", () => {
    assert.equal(estimateThresholds(syntheticPoints(MIN_POINTS - 1, 2), CS_PACE), null);
  });

  it("refuse quand le lien allure-FC est inexistant", () => {
    const noise = Array.from({ length: 60 }, (_, i) => ({
      pace: 250 + (i % 20) * 5,
      hr: 130 + ((i * 37) % 50), // bruit pur
    }));
    assert.equal(estimateThresholds(noise, CS_PACE), null);
  });

  it("borne l'extrapolation au-delà des vitesses observées", () => {
    // CS très rapide (pace 150 s/km = 6.7 m/s) face à des données jusqu'à 4.8 m/s
    const t = estimateThresholds(syntheticPoints(60, 2), 150);
    assert.ok(t);
    // speed plafonnée à maxSpeed × 1.05 = 5.04 → HR ≤ 80 + 15 × 5.04 = 155.6
    assert.ok(t!.lt2Hr <= 156, `lt2=${t!.lt2Hr}`);
  });

  it("respecte la FC max fournie", () => {
    const t = estimateThresholds(syntheticPoints(60, 2), 150, 150);
    assert.ok(t);
    assert.ok(t!.lt2Hr <= 150);
  });

  it("zones ordonnées et cohérentes", () => {
    const t = estimateThresholds(syntheticPoints(60, 2), CS_PACE)!;
    assert.equal(t.zones.length, 5);
    for (let i = 1; i < t.zones.length; i++) {
      assert.ok(t.zones[i].hrLow >= t.zones[i - 1].hrLow, "FC croissantes");
      assert.ok(t.zones[i].paceCeil < t.zones[i - 1].paceCeil, "allures décroissantes");
    }
    assert.equal(t.zones[0].hrLow, 0);
    assert.equal(t.zones[4].hrHigh, Infinity);
  });

  it("classe une FC dans la bonne zone", () => {
    const t = estimateThresholds(syntheticPoints(60, 2), CS_PACE)!;
    assert.equal(zoneForHr(t, 100).key, "z1");
    assert.equal(zoneForHr(t, t.lt1Hr + 2).key, "z2");
    assert.equal(zoneForHr(t, t.lt2Hr + 2).key, "z3");
    assert.equal(zoneForHr(t, 250).key, "z5");
  });
});

describe("genericLt2Hr", () => {
  it("87 % de la FC max", () => {
    assert.equal(genericLt2Hr(200), 174);
  });
});
