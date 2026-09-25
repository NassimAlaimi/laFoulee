import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { POLES, locate } from "../src/lib/poles.ts";

describe("locate", () => {
  it("plus long préfixe", () => {
    assert.equal(locate("/analysis/modeles")?.page.key, "modeles");
    assert.equal(locate("/analysis")?.page.key, "forme");
  });
  it("pages profondes rattachées à leur pôle", () => {
    assert.equal(locate("/goals/abc/race-plan")?.pole.key, "races");
    assert.equal(locate("/strength/new")?.pole.key, "body");
    assert.equal(locate("/activities/42")?.pole.key, "activities");
  });
  it("l'accueil ne capture pas tout", () => {
    assert.equal(locate("/")?.pole.key, "today");
    assert.equal(locate("/login"), null);
  });
  it("chaque page n'appartient qu'à un pôle", () => {
    const all = POLES.flatMap((p) => p.pages.map((x) => x.href));
    assert.equal(new Set(all).size, all.length);
  });
});
