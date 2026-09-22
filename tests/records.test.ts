import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fitnessProfile,
  personalRecords,
  isMaximalEffort,
  predictions,
  type BestEffortLike,
} from "../src/lib/records.ts";
import type { ActivityLike } from "../src/lib/stats.ts";

const mmss = (m: number, s: number) => m * 60 + s;
const hms = (h: number, m: number, s: number) => h * 3600 + m * 60 + s;

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

function effort(
  name: string,
  distance: number,
  seconds: number,
  days = 30
): BestEffortLike {
  return {
    name,
    distance,
    movingTime: seconds,
    startDate: daysAgo(days),
    activityId: `act-${name}-${seconds}`,
    activity: { name: `Sortie ${name}` },
  };
}

function activity(partial: Partial<ActivityLike> = {}): ActivityLike {
  return {
    id: "a1",
    name: "Sortie",
    type: "Run",
    startDate: daysAgo(10),
    distance: 10000,
    movingTime: 3000,
    elapsedTime: 3000,
    totalElevation: 0,
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

/**
 * Scénario réel qui a motivé la refonte :
 * un 5K rapide (24'51") coexiste avec des sorties longues tranquilles.
 */
const SCENARIO_REEL: BestEffortLike[] = [
  effort("1K", 1000, mmss(4, 30)),
  effort("5K", 5000, mmss(24, 51)),
  effort("10K", 10000, mmss(67, 50)),
  effort("Half-Marathon", 21097.5, hms(2, 43, 53)),
];

describe("personalRecords", () => {
  it("associe les best efforts Strava aux bonnes distances", () => {
    const records = personalRecords(SCENARIO_REEL, []);
    const cinq = records.find((r) => r.key === "5k")!;
    assert.equal(cinq.seconds, mmss(24, 51));
    assert.equal(cinq.estimated, false);
    assert.ok(cinq.vdot !== null && cinq.vdot > 0);
  });

  it("retient le meilleur temps quand plusieurs efforts existent", () => {
    const records = personalRecords(
      [
        effort("5K", 5000, mmss(27, 0)),
        effort("5K", 5000, mmss(24, 51)),
        effort("5K", 5000, mmss(26, 10)),
      ],
      []
    );
    assert.equal(records.find((r) => r.key === "5k")!.seconds, mmss(24, 51));
  });

  it("marque comme estimé un record déduit d'une activité entière", () => {
    const records = personalRecords(
      [],
      [activity({ distance: 10050, movingTime: mmss(55, 0) })]
    );
    const dix = records.find((r) => r.key === "10k")!;
    assert.ok(dix.seconds !== null);
    assert.equal(dix.estimated, true);
  });

  it("laisse une distance non courue à null", () => {
    const records = personalRecords([effort("5K", 5000, mmss(24, 51))], []);
    assert.equal(records.find((r) => r.key === "marathon")!.seconds, null);
  });
});

describe("fitnessProfile", () => {
  it("retient le 5K rapide et ignore la sortie longue lente", () => {
    const records = personalRecords(SCENARIO_REEL, []);
    const profile = fitnessProfile(records);
    assert.equal(
      profile.source?.key,
      "5k",
      `base retenue : ${profile.source?.key} (doit être 5k)`
    );
    assert.ok(profile.vdot > 37 && profile.vdot < 40, `VDOT ${profile.vdot}`);
  });

  it("exclut les records trop anciens", () => {
    const records = personalRecords(
      [effort("5K", 5000, mmss(20, 0), 900)], // il y a ~2,5 ans
      []
    );
    const recent = fitnessProfile(records, 365);
    assert.equal(recent.source, null);
    const tout = fitnessProfile(records, null);
    assert.ok(tout.source !== null);
  });

  it("renvoie un profil vide sans aucun record", () => {
    const profile = fitnessProfile(personalRecords([], []));
    assert.equal(profile.source, null);
    assert.equal(profile.vdot, 0);
  });
});

describe("predictions", () => {
  it("NE reproduit PAS le bug historique : 5K sub-25 ne prédit pas 35 min", () => {
    const records = personalRecords(SCENARIO_REEL, []);
    const profile = fitnessProfile(records);
    const preds = predictions(records, profile);

    const cinq = preds.find((p) => p.key === "5k")!;
    assert.ok(
      cinq.seconds < mmss(25, 30),
      `5K prédit à ${Math.round(cinq.seconds / 60)} min — doit rester sous 25'30"`
    );
  });

  it("prédit le 10K dans une fourchette réaliste depuis un 5K en 24'51\"", () => {
    const records = personalRecords(SCENARIO_REEL, []);
    const preds = predictions(records, fitnessProfile(records));
    const dix = preds.find((p) => p.key === "10k")!;
    // Attendu ~51-52 min (tables Daniels pour VDOT ~38,6)
    assert.ok(
      dix.seconds > mmss(50, 0) && dix.seconds < mmss(53, 0),
      `10K prédit : ${Math.floor(dix.seconds / 60)}'${dix.seconds % 60}"`
    );
  });

  it("prédit un marathon plausible", () => {
    const records = personalRecords(SCENARIO_REEL, []);
    const preds = predictions(records, fitnessProfile(records));
    const marathon = preds.find((p) => p.key === "marathon")!;
    assert.ok(
      marathon.seconds > hms(3, 40, 0) && marathon.seconds < hms(4, 15, 0),
      `Marathon prédit : ${(marathon.seconds / 3600).toFixed(2)} h`
    );
  });

  it("signale une confiance faible pour un marathon sans volume", () => {
    const records = personalRecords(SCENARIO_REEL, []);
    const preds = predictions(records, fitnessProfile(records), {
      weeklyKm: 25,
      longestRunMeters: 12000,
    });
    const marathon = preds.find((p) => p.key === "marathon")!;
    assert.equal(marathon.confidence, "low");
    assert.ok(marathon.confidenceReason.length > 0);
  });

  it("donne une confiance élevée là où un vrai record existe", () => {
    const records = personalRecords(SCENARIO_REEL, []);
    const preds = predictions(records, fitnessProfile(records));
    assert.equal(preds.find((p) => p.key === "5k")!.confidence, "high");
  });

  it("détecte qu'un record réel bat la prédiction", () => {
    const records = personalRecords(SCENARIO_REEL, []);
    const preds = predictions(records, fitnessProfile(records));
    // Le 5K est la base du VDOT : record == prédiction, donc il la "bat" (<=)
    assert.equal(preds.find((p) => p.key === "5k")!.beatsPrediction, true);
  });

  it("renvoie un tableau vide sans profil", () => {
    const empty = personalRecords([], []);
    assert.deepEqual(predictions(empty, fitnessProfile(empty)), []);
  });

  it("reste cohérent : allure prédite plus lente sur distance plus longue", () => {
    const records = personalRecords(SCENARIO_REEL, []);
    const preds = predictions(records, fitnessProfile(records)).filter(
      (p) => p.major
    );
    for (let i = 1; i < preds.length; i++) {
      assert.ok(
        preds[i].pace > preds[i - 1].pace,
        `${preds[i].name} doit avoir une allure plus lente que ${preds[i - 1].name}`
      );
    }
  });
});

describe("qualité d'effort et honnêteté des libellés", () => {
  it("n'annonce PAS une prédiction fiable sur une distance courue en sortie tranquille", () => {
    // Son 10K « record » (1h07) est une sortie lente : la prédiction 51'34"
    // vient du VDOT du 5K, pas de ce 10K. Le libellé ne doit pas le laisser croire.
    const records = personalRecords(SCENARIO_REEL, []);
    const preds = predictions(records, fitnessProfile(records));
    const dix = preds.find((p) => p.key === "10k")!;

    assert.equal(dix.recordIsMaximal, false);
    assert.notEqual(
      dix.confidence,
      "high",
      "un record non maximal ne doit pas produire une confiance élevée"
    );
  });

  it("reconnaît un effort maximal sur la distance de référence", () => {
    const records = personalRecords(SCENARIO_REEL, []);
    const preds = predictions(records, fitnessProfile(records));
    const cinq = preds.find((p) => p.key === "5k")!;
    assert.equal(cinq.recordIsMaximal, true);
    assert.equal(cinq.confidence, "high");
  });

  it("isMaximalEffort compare bien au VDOT du profil", () => {
    assert.equal(isMaximalEffort(38.5, 38.6), true);
    assert.equal(isMaximalEffort(37.0, 38.6), true); // dans la tolérance
    assert.equal(isMaximalEffort(27.9, 38.6), false); // sortie lente
    assert.equal(isMaximalEffort(null, 38.6), false);
    assert.equal(isMaximalEffort(38.6, 0), false);
  });
});
