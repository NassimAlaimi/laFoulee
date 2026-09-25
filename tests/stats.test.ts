import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  acwrSeries,
  acwrZone,
  compareTrend,
  periodStats,
  startOfWeek,
  trainingLoad,
  weeklyVolume,
  type ActivityLike,
} from "../src/lib/stats.ts";

const daysAgo = (n: number) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
};

function run(partial: Partial<ActivityLike> = {}): ActivityLike {
  return {
    id: Math.random().toString(36).slice(2),
    name: "Sortie",
    type: "Run",
    startDate: daysAgo(1),
    distance: 10000,
    movingTime: 3000,
    elapsedTime: 3000,
    totalElevation: 50,
    averageSpeed: 10000 / 3000,
    maxSpeed: null,
    averageHr: null,
    maxHr: null,
    sufferScore: null,
    averageCadence: null,
    isRace: false,
    ...partial,
  };
}

describe("startOfWeek", () => {
  it("renvoie toujours un lundi", () => {
    for (let i = 0; i < 14; i++) {
      assert.equal(startOfWeek(daysAgo(i)).getDay(), 1);
    }
  });

  it("place le dimanche dans la semaine qui commence 6 jours avant", () => {
    const dimanche = new Date(2025, 0, 5); // dimanche 5 janvier 2025
    const lundi = startOfWeek(dimanche);
    assert.equal(lundi.getDate(), 30); // lundi 30 décembre 2024
    assert.equal(lundi.getMonth(), 11);
  });
});

describe("trainingLoad", () => {
  it("utilise le TRIMP quand la FC est disponible", () => {
    const facile = trainingLoad(run({ averageHr: 130, movingTime: 3600 }), {
      maxHr: 190,
      restHr: 55,
    });
    const dur = trainingLoad(run({ averageHr: 175, movingTime: 3600 }), {
      maxHr: 190,
      restHr: 55,
    });
    assert.ok(dur > facile, "une séance plus intense doit peser plus lourd");
  });

  it("croît avec la durée à intensité égale", () => {
    const court = trainingLoad(run({ averageHr: 150, movingTime: 1800 }), {
      maxHr: 190,
      restHr: 55,
    });
    const long = trainingLoad(run({ averageHr: 150, movingTime: 5400 }), {
      maxHr: 190,
      restHr: 55,
    });
    assert.ok(long > court);
  });

  it("retombe sur un proxy distance+dénivelé sans cardio", () => {
    const plat = trainingLoad(run({ distance: 10000, totalElevation: 0 }));
    const montagne = trainingLoad(run({ distance: 10000, totalElevation: 500 }));
    assert.ok(montagne > plat, "le dénivelé doit augmenter la charge");
    assert.ok(plat > 0);
  });

  it("ne renvoie jamais de valeur négative", () => {
    assert.ok(trainingLoad(run({ distance: 0, movingTime: 0 })) >= 0);
  });
});

describe("weeklyVolume", () => {
  it("agrège sur le bon nombre de semaines", () => {
    const weeks = weeklyVolume([run()], 12);
    assert.equal(weeks.length, 12);
  });

  it("place une sortie d'aujourd'hui dans la dernière semaine", () => {
    const weeks = weeklyVolume([run({ startDate: daysAgo(0), distance: 8000 })], 4);
    assert.equal(weeks[weeks.length - 1].km, 8);
  });

  it("ignore les activités hors fenêtre", () => {
    const weeks = weeklyVolume([run({ startDate: daysAgo(400) })], 12);
    assert.equal(
      weeks.reduce((a, w) => a + w.km, 0),
      0
    );
  });

  it("cumule plusieurs sorties de la même semaine", () => {
    const weeks = weeklyVolume(
      [
        run({ startDate: daysAgo(0), distance: 5000 }),
        run({ startDate: daysAgo(1), distance: 7000 }),
      ],
      2
    );
    const total = weeks.reduce((a, w) => a + w.km, 0);
    assert.equal(total, 12);
  });
});

describe("acwrZone", () => {
  it("classe correctement les ratios", () => {
    assert.equal(acwrZone(0), "detraining");
    assert.equal(acwrZone(0.5), "detraining");
    assert.equal(acwrZone(1.0), "optimal");
    assert.equal(acwrZone(1.3), "optimal");
    assert.equal(acwrZone(1.4), "caution");
    assert.equal(acwrZone(1.8), "danger");
  });
});

