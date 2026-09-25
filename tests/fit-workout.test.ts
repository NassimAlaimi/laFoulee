import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { flattenForWatch, workoutToFit } from "../src/lib/fit-workout.ts";
import { parseWorkout } from "../src/lib/workout-dsl.ts";
import { decodeFit } from "../src/lib/fit.ts";
import { paceSet } from "../src/lib/workouts.ts";

const steps = (s: string) => {
  const r = parseWorkout(s);
  if (!r.ok) throw new Error(r.error);
  return r.steps;
};

describe("flattenForWatch", () => {
  it("un seul niveau de répétition", () => {
    const f = flattenForWatch(steps("20' EF + 3×(6×400 @VMA r=1'30) R=3' + 10' RC"));
    // échauffement, (répétition + récup inter-séries) ×2, répétition, RC
    assert.deepEqual(f.map((x) => x.type), ["step", "repeat", "step", "repeat", "step", "repeat", "step"]);
    const rep = f[1];
    assert.ok(rep.type === "repeat" && rep.times === 6 && rep.steps.length === 2);
  });
});

describe("workoutToFit", () => {
  it("produit un FIT « workout » lisible", () => {
    const bytes = workoutToFit("Pyramide", steps("15' EF + 5×1km @seuil r=2' + 10' RC"), paceSet(50));
    const fit = decodeFit(bytes);
    assert.equal(fit.fileType, 5);
    assert.ok(new TextDecoder().decode(bytes).includes("Pyramide"));
  });
});
