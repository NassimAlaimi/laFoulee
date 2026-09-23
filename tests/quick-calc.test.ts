import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseDistance, parseDuration, parsePace, quickCalc } from "../src/lib/quick-calc.ts";

describe("parseDistance", () => {
  it("formats courants", () => {
    assert.equal(parseDistance("5k 24:30"), 5000);
    assert.equal(parseDistance("10 km en 50:00"), 10000);
    assert.equal(parseDistance("21,1km"), 21100);
    assert.equal(parseDistance("1500m 5:10"), 1500);
    assert.equal(parseDistance("semi en 1h45"), 21097.5);
    assert.equal(parseDistance("Marathon 3h30"), 42195);
  });
  it("ignore ce qui n'est pas une distance", () => {
    assert.equal(parseDistance("12 km/h"), null);
    assert.equal(parseDistance("bonjour"), null);
  });
});

describe("parseDuration", () => {
  it("mm:ss, h:mm:ss, 1h45, minutes", () => {
    assert.equal(parseDuration("5k 24:30"), 24 * 60 + 30);
    assert.equal(parseDuration("semi 1:45:10"), 3600 + 45 * 60 + 10);
    assert.equal(parseDuration("semi en 1h45"), 3600 + 45 * 60);
    assert.equal(parseDuration("marathon 3h"), 3 * 3600);
    assert.equal(parseDuration("10k 49'50\""), 49 * 60 + 50);
    assert.equal(parseDuration("10k 45min"), 45 * 60);
  });
  it("une allure n'est pas une durée", () => {
    assert.equal(parseDuration("4:50/km"), null);
  });
});

describe("parsePace", () => {
  it("allure et vitesse", () => {
    assert.equal(parsePace("4'50/km"), 290);
    assert.equal(parsePace("4:50 /km"), 290);
    assert.equal(parsePace("12 km/h"), 300);
    assert.equal(parsePace("5k 24:30"), null);
  });
});

describe("quickCalc", () => {
  it("performance → VDOT et équivalents cohérents", () => {
    const r = quickCalc("5k 24:30");
    assert.ok(r && r.kind === "performance");
    assert.ok(r.vdot > 38 && r.vdot < 40.5, `${r.vdot}`);
    const five = r.equivalents.find((e) => e.label === "5 km")!;
    assert.equal(five.seconds, 24 * 60 + 30);
    const ten = r.equivalents.find((e) => e.label === "10 km")!;
    assert.ok(ten.seconds > 2 * five.seconds, "le 10 km est plus lent que 2 × 5 km");
  });

  it("allure → temps de passage", () => {
    const r = quickCalc("5'00/km");
    assert.ok(r && r.kind === "pace");
    assert.equal(r.kmh, 12);
    assert.equal(r.splits.find((s) => s.label === "10 km")!.seconds, 3000);
  });

  it("refuse l'invraisemblable et le texte libre", () => {
    assert.equal(quickCalc("5k 5:00"), null); // 1'00/km
    assert.equal(quickCalc("activités"), null);
    assert.equal(quickCalc(""), null);
  });
});
