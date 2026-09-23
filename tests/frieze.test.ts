import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { friezeOf, parseRepeat } from "../src/lib/frieze.ts";

describe("frise de séance", () => {
  it("lit « 6 × 2 min vite / 90 s lent »", () => {
    assert.deepEqual(parseRepeat("6 × 2 min vite / 90 s lent"), { reps: 6, work: 2, rest: 1.5 });
    assert.equal(parseRepeat("2.7 km échauffement"), null);
  });

  it("déplie un fartlek en 6 efforts et 5 récupérations entre échauffement et retour au calme", () => {
    const f = friezeOf(
      [
        { kind: "warmup", label: "2 km échauffement", distanceM: 2000, pace: 420 },
        { kind: "work", label: "6 × 2 min vite / 90 s lent", pace: 300 },
        { kind: "cooldown", label: "2 km retour au calme", distanceM: 2000, pace: 420 },
      ],
      360
    );
    assert.equal(f.filter((x) => x.kind === "work").length, 6);
    assert.equal(f.filter((x) => x.kind === "rest").length, 5);
    assert.equal(f[0].kind, "easy");
    assert.equal(f[0].minutes, 14);
    assert.equal(f[f.length - 1].kind, "easy");
  });

  it("consomme l'étape de récupération qui suit un bloc répété", () => {
    const f = friezeOf([
      { kind: "work", label: "5 × 5 min", repeat: 5, durationMin: 5, pace: 330 },
      { kind: "recovery", label: "récup 1 min", durationMin: 1, pace: null },
    ]);
    assert.equal(f.length, 9);
    assert.equal(f.filter((x) => x.kind === "rest").every((x) => x.minutes === 1), true);
  });

  it("sortie continue : un seul segment", () => {
    const f = friezeOf([{ kind: "block", label: "10 km", distanceM: 10000, pace: 420 }]);
    assert.equal(f.length, 1);
    assert.equal(f[0].kind, "steady");
    assert.equal(f[0].minutes, 70);
  });
});
