import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bboxAround, overpassQuery, MAX_SPAN_KM, bboxKey, parseOsmZones, findOsmZone, putOsmZone, MAX_ZONES, rankWays, bboxSpanKm, MINOR_WAYS_MAX_KM, tileBbox, zoneKey, OSM_FMT, formatRoad, parseRoad, downsample, roadsInCache, gridTiles } from "../src/lib/osm.ts";

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

describe("cache OSM multi-zones", () => {
  const A = { minLat: 47.19, maxLat: 47.23, minLon: -1.75, maxLon: -1.54 };
  const inner = { minLat: 47.2, maxLat: 47.22, minLon: -1.7, maxLon: -1.6 };
  const other = { minLat: 45.5, maxLat: 45.6, minLon: 2.8, maxLon: 2.9 };
  const now = 1_000_000_000;

  it("lit l'ancien format (tableau + colonne bbox)", () => {
    const z = parseOsmZones(JSON.stringify(["abc"]), bboxKey(A), now);
    assert.equal(z.length, 1);
    assert.deepEqual(z[0].roads, ["abc"]);
    assert.equal(z[0].bbox.minLon, -1.75);
  });
  it("contenu illisible ou clé héritée invalide → aucune zone", () => {
    assert.deepEqual(parseOsmZones("{oops", "", now), []);
    assert.deepEqual(parseOsmZones("[]", "multi", now), []);
  });
  it("réutilise une zone qui contient la zone demandée", () => {
    const zones = putOsmZone([], { key: bboxKey(A), bbox: A, builtAt: now, fmt: OSM_FMT, roads: ["a"] });
    assert.deepEqual(findOsmZone(zones, inner, now + 1, 1000)?.roads, ["a"]);
    assert.equal(findOsmZone(zones, other, now + 1, 1000), null);
  });
  it("ignore les zones périmées", () => {
    const zones = putOsmZone([], { key: bboxKey(A), bbox: A, builtAt: now, fmt: OSM_FMT, roads: ["a"] });
    assert.equal(findOsmZone(zones, A, now + 5000, 1000), null);
  });
  it("garde plusieurs zones (l'atelier n'écrase plus la carte des activités)", () => {
    let zones = putOsmZone([], { key: bboxKey(A), bbox: A, builtAt: now, fmt: OSM_FMT, roads: ["a"] });
    zones = putOsmZone(zones, { key: bboxKey(other), bbox: other, builtAt: now + 1, fmt: OSM_FMT, roads: ["o"] });
    assert.deepEqual(findOsmZone(zones, A, now + 2, 1000)?.roads, ["a"]);
    assert.deepEqual(findOsmZone(zones, other, now + 2, 1000)?.roads, ["o"]);
  });
  it("borne le nombre de zones et remplace une zone identique", () => {
    let zones: ReturnType<typeof putOsmZone> = [];
    for (let i = 0; i < MAX_ZONES + 3; i++) {
      const b = { minLat: i, maxLat: i + 0.1, minLon: 0, maxLon: 0.1 };
      zones = putOsmZone(zones, { key: bboxKey(b), bbox: b, builtAt: now + i, fmt: OSM_FMT, roads: [] });
    }
    assert.equal(zones.length, MAX_ZONES);
    assert.equal(zones[0].builtAt, now + MAX_ZONES + 2); // la plus récente d'abord
    const again = putOsmZone(zones, { ...zones[1], builtAt: now + 100 });
    assert.equal(again.length, MAX_ZONES);
  });
});

describe("rankWays", () => {
  it("coupe d'abord les sentiers et escaliers, jamais les rues", () => {
    const ways = [
      { id: 1, tags: { highway: "footway" } },
      { id: 2, tags: { highway: "residential" } },
      { id: 3, tags: { highway: "steps" } },
      { id: 4, tags: { highway: "primary" } },
      { id: 5, tags: { highway: "residential" } },
    ];
    assert.deepEqual(rankWays(ways, 3).map((w) => w.id), [4, 2, 5]);
    assert.equal(rankWays(ways, 10).length, 5);
  });
});

describe("overpassQuery selon la taille de la zone", () => {
  it("petite zone : trottoirs et sentiers inclus", () => {
    const q = overpassQuery(bboxAround(47.2, -1.6, 4));
    assert.ok(q.includes("footway") && q.includes("residential"));
  });
  it("grande zone : rues seulement (poids et lisibilité)", () => {
    const q = overpassQuery({ minLat: 47.1, maxLat: 47.3, minLon: -1.8, maxLon: -1.5 });
    assert.ok(bboxSpanKm({ minLat: 47.1, maxLat: 47.3, minLon: -1.8, maxLon: -1.5 }) > MINOR_WAYS_MAX_KM);
    assert.ok(!q.includes("footway") && q.includes("residential"));
  });
});

