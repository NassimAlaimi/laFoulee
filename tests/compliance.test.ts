import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  complianceSeries,
  overallCompliance,
  phaseCompliance,
  zoneFor,
  type PlanSessionLike,
} from "../src/lib/compliance.ts";

const monday = (offsetWeeks: number) => {
  // Lundi 2026-09-21 (semaine de référence)
  const d = new Date(Date.UTC(2026, 8, 21, 10, 0, 0));
  d.setDate(d.getDate() + offsetWeeks * 7);
  return d;
};

function session(
  weekNumber: number,
  status: string,
  kind = "easy",
  distanceKm = 10,
  weekStart = monday(weekNumber - 1)
): PlanSessionLike {
  return { weekNumber, weekStart, phase: "base", distanceKm, status, kind };
}

describe("zoneFor", () => {
  it("classe les seuils de conformité", () => {
    assert.equal(zoneFor(100, 3, false), "good");
    assert.equal(zoneFor(90, 3, false), "good");
    assert.equal(zoneFor(89, 3, false), "fair");
    assert.equal(zoneFor(60, 3, false), "fair");
    assert.equal(zoneFor(59, 3, false), "low");
    assert.equal(zoneFor(0, 3, false), "low");
  });

  it("semaine à venir et semaine vide", () => {
    assert.equal(zoneFor(null, 3, true), "upcoming");
    assert.equal(zoneFor(null, 0, false), "empty");
  });
});

describe("complianceSeries", () => {
  it("semaine pleinement réalisée", () => {
    const rows = complianceSeries(
      [session(1, "done", "easy", 10), session(1, "done", "long", 20), session(1, "done", "intervals", 8)],
      new Map([[1, 38]]),
      monday(1)
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].donePct, 100);
    assert.equal(rows[0].zone, "good");
    assert.equal(rows[0].kmRatio, 1);
    assert.equal(rows[0].sessionsDone, 3);
    assert.equal(rows[0].sessionsSkipped, 0);
  });

  it("semaine partielle : 2/3 séances, km au rendez-vous", () => {
    const rows = complianceSeries(
      [session(1, "done", "easy", 10), session(1, "done", "long", 20), session(1, "skipped", "intervals", 8)],
      new Map([[1, 30]]),
      monday(1)
    );
    assert.equal(rows[0].donePct, 67);
    assert.equal(rows[0].zone, "fair");
    assert.equal(rows[0].kmRatio, 0.79);
  });

  it("semaine décrochée", () => {
    const rows = complianceSeries(
      [session(1, "done", "easy", 10), session(1, "skipped", "long", 20), session(1, "skipped", "intervals", 8)],
      new Map([[1, 12]]),
      monday(1)
    );
    assert.equal(rows[0].donePct, 33);
    assert.equal(rows[0].zone, "low");
  });

  it("semaine à venir : ratios nuls et zone upcoming", () => {
    const rows = complianceSeries(
      [session(2, "planned", "long", 24)],
      new Map(),
      monday(0)
    );
    assert.equal(rows[0].zone, "upcoming");
    assert.equal(rows[0].donePct, null);
    assert.equal(rows[0].kmRatio, null);
  });

  it("muscu, cross et repos ne comptent pas", () => {
    const rows = complianceSeries(
      [
        session(1, "done", "strength", 0),
        session(1, "done", "cross", 12),
        session(1, "planned", "rest", 0),
        session(1, "done", "easy", 10),
      ],
      new Map([[1, 10]]),
      monday(1)
    );
    assert.equal(rows[0].sessionsPlanned, 1);
    assert.equal(rows[0].donePct, 100);
    assert.equal(rows[0].plannedKm, 10);
  });

  it("séance déplacée : pas comptée comme faite, pas comme sautée", () => {
    const rows = complianceSeries(
      [session(1, "done", "easy", 10), session(1, "moved", "intervals", 8)],
      new Map([[1, 12]]),
      monday(1)
    );
    assert.equal(rows[0].sessionsDone, 1);
    assert.equal(rows[0].sessionsSkipped, 0);
    assert.equal(rows[0].donePct, 50);
  });

  it("km réels au-delà du prévu : ratio > 1", () => {
    const rows = complianceSeries(
      [session(1, "done", "easy", 10)],
      new Map([[1, 14.5]]),
      monday(1)
    );
    assert.equal(rows[0].kmRatio, 1.45);
  });

  it("tri par numéro de semaine", () => {
    const rows = complianceSeries(
      [session(3, "planned"), session(1, "done", "easy", 10), session(2, "planned")],
      new Map([[1, 10]]),
      monday(1)
    );
    assert.deepEqual(rows.map((r) => r.weekNumber), [1, 2, 3]);
  });
});

describe("phaseCompliance", () => {
  it("agrège par phase en ignorant les semaines à venir", () => {
    const rows = complianceSeries(
      [
        session(1, "done", "easy", 10),
        session(1, "done", "long", 20),
        session(1, "skipped", "intervals", 8, monday(0)),
        { ...session(2, "done", "easy", 12, monday(1)), phase: "build" },
        { ...session(3, "planned", "long", 24, monday(2)), phase: "build" },
      ],
      new Map([[1, 30], [2, 14]]),
      monday(1)
    );
    const phases = phaseCompliance(rows);
    assert.equal(phases.length, 2); // base + build, la semaine 3 est à venir
    const base = phases.find((p) => p.phase === "base")!;
    assert.equal(base.sessionsPlanned, 3);
    assert.equal(base.sessionsDone, 2);
    assert.equal(base.sessionPct, 67);
    assert.equal(base.plannedKm, 38);
    assert.equal(base.actualKm, 30);
    assert.equal(base.kmPct, 79);
    const build = phases.find((p) => p.phase === "build")!;
    assert.equal(build.sessionsPlanned, 1);
    assert.equal(build.sessionsDone, 1);
    assert.equal(build.sessionPct, 100);
  });

  it("phase sans course : pourcentages nuls", () => {
    const rows = complianceSeries(
      [session(1, "planned", "rest", 0)],
      new Map(),
      monday(1)
    );
    const phases = phaseCompliance(rows);
    assert.equal(phases[0].sessionPct, null);
    assert.equal(phases[0].kmPct, null);
  });
});

describe("overallCompliance", () => {
  it("mélange les semaines passées uniquement", () => {
    const rows = complianceSeries(
      [
        session(1, "done", "easy", 10),
        session(1, "skipped", "long", 20),
        session(2, "done", "easy", 10),
        session(3, "planned", "long", 24),
      ],
      new Map([[1, 20], [2, 10]]),
      monday(1)
    );
    const overall = overallCompliance(rows);
    assert.equal(overall.sessionPct, 67); // 2/3
    assert.equal(overall.kmPct, 75); // 30/40
  });

  it("aucune semaine passée → null", () => {
    const rows = complianceSeries([session(3, "planned", "long", 24)], new Map(), monday(0));
    assert.equal(overallCompliance(rows).sessionPct, null);
  });
});
