import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bboxAround, overpassQuery, MAX_SPAN_KM } from "../src/lib/osm.ts";

describe("osm", () => {
  it("bbox centré et borné", () => {
    const b = bboxAround(48.85, 2.35, 5);
    assert.ok(b.maxLat > 48.85 && b.minLat < 48.85);
    const big = bboxAround(48.85, 2.35, 999);
    assert.ok((big.maxLat - big.minLat) * 111.32 <= MAX_SPAN_KM + 0.5);
  });
  it("requête Overpass avec la bbox", () => {
    const q = overpassQuery({ minLat: 48.8, maxLat: 48.9, minLon: 2.2, maxLon: 2.4 });
    assert.ok(q.includes("(48.80000,2.20000,48.90000,2.40000)"));
    assert.ok(q.includes('"highway"'));
  });
});
