import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  averageSleep,
  correlation,
  readinessScore,
  readinessSeries,
} from "../src/lib/readiness.ts";

describe("readinessScore", () => {
  it("journée parfaite : 100 et prêt", () => {
    const r = readinessScore({ sleepHours: 8.5, sleepQuality: 5, fatigue: 1, mood: 5, painLevel: 0 });
    assert.equal(r.score, 100);
    assert.equal(r.zone, "ready");
  });

  it("sommeil très court : forte pénalité", () => {
    const r = readinessScore({ sleepHours: 5 });
    assert.equal(r.score, 72);
    assert.ok(r.breakdown.includes("sommeil très court"));
  });

  it("sommeil court + douleur : cumul", () => {
    const r = readinessScore({ sleepHours: 6, painLevel: 2 });
    assert.equal(r.score, 69);
    assert.equal(r.zone, "solid");
  });

  it("fatigue maximale + douleur empêchante : récupère", () => {
    const r = readinessScore({ fatigue: 5, painLevel: 3, sleepHours: 5 });
    assert.equal(r.score, 22);
    assert.equal(r.zone, "recover");
  });

  it("le score reste borné (plancher à 2 avec toutes les pénalités)", () => {
    const r = readinessScore({ sleepHours: 0, fatigue: 5, painLevel: 3, sleepQuality: 1, mood: 1, rpe: 10 });
    assert.equal(r.score, 2);
  });

  it("zones : seuils 80 / 65 / 50", () => {
    assert.equal(readinessScore({ sleepHours: 7 }).zone, "ready"); // 95
    assert.equal(readinessScore({ sleepHours: 6.5 }).zone, "ready"); // 95
    assert.equal(readinessScore({ sleepHours: 6, fatigue: 4 }).zone, "solid"); // 73
    assert.equal(readinessScore({ sleepHours: 5.5, fatigue: 4 }).zone, "fragile"); // 60
    assert.equal(readinessScore({ sleepHours: 5, painLevel: 3 }).zone, "recover"); // 42
  });

  it("sans donnée : 100, aucun facteur", () => {
    const r = readinessScore({});
    assert.equal(r.score, 100);
    assert.deepEqual(r.breakdown, []);
  });
});

describe("readinessSeries", () => {
  it("tri chronologique et filtre sur la fenêtre", () => {
    const now = Date.now();
    const day = 86400000;
    const logs = [
      { date: new Date(now - 3 * day), sleepHours: 8 },
      { date: new Date(now - 20 * day), sleepHours: 3 }, // hors fenêtre
      { date: new Date(now - 1 * day), sleepHours: 6 },
    ];
    const s = readinessSeries(logs, 14);
    assert.equal(s.length, 2);
    assert.ok(s[0].date.getTime() < s[1].date.getTime());
    assert.equal(s[1].score, 85);
  });
});

describe("averageSleep", () => {
  it("moyenne sur les jours renseignés", () => {
    const now = Date.now();
    const day = 86400000;
    const logs = [
      { date: new Date(now - day), sleepHours: 8 },
      { date: new Date(now - 2 * day), sleepHours: 7 },
      { date: new Date(now - 3 * day), sleepHours: null },
    ];
    assert.equal(averageSleep(logs, 7), 7.5);
  });

  it("null sans donnée", () => {
    assert.equal(averageSleep([{ date: new Date() }]), null);
  });
});

describe("correlation", () => {
  it("corrélation parfaite positive", () => {
    assert.equal(correlation([1, 2, 3, 4], [2, 4, 6, 8]), 1);
  });

  it("corrélation parfaite négative", () => {
    assert.equal(correlation([1, 2, 3, 4], [8, 6, 4, 2]), -1);
  });

  it("sans corrélation", () => {
    const r = correlation([1, 2, 3, 4], [4, 1, 4, 1]);
    assert.ok(r !== null && Math.abs(r) < 0.5);
  });

  it("moins de 4 points : null", () => {
    assert.equal(correlation([1, 2], [1, 2]), null);
  });

  it("série constante : null", () => {
    assert.equal(correlation([1, 1, 1, 1], [2, 4, 6, 8]), null);
  });

  it("longueurs différentes : null", () => {
    assert.equal(correlation([1, 2, 3, 4], [1, 2, 3]), null);
  });
});
