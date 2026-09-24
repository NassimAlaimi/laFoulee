import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  elevationPacingPlan,
  elevationProfile,
  fuelingStops,
  gradeFactor,
  paceForGrade,
  parseGpx,
} from "../src/lib/gpx.ts";

const GPX = `<?xml version="1.0"?>
<gpx><trk><trkseg>
<trkpt lat="48.8600" lon="2.3400"><ele>35</ele></trkpt>
<trkpt lat="48.8610" lon="2.3400"><ele>40</ele></trkpt>
<trkpt lat="48.8620" lon="2.3400"><ele>42</ele></trkpt>
<trkpt lat="48.8630" lon="2.3400"><ele>38</ele></trkpt>
<trkpt lat="48.8640" lon="2.3400"><ele>50</ele></trkpt>
<trkpt lat="48.8650" lon="2.3400"><ele>52</ele></trkpt>
<trkpt lat="48.8660" lon="2.3400"><ele>49</ele></trkpt>
<trkpt lat="48.8670" lon="2.3400"><ele>40</ele></trkpt>
<trkpt lat="48.8680" lon="2.3400"><ele>30</ele></trkpt>
<trkpt lat="48.8690" lon="2.3400"><ele>28</ele></trkpt>
</trkseg></trk></gpx>`;

describe("parseGpx", () => {
  it("extrait les points", () => {
    const pts = parseGpx(GPX);
    assert.equal(pts.length, 10);
    assert.equal(pts[0].lat, 48.86);
    assert.equal(pts[0].ele, 35);
  });

  it("tolère les fichiers sans élévation", () => {
    const pts = parseGpx('<trkpt lat="1" lon="2"></trkpt>');
    assert.equal(pts.length, 1);
    assert.equal(pts[0].ele, 0);
  });

  it("ignore le contenu non-GPX", () => {
    assert.equal(parseGpx("").length, 0);
    assert.equal(parseGpx("pas un gpx").length, 0);
  });
});

describe("elevationProfile", () => {
  it("regroupe par kilomètre avec gain, perte et pente", () => {
    // ~111 m entre chaque point de latitude → 10 points ≈ 1 km
    const profile = elevationProfile(parseGpx(GPX), 1000);
    assert.ok(profile.length >= 1);
    const total = profile.reduce((a, b) => a + b.lengthKm, 0);
    assert.ok(Math.abs(total - 1) < 0.05, `total=${total}`);
    const totalGain = profile.reduce((a, b) => a + b.gain, 0);
    assert.ok(totalGain > 15, `gain=${totalGain}`);
  });

  it("séance vide : aucun tronçon", () => {
    assert.deepEqual(elevationProfile([]), []);
  });
});

describe("gradeFactor / paceForGrade", () => {
  it("plat : facteur 1", () => {
    assert.equal(gradeFactor(0), 1);
    assert.equal(paceForGrade(300, 0), 300);
  });

  it("montée : ralentit", () => {
    assert.ok(gradeFactor(5) > 1.15, `f(5)=${gradeFactor(5)}`);
    assert.ok(paceForGrade(300, 10) > 390, `10% → ${paceForGrade(300, 10)}`);
  });

  it("descente : accélère, borné", () => {
    assert.ok(gradeFactor(-5) < 1);
    assert.ok(gradeFactor(-20) >= 0.72, `borné à ${gradeFactor(-20)}`);
  });
});

describe("elevationPacingPlan", () => {
  it("la somme des tronçons vaut le chrono visé", () => {
    const profile = [
      { km: 0, lengthKm: 1, gain: 40, loss: 0, grade: 4 },
      { km: 1, lengthKm: 1, gain: 0, loss: 0, grade: 0 },
      { km: 2, lengthKm: 1, gain: 0, loss: 30, grade: -3 },
    ];
    const plan = elevationPacingPlan(profile, 3600, 300);
    const total = plan.reduce((a, s) => a + s.seconds, 0);
    assert.ok(Math.abs(total - 3600) <= 3, `total=${total}`);
    // la côte coûte plus cher que le plat, la descente moins
    assert.ok(plan[0].pace > plan[1].pace);
    assert.ok(plan[2].pace < plan[1].pace);
    // cumulés croissants
    assert.ok(plan[0].cumulative < plan[1].cumulative);
    assert.ok(plan[1].cumulative < plan[2].cumulative);
    assert.equal(plan[2].cumulative, 3600);
  });

  it("entrées invalides : plan vide", () => {
    assert.deepEqual(elevationPacingPlan([], 3600, 300), []);
    assert.deepEqual(
      elevationPacingPlan([{ km: 0, lengthKm: 1, gain: 0, loss: 0, grade: 0 }], 0, 300),
      []
    );
  });
});

describe("fuelingStops", () => {
  it("un ravitaillement tous les 5 km, sans départ ni arrivée", () => {
    const stops = fuelingStops(42.2, 5);
    assert.deepEqual(
      stops.map((s) => s.km),
      [5, 10, 15, 20, 25, 30, 35, 40]
    );
  });

  it("borné en nombre", () => {
    assert.equal(fuelingStops(100, 1, 15).length, 15);
  });

  it("aucun arrêt sur courte distance", () => {
    assert.deepEqual(fuelingStops(4, 5), []);
    assert.deepEqual(fuelingStops(10, 0), []);
  });
});
