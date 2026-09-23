import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bestWeek,
  distanceComparison,
  elevationComparison,
  longestDayStreak,
  monthlyKm,
  whenYouRun,
  type RecapRun,
} from "../src/lib/recap.ts";

const run = (y: number, m: number, d: number, h: number, km: number): RecapRun => ({
  id: `${y}${m}${d}${h}`,
  name: "",
  startDate: new Date(y, m, d, h),
  distance: km * 1000,
  movingTime: km * 360,
  totalElevation: 0,
});

describe("rétrospective", () => {
  it("comparaisons de distance et de dénivelé", () => {
    assert.equal(distanceComparison(5), null);
    assert.equal(distanceComparison(42), "l'équivalent d'un marathon");
    assert.equal(distanceComparison(400), "l'équivalent de Paris → Lyon");
    assert.match(distanceComparison(800)!, /^1,2 fois Paris → Marseille$/);
    assert.equal(elevationComparison(50), null);
    assert.match(elevationComparison(9000)!, /Everest/);
    assert.match(elevationComparison(1000)!, /tour Eiffel/);
  });

  it("série de jours consécutifs, doublons du même jour ignorés", () => {
    const s = longestDayStreak([
      new Date(2026, 2, 1, 8),
      new Date(2026, 2, 1, 18),
      new Date(2026, 2, 2, 8),
      new Date(2026, 2, 3, 8),
      new Date(2026, 2, 5, 8),
    ]);
    assert.equal(s.days, 3);
    assert.equal(s.end!.getDate(), 3);
    // traverse le passage à l'heure d'été (29 mars 2026)
    assert.equal(longestDayStreak([new Date(2026, 2, 28, 9), new Date(2026, 2, 29, 9), new Date(2026, 2, 30, 9)]).days, 3);
  });

  it("jour et tranche horaire favoris", () => {
    // 21 sept. 2026 = lundi
    const w = whenYouRun([run(2026, 8, 21, 18, 5), run(2026, 8, 28, 19, 5), run(2026, 8, 23, 7, 5)]);
    assert.equal(w.favoriteDay, 0);
    assert.equal(w.slots[w.favoriteSlot!], "17–20 h");
    assert.ok(Math.abs(w.share - 2 / 3) < 1e-9);
  });

  it("meilleure semaine et kilomètres par mois", () => {
    const runs = [run(2026, 8, 21, 8, 10), run(2026, 8, 27, 8, 12), run(2026, 8, 28, 8, 5)];
    const b = bestWeek(runs)!;
    assert.equal(b.km, 22);
    assert.equal(b.start.getDate(), 21);
    assert.equal(monthlyKm(runs, 2026)[8], 27);
  });
});
