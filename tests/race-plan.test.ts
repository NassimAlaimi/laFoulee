import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  debrief,
  gapFactor,
  heatPenalty,
  kmTable,
  pacingCurve,
  sampleCourse,
  scenarios,
  segmentCourse,
  strategyFactor,
  switchSignal,
  timeAt,
} from "../src/lib/race-plan.ts";

/** Parcours de 10 km : 4 km plats, 1 km de montée à 6 %, 1 km de descente, 4 km plats. */
function course() {
  const pts = [];
  for (let m = 0; m <= 10000; m += 25) {
    let ele = 100;
    if (m > 4000 && m <= 5000) ele = 100 + (m - 4000) * 0.06;
    else if (m > 5000 && m <= 6000) ele = 160 - (m - 5000) * 0.06;
    pts.push({ lat: 48 + m / 111195, lon: 2, ele });
  }
  return sampleCourse(pts);
}

describe("échantillonnage et découpage", () => {
  const s = course();
  it("tous les 50 m, pente lissée", () => {
    assert.ok(Math.abs(s[s.length - 1].d - 10000) < 5);
    const mid = s.find((x) => x.d >= 4500)!;
    assert.ok(Math.abs(mid.grade - 6) < 0.5, `grade=${mid.grade}`);
  });
  it("plat / montée / descente / plat", () => {
    const seg = segmentCourse(s);
    assert.deepEqual(seg.map((x) => x.kind), ["flat", "up", "down", "flat"]);
    const up = seg[1];
    assert.ok(Math.abs(up.startKm - 4) < 0.25 && Math.abs(up.endKm - 5) < 0.25);
    assert.ok(Math.abs(up.gain - 60) < 8, `gain=${up.gain}`);
    assert.equal(up.rank, 1);
  });
});

describe("allures", () => {
  it("coût de la pente", () => {
    assert.equal(gapFactor(0), 1);
    assert.ok(gapFactor(6) > 1.2);
    assert.ok(gapFactor(-6) < 1);
    assert.ok(gapFactor(-25) > gapFactor(-10)); // descente très raide : freine
  });
  it("stratégie négative : plus lent au début", () => {
    assert.ok(strategyFactor("negative", 0) > 1 && strategyFactor("negative", 1) < 1);
    assert.equal(strategyFactor("even", 0.2), 1);
  });
  it("chaleur (Hadley)", () => {
    assert.equal(heatPenalty(10, 5), 0);
    const hot = heatPenalty(28, 20);
    assert.ok(hot > 0.04 && hot < 0.06, `hot=${hot}`); // 82 °F + 68 °F ≈ 150 → 4,5 %
    assert.equal(heatPenalty(null, null), 0);
  });
  it("le total vaut le chrono visé, la côte est plus lente", () => {
    const s = course();
    const c = pacingCurve({ samples: s, targetSeconds: 3000, strategy: "even" });
    assert.ok(Math.abs(c[c.length - 1] - 3000) < 1);
    const rows = kmTable(s, c);
    assert.equal(rows.length, 10);
    assert.ok(rows[4].pace > rows[1].pace + 30, `montée ${rows[4].pace} vs plat ${rows[1].pace}`);
    assert.ok(rows[5].pace < rows[1].pace);
    const hot = pacingCurve({ samples: s, targetSeconds: 3000, strategy: "even", heat: 0.04 });
    assert.ok(Math.abs(hot[hot.length - 1] - 3120) < 1);
  });
});

describe("scénarios", () => {
  it("A < B < C, barrière et signal de bascule", () => {
    const s = course();
    const sc = scenarios({ samples: s, targetSeconds: 3000, realisticSeconds: 3150, strategy: "negative", checkpoints: [{ km: 7, kind: "cutoff", label: "Barrière", cutoff: 2500 }] });
    assert.deepEqual(sc.map((x) => x.key), ["A", "B", "C"]);
    assert.equal(sc[1].seconds, 3150);
    assert.ok(sc[2].seconds > sc[1].seconds);
    const cut = sc[0].passes.find((p) => p.label === "Barrière")!;
    assert.ok(cut.margin! > 0);
    const sig = switchSignal(sc)!;
    assert.equal(sig.km, 5);
    const a5 = sc[0].passes.find((p) => p.km === 5)!.time;
    const b5 = sc[1].passes.find((p) => p.km === 5)!.time;
    assert.ok(sig.after > a5 && sig.after < b5);
  });
});

describe("débrief", () => {
  it("départ trop rapide puis défaillance", () => {
    const s = course();
    const curve = pacingCurve({ samples: s, targetSeconds: 3000, strategy: "even" });
    const plan = kmTable(s, curve);
    // réel : 3 premiers km 8 % plus vite, 3 derniers 10 % plus lents
    const splits = plan.map((r, i) => ({ distance: 1000, elapsedTime: Math.round(r.seconds * (i < 3 ? 0.92 : i >= 7 ? 1.1 : 1)) }));
    const d = debrief({ samples: s, curve, segments: segmentCourse(s), splits })!;
    assert.ok(d.thirds[0] < -2 && d.thirds[2] > 2, `thirds=${d.thirds}`);
    assert.ok(d.lessons.includes("fastStart"));
    assert.equal(Math.round(timeAt(s, curve, 10000)), d.total.planned);
  });
});