describe("acwrSeries", () => {
  it("produit un point par jour", () => {
    assert.equal(acwrSeries([run()], 30).length, 30);
  });

  it("détecte une montée de charge brutale", () => {
    // 4 semaines calmes puis une semaine très chargée
    const acts: ActivityLike[] = [];
    for (let d = 90; d > 7; d -= 3) {
      acts.push(run({ startDate: daysAgo(d), distance: 5000 }));
    }
    for (let d = 6; d >= 0; d--) {
      acts.push(run({ startDate: daysAgo(d), distance: 20000 }));
    }
    const serie = acwrSeries(acts, 90);
    const dernier = serie[serie.length - 1];
    assert.ok(
      dernier.ratio > 1.5,
      `ratio final ${dernier.ratio} — doit signaler un risque`
    );
    assert.equal(dernier.zone, "danger");
  });

  it("renvoie un ratio nul sans aucune activité", () => {
    const serie = acwrSeries([], 30);
    assert.equal(serie[serie.length - 1].ratio, 0);
    assert.equal(serie[serie.length - 1].ready, false);
  });

  it("n'invente pas de ratio tant qu'il manque 28 jours d'historique", () => {
    // Deux semaines de données seulement : la charge chronique est
    // artificiellement basse, le ratio exploserait sans garde-fou.
    const acts: ActivityLike[] = [];
    for (let d = 13; d >= 0; d--) {
      acts.push(run({ startDate: daysAgo(d), distance: 12000 }));
    }
    const serie = acwrSeries(acts, 30);
    const dernier = serie[serie.length - 1];
    assert.equal(dernier.ready, false, "doit être marqué non exploitable");
    assert.equal(dernier.zone, "insufficient");
    assert.equal(dernier.ratio, 0);
  });

  it("active le ratio une fois 28 jours d'historique atteints", () => {
    const acts: ActivityLike[] = [];
    for (let d = 60; d >= 0; d -= 2) {
      acts.push(run({ startDate: daysAgo(d), distance: 10000 }));
    }
    const dernier = acwrSeries(acts, 30).at(-1)!;
    assert.equal(dernier.ready, true);
    assert.notEqual(dernier.zone, "insufficient");
    assert.ok(dernier.ratio > 0);
  });
});

describe("periodStats", () => {
  it("calcule des totaux corrects", () => {
    const s = periodStats([
      run({ distance: 10000, movingTime: 3000, totalElevation: 100 }),
      run({ distance: 5000, movingTime: 1500, totalElevation: 50 }),
    ]);
    assert.equal(s.sessions, 2);
    assert.equal(s.km, 15);
    assert.equal(s.elevation, 150);
    assert.equal(s.longestRunKm, 10);
  });

  it("gère une période vide sans planter", () => {
    const s = periodStats([]);
    assert.equal(s.sessions, 0);
    assert.equal(s.km, 0);
    assert.equal(s.avgHr, null);
    assert.equal(s.longestRunKm, 0);
  });
});

describe("compareTrend", () => {
  it("détecte une hausse", () => {
    const t = compareTrend(110, 100);
    assert.equal(t.direction, "up");
    assert.equal(t.percent, 10);
  });

  it("détecte une baisse", () => {
    assert.equal(compareTrend(90, 100).direction, "down");
  });

  it("considère un écart minime comme stable", () => {
    assert.equal(compareTrend(100.2, 100).direction, "flat");
  });

  it("ne divise pas par zéro", () => {
    const t = compareTrend(50, 0);
    assert.equal(t.percent, 0);
    assert.ok(Number.isFinite(t.percent));
  });
});

describe("calendarDaysBetween", () => {
  it("compte les jours calendaires, pas les tranches de 24 h", async () => {
    const { calendarDaysBetween } = await import("../src/lib/stats.ts");
    assert.equal(calendarDaysBetween(new Date(2026, 8, 23, 21), new Date(2026, 8, 28, 0)), 5);
    assert.equal(calendarDaysBetween(new Date(2026, 8, 23, 1), new Date(2026, 8, 23, 23)), 0);
    // passage à l'heure d'hiver (25 oct. 2026)
    assert.equal(calendarDaysBetween(new Date(2026, 9, 24, 12), new Date(2026, 9, 26, 12)), 2);
  });
});

describe("trimLeadingEmpty", () => {
  it("coupe les mois vides en tête, garde un minimum", async () => {
    const { trimLeadingEmpty } = await import("../src/lib/stats.ts");
    const rows = [null, null, 3, null, 5].map((v) => ({ v }));
    assert.deepEqual(trimLeadingEmpty(rows, (r) => r.v == null).map((r) => r.v), [3, null, 5]);
    assert.equal(trimLeadingEmpty([{ v: null }, { v: null }, { v: null }], (r) => r.v == null).length, 2);
    assert.deepEqual(trimLeadingEmpty([{ v: null }, { v: 1 }], (r) => r.v == null, 2).map((r) => r.v), [null, 1]);
  });
});

describe("monthlyProgression", () => {
  it("range chaque sortie dans son mois local (pas UTC)", async () => {
    const { monthlyProgression } = await import("../src/lib/stats.ts");
    const now = new Date(2026, 8, 23, 12);
    const a = (d: Date) => ({ id: String(+d), name: "", type: "Run", startDate: d, distance: 5000, movingTime: 1800, elapsedTime: 1800, totalElevation: 0, averageSpeed: 2.8, maxSpeed: 3, averageHr: null, maxHr: null, sufferScore: null, averageCadence: null, isRace: false });
    const rows = monthlyProgression([a(new Date(2026, 8, 1, 0, 30)), a(new Date(2026, 7, 31, 23, 30))] as never, 3, now);
    assert.deepEqual(rows.map((r) => r.month), ["2026-07", "2026-08", "2026-09"]);
    assert.equal(rows[2].sessions, 1, "1er sept. 0 h 30 compte en septembre");
    assert.equal(rows[1].sessions, 1, "31 août 23 h 30 compte en août");
  });
});
