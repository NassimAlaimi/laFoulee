import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calendarGrid, levelFor } from "../src/lib/calendar.ts";

const now = new Date(2026, 8, 24, 18); // jeudi 24 sept.
const run = (d: Date, km: number, extra: Partial<{ isRace: boolean; name: string }> = {}) => ({
  id: `a${d.getTime()}`,
  name: extra.name ?? "Sortie",
  startDate: d,
  distance: km * 1000,
  isRace: extra.isRace ?? false,
});

describe("calendarGrid", () => {
  it("une colonne par semaine, la dernière est la semaine courante", () => {
    const g = calendarGrid({ runs: [], weeks: 4, now });
    assert.equal(g.weeks.length, 4);
    assert.equal(g.weeks[3].monday.getDate(), 21);
    assert.equal(g.weeks[3].days[3].today, true);
    assert.equal(g.weeks[3].days[4].future, true);
  });

  it("regroupe par jour local (sortie à 0 h 30)", () => {
    const g = calendarGrid({ runs: [run(new Date(2026, 8, 22, 0, 30), 10), run(new Date(2026, 8, 22, 19), 5)], weeks: 1, now });
    const tue = g.weeks[0].days[1];
    assert.equal(tue.km, 15);
    assert.equal(tue.count, 2);
    assert.equal(g.weeks[0].km, 15);
  });

  it("marque course et sortie longue", () => {
    const runs = [
      run(new Date(2026, 8, 1), 8),
      run(new Date(2026, 8, 3), 8),
      run(new Date(2026, 8, 5), 8),
      run(new Date(2026, 8, 13), 21, { isRace: true }),
    ];
    const g = calendarGrid({ runs, weeks: 4, now });
    const sun = g.weeks.find((w) => w.monday.getDate() === 7)!.days[6];
    assert.equal(sun.isRace, true);
    assert.equal(sun.isLong, true);
    assert.equal(sun.level, 4);
  });

  it("affiche les séances planifiées à venir, pas celles du passé", () => {
    const g = calendarGrid({
      runs: [],
      planned: [
        { date: new Date(2026, 8, 26), kind: "long", title: "Sortie longue", distanceKm: 18 },
        { date: new Date(2026, 8, 22), kind: "easy", title: "Footing", distanceKm: 8 },
      ],
      weeks: 1,
      futureWeeks: 1,
      now,
    });
    assert.equal(g.weeks.length, 2);
    assert.equal(g.weeks[0].days[5].planned?.title, "Sortie longue");
    assert.equal(g.weeks[0].days[1].planned, null);
  });

  it("série : la semaine courante vide ne casse pas la série", () => {
    const runs = [run(new Date(2026, 8, 15), 5), run(new Date(2026, 8, 8), 5), run(new Date(2026, 7, 25), 5)];
    const g = calendarGrid({ runs, weeks: 6, now });
    assert.equal(g.streak, 2);
  });

  it("paliers", () => {
    assert.equal(levelFor(0, 20), 0);
    assert.equal(levelFor(2, 20), 1);
    assert.equal(levelFor(20, 20), 4);
  });
});
