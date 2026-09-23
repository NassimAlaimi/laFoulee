import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCalendar, escapeText, foldLine, sessionSummary } from "../src/lib/ics.ts";

describe("ics", () => {
  it("échappe virgules, points-virgules, retours à la ligne", () => {
    assert.equal(escapeText("a, b; c\nd\\e"), "a\\, b\\; c\\nd\\\\e");
  });

  it("replie à 75 octets sans couper un caractère multi-octet", () => {
    const line = "DESCRIPTION:" + "é".repeat(100);
    const folded = foldLine(line);
    for (const part of folded.split("\r\n")) assert.ok(Buffer.byteLength(part, "utf8") <= 75);
    assert.equal(folded.split("\r\n").map((p, i) => (i ? p.slice(1) : p)).join(""), line);
  });

  it("calendrier : séances journée entière, UID stables, séances sautées exclues, course avec alarme", () => {
    const ics = buildCalendar({
      name: "Test",
      now: new Date(Date.UTC(2026, 8, 1)),
      sessions: [
        { id: "s1", date: new Date(2026, 8, 2), title: "Seuil", kindLabel: "Seuil", distanceKm: 10, durationMin: 55, status: "planned" },
        { id: "s2", date: new Date(2026, 8, 3), title: "Footing", kindLabel: "Endurance", distanceKm: 6, durationMin: 40, status: "skipped" },
        { id: "s3", date: new Date(2026, 8, 4), title: "Renfo", kindLabel: "Renforcement", distanceKm: 0, durationMin: 30, status: "done" },
      ],
      races: [{ id: "r1", name: "Semi de Paris", date: new Date(2026, 9, 4), distanceKm: 21.1, targetTime: 6300 }],
    });
    assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
    assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
    assert.equal(ics.match(/BEGIN:VEVENT/g)!.length, 3);
    assert.ok(ics.includes("UID:s1@foulee"));
    assert.ok(!ics.includes("UID:s2@foulee"));
    assert.ok(ics.includes("DTSTART;VALUE=DATE:20260902"));
    assert.ok(ics.includes("DTEND;VALUE=DATE:20260903"));
    assert.ok(ics.includes("SUMMARY:✓ Renfo · 30 min"));
    assert.ok(ics.includes("TRIGGER:-P7D"));
    assert.ok(ics.includes("UID:race-r1@foulee"));
  });

  it("résumé : distance arrondie, coche si faite", () => {
    assert.equal(
      sessionSummary({ id: "x", date: new Date(), title: "Sortie longue", kindLabel: "", distanceKm: 18.04, durationMin: 110, status: "done" }),
      "✓ Sortie longue · 18 km"
    );
  });
});
