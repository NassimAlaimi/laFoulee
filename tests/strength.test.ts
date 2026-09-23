import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EXERCISES,
  TEMPLATES,
  best1RM,
  estimate1RM,
  exerciseHistories,
  exerciseInfo,
  isHardSet,
  nextSuggestion,
  setsByMuscle,
  tonnage,
  workoutPRs,
  type SetLike,
} from "../src/lib/strength.ts";

const set = (exercise: string, reps: number, weightKg: number, rir: number | null = null, isWarmup = false): SetLike => ({
  exercise,
  reps,
  weightKg,
  rir,
  isWarmup,
});
const day = (n: number) => new Date(2026, 0, n);

describe("estimate1RM", () => {
  it("1 répétition = la charge elle-même", () => {
    assert.equal(estimate1RM(100, 1), 100);
  });
  it("encadré par Epley et Brzycki", () => {
    const e = estimate1RM(100, 5)!;
    const epley = 100 * (1 + 5 / 30);
    const brzycki = (100 * 36) / 32;
    assert.ok(e >= Math.min(epley, brzycki) - 0.1 && e <= Math.max(epley, brzycki) + 0.1, `${e}`);
  });
  it("les répétitions en réserve comptent : 8 reps à RIR 2 = un 10RM", () => {
    assert.equal(estimate1RM(60, 8, 2), estimate1RM(60, 10));
    assert.ok(estimate1RM(60, 8, 2)! > estimate1RM(60, 8)!);
  });
  it("refuse au-delà de 12 et sans charge", () => {
    assert.equal(estimate1RM(40, 15), null);
    assert.equal(estimate1RM(40, 10, 3), null);
    assert.equal(estimate1RM(0, 5), null);
  });
});

describe("volume", () => {
  it("tonnage : séries de travail seulement, jamais les exercices tenus", () => {
    const sets = [set("back-squat", 5, 40, null, true), set("back-squat", 5, 60), set("back-squat", 5, 60), set("plank", 60, 10)];
    assert.equal(tonnage(sets), 600);
  });
  it("série dure : RIR ≤ 4 ou non renseigné, jamais un échauffement", () => {
    assert.ok(isHardSet(set("rdl", 8, 40, 2)));
    assert.ok(isHardSet(set("rdl", 8, 40)));
    assert.ok(!isHardSet(set("rdl", 8, 40, 5)));
    assert.ok(!isHardSet(set("rdl", 8, 40, 1, true)));
  });
  it("muscles : primaire = 1, secondaire = ½", () => {
    const m = setsByMuscle([set("back-squat", 5, 60), set("back-squat", 5, 60)]);
    assert.equal(m.quads, 2);
    assert.equal(m.glutes, 2);
    assert.equal(m.core, 1);
    assert.equal(m.chest, 0);
  });
});

describe("historique et records", () => {
  const w1 = { id: "a", date: day(1), sets: [set("back-squat", 5, 60), set("back-squat", 5, 60), set("plank", 45, 0)] };
  const w2 = { id: "b", date: day(8), sets: [set("back-squat", 5, 65), set("plank", 60, 0), set("rdl", 8, 50)] };
  const w3 = { id: "c", date: day(15), sets: [set("back-squat", 5, 62.5)] };

  it("exerciseHistories : chronologique, meilleur 1RM retenu", () => {
    const h = exerciseHistories([w3, w1, w2]);
    const squat = h.find((x) => x.exercise === "back-squat")!;
    assert.deepEqual(squat.sessions.map((s) => s.workoutId), ["a", "b", "c"]);
    assert.equal(squat.bestE1rm, best1RM(w2.sets.filter((s) => s.exercise === "back-squat")));
    assert.equal(squat.bestWeight, 65);
  });

  it("workoutPRs : 1RM battu, durée battue ; pas de record au premier passage", () => {
    const prs = workoutPRs(w2, [w1, w2, w3]);
    assert.deepEqual(
      prs.map((p) => [p.exercise, p.kind]),
      [
        ["back-squat", "e1rm"],
        ["plank", "reps"],
      ]
    );
    assert.equal(workoutPRs(w3, [w1, w2, w3]).length, 0);
    assert.equal(workoutPRs(w1, [w1]).length, 0);
  });
});

describe("nextSuggestion", () => {
  it("toutes les séries faites avec marge → +1 pas de charge", () => {
    const s = nextSuggestion([set("back-squat", 6, 60, 2), set("back-squat", 6, 60, 3), set("back-squat", 6, 60, 2)])!;
    assert.equal(s.weightKg, 65);
    assert.equal(s.reps, 6);
    assert.equal(s.sets, 3);
  });
  it("une série ratée → même charge, consolider", () => {
    const s = nextSuggestion([set("rdl", 8, 50), set("rdl", 8, 50), set("rdl", 6, 50)])!;
    assert.equal(s.weightKg, 50);
    assert.equal(s.reps, 7);
  });
  it("à l'échec (RIR 0-1) → pas de hausse de charge", () => {
    const s = nextSuggestion([set("bench-press", 8, 60, 1), set("bench-press", 8, 60, 0)])!;
    assert.equal(s.weightKg, 60);
  });
  it("poids du corps : +1 rep ; gainage : +5 s", () => {
    assert.equal(nextSuggestion([set("push-up", 15, 0), set("push-up", 12, 0)])!.reps, 16);
    assert.equal(nextSuggestion([set("plank", 45, 0)])!.reps, 50);
  });
  it("ignore les échauffements", () => {
    assert.equal(nextSuggestion([set("back-squat", 5, 40, null, true)]), null);
  });
});

describe("bibliothèque", () => {
  it("slugs uniques, modèles valides", () => {
    const slugs = EXERCISES.map((e) => e.slug);
    assert.equal(new Set(slugs).size, slugs.length);
    for (const t of TEMPLATES) for (const i of t.items) assert.ok(slugs.includes(i.exercise), i.exercise);
  });
  it("exercice libre : repli sans planter", () => {
    const e = exerciseInfo("Kettlebell swing");
    assert.equal(e.name, "Kettlebell swing");
    assert.deepEqual(e.primary, []);
  });
});
