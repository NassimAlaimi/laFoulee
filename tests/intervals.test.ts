import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classProgression, coefficientOfVariation, detectIntervals, intervalClass } from "../src/lib/intervals.ts";

/** Split synthétique : distance en m, allure en s/km. */
const split = (distance: number, pace: number) => ({
  distance,
  seconds: (distance / 1000) * pace,
});

describe("detectIntervals", () => {
  it("détecte un 6 × 1 000 sur splits kilométriques", () => {
    const splits = [
      split(1000, 360), // échauffement
      ...Array.from({ length: 6 }, () => [split(1000, 232), split(1000, 330)]).flat(),
      split(1000, 360), // retour au calme
    ];
    const a = detectIntervals(splits);
    assert.equal(a.detected, true);
    assert.equal(a.summary!.count, 6);
    assert.equal(a.summary!.repDistance, 1000);
    assert.ok(a.summary!.avgPace < 240);
    assert.ok(a.summary!.recoveryPace! > 300);
  });

  it("détecte un 8 × 400 sur des tours", () => {
    const splits = [
      split(1000, 360),
      ...Array.from({ length: 8 }, () => [split(400, 210), split(200, 330)]).flat(),
      split(1000, 360),
    ];
    const a = detectIntervals(splits);
    assert.equal(a.detected, true);
    assert.equal(a.summary!.count, 8);
    assert.equal(a.summary!.repDistance, 400);
  });

  it("une séance continue (tempo régulier) n'est pas des intervalles", () => {
    const splits = Array.from({ length: 10 }, () => split(1000, 300));
    const a = detectIntervals(splits);
    assert.equal(a.detected, false);
    assert.equal(a.continuous, true);
  });

  it("deux fractions seulement : pas d'intervalles", () => {
    const splits = [
      split(1000, 360),
      split(1000, 240),
      split(1000, 320),
      split(1000, 240),
      split(1000, 360),
    ];
    assert.equal(detectIntervals(splits).detected, false);
  });

  it("fatigue positive quand les dernières fractions ralentissent", () => {
    const paces = [230, 232, 234, 238, 244, 250];
    const splits = [
      split(1000, 360),
      ...paces.map((p) => [split(1000, p), split(1000, 330)]).flat(),
      split(1000, 360),
    ];
    const a = detectIntervals(splits);
    assert.equal(a.detected, true);
    assert.ok(a.summary!.fatigue > 3, `fatigue attendue positive, reçu ${a.summary!.fatigue}`);
  });

  it("fatigue nulle ou négative sur des fractions régulières", () => {
    const splits = [
      split(1000, 360),
      ...Array.from({ length: 4 }, () => [split(1000, 235), split(1000, 330)]).flat(),
      split(1000, 360),
    ];
    const a = detectIntervals(splits);
    assert.ok(Math.abs(a.summary!.fatigue) < 2);
  });

  it("ignore les splits vides ou absurdes", () => {
    const splits = [
      { distance: 0, seconds: 0 },
      split(1000, 360),
      ...Array.from({ length: 4 }, () => [split(1000, 235), split(1000, 330)]).flat(),
      { distance: 1000, seconds: 0 },
    ];
    const a = detectIntervals(splits);
    assert.equal(a.detected, true);
    assert.equal(a.summary!.count, 4);
  });

  it("pas assez de splits : refus", () => {
    const splits = [split(1000, 300), split(1000, 240), split(1000, 320)];
    const a = detectIntervals(splits);
    assert.equal(a.detected, false);
    assert.equal(a.summary, null);
  });

  it("allures homogènes entre fractions : CV faible", () => {
    const paces = [232, 234, 231, 235, 233, 232];
    const splits = [
      split(1000, 360),
      ...paces.map((p) => [split(1000, p), split(1000, 330)]).flat(),
    ];
    const a = detectIntervals(splits);
    assert.ok(a.summary!.cv < 2);
  });
});

describe("coefficientOfVariation", () => {
  it("calcule le CV", () => {
    assert.equal(coefficientOfVariation([10, 10, 10]), 0);
    assert.ok(coefficientOfVariation([10, 20]) > 30);
    assert.equal(coefficientOfVariation([5]), 0);
  });
});

describe("progression par classe", () => {
  const mk = (id: string, date: Date, repDistance: number, paces: number[]) => ({
    id,
    name: id,
    date,
    analysis: {
      detected: true,
      continuous: false,
      reps: [],
      summary: {
        count: paces.length,
        repDistance,
        avgPace: paces.reduce((a, b) => a + b, 0) / paces.length,
        bestPace: Math.min(...paces),
        worstPace: Math.max(...paces),
        cv: 0,
        fatigue: 0,
        recoveryPace: null,
        totalKm: 10,
      },
    },
  });

  it("classe les distances", () => {
    assert.equal(intervalClass(400), "court");
    assert.equal(intervalClass(500), "court");
    assert.equal(intervalClass(1000), "1000");
    assert.equal(intervalClass(1300), "1000");
    assert.equal(intervalClass(2000), "long");
  });

  it("suit la progression des allures de la classe, plus ancienne → plus récente", () => {
    const sessions = [
      mk("a", new Date("2026-09-01"), 1000, [250]),
      mk("b", new Date("2026-09-10"), 400, [240]),
      mk("c", new Date("2026-09-20"), 1000, [245]),
      mk("d", new Date("2026-09-25"), 1000, [242]),
    ];
    const prog = classProgression(sessions, "1000");
    assert.deepEqual(prog.map((p) => p.pace), [250, 245, 242]);
    assert.equal(prog.length, 3);
  });

  it("limite le nombre de points", () => {
    const sessions = Array.from({ length: 8 }, (_, i) =>
      mk(`s${i}`, new Date(2026, 8, i + 1), 1000, [250 - i])
    );
    assert.equal(classProgression(sessions, "1000", 4).length, 4);
  });
});
