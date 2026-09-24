import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { helpFor, LEXIQUE, onboardingSteps, PAGE_HELP } from "../src/lib/help.ts";

describe("helpFor", () => {
  it("préfixe le plus long d'abord", () => {
    assert.equal(helpFor("/analysis")?.title, "Forme & charge");
    assert.equal(helpFor("/analysis/modeles")?.title, "Modèles & seuils");
    assert.equal(helpFor("/analysis/seances")?.title, "Séances passées");
  });

  it("couvre les pôles et leurs pages", () => {
    for (const p of ["/", "/activities", "/training", "/workouts", "/goals", "/corps", "/strength", "/gear", "/plus", "/settings", "/records", "/calculator", "/recap", "/log"]) {
      assert.ok(helpFor(p), `aide manquante pour ${p}`);
    }
  });

  it("renvoie null hors de l'app", () => {
    assert.equal(helpFor("/inconnu"), null);
    assert.equal(helpFor("/login"), null);
  });

  it("chaque entrée a un titre et au moins deux phrases", () => {
    for (const e of PAGE_HELP) {
      assert.ok(e.title.length > 2);
      assert.ok(e.lines.length >= 2, e.path);
    }
  });
});

describe("LEXIQUE", () => {
  it("définit les termes clés sans doublons", () => {
    const terms = LEXIQUE.map((l) => l.term);
    assert.equal(new Set(terms).size, terms.length);
    for (const l of LEXIQUE) assert.ok(l.def.length > 20, l.term);
    for (const t of ["CTL", "VDOT", "TSB", "LT2", "Split négatif", "Polarisation"]) {
      assert.ok(terms.includes(t), `terme manquant : ${t}`);
    }
  });
});

describe("onboardingSteps", () => {
  it("liste les quatre étapes et compte les faites", () => {
    const r = onboardingSteps({ stravaConnected: true, hasRuns: false, hasGoal: false, logDays: 0 });
    assert.equal(r!.total, 4);
    assert.equal(r!.done, 1);
    assert.equal(r!.steps[0].done, true);
    assert.equal(r!.steps[1].done, false);
  });

  it("disparaît quand tout est fait", () => {
    assert.equal(onboardingSteps({ stravaConnected: true, hasRuns: true, hasGoal: true, logDays: 3 }), null);
  });

  it("le carnet exige trois jours", () => {
    const r = onboardingSteps({ stravaConnected: true, hasRuns: true, hasGoal: true, logDays: 2 });
    assert.equal(r!.steps[3].done, false);
  });
});
