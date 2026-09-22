import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  danielsPaces,
  percentMaxForDuration,
  timeFromVdot,
  vdotFromPerformance,
  vmaFromVdot,
} from "../src/lib/vdot.ts";

const mmss = (m: number, s: number) => m * 60 + s;
const hms = (h: number, m: number, s: number) => h * 3600 + m * 60 + s;

describe("vdotFromPerformance", () => {
  it("correspond aux tables de Daniels (tolérance 0,5 point)", () => {
    // Références issues des tables VDOT publiées
    const cases: Array<[number, number, number]> = [
      [5000, mmss(24, 8), 40],
      [5000, mmss(19, 57), 50],
      [5000, mmss(17, 3), 60],
      [10000, mmss(50, 3), 40],
      [10000, mmss(41, 21), 50],
      [21097.5, hms(1, 50, 59), 40],
      [42195, hms(3, 49, 45), 40],
    ];
    for (const [meters, seconds, expected] of cases) {
      const v = vdotFromPerformance(meters, seconds);
      assert.ok(
        Math.abs(v - expected) < 0.5,
        `${meters}m en ${seconds}s → VDOT ${v.toFixed(2)}, attendu ~${expected}`
      );
    }
  });

  it("renvoie 0 sur des entrées invalides", () => {
    assert.equal(vdotFromPerformance(0, 100), 0);
    assert.equal(vdotFromPerformance(1000, 0), 0);
    assert.equal(vdotFromPerformance(-5, -5), 0);
  });

  it("augmente quand on court la même distance plus vite", () => {
    const lent = vdotFromPerformance(5000, mmss(30, 0));
    const rapide = vdotFromPerformance(5000, mmss(22, 0));
    assert.ok(rapide > lent);
  });

  it("note correctement une sortie longue lente comme un VDOT faible", () => {
    // Le cas qui cassait les prédictions : semi en 2h43 (7'46/km)
    const sortieLongue = vdotFromPerformance(21097.5, hms(2, 43, 53));
    const cinqKRapide = vdotFromPerformance(5000, mmss(24, 51));
    assert.ok(
      cinqKRapide > sortieLongue,
      `5K 24'51" (VDOT ${cinqKRapide.toFixed(1)}) doit primer sur semi 2h43 (VDOT ${sortieLongue.toFixed(1)})`
    );
  });
});

describe("timeFromVdot", () => {
  it("est l'inverse de vdotFromPerformance à la seconde près", () => {
    // timeFromVdot arrondit à la seconde. Sur 1000 m, 1 s d'écart représente
    // déjà ~0,1 point de VDOT : on vérifie donc la précision côté TEMPS,
    // qui est la grandeur réellement affichée à l'utilisateur.
    for (const vdot of [25, 35, 45, 55, 65, 75]) {
      for (const meters of [1000, 5000, 10000, 21097.5, 42195]) {
        const t = timeFromVdot(vdot, meters);
        const back = vdotFromPerformance(meters, t);
        const tBack = timeFromVdot(back, meters);
        assert.ok(
          Math.abs(tBack - t) <= 1,
          `VDOT ${vdot} @ ${meters}m → ${t}s → ${tBack}s`
        );
      }
    }
  });

  it("produit des temps croissants avec la distance", () => {
    const vdot = 45;
    const times = [1000, 5000, 10000, 21097.5, 42195].map((m) =>
      timeFromVdot(vdot, m)
    );
    for (let i = 1; i < times.length; i++) {
      assert.ok(times[i] > times[i - 1]);
    }
  });

  it("produit des allures décroissantes avec la distance", () => {
    const vdot = 45;
    const paces = [1000, 5000, 10000, 21097.5, 42195].map(
      (m) => timeFromVdot(vdot, m) / (m / 1000)
    );
    for (let i = 1; i < paces.length; i++) {
      assert.ok(
        paces[i] > paces[i - 1],
        "on ralentit forcément quand la distance augmente"
      );
    }
  });

  it("gère les entrées dégénérées", () => {
    assert.equal(timeFromVdot(0, 5000), 0);
    assert.equal(timeFromVdot(45, 0), 0);
  });
});

describe("percentMaxForDuration", () => {
  it("décroît avec la durée", () => {
    const court = percentMaxForDuration(5);
    const moyen = percentMaxForDuration(30);
    const long = percentMaxForDuration(180);
    assert.ok(court > moyen && moyen > long);
  });

  it("dépasse 100 % de VO2max sur efforts très courts", () => {
    // Comportement voulu du modèle de Daniels : sur 2-3 minutes, la filière
    // anaérobie permet de dépasser transitoirement VO2max.
    assert.ok(percentMaxForDuration(3) > 1);
    assert.ok(percentMaxForDuration(3) < 1.25);
  });

  it("reste dans une plage plausible sur effort long", () => {
    assert.ok(percentMaxForDuration(180) < 0.9);
    assert.ok(percentMaxForDuration(240) >= 0.75);
  });
});

describe("vmaFromVdot", () => {
  it("donne une VMA cohérente avec le niveau", () => {
    // VDOT 38.6 ≈ 5K en 24'51" → VMA attendue autour de 12-13 km/h
    const vma = vmaFromVdot(38.58);
    assert.ok(vma > 11.5 && vma < 13.5, `VMA calculée : ${vma}`);
  });

  it("croît avec le VDOT", () => {
    assert.ok(vmaFromVdot(60) > vmaFromVdot(40));
  });
});

describe("danielsPaces", () => {
  it("ordonne les allures de la plus lente à la plus rapide", () => {
    const paces = danielsPaces(45);
    for (let i = 1; i < paces.length; i++) {
      assert.ok(
        paces[i].pace < paces[i - 1].pace,
        `${paces[i].name} doit être plus rapide que ${paces[i - 1].name}`
      );
    }
  });

  it("place l'endurance fondamentale nettement plus lente que le seuil", () => {
    const p = danielsPaces(45);
    const easy = p.find((x) => x.key === "easy")!;
    const threshold = p.find((x) => x.key === "threshold")!;
    assert.ok(easy.pace - threshold.pace > 30, "au moins 30 s/km d'écart");
  });
});
