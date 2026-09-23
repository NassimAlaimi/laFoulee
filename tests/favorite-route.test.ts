import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  favoriteRoute,
  favoriteRouteSummary,
  paceTrend,
  routeTimeline,
} from "../src/lib/favorite-route.ts";
import { encodePolyline, type LatLng } from "../src/lib/polyline.ts";

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
  out.push([lat, lng]);
  return out;
}

/** Une sortie de test sur un parcours. */
function run(
  id: string,
  polyline: string,
  distance: number,
  daysAgo: number,
  movingTime: number,
  hr: number | null = null,
  isRace = false
) {
  return {
    id,
    polyline,
    distance,
    startDate: new Date(Date.now() - daysAgo * 86_400_000),
    movingTime,
    averageHr: hr,
    isRace,
  };
}

const LOOP_A = encodePolyline(square(48.85, 2.35, 500));
const LOOP_A2 = encodePolyline(square(48.8501, 2.3501, 500)); // quasi identique
const LOOP_B = encodePolyline(square(48.90, 2.40, 500)); // ailleurs

describe("favoriteRoute", () => {
  it("renvoie null sans parcours récurrent (moins de 2 sorties)", () => {
    assert.equal(favoriteRoute([run("a", LOOP_A, 2000, 1, 600)]), null);
  });

  it("retrouve le parcours le plus couru et ignore les autres", () => {
    const items = [
      run("a", LOOP_A, 2000, 30, 610),
      run("b", LOOP_A2, 1990, 20, 600),
      run("c", LOOP_A, 2010, 10, 590),
      run("d", LOOP_B, 2000, 5, 600),
    ];
    const fav = favoriteRoute(items);
    assert.ok(fav);
    assert.equal(fav.items.length, 3);
    assert.deepEqual(
      fav.items.map((i) => i.id).sort(),
      ["a", "b", "c"]
    );
  });

  it("tri : le parcours le plus fréquenté gagne même s'il arrive après", () => {
    const items = [
      run("d", LOOP_B, 2000, 5, 600),
      run("a", LOOP_A, 2000, 30, 610),
      run("b", LOOP_A2, 1990, 20, 600),
      run("c", LOOP_A, 2010, 10, 590),
    ];
    const fav = favoriteRoute(items);
    assert.ok(fav);
    assert.equal(fav.items.length, 3);
  });
});

describe("routeTimeline", () => {
  it("trie de l'ancien au récent et calcule l'allure", () => {
    const tl = routeTimeline([
      run("r", LOOP_A, 2000, 5, 600, 150),
      run("o", LOOP_A, 2000, 60, 640, 155),
    ]);
    assert.equal(tl[0].id, "o");
    assert.equal(tl[1].id, "r");
    // 2000 m en 640 s → 320 s/km ; en 600 s → 300 s/km
    assert.equal(tl[0].pace, 320);
    assert.equal(tl[1].pace, 300);
    assert.equal(tl[0].hr, 155);
  });
});

describe("paceTrend", () => {
  it("null si moins de 2 points", () => {
    const tl = routeTimeline([run("a", LOOP_A, 2000, 1, 600)]);
    assert.equal(paceTrend(tl), null);
  });

  it("négatif quand l'allure s'améliore, positif quand elle se dégrade", () => {
    const faster = routeTimeline([
      run("a", LOOP_A, 2000, 60, 640), // 320 s/km
      run("b", LOOP_A, 2000, 30, 600), // 300 s/km
      run("c", LOOP_A, 2000, 0, 560), // 280 s/km
    ]);
    assert.ok((paceTrend(faster) as number) < 0);

    const slower = routeTimeline([
      run("a", LOOP_A, 2000, 60, 560),
      run("b", LOOP_A, 2000, 30, 600),
      run("c", LOOP_A, 2000, 0, 640),
    ]);
    assert.ok((paceTrend(slower) as number) > 0);
  });

  it("allure constante → pente nulle", () => {
    const flat = routeTimeline([
      run("a", LOOP_A, 2000, 60, 600),
      run("b", LOOP_A, 2000, 30, 600),
      run("c", LOOP_A, 2000, 0, 600),
    ]);
    assert.equal(paceTrend(flat), 0);
  });
});

describe("favoriteRouteSummary", () => {
  it("agrège compte, distance moyenne, meilleure et dernière allure", () => {
    const tl = routeTimeline([
      run("a", LOOP_A, 2000, 60, 640, 150),
      run("b", LOOP_A, 2000, 30, 600, 148),
      run("c", LOOP_A, 2000, 0, 560, 145),
    ]);
    const s = favoriteRouteSummary(tl);
    assert.equal(s.count, 3);
    assert.ok(Math.abs(s.km - 2) < 0.01);
    assert.equal(s.bestPace, 280);
    assert.equal(s.recentPace, 280);
    assert.equal(s.hr, true);
    assert.ok((s.trend as number) < 0);
  });

  it("ne raconte pas de tendance sur un recul trop court", () => {
    // 5 sorties sur 9 jours : la pente brute est énorme, mais on la tait.
    const tl = routeTimeline([
      run("a", LOOP_A, 2000, 9, 640),
      run("b", LOOP_A, 2000, 7, 560),
      run("c", LOOP_A, 2000, 5, 620),
      run("d", LOOP_A, 2000, 2, 500),
      run("e", LOOP_A, 2000, 0, 580),
    ]);
    const s = favoriteRouteSummary(tl);
    assert.equal(s.spanDays, 9);
    assert.equal(s.trend, null);
  });

  it("donne une tendance au-delà de 60 jours", () => {
    const tl = routeTimeline([
      run("a", LOOP_A, 2000, 120, 640),
      run("b", LOOP_A, 2000, 60, 600),
      run("c", LOOP_A, 2000, 0, 560),
    ]);
    const s = favoriteRouteSummary(tl);
    assert.ok(s.spanDays >= 60);
    assert.ok((s.trend as number) < 0);
  });
});
