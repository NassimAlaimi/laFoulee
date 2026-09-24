import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bubblePosition,
  centeredBubble,
  TOUR_STEPS,
  TOUR_STORAGE_KEY,
} from "../src/lib/tour.ts";

const vw = { width: 1280, height: 800 };
const bubble = { width: 360, height: 200 };

describe("bubblePosition", () => {
  it("se place sous l'ancre quand la place existe", () => {
    const anchor = { top: 200, left: 400, width: 400, height: 60 };
    const pos = bubblePosition(anchor, bubble, vw);
    assert.equal(pos.arrow, "top");
    assert.equal(pos.top, 200 + 60 + 14);
    assert.equal(pos.left, 400 + 200 - 180); // centrée
    assert.equal(pos.arrowOffset, 180);
  });

  it("bascule au-dessus quand le bas manque", () => {
    const anchor = { top: 700, left: 400, width: 400, height: 60 };
    const pos = bubblePosition(anchor, bubble, vw);
    assert.equal(pos.arrow, "bottom");
    assert.equal(pos.top, 700 - 14 - 200);
  });

  it("passe à droite quand il n'y a ni dessous ni dessus", () => {
    // Ancre qui occupe presque toute la hauteur
    const anchor = { top: 0, left: 100, width: 300, height: 780 };
    const pos = bubblePosition(anchor, bubble, vw);
    assert.equal(pos.arrow, "left");
    assert.equal(pos.left, 100 + 300 + 14);
    assert.ok(pos.top >= 14 && pos.top + 200 <= 800 - 14);
  });

  it("reste dans la fenêtre près du bord droit", () => {
    const anchor = { top: 200, left: 1200, width: 60, height: 40 };
    const pos = bubblePosition(anchor, bubble, vw);
    assert.ok(pos.left + bubble.width <= vw.width - 14 + 0.01);
    assert.ok(pos.left >= 14);
    assert.ok(pos.arrowOffset <= bubble.width - 24);
  });

  it("ne déborde pas sur un écran étroit", () => {
    const narrow = { width: 390, height: 844 };
    const anchor = { top: 300, left: 20, width: 350, height: 60 };
    const pos = bubblePosition(anchor, bubble, narrow);
    assert.ok(pos.left >= 12);
    assert.ok(pos.left + 360 <= 390 - 12 + 0.01);
  });

  it("flèche bornée dans la bulle", () => {
    const anchor = { top: 200, left: 5, width: 80, height: 40 };
    const pos = bubblePosition(anchor, bubble, vw);
    assert.ok(pos.arrowOffset >= 24 && pos.arrowOffset <= 360 - 24);
  });
});

describe("centeredBubble", () => {
  it("centre la bulle finale", () => {
    const pos = centeredBubble({ width: 1280, height: 800 }, 220);
    assert.equal(pos.left, (1280 - 360) / 2);
    assert.equal(pos.top, (800 - 220) / 2);
  });
});

describe("TOUR_STEPS", () => {
  it("traverse les six pôles et se termine par une carte libre", () => {
    assert.equal(TOUR_STEPS.length, 8);
    assert.equal(TOUR_STEPS[TOUR_STEPS.length - 1].anchor, "");
    const paths = TOUR_STEPS.map((s) => s.path).filter(Boolean);
    assert.deepEqual(paths, ["/", "/", "/activities", "/training", "/analysis", "/goals", "/corps"]);
    for (const s of TOUR_STEPS) {
      assert.ok(s.title.length > 3);
      assert.ok(s.body.length > 20);
    }
  });

  it("les ancres sont des sélecteurs data-tour (ou vides)", () => {
    for (const s of TOUR_STEPS) {
      assert.ok(s.anchor === "" || s.anchor.startsWith('[data-tour="'));
    }
  });

  it("clé de persistance versionnée", () => {
    assert.match(TOUR_STORAGE_KEY, /^foulee:tour:v\d+$/);
  });
});
