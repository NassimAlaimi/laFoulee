import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { seasonPlan, taperWeeks, recoveryWeeks } from "../src/lib/season.ts";

const A = (name: string, date: Date, km: number): { id: string; name: string; date: Date; distanceKm: number; priority: "A" } => ({ id: name, name, date, distanceKm: km, priority: "A" });

describe("taper/recovery", () => {
  it("proportionnel à la distance", () => {
    assert.equal(taperWeeks(10), 2);
    assert.equal(taperWeeks(21), 2);
    assert.equal(taperWeeks(42), 3);
    assert.equal(recoveryWeeks(10), 1);
    assert.equal(recoveryWeeks(42), 3);
  });
});

describe("seasonPlan", () => {
  it("deux courses A à 12 semaines : deux blocs complets", () => {
    const d1 = new Date(2026, 3, 12); // mi-avril
    const d2 = new Date(2026, 6, 5); // ~12 semaines plus tard
    const s = seasonPlan({ races: [A("10k", d1, 10), A("10k2", d2, 10)], startWeeklyKm: 40 });
    const phases = s.weeks.map((w) => w.phase);
    assert.ok(phases.includes("taper") && phases.includes("peak") && phases.includes("base"));
    assert.ok(phases.includes("recovery"));
    // la semaine de chaque course est marquée race
    const raceWeeks = s.weeks.filter((w) => w.phase === "race");
    assert.equal(raceWeeks.length, 2);
    assert.equal(s.blocks.length, 2);
    assert.equal(s.conflicts.length, 0);
  });

  it("A + B + C : pas de bloc pour B et C, mais un bloc pour A", () => {
    const a = A("A", new Date(2026, 3, 12), 21);
    const b = { id: "B", name: "B", date: new Date(2026, 4, 10), distanceKm: 10, priority: "B" as const };
    const c = { id: "C", name: "C", date: new Date(2026, 5, 1), distanceKm: 5, priority: "C" as const };
    const s = seasonPlan({ races: [a, b, c], startWeeklyKm: 40 });
    assert.equal(s.blocks.length, 1);
    // les semaines de B et C sont notées
    const notes = s.weeks.filter((w) => w.note).map((w) => w.note!);
    assert.ok(notes.some((n) => n.includes("B")));
    assert.ok(notes.some((n) => n.includes("C")));
  });

  it("deux A trop proches : conflit signalé", () => {
    const s = seasonPlan({ races: [A("m1", new Date(2026, 3, 12), 42), A("m2", new Date(2026, 4, 3), 42)], startWeeklyKm: 40 });
    assert.equal(s.conflicts.length, 1);
    assert.equal(s.blocks.length, 1);
  });

  it("volume indicatif : pic > base > affûtage", () => {
    const s = seasonPlan({ races: [A("m", new Date(2026, 4, 24), 42)], startWeeklyKm: 40 });
    const by = (p: string) => Math.max(...s.weeks.filter((w) => w.phase === p).map((w) => w.targetKm));
    assert.ok(by("peak") > by("build"), `peak=${by("peak")} build=${by("build")}`);
    assert.ok(by("base") < by("build"));
    assert.ok(by("taper") < by("peak"));
  });
});
