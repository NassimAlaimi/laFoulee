import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { coverWindow, fitWindow, framedBbox, scaleBar, unionBox, viewFor, zoomWindow } from "../src/lib/route-view.ts";

const km = (b: { minLat: number; maxLat: number; minLon: number; maxLon: number }) => {
  const lat = (b.minLat + b.maxLat) / 2;
  return {
    w: (b.maxLon - b.minLon) * 111.32 * Math.cos((lat * Math.PI) / 180),
    h: (b.maxLat - b.minLat) * 111.32,
  };
};

describe("framedBbox", () => {
  // Réseau réel observé : 15,4 km de large pour 3,6 km de haut (Nantes).
  const strip = { minLat: 47.19425, maxLat: 47.2269, minLon: -1.74598, maxLon: -1.54262 };

  it("contient tout le réseau (rien n'est rogné)", () => {
    const f = framedBbox(strip);
    assert.ok(f.minLat < strip.minLat && f.maxLat > strip.maxLat);
    assert.ok(f.minLon < strip.minLon && f.maxLon > strip.maxLon);
  });
  it("donne des proportions lisibles au lieu d'une bande écrasée", () => {
    const { w, h } = km(framedBbox(strip));
    assert.ok(h / w >= 0.549, `ratio ${h / w}`);
    const v = viewFor(framedBbox(strip));
    assert.ok(v.H > 400, `hauteur ${v.H}`); // avant : 211 px pour 1000 de large
  });
  it("plafonne le côté long autour du centre", () => {
    const huge = { minLat: 47, maxLat: 47.1, minLon: -2, maxLon: 0 };
    const { w } = km(framedBbox(huge, { maxKm: 20 }));
    assert.ok(w <= 20.01, `largeur ${w}`);
  });
  it("élargit aussi un réseau très vertical", () => {
    const tall = { minLat: 47, maxLat: 47.1, minLon: -1.5, maxLon: -1.499 };
    const { w, h } = km(framedBbox(tall));
    assert.ok(w / h >= 0.549);
  });
});

describe("fitWindow / zoomWindow", () => {
  const W = 1000;
  const H = 411;
  it("contain : toute la carte est visible, au ratio du cadre", () => {
    const f = fitWindow(W, H, 1.6, "contain"); // cadre moins plat que la carte
    assert.equal(f.w, W);
    assert.ok(f.h >= H);
    assert.ok(Math.abs(f.w / f.h - 1.6) < 1e-9);
  });
  it("crop (mobile) : carte haute, côtés rognés et centrés", () => {
    const f = fitWindow(W, H, 0.85, "crop");
    assert.equal(f.h, H);
    assert.ok(f.w < W);
    assert.ok(Math.abs(f.x + f.w / 2 - W / 2) < 1e-9);
    assert.ok(Math.abs(f.w / f.h - 0.85) < 1e-9);
  });
  it("le zoom garde le ratio et le point sous le curseur", () => {
    const f = fitWindow(W, H, 0.85, "crop");
    const z = zoomWindow(f, 0.5, 500, 200, f);
    assert.ok(Math.abs(z.w / z.h - f.w / f.h) < 1e-9);
    // (500, 200) garde la même position relative dans la fenêtre
    assert.ok(Math.abs((500 - f.x) / f.w - (500 - z.x) / z.w) < 1e-9);
  });
  it("borné : pas plus large que la fenêtre d'origine, pas au-delà de ×40", () => {
    const f = fitWindow(W, H, 2, "contain");
    assert.equal(zoomWindow(f, 3, 0, 0, f).w, f.w);
    let z = f;
    for (let i = 0; i < 100; i++) z = zoomWindow(z, 0.5, 500, 200, f);
    assert.ok(Math.abs(z.w - f.w / 40) < 1e-9);
  });
});

describe("projection conforme", () => {
  it("un carré de 1 km reste un carré à l'écran (plus d'étirement est-ouest)", () => {
    const lat = 47.2;
    const dLat = 1 / 111.32;
    const dLon = 1 / (111.32 * Math.cos((lat * Math.PI) / 180));
    const v = viewFor({ minLat: lat, maxLat: lat + dLat, minLon: -1.6, maxLon: -1.6 + dLon });
    const w = v.x(-1.6 + dLon) - v.x(-1.6);
    const h = v.y(lat) - v.y(lat + dLat);
    assert.ok(Math.abs(w / h - 1) < 0.01, `ratio ${w / h}`);
    assert.ok(Math.abs(v.pxPerMeter * 1000 - h) < 0.5);
  });
  it("unproject inverse la projection", () => {
    const v = viewFor({ minLat: 47.1, maxLat: 47.3, minLon: -1.8, maxLon: -1.5 });
    const p = v.unproject(v.x(-1.61), v.y(47.22));
    assert.ok(Math.abs(p.lat - 47.22) < 1e-9 && Math.abs(p.lng + 1.61) < 1e-9);
  });
});

describe("coverWindow / unionBox / scaleBar", () => {
  it("coverWindow contient le rectangle, au ratio demandé, centré", () => {
    const r = { x: 100, y: 50, w: 200, h: 200 };
    const c = coverWindow(r, 1.7);
    assert.ok(Math.abs(c.w / c.h - 1.7) < 1e-9);
    assert.ok(c.x <= r.x && c.y <= r.y && c.x + c.w >= r.x + r.w && c.y + c.h >= r.y + r.h);
    assert.ok(Math.abs(c.x + c.w / 2 - 200) < 1e-9);
  });
  it("unionBox couvre toutes les boîtes, avec marge", () => {
    const u = unionBox([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 5, w: 10, h: 10 }])!;
    assert.ok(u.x < 0 && u.y < 0 && u.x + u.w > 30 && u.y + u.h > 15);
    assert.equal(unionBox([]), null);
  });
  it("scaleBar choisit une longueur ronde qui tient", () => {
    const s = scaleBar(10, 110); // 10 m par pixel
    assert.equal(s.meters, 1000);
    assert.equal(s.px, 100);
  });
});
