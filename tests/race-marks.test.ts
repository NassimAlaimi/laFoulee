import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  activityMarks,
  dayMonthLabel,
  type ChartMark,
} from "../src/lib/race-marks.ts";

function d(daysAgo: number): Date {
  return new Date(Date.now() - daysAgo * 86_400_000);
}

describe("dayMonthLabel", () => {
  it("formate « 14 sept. »", () => {
    assert.equal(dayMonthLabel(new Date(2026, 8, 14)), "14 sept.");
  });
});

describe("activityMarks", () => {
  it("marque les courses dans la fenêtre, pas le futur ni le trop ancien", () => {
    const marks = activityMarks({
      races: [
        { startDate: d(10), isRace: true },
        { startDate: d(200), isRace: true }, // hors fenêtre
        { startDate: d(-3), isRace: true }, // futur
        { startDate: d(5), isRace: false },
      ],
      records: [],
      windowDays: 180,
    });
    assert.deepEqual(
      marks.map((m) => m.kind),
      ["race"]
    );
    assert.equal(marks.length, 1);
  });

  it("une course prime sur un record le même jour", () => {
    const day = d(10);
    const marks = activityMarks({
      races: [{ startDate: day, isRace: true }],
      records: [{ date: day }],
      windowDays: 180,
    });
    assert.equal(marks.length, 1);
    assert.equal(marks[0].kind, "race");
  });

  it("marque les records seuls en « pr », triés par date", () => {
    const marks = activityMarks({
      races: [],
      records: [{ date: d(20) }, { date: d(5) }, { date: null }],
      windowDays: 180,
    });
    assert.equal(marks.length, 2);
    assert.equal(marks[0].kind, "pr");
    // tri chronologique : le plus ancien d'abord
    assert.ok(marks[0].date < marks[1].date);
  });
});
