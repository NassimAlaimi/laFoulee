import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { csvCell } from "../src/lib/csv.ts";

describe("cellule CSV", () => {
  it("échappe guillemets, virgules et retours à la ligne", () => {
    assert.equal(csvCell('Sortie "longue", bois'), '"Sortie ""longue"", bois"');
    assert.equal(csvCell(null), "");
  });
  it("neutralise les formules, pas les nombres négatifs", () => {
    assert.equal(csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
    assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
    assert.equal(csvCell("-cmd"), "'-cmd");
    assert.equal(csvCell("-12.5"), "-12.5");
    assert.equal(csvCell(-3), "-3");
  });
});
