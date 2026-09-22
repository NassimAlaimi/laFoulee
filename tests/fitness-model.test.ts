import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ATL_DAYS,
  CTL_DAYS,
  formOn,
  formSeries,
  formSummary,
  formZone,
  peakForm,
  plannedLoad,
} from "../src/lib/fitness-model.ts";
import {
  classifyIntensity,
  consistencyGrid,
  polarizationSummary,
  recordTimeline,
  yearCompare,
} from "../src/lib/analysis.ts";
import type { ActivityLike } from "../src/lib/stats.ts";

const NOW = new Date("2025-06-15T12:00:00");

function run(daysAgo: number, km = 10, opts: Partial<ActivityLike> = {}): ActivityLike {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(10, 0, 0, 0);
  return {
    id: `${daysAgo}-${km}-${Math.random()}`,
    name: "Sortie",
    type: "Run",
    startDate: d,
    distance: km * 1000,
    movingTime: km * 300,
    elapsedTime: km * 300,
    totalElevation: 0,
    averageSpeed: 1000 / 300,
    maxSpeed: null,
    averageHr: null,
    maxHr: null,
    sufferScore: null,
    averageCadence: null,
    isRace: false,
    ...opts,
  };
}

/** Charge régulière : 4 sorties de 10 km par semaine sur `weeks` semaines. */
function steady(weeks: number): ActivityLike[] {
  const out: ActivityLike[] = [];
  for (let d = 0; d < weeks * 7; d++) {
    if (d % 7 === 0 || d % 7 === 2 || d % 7 === 4 || d % 7 === 6) out.push(run(d));
  }
  return out;
}

// ---------------------------------------------------------------- Zones

describe("formZone", () => {
  it("classe la fraîcheur relativement à la condition", () => {
    assert.equal(formZone(30, 60), "fresh"); // +50 % de la CTL : très frais
    assert.equal(formZone(9, 60), "optimal"); // +15 % : fenêtre de performance
    assert.equal(formZone(2, 60), "neutral"); // +3 % : ni frais ni chargé
    assert.equal(formZone(-12, 60), "productive");
    assert.equal(formZone(-25, 60), "overreaching");
  });

  it("ne dépend pas du niveau absolu", () => {
    // Même ratio TSB/CTL → même zone, que la CTL soit de 30 ou de 90.
    assert.equal(formZone(-6, 30), formZone(-18, 90));
  });
});

// ---------------------------------------------------------------- Séries

describe("formSeries", () => {
  it("converge vers la charge quotidienne moyenne", () => {
    // 40 km/semaine ≈ 400 points/semaine ≈ 57 points/jour
    const series = formSeries({ activities: steady(20), days: 30, now: NOW });
    const last = series[series.length - 1];
    assert.ok(
      Math.abs(last.ctl - 57) < 8,
      `CTL ${last.ctl} attendue autour de 57`
    );
    // À charge stable, fatigue et condition se rejoignent.
    assert.ok(Math.abs(last.tsb) < 8, `TSB ${last.tsb} devrait être proche de 0`);
  });

  it("la fatigue réagit plus vite que la condition", () => {
    assert.ok(ATL_DAYS < CTL_DAYS);
    const base = steady(12);
    // Grosse semaine ajoutée juste avant aujourd'hui
    const spike = [...base, run(1, 25), run(2, 25), run(3, 25)];
    const a = formSummary(formSeries({ activities: base, days: 30, now: NOW }), NOW)!;
    const b = formSummary(formSeries({ activities: spike, days: 30, now: NOW }), NOW)!;
    assert.ok(b.atl - a.atl > b.ctl - a.ctl, "l'ATL doit bouger davantage");
    assert.ok(b.tsb < a.tsb, "la fraîcheur doit baisser");
  });

  it("perd de la condition à l'arrêt", () => {
    const stopped = steady(20).filter((a) => a.startDate < new Date("2025-05-01"));
    const series = formSeries({ activities: stopped, days: 60, now: NOW });
    const mid = series[0].ctl;
    const last = series[series.length - 1].ctl;
    assert.ok(last < mid * 0.6, `CTL ${last} vs ${mid} — la condition doit chuter`);
    assert.ok(series[series.length - 1].tsb > 0, "arrêt total → fraîcheur positive");
  });

  it("projette les séances planifiées et les marque comme telles", () => {
    const future = [1, 3, 5, 7, 9].map((d) => {
      const date = new Date(NOW);
      date.setDate(date.getDate() + d);
      return { date, load: 120 };
    });
    const series = formSeries({ activities: steady(12), days: 30, now: NOW, future });
    const projected = series.filter((p) => p.projected);
    assert.equal(projected.length, 9);
    assert.ok(projected.every((p) => p.date > NOW));
    assert.ok(series.filter((p) => !p.projected).every((p) => p.date <= NOW));
  });

  it("retrouve un point à une date donnée", () => {
    const series = formSeries({ activities: steady(10), days: 20, now: NOW });
    const target = new Date(NOW);
    target.setDate(target.getDate() - 5);
    const p = formOn(series, target);
    assert.ok(p);
    assert.equal(p.date.getDate(), target.getDate());
  });
});

