import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildGraph, findLoops, nearestNode, shortestPath, straightSegments, serializeGraph, deserializeGraph } from "../src/lib/route-graph.ts";
import { encodePolyline, decodePolyline } from "../src/lib/polyline.ts";

// Grille 5×5 d'intersections espacées de 100 m, autour de (48.0, 2.0).
const SP = 100;
function pt(r: number, c: number): [number, number] {
  return [48.0 + (r * SP) / 111_320, 2.0 + (c * SP) / (111_320 * Math.cos((48 * Math.PI) / 180))];
}
function grid(): Array<{ polyline: string; startDate: Date }> {
  const acts: Array<{ polyline: string; startDate: Date }> = [];
  const d = (n: number) => new Date(2026, 0, n);
  // Horizontales (rues très courues)
  for (let r = 0; r < 5; r++) {
    const cells = Array.from({ length: 5 }, (_, c) => [r, c] as [number, number]);
    const line = encodePolyline(cells.map(([rr, cc]) => pt(rr, cc)));
    for (let k = 0; k < r + 1; k++) acts.push({ polyline: line, startDate: d(r + 1) });
  }
  // Verticales (rares)
  for (let c = 0; c < 5; c++) {
    const cells = Array.from({ length: 5 }, (_, r) => [r, c] as [number, number]);
    acts.push({ polyline: encodePolyline(cells.map(([rr, cc]) => pt(rr, cc))), startDate: d(28) });
  }
  return acts;
}

describe("buildGraph", () => {
  const g = buildGraph(grid());
  it("construit nœuds et arêtes, compte les passages", () => {
    assert.ok(g.nodes.size >= 25);
    assert.ok(g.edges.length >= 40, `edges=${g.edges.length}`);
    const busy = g.edges.filter((e) => e.passes >= 2);
    assert.ok(busy.length >= 15, `busy=${busy.length}`);
    assert.ok(g.edges.some((e) => e.passes === 1), "rues rares présentes");
  });
  it("sérialise et restaure", () => {
    const s = serializeGraph(g);
    const g2 = deserializeGraph(s)!;
    assert.equal(g2.nodes.size, g.nodes.size);
    assert.equal(g2.edges.length, g.edges.length);
  });
});

describe("findLoops", () => {
  const g = buildGraph(grid());
  it("trouve une boucle fermée dans la tolérance", () => {
    const loops = findLoops(g, [48.0, 2.0], { targetMeters: 800, explore: 0.5, attempts: 200, seed: 7 });
    assert.ok(loops.length >= 1, `loops=${loops.length}`);
    const l = loops[0];
    assert.ok(l.meters >= 720 && l.meters <= 880, `m=${l.meters}`);
    const a = l.points[0];
    const b = l.points[l.points.length - 1];
    assert.ok(Math.abs(a[0] - b[0]) < 1e-3 && Math.abs(a[1] - b[1]) < 1e-3, "boucle fermée");
    assert.ok(l.score > 0);
  });
});

describe("shortestPath & nearestNode", () => {
  const g = buildGraph(grid());
  it("relie deux points par le réseau", () => {
    const a = pt(0, 0);
    const b = pt(4, 4);
    const p = shortestPath(g, [48.0, 2.0], a, b)!;
    assert.ok(p, "chemin trouvé");
    assert.ok(p.meters > 700 && p.meters < 1000, `m=${p.meters}`);
  });
  it("nearestNode trouve le nœud proche", () => {
    assert.ok(nearestNode(g, [48.0, 2.0], pt(2, 2), 30));
  });
});

describe("straightSegments", () => {
  const g = buildGraph(grid());
  it("trouve des lignes droites ≥ 400 m", () => {
    const segs = straightSegments(g, 400);
    assert.ok(segs.length >= 1);
    assert.ok(segs[0].meters >= 400);
    assert.ok(decodePolyline(encodePolyline(segs[0].points)).length >= 2);
  });
});
