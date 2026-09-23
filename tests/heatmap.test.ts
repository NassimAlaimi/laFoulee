import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { yearHeatmap } from "../src/lib/heatmap.ts";

function run(iso: string, km: number) {
  return { startDate: new Date(iso), distance: km * 1000 };
}

describe("yearHeatmap", () => {
  it("couvre l'année en semaines entières, de la semaine du 1er janv. à celle du 31 déc.", () => {
    const grid = yearHeatmap([run("2026-03-10T08:00:00", 5)], 2026);
    // 2026 : 1er janvier = jeudi, 31 décembre = jeudi → 53 semaines de lundi
    assert.ok(grid.weeks.length >= 52 && grid.weeks.length <= 53);
    // chaque semaine a 7 jours
    assert.ok(grid.weeks.every((w) => w.days.length === 7));
    // la première semaine contient le 1er janvier, la dernière le 31 décembre
    const firstDays = grid.weeks[0].days.map((d) => d.date.getTime());
    const lastDays = grid.weeks[grid.weeks.length - 1].days.map((d) => d.date.getTime());
    assert.ok(firstDays.includes(new Date("2026-01-01T00:00:00").getTime()));
    assert.ok(lastDays.includes(new Date("2026-12-31T00:00:00").getTime()));
  });

  it("cumule le volume du jour et calcule le max quotidien", () => {
    const grid = yearHeatmap(
      [run("2026-06-15T08:00:00", 6), run("2026-06-15T18:00:00", 4), run("2026-06-16T08:00:00", 3)],
      2026
    );
    // trouve le jour du 15 juin et vérifie 10 km
    let june15 = 0;
    for (const w of grid.weeks) {
      for (const d of w.days) {
        if (d.date.getTime() === new Date("2026-06-15T00:00:00").getTime()) june15 = d.km;
      }
    }
    assert.equal(june15, 10);
    assert.equal(grid.max, 10);
  });

  it("calcule la meilleure série de semaines actives", () => {
    // semaines actives : on court chaque lundi des 3 premières semaines de juin
    const runs = ["2026-06-01", "2026-06-08", "2026-06-15"].map((d) => run(`${d}T08:00:00`, 5));
    const grid = yearHeatmap(runs, 2026);
    assert.ok(grid.bestStreak >= 3);
    assert.ok(grid.activeRate > 0);
  });
});