describe("tileBbox", () => {
  const frame = { minLat: 47.16, maxLat: 47.26, minLon: -1.78, maxLon: -1.51 }; // ~20 × 11 km
  it("découpe en tuiles d'au plus ~6 km qui couvrent exactement la zone", () => {
    const tiles = tileBbox(frame, 6);
    assert.ok(tiles.length >= 4);
    for (const t of tiles) assert.ok(bboxSpanKm(t) <= 6.01, `tuile de ${bboxSpanKm(t)} km`);
    const area = (b: typeof frame) => (b.maxLat - b.minLat) * (b.maxLon - b.minLon);
    const sum = tiles.reduce((a, t) => a + area(t), 0);
    assert.ok(Math.abs(sum - area(frame)) < 1e-9);
  });
  it("commence par le centre", () => {
    const tiles = tileBbox(frame, 6);
    const c = (b: typeof frame) => [(b.minLat + b.maxLat) / 2, (b.minLon + b.maxLon) / 2];
    const mid = c(frame);
    const d = (b: typeof frame) => Math.hypot(c(b)[0] - mid[0], c(b)[1] - mid[1]);
    assert.ok(d(tiles[0]) <= d(tiles[tiles.length - 1]));
  });
  it("petite zone : une seule tuile", () => {
    assert.equal(tileBbox(bboxAround(47.2, -1.6, 3), 6).length, 1);
  });
});

describe("niveau de détail du cache", () => {
  const A = { minLat: 47.19, maxLat: 47.23, minLon: -1.75, maxLon: -1.54 };
  const now = 1_000_000_000;
  it("une zone « streets » ne sert pas une demande « all » ; l'inverse oui", () => {
    const streets = putOsmZone([], { key: zoneKey(A, "streets"), bbox: A, builtAt: now, fmt: OSM_FMT, roads: ["s"], detail: "streets" });
    assert.equal(findOsmZone(streets, A, now, 1000, "all"), null);
    assert.deepEqual(findOsmZone(streets, A, now, 1000, "streets")?.roads, ["s"]);
    const all = putOsmZone([], { key: zoneKey(A, "all"), bbox: A, builtAt: now, fmt: OSM_FMT, roads: ["a"], detail: "all" });
    assert.deepEqual(findOsmZone(all, A, now, 1000, "streets")?.roads, ["a"]);
  });
});

describe("voies en cache : classe et carrefours", () => {
  it("formatRoad / parseRoad aller-retour, ancien format compris", () => {
    assert.deepEqual(parseRoad(formatRoad(2, "_p~iF~ps|U")), { cls: 2, polyline: "_p~iF~ps|U" });
    assert.deepEqual(parseRoad("_p~iF~ps|U"), { cls: 1, polyline: "_p~iF~ps|U" });
  });
  it("le rééchantillonnage garde les carrefours, même rapprochés", () => {
    // Points tous les ~5 m ; le 3e est un carrefour.
    const pts: Array<[number, number]> = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => [47 + i * 0.000045, -1.5]);
    const keep = pts.map((_, i) => i === 3);
    const out = downsample(pts, keep);
    assert.ok(out.some((p) => p[0] === pts[3][0]));
    assert.ok(out.length < pts.length);
  });
  it("une zone à l'ancien format ne sert plus qu'en secours", () => {
    const A = { minLat: 47.19, maxLat: 47.23, minLon: -1.75, maxLon: -1.54 };
    const old = putOsmZone([], { key: bboxKey(A), bbox: A, builtAt: 1000, roads: ["x"] });
    assert.equal(findOsmZone(old, A, 1000, 5000), null);
    assert.deepEqual(findOsmZone(old, A, 1000, Infinity)?.roads, ["x"]);
  });
  it("roadsInCache réunit les tuiles qui touchent la zone, sans doublon", () => {
    const T1 = { minLat: 47.0, maxLat: 47.1, minLon: -1.6, maxLon: -1.5 };
    const T2 = { minLat: 47.0, maxLat: 47.1, minLon: -1.5, maxLon: -1.4 };
    const far = { minLat: 48, maxLat: 48.1, minLon: -1.6, maxLon: -1.5 };
    let z = putOsmZone([], { key: "1", bbox: T1, builtAt: 1, fmt: OSM_FMT, roads: ["1:a", "1:shared"] });
    z = putOsmZone(z, { key: "2", bbox: T2, builtAt: 2, fmt: OSM_FMT, roads: ["1:b", "1:shared"] });
    z = putOsmZone(z, { key: "3", bbox: far, builtAt: 3, fmt: OSM_FMT, roads: ["1:loin"] });
    const got = roadsInCache(z, { minLat: 47.04, maxLat: 47.06, minLon: -1.52, maxLon: -1.48 }, 10, 100).sort();
    assert.deepEqual(got, ["1:a", "1:b", "1:shared"]);
  });
});

describe("gridTiles", () => {
  it("deux cadres qui se chevauchent partagent les mêmes tuiles (cache commun)", () => {
    const a = gridTiles({ minLat: 47.19, maxLat: 47.24, minLon: -1.8, maxLon: -1.65 });
    const b = gridTiles({ minLat: 47.2, maxLat: 47.23, minLon: -1.76, maxLon: -1.7 });
    const keys = new Set(a.map(bboxKey));
    assert.ok(b.every((t) => keys.has(bboxKey(t))));
  });
  it("couvre la zone et commence par le centre", () => {
    const z = { minLat: 47.12, maxLat: 47.31, minLon: -1.9, maxLon: -1.45 };
    const tiles = gridTiles(z);
    assert.ok(tiles.some((t) => t.minLat <= z.minLat) && tiles.some((t) => t.maxLat >= z.maxLat));
    assert.ok(tiles.some((t) => t.minLon <= z.minLon) && tiles.some((t) => t.maxLon >= z.maxLon));
    const c = (t: typeof z) => Math.hypot((t.minLat + t.maxLat) / 2 - 47.215, ((t.minLon + t.maxLon) / 2 + 1.675) * 0.68);
    assert.ok(c(tiles[0]) <= c(tiles[tiles.length - 1]));
  });
});
