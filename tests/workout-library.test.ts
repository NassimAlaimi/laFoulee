import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterLibrary, librarySessions } from "../src/lib/workout-library.ts";
import { paceSet } from "../src/lib/workouts.ts";

describe("librarySessions", () => {
  it("produit 13 séances, chacune avec des étapes de travail", () => {
    const sessions = librarySessions(paceSet(50));
    assert.equal(sessions.length, 13);
    for (const s of sessions) {
      assert.ok(s.why.length > 20, `${s.id} : bénéfice attendu`);
      assert.ok(s.steps.some((st) => st.kind === "work"), `${s.id} : bloc de travail`);
      assert.ok(s.km > 0, `${s.id} : km estimés`);
      assert.ok(s.minutes > 0, `${s.id} : minutes estimées`);
    }
  });

  it("ids uniques", () => {
    const ids = librarySessions(paceSet(50)).map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("les allures s'accélèrent quand le VDOT monte", () => {
    const vdot45 = librarySessions(paceSet(45));
    const vdot55 = librarySessions(paceSet(55));
    const thresholdOf = (list: typeof vdot45) =>
      list.find((s) => s.id === "seuil-2x20")!.steps.find((st) => st.kind === "work")!.pace!;
    const vo2Of = (list: typeof vdot45) =>
      list.find((s) => s.id === "vo2max-1000")!.steps.find((st) => st.kind === "work")!.pace!;
    assert.ok(thresholdOf(vdot55) < thresholdOf(vdot45), "seuil plus rapide à VDOT 55");
    assert.ok(vo2Of(vdot55) < vo2Of(vdot45), "VO2max plus rapide à VDOT 55");
  });

  it("chaque bloc de travail porte une allure", () => {
    const sessions = librarySessions(paceSet(50));
    for (const s of sessions) {
      for (const st of s.steps) {
        if (st.kind === "work" && s.id !== "cotes") {
          assert.ok(st.pace !== undefined && st.pace > 0, `${s.id} : allure du bloc`);
        }
      }
    }
  });

  it("les côtes n'ont pas d'allure (effort par ressenti)", () => {
    const cotes = librarySessions(paceSet(50)).find((s) => s.id === "cotes")!;
    const work = cotes.steps.find((st) => st.kind === "work")!;
    assert.equal(work.pace, undefined);
    assert.equal(work.repeat, 8);
  });

  it("les répétitions gonflent le kilométrage", () => {
    const sessions = librarySessions(paceSet(50));
    const vo2 = sessions.find((s) => s.id === "vo2max-1000")!;
    // 3.5 + 6 + 1.5 = 11 km
    assert.equal(vo2.km, 11);
  });

  it("fonctionne sans VDOT (allures estimées)", () => {
    const sessions = librarySessions(paceSet(0, 360));
    const work = sessions.find((s) => s.id === "seuil-2x20")!.steps.find((st) => st.kind === "work")!;
    assert.ok(work.pace! > 0);
  });
});

describe("filterLibrary", () => {
  it("renvoie tout pour « tous »", () => {
    assert.equal(filterLibrary(librarySessions(paceSet(50)), "tous").length, 13);
  });

  it("filtre par profil en gardant l'universel", () => {
    const marathon = filterLibrary(librarySessions(paceSet(50)), "marathon");
    assert.ok(marathon.every((s) => s.target === "marathon" || s.target === "universel"));
    assert.ok(marathon.some((s) => s.target === "marathon"));
    assert.ok(!marathon.some((s) => s.target === "5k-10k"));
  });
});
