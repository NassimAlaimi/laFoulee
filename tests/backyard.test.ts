import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { backyardTable, backyardWeeklyHours, BACKYARD_LOOP_KM } from "../src/lib/backyard.ts";

describe("backyardTable", () => {
  it("une boucle sous l'heure, repos = 60 min − boucle", () => {
    const t = backyardTable({ runPace: 360, walkPace: 660, runRatio: 0.8, loops: 4 });
    const mix = 360 * 0.8 + 660 * 0.2; // 288 + 132 = 420 s/km
    const expectLoop = BACKYARD_LOOP_KM * mix;
    assert.ok(Math.abs(t.rows[0].loopSeconds - expectLoop) < 1);
    assert.ok(Math.abs(t.rows[0].restSeconds - (3600 - expectLoop)) < 1);
    assert.equal(t.rows[3].loop, 4);
    assert.equal(t.rows[3].km, Math.round(BACKYARD_LOOP_KM * 4 * 10) / 10);
  });
  it("trop lent : boucle qui dépasse l'heure", () => {
    const t = backyardTable({ runPace: 600, walkPace: 700, runRatio: 1, loops: 1 });
    assert.equal(t.rows[0].tooSlow, true);
    assert.ok(t.rows[0].restSeconds <= 0);
  });
  it("24 boucles = 160,9 km et du sommeil emprunté", () => {
    const t = backyardTable({ runPace: 420, walkPace: 660, runRatio: 0.7, loops: 24 });
    assert.equal(t.totalKm, Math.round(BACKYARD_LOOP_KM * 24 * 10) / 10);
    assert.equal(t.sleepBorrowed, 0);
    const t36 = backyardTable({ runPace: 420, walkPace: 660, runRatio: 0.7, loops: 36 });
    assert.equal(t36.sleepBorrowed, 12);
  });
});

describe("backyardWeeklyHours", () => {
  it("pic en heures ≈ boucles × 0,9", () => {
    const w = backyardWeeklyHours(24);
    assert.ok(w.peak >= 18 && w.peak <= 24);
    assert.ok(w.longRun < w.peak);
  });
});