describe("peakForm", () => {
  it("identifie la fenêtre la plus fraîche d'un affûtage", () => {
    const base = steady(14);
    // Affûtage : charge décroissante sur 14 jours
    const future = Array.from({ length: 14 }, (_, i) => {
      const date = new Date(NOW);
      date.setDate(date.getDate() + i + 1);
      return { date, load: Math.max(0, 90 - i * 7) };
    });
    const series = formSeries({ activities: base, days: 30, now: NOW, future });
    const from = new Date(NOW);
    from.setDate(from.getDate() + 1);
    const to = new Date(NOW);
    to.setDate(to.getDate() + 14);
    const peak = peakForm(series, from, to)!;
    assert.ok(peak.tsb > series.find((p) => !p.projected)!.tsb);
    // Le pic tombe en fin d'affûtage, pas au début
    assert.ok(peak.date > new Date(NOW.getTime() + 6 * 86400000));
  });
});

describe("plannedLoad", () => {
  it("croît avec la distance et l'intensité", () => {
    const easy = plannedLoad({ distanceKm: 10, durationMin: 60, intensity: 2, kind: "easy" });
    const long = plannedLoad({ distanceKm: 20, durationMin: 120, intensity: 2, kind: "long" });
    const hard = plannedLoad({ distanceKm: 10, durationMin: 55, intensity: 4, kind: "threshold" });
    assert.ok(long > easy);
    assert.ok(hard > easy);
  });

  it("valorise le renfo sans kilomètres", () => {
    const s = plannedLoad({ distanceKm: 0, durationMin: 40, intensity: 2, kind: "strength" });
    assert.ok(s > 0);
  });

  it("donne une charge nulle au repos", () => {
    assert.equal(plannedLoad({ distanceKm: 0, durationMin: 0, intensity: 0, kind: "rest" }), 0);
  });
});

// ---------------------------------------------------------------- Analyses

describe("classifyIntensity", () => {
  const paces = { easy: 330, marathon: 300, threshold: 285 };

  it("sépare facile, zone grise et intense", () => {
    assert.equal(classifyIntensity(340, paces), "easy");
    assert.equal(classifyIntensity(295, paces), "moderate");
    assert.equal(classifyIntensity(270, paces), "hard");
  });
});

describe("polarizationSummary", () => {
  it("détecte un entraînement majoritairement facile", () => {
    // VDOT 50 → allure marathon ≈ 4'30/km ; on court à 6'00/km
    const runs = Array.from({ length: 20 }, (_, i) =>
      run(i * 3, 10, { averageSpeed: 1000 / 360 })
    );
    const s = polarizationSummary(runs, 50, { now: NOW })!;
    assert.ok(s.easy > 90);
    assert.ok(["Équilibré", "Polarisé"].includes(s.verdict) || s.verdict.includes("intensité"));
  });

  it("alerte quand la zone grise domine", () => {
    const runs = Array.from({ length: 20 }, (_, i) =>
      run(i * 3, 10, { averageSpeed: 1000 / 265 })
    );
    const s = polarizationSummary(runs, 50, { now: NOW })!;
    assert.ok(s.moderate + s.hard > 60);
  });
});

describe("yearCompare", () => {
  it("cumule les kilomètres année par année", () => {
    const runs = [
      run(10, 10),
      run(20, 10),
      run(400, 10), // année précédente
    ];
    const { rows, years, totals } = yearCompare(runs, { years: 2, now: NOW });
    assert.equal(years.length, 2);
    assert.equal(rows.length, 52);
    const current = totals.find((t) => t.year === "2025")!;
    assert.equal(current.km, 20);
    assert.equal(current.runs, 2);
  });

  it("n'extrapole pas l'année en cours au-delà de la semaine courante", () => {
    const { rows } = yearCompare([run(10, 10)], { years: 1, now: NOW });
    const last = rows[rows.length - 1];
    assert.equal(last["2025"], undefined);
  });
});

describe("consistencyGrid", () => {
  it("compte les semaines actives et les séries", () => {
    const runs = steady(8);
    const grid = consistencyGrid(runs, { weeks: 10, now: NOW });
    assert.equal(grid.weeks.length, 10);
    assert.ok(grid.activeRate >= 80);
    assert.ok(grid.currentStreak >= 7);
    assert.ok(grid.bestStreak >= grid.currentStreak);
  });

  it("casse la série sur une semaine blanche", () => {
    const runs = steady(8).filter(
      (a) => !(a.startDate > new Date("2025-05-19") && a.startDate < new Date("2025-05-26"))
    );
    const grid = consistencyGrid(runs, { weeks: 10, now: NOW });
    assert.ok(grid.currentStreak < 8);
  });
});

describe("recordTimeline", () => {
  it("ne garde que les améliorations", () => {
    const efforts = [
      { name: "5K", distance: 5000, movingTime: 1500, startDate: new Date("2025-01-01") },
      { name: "5K", distance: 5000, movingTime: 1450, startDate: new Date("2025-02-01") },
      { name: "5K", distance: 5000, movingTime: 1480, startDate: new Date("2025-03-01") },
      { name: "5K", distance: 5000, movingTime: 1400, startDate: new Date("2025-04-01") },
    ];
    const t = recordTimeline(efforts);
    assert.equal(t.length, 2); // le 1er record n'est pas une amélioration
    assert.equal(t[0].seconds, 1400);
    assert.equal(t[0].improvementSeconds, 50);
  });
});
