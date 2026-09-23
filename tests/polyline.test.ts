import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clusterByStart,
  decodePolyline,
  encodePolyline,
  groupRoutes,
  haversine,
  kmSegments,
  niceScale,
  routePath,
  routeSignature,
  sameRoute,
  simplify,
  type LatLng,
} from "../src/lib/polyline.ts";

// Exemple de la documentation Google
const GOOGLE = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

/** Boucle carrée d'environ `sideM` mètres de côté autour de (lat, lng). */
function square(lat: number, lng: number, sideM: number, stepsPerSide = 20): LatLng[] {
  const dLat = sideM / 111_320;
  const dLng = sideM / (111_320 * Math.cos((lat * Math.PI) / 180));
  const corners: LatLng[] = [
    [lat, lng],
    [lat, lng + dLng],
    [lat + dLat, lng + dLng],
    [lat + dLat, lng],
    [lat, lng],
  ];
  const out: LatLng[] = [];
  for (let c = 0; c < 4; c++) {
    for (let i = 0; i < stepsPerSide; i++) {
      const t = i / stepsPerSide;
      out.push([
        corners[c][0] + (corners[c + 1][0] - corners[c][0]) * t,
        corners[c][1] + (corners[c + 1][1] - corners[c][1]) * t,
      ]);
    }
  }
  out.push(corners[4]);
  return out;
}

describe("decodePolyline / encodePolyline", () => {
  it("décode l'exemple de référence Google", () => {
    const pts = decodePolyline(GOOGLE);
    assert.deepEqual(pts, [
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ]);
  });

  it("aller-retour exact à 1e-5 près", () => {
    const pts = square(48.85, 2.35, 800);
    const back = decodePolyline(encodePolyline(pts));
    assert.equal(back.length, pts.length);
    back.forEach((p, i) => {
      assert.ok(Math.abs(p[0] - pts[i][0]) < 1e-5);
      assert.ok(Math.abs(p[1] - pts[i][1]) < 1e-5);
    });
  });

  it("vide ou nul → aucun point", () => {
    assert.deepEqual(decodePolyline(null), []);
    assert.deepEqual(decodePolyline(""), []);
  });
});

describe("géométrie", () => {
  it("haversine : 1° de latitude ≈ 111 km", () => {
    const d = haversine([45, 3], [46, 3]);
    assert.ok(Math.abs(d - 111_195) < 200, `${d}`);
  });

  it("simplify conserve les extrémités et allège une ligne droite", () => {
    const line = Array.from({ length: 50 }, (_, i) => [i, i * 2] as [number, number]);
    const s = simplify(line, 0.5);
    assert.deepEqual(s, [line[0], line[49]]);
  });

  it("routePath tient dans la boîte et détecte une boucle", () => {
    const r = routePath(encodePolyline(square(48.85, 2.35, 800)), 40, 40, 4);
    assert.ok(r.d.startsWith("M"));
    assert.equal(r.loop, true);
    const nums = r.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    assert.ok(nums.every((n) => n >= 3.9 && n <= 36.1), "coordonnées hors boîte");
  });

  it("arrondit le point de départ au centième (déterminisme SSR/client)", () => {
    const r = routePath(encodePolyline(square(48.85, 2.35, 800)), 40, 40, 4);
    assert.ok(r.start);
    assert.ok(r.end);
    for (const v of [...r.start, ...r.end]) {
      assert.equal(v, Number(v.toFixed(2)), "point non arrondi au centième");
    }
  });
});

describe("kmSegments", () => {
  it("coupe une boucle de 3,2 km en 4 tronçons (3 bornes)", () => {
    const loop = square(48.85, 2.35, 800, 40); // 4 × 800 m
    const seg = kmSegments(encodePolyline(loop), 3200, 400, 300);
    assert.equal(seg.markers.length, 3);
    assert.equal(seg.segments.length, 4);
    assert.deepEqual(seg.markers.map((m) => m.km), [1, 2, 3]);
    assert.ok(seg.pxPerMeter > 0);
  });

  it("remet les distances à l'échelle de la distance réelle", () => {
    const loop = square(48.85, 2.35, 800, 40);
    // Si la montre annonce 6,4 km, la polyline (3,2 km) est étirée ×2
    const seg = kmSegments(encodePolyline(loop), 6400, 400, 300);
    assert.equal(seg.markers.length, 6);
  });
});

describe("niceScale", () => {
  it("choisit une longueur ronde proche de la cible", () => {
    const s = niceScale(0.1, 50)!; // 0,1 px/m, cible 50 px → 500 m
    assert.equal(s.label, "500 m");
    assert.equal(Math.round(s.px), 50);
    assert.equal(niceScale(0, 50), null);
  });
});

describe("même parcours", () => {
  const a = square(48.85, 2.35, 800);
  const aShifted = a.map(([la, ln]) => [la + 0.0002, ln + 0.0002] as LatLng); // ~25 m
  const aReversed = [...a].reverse();
  const other = square(48.9, 2.4, 800); // 6 km plus loin

  it("reconnaît le même tracé, légèrement décalé", () => {
    assert.ok(
      sameRoute({ polyline: encodePolyline(a), distance: 3200 }, { polyline: encodePolyline(aShifted), distance: 3250 })
    );
  });

  it("reconnaît la même boucle courue dans l'autre sens", () => {
    assert.ok(
      sameRoute({ polyline: encodePolyline(a), distance: 3200 }, { polyline: encodePolyline(aReversed), distance: 3200 })
    );
  });

  it("rejette un parcours éloigné, ou de distance trop différente", () => {
    assert.ok(!sameRoute({ polyline: encodePolyline(a), distance: 3200 }, { polyline: encodePolyline(other), distance: 3200 }));
    assert.ok(!sameRoute({ polyline: encodePolyline(a), distance: 3200 }, { polyline: encodePolyline(aShifted), distance: 5000 }));
  });

  it("signature : n points équidistants", () => {
    const sig = routeSignature(encodePolyline(a), 16);
    assert.equal(sig.length, 16);
  });

  it("groupRoutes regroupe les passages et trie par fréquence", () => {
    const items = [
      { id: "1", polyline: encodePolyline(a), distance: 3200 },
      { id: "2", polyline: encodePolyline(other), distance: 3200 },
      { id: "3", polyline: encodePolyline(aShifted), distance: 3200 },
      { id: "4", polyline: encodePolyline(aReversed), distance: 3200 },
      { id: "5", polyline: null, distance: 3200 },
    ];
    const g = groupRoutes(items);
    assert.equal(g.length, 2);
    assert.deepEqual(g[0].items.map((i) => i.id), ["1", "3", "4"]);
  });

  it("clusterByStart sépare deux villes", () => {
    const c = clusterByStart([
      { start: [48.85, 2.35] as LatLng },
      { start: [48.86, 2.36] as LatLng },
      { start: [43.3, 5.37] as LatLng },
    ]);
    assert.equal(c.length, 2);
    assert.equal(c[0].items.length, 2);
  });
});
