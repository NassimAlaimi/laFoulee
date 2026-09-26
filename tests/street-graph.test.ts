import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildStreetGraph, familiarityFactor, knownPoints, largestComponent } from "../src/lib/street-graph.ts";
import { findLoops, loopOverlap, pickDistinct, shortestPath } from "../src/lib/route-graph.ts";
import { encodePolyline, haversine, type LatLng } from "../src/lib/polyline.ts";
import { formatRoad, type RoadClass } from "../src/lib/osm.ts";

const O: LatLng = [47.2, -1.6];
const M_LAT = 1 / 111_320;
const M_LON = 1 / (111_320 * Math.cos((O[0] * Math.PI) / 180));
const at = (x: number, y: number): LatLng => [O[0] + y * M_LAT, O[1] + x * M_LON];
/** Une voie droite de (x0,y0) à (x1,y1), un point tous les 20 m. */
function road(x0: number, y0: number, x1: number, y1: number, cls: RoadClass = 1): string {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 20));
  const pts: LatLng[] = [];
  for (let i = 0; i <= n; i++) pts.push(at(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n));
  return formatRoad(cls, encodePolyline(pts));
}
/** Quadrillage de rues : `n` × `n` îlots de `block` m, centré sur O. */
function grid(n: number, block: number): string[] {
  const half = (n * block) / 2;
  const out: string[] = [];
  for (let i = 0; i <= n; i++) {
    out.push(road(-half, -half + i * block, half, -half + i * block));
    out.push(road(-half + i * block, -half, -half + i * block, half));
  }
  return out;
}

describe("buildStreetGraph", () => {
  it("les rues qui se croisent sont reliées (graphe routable)", () => {
    const g = buildStreetGraph(grid(4, 200), [], { center: O, radiusM: 5000 });
    const p = shortestPath(g, O, at(-400, -400), at(400, 400));
    assert.ok(p, "un chemin doit exister");
    assert.ok(Math.abs(p!.meters - 1600) < 60, `${p!.meters} m`);
  });
  it("évite un grand axe quand une rue parallèle existe", () => {
    const roads = [road(0, 0, 1000, 0, 0), road(0, 0, 0, 60), road(0, 60, 1000, 60), road(1000, 60, 1000, 0)];
    const g = buildStreetGraph(roads, [], { center: O, radiusM: 5000 });
    const p = shortestPath(g, O, at(0, 0), at(1000, 0))!;
    // Le détour par la rue (1120 m) coûte moins que l'axe (1000 m × 2,2).
    assert.ok(p.meters > 1100, `${p.meters} m : l'itinéraire a pris le grand axe`);
  });
  it("familiarité : le curseur inverse la préférence", () => {
    assert.ok(familiarityFactor(true, 0) < familiarityFactor(false, 0));
    assert.ok(familiarityFactor(true, 1) > familiarityFactor(false, 1));
  });
  it("marque les rues déjà courues", () => {
    const known = [{ lat: at(100, 0)[0], lon: at(100, 0)[1], passes: 7 }];
    const g = buildStreetGraph([road(0, 0, 400, 0)], known, { center: O, radiusM: 5000 });
    assert.ok(g.edges.some((e) => e.passes === 7));
    assert.ok(g.edges.some((e) => e.passes === 0));
  });
  it("ne garde que la plus grande composante", () => {
    const g = buildStreetGraph([...grid(2, 200), road(3000, 3000, 3200, 3000)], [], { center: O, radiusM: 10000 });
    assert.ok([...g.nodes.values()].every((n) => haversine([n.lat, n.lon], O) < 1000));
    assert.equal(largestComponent(g).nodes.size, g.nodes.size);
  });
});

describe("boucles sur les vraies rues", () => {
  const g = buildStreetGraph(grid(12, 150), [], { center: O, radiusM: 5000 });
  const loops = findLoops(g, O, { targetMeters: 3000, start: { x: 0, y: 0 }, samples: 90 });
  it("propose plusieurs boucles de la bonne distance", () => {
    assert.ok(loops.length >= 2, `${loops.length} boucle(s)`);
    for (const l of loops) assert.ok(Math.abs(l.meters - 3000) <= 300, `${l.meters} m`);
  });
  it("jamais deux fois la même boucle", () => {
    const cells = loops.map((l) => new Set(l.points.map((p) => `${Math.round((p[0] - O[0]) / M_LAT / 60)}:${Math.round((p[1] - O[1]) / M_LON / 60)}`)));
    for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) assert.ok(loopOverlap(cells[i], cells[j]) < 0.7, `boucles ${i} et ${j}`);
  });
  it("le retour ne longe pas l'aller", () => {
    for (const l of loops) assert.ok(l.reuse < 0.2, `reuse ${l.reuse}`);
  });
});

describe("pickDistinct", () => {
  it("écarte une boucle qui recouvre une meilleure", () => {
    const A = { score: 0.9, cells: new Set(["1", "2", "3", "4"]) };
    const A2 = { score: 0.8, cells: new Set(["1", "2", "3", "5"]) };
    const B = { score: 0.5, cells: new Set(["7", "8", "9"]) };
    assert.deepEqual(pickDistinct([A2, B, A], 3), [A, B]);
  });
});

describe("knownPoints", () => {
  it("un point tous les ~20 m le long des tronçons courus", () => {
    const g = buildStreetGraph([road(0, 0, 400, 0)], [], { center: O, radiusM: 1000 });
    const pts = knownPoints(g);
    assert.ok(pts.length >= g.edges.length);
    assert.ok(pts.length >= 20 && pts.length <= 40, `${pts.length} points pour 400 m`);
  });
});
