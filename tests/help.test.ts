import { test } from "node:test";
import assert from "node:assert/strict";
import { helpFor, LEXIQUE_IDS, onboardingSteps, PAGE_HELP } from "../src/lib/help.ts";
import { readFileSync } from "node:fs";

/** Messages français : source de vérité pour la structure de l'aide. */
const fr = JSON.parse(readFileSync("messages/fr.json", "utf8"));

test("helpFor : préfixe le plus long d'abord", () => {
  assert.equal(helpFor("/analysis")?.key, "analysis");
  assert.equal(helpFor("/analysis/modeles")?.key, "modeles");
  assert.equal(helpFor("/analysis/seances")?.key, "seances");
});

test("helpFor : couvre les pôles et leurs pages", () => {
  for (const p of ["/", "/activities", "/training", "/workouts", "/goals", "/corps", "/strength", "/gear", "/plus", "/settings", "/records", "/calculator", "/recap", "/log"]) {
    assert.ok(helpFor(p), `aide manquante pour ${p}`);
  }
});

test("helpFor : renvoie null hors de l'app", () => {
  assert.equal(helpFor("/inconnu"), null);
  assert.equal(helpFor("/login"), null);
});

test("chaque entrée d'aide a un titre et au moins deux phrases dans les messages", () => {
  for (const e of PAGE_HELP) {
    const entry = fr.help?.[e.key];
    assert.ok(entry, `messages help.${e.key} manquant`);
    assert.ok(entry.title.length > 2, `titre manquant : help.${e.key}`);
    assert.ok(Array.isArray(entry.lines) && entry.lines.length >= 2, `phrases manquantes : help.${e.key}`);
    for (const l of entry.links ?? []) {
      assert.ok(typeof l.href === "string" && typeof l.label === "string", `lien invalide : help.${e.key}`);
    }
  }
});

test("LEXIQUE : identifiants uniques, définitions présentes dans les messages", () => {
  assert.equal(new Set(LEXIQUE_IDS).size, LEXIQUE_IDS.length);
  for (const id of LEXIQUE_IDS) {
    const t = fr.lexique?.terms?.[id];
    assert.ok(t, `terme manquant dans les messages : lexique.terms.${id}`);
    assert.ok(t.term.length > 0 && t.def.length > 20, `définition invalide : ${id}`);
  }
});

test("onboardingSteps : liste les quatre étapes et compte les faites", () => {
  const r = onboardingSteps({ stravaConnected: true, hasRuns: false, hasGoal: false, logDays: 0 });
  assert.equal(r!.total, 4);
  assert.equal(r!.done, 1);
  assert.equal(r!.steps[0].done, true);
  assert.equal(r!.steps[1].done, false);
});

test("onboardingSteps : disparaît quand tout est fait", () => {
  assert.equal(onboardingSteps({ stravaConnected: true, hasRuns: true, hasGoal: true, logDays: 3 }), null);
});

test("onboardingSteps : le carnet exige trois jours", () => {
  const r = onboardingSteps({ stravaConnected: true, hasRuns: true, hasGoal: true, logDays: 2 });
  assert.equal(r!.steps[3].done, false);
});
