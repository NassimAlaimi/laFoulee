import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LEGAL, fillLegal } from "../src/content/legal.ts";

describe("pages légales", () => {
  it("même structure dans les trois langues", () => {
    for (const page of ["legal", "privacy"] as const) {
      const shape = (l: string) => LEGAL[l][page].sections.map((s) => s.body.length);
      assert.deepEqual(shape("en"), shape("fr"), `${page} en ≠ fr`);
      assert.deepEqual(shape("es"), shape("fr"), `${page} es ≠ fr`);
    }
  });
  it("remplace les variables d'identité", () => {
    const id = { publisher: "N. D.", contact: "a@b.fr", host: "OVH", url: "https://x" };
    assert.equal(fillLegal("{publisher} — {contact} ({host}, {url}) {autre}", id), "N. D. — a@b.fr (OVH, https://x) {autre}");
  });
  it("aucune variable inconnue dans les textes", () => {
    for (const l of Object.keys(LEGAL)) {
      const all = JSON.stringify(LEGAL[l]);
      for (const m of all.match(/\{[a-z]+\}/g) ?? []) {
        assert.ok(["{publisher}", "{contact}", "{host}", "{url}"].includes(m), `${l}: ${m}`);
      }
    }
  });
});
