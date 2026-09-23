import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  currentDailyStreak,
  goalProgress,
} from "../src/lib/goal-progress.ts";

function run(iso: string, km = 5) {
  return { startDate: new Date(iso), distance: km * 1000 };
}

describe("currentDailyStreak", () => {
  it("compte la série terminée hier si aujourd'hui pas encore couru", () => {
    const now = new Date("2026-09-23T20:00:00");
    const dates = [
      new Date("2026-09-21T08:00:00"),
      new Date("2026-09-22T08:00:00"),
    ];
    assert.equal(currentDailyStreak(dates, now), 2);
  });

  it("compte la série en cours aujourd'hui", () => {
    const now = new Date("2026-09-23T20:00:00");
    const dates = [
      new Date("2026-09-21T08:00:00"),
      new Date("2026-09-22T08:00:00"),
      new Date("2026-09-23T08:00:00"),
    ];
    assert.equal(currentDailyStreak(dates, now), 3);
  });

  it("renvoie 0 si la série est rompue", () => {
    const now = new Date("2026-09-23T20:00:00");
    assert.equal(currentDailyStreak([new Date("2026-09-20T08:00:00")], now), 0);
  });
});

describe("goalProgress", () => {
  it("volume : km du mois en cours", () => {
    const now = new Date("2026-09-15T12:00:00");
    const p = goalProgress({
      kind: "volume",
      targetValue: 200,
      now,
      runs: [
        run("2026-09-01T08:00:00", 50),
        run("2026-09-14T08:00:00", 78),
        run("2026-08-25T08:00:00", 100), // hors mois
      ],
    });
    assert.ok(p);
    assert.equal(p.current, 128);
    assert.equal(p.percent, 64);
    assert.equal(p.unit, "km");
    assert.equal(p.done, false);
  });

  it("streak : jours consécutifs", () => {
    const now = new Date("2026-09-23T20:00:00");
    const p = goalProgress({
      kind: "streak",
      targetValue: 30,
      now,
      runs: [
        run("2026-09-21T08:00:00"),
        run("2026-09-22T08:00:00"),
        run("2026-09-23T08:00:00"),
      ],
    });
    assert.ok(p);
    assert.equal(p.current, 3);
    assert.equal(p.unit, "jours");
  });

  it("frequency : sorties de la semaine", () => {
    // 23 sept. 2026 est un mercredi ; la semaine commence lundi 21.
    const now = new Date("2026-09-23T12:00:00");
    const p = goalProgress({
      kind: "frequency",
      targetValue: 4,
      now,
      runs: [
        run("2026-09-21T08:00:00"),
        run("2026-09-23T08:00:00"),
        run("2026-09-14T08:00:00"), // semaine précédente
      ],
    });
    assert.ok(p);
    assert.equal(p.current, 2);
    assert.equal(p.unit, "sorties/sem");
  });

  it("plafonne à 100 % et marque done", () => {
    const now = new Date("2026-09-23T20:00:00");
    const p = goalProgress({
      kind: "frequency",
      targetValue: 2,
      now,
      runs: [run("2026-09-21T08:00:00"), run("2026-09-22T08:00:00"), run("2026-09-23T08:00:00")],
    });
    assert.ok(p);
    assert.equal(p.percent, 100);
    assert.equal(p.done, true);
  });

  it("renvoie null sans cible", () => {
    assert.equal(goalProgress({ kind: "volume", targetValue: null, now: new Date(), runs: [] }), null);
  });
});
