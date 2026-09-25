import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseWorkout, toDsl, expand, summarize, inferKind, toPlanSteps, type WorkoutStep } from "../src/lib/workout-dsl.ts";
import { paceSet } from "../src/lib/workouts.ts";

const paces = paceSet(50);
const ok = (s: string): WorkoutStep[] => {
  const r = parseWorkout(s);
  if (!r.ok) assert.fail(`${s} → ${r.error} @${r.at}`);
  return r.steps;
};

describe("parseWorkout", () => {
  it("séance complète avec séries et récupérations", () => {
    const steps = ok("20' EF + 3×(6×400 @VMA r=1'30) R=3' + 10' RC");
    assert.equal(steps.length, 3);
    assert.deepEqual(steps[0], { type: "step", role: "warmup", duration: { kind: "time", seconds: 1200 }, target: { kind: "rel", ref: "easy" } });
    const set = steps[1];
    assert.equal(set.type, "repeat");
    if (set.type !== "repeat") return;
    assert.equal(set.times, 3);
    const inner = set.steps[0];
    assert.equal(inner.type, "repeat");
    if (inner.type !== "repeat") return;
    assert.equal(inner.times, 6);
    assert.deepEqual(inner.steps[0], { type: "step", role: "work", duration: { kind: "distance", meters: 400 }, target: { kind: "rel", ref: "vma" } });
    assert.deepEqual(inner.steps[1], { type: "step", role: "recovery", duration: { kind: "time", seconds: 90 } });
    // récupération entre séries : dernière étape du corps répété
    assert.deepEqual(set.steps[1], { type: "step", role: "recovery", duration: { kind: "time", seconds: 180 } });
    assert.equal(steps[2].type === "step" && steps[2].role, "cooldown");
  });

  it("virgules, mots et allure explicite", () => {
    const steps = ok("15' échauffement, 3×10' @seuil r=2', 10' RC");
    assert.equal(steps.length, 3);
    const s = ok("2km EF + 5×1km @5:10 r 400m + 2km EF");
    const rep = s[1];
    assert.ok(rep.type === "repeat");
    if (rep.type === "repeat") {
      assert.deepEqual(rep.steps[0], { type: "step", role: "work", duration: { kind: "distance", meters: 1000 }, target: { kind: "pace", seconds: 310 } });
      assert.deepEqual(rep.steps[1], { type: "step", role: "recovery", duration: { kind: "distance", meters: 400 } });
    }
  });

  it("cibles variées", () => {
    const t = (s: string) => {
      const x = ok(s)[0];
      return x.type === "step" ? x.target : null;
    };
    assert.deepEqual(t("45' @Z2"), { kind: "zone", zone: 2 });
    assert.deepEqual(t("30' @150bpm"), { kind: "hr", bpm: 150 });
    assert.deepEqual(t("5' @90%VMA"), { kind: "pctVma", pct: 90 });
    assert.deepEqual(t("20min @RPE7"), { kind: "rpe", rpe: 7 });
    assert.deepEqual(t("1h10 EF"), { kind: "rel", ref: "easy" });
  });

  it("durées et distances", () => {
    const d = (s: string) => {
      const x = ok(s)[0];
      return x.type === "step" ? x.duration : null;
    };
    assert.deepEqual(d("1h10"), { kind: "time", seconds: 4200 });
    assert.deepEqual(d("1'30"), { kind: "time", seconds: 90 });
    assert.deepEqual(d("45\""), { kind: "time", seconds: 45 });
    assert.deepEqual(d("1,5km"), { kind: "distance", meters: 1500 });
    assert.deepEqual(d("400 m"), { kind: "distance", meters: 400 });
  });

  it("erreurs lisibles", () => {
    const r = parseWorkout("3×(400 @VMA");
    assert.equal(r.ok, false);
    const r2 = parseWorkout("20' @blabla");
    assert.equal(r2.ok, false);
    if (!r2.ok) assert.equal(r2.error, "target");
    assert.equal(parseWorkout("").ok, false);
  });
});

describe("toDsl", () => {
  it("réécriture canonique idempotente", () => {
    const a = toDsl(ok("20' EF + 3×(6×400 @VMA r=1'30) R=3' + 10' RC"));
    assert.equal(a, "20' échauffement + 3×(6×400m @VMA r=1'30) R=3' + 10' RC");
    assert.equal(toDsl(ok(a)), a);
  });
});

describe("expand & summarize", () => {
  it("récupération entre séries : 2 pour 3 séries", () => {
    const seg = expand(ok("3×(6×400 @VMA r=1'30) R=3'"), paces);
    assert.equal(seg.filter((s) => s.role === "recovery" && s.seconds === 180).length, 2);
    assert.equal(seg.filter((s) => s.role === "recovery" && s.seconds === 90).length, 15);
  });
  it("ne compte pas la récupération après la dernière répétition", () => {
    const seg = expand(ok("6×400 @VMA r=1'"), paces);
    assert.equal(seg.filter((s) => s.role === "work").length, 6);
    assert.equal(seg.filter((s) => s.role === "recovery").length, 5);
  });
  it("totaux, intensité et type", () => {
    const steps = ok("20' EF + 3×10' @seuil r=2' + 10' RC");
    const sum = summarize(steps, paces);
    assert.equal(Math.round(sum.seconds / 60), 64);
    assert.equal(sum.intensity, 3);
    assert.equal(sum.hardMinutes, 30);
    assert.equal(inferKind(steps, paces), "threshold");
    assert.equal(inferKind(ok("1h30 EF"), paces), "long");
    assert.equal(inferKind(ok("15' EF + 10×400 @VMA r=1' + 10' EF"), paces), "intervals");
  });
  it("étapes de plan", () => {
    const st = toPlanSteps(ok("20' EF + 3×10' @seuil r=2' + 10' RC"), paces);
    assert.deepEqual(st.map((s) => s.kind), ["warmup", "work", "cooldown"]);
    assert.equal(st[1].repeat, 3);
    assert.equal(st[1].durationMin, 10);
  });
});
