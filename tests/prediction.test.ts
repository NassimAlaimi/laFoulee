import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  criticalSpeed,
  durationCurve,
  enduranceIndex,
  goalGap,
  linearFit,
  pacingPlan,
  racePrediction,
  RIEGEL_DEFAULT,
  volumeNeeded,
} from "../src/lib/prediction.ts";
import { fitnessProfile, type PersonalRecord } from "../src/lib/records.ts";
import { vdotFromPerformance, timeFromVdot } from "../src/lib/vdot.ts";

function rec(
  key: string,
  name: string,
  meters: number,
  seconds: number | null,
  opts: Partial<PersonalRecord> = {}
): PersonalRecord {
  return {
    key,
    name,
    meters,
    major: true,
    seconds,
    pace: seconds ? (seconds / meters) * 1000 : null,
    date: new Date("2025-02-01T10:00:00Z"),
    activityId: key,
    activityName: name,
    vdot: seconds ? vdotFromPerformance(meters, seconds) : null,
    estimated: false,
    ...opts,
  };
}

/** Coureur cohérent : k = 1.06 exactement, base 5 km en 20 min. */
function riegelRunner(k = 1.06): PersonalRecord[] {
  const base = { meters: 5000, seconds: 1200 };
  const dists: Array<[string, string, number]> = [
    ["1k", "1 km", 1000],
    ["5k", "5 km", 5000],
    ["10k", "10 km", 10000],
    ["half", "Semi-marathon", 21097.5],
  ];
  return dists.map(([key, name, m]) =>
    rec(key, name, m, Math.round(base.seconds * Math.pow(m / base.meters, k)))
  );
}

// ---------------------------------------------------------------- Régression

describe("linearFit", () => {
  it("retrouve exactement une droite", () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = xs.map((x) => 3 * x + 7);
    const { slope, intercept, r2 } = linearFit(xs, ys);
    assert.ok(Math.abs(slope - 3) < 1e-9);
    assert.ok(Math.abs(intercept - 7) < 1e-9);
    assert.ok(r2 > 0.999);
  });

  it("renvoie un R² faible sur du bruit", () => {
    const { r2 } = linearFit([1, 2, 3, 4], [5, 1, 6, 2]);
    assert.ok(r2 < 0.5);
  });
});

// ---------------------------------------------------------------- Endurance

describe("enduranceIndex", () => {
  it("retrouve l'exposant qui a généré les performances", () => {
    for (const k of [1.03, 1.06, 1.11]) {
      const records = riegelRunner(k);
      const profile = fitnessProfile(records, null);
      const e = enduranceIndex(records, profile.vdot, { tolerance: 99 });
      assert.ok(
        Math.abs(e.exponent - k) < 0.01,
        `k attendu ${k}, mesuré ${e.exponent.toFixed(3)}`
      );
      assert.equal(e.measured, true);
    }
  });

  it("retombe sur la référence sans assez de performances", () => {
    const e = enduranceIndex([rec("5k", "5 km", 5000, 1200)], 40);
    assert.equal(e.exponent, RIEGEL_DEFAULT);
    assert.equal(e.measured, false);
  });

  it("ignore les efforts manifestement non maximaux", () => {
    const records = riegelRunner(1.06);
    // Un semi couru en promenade : VDOT très bas, ne doit pas tirer la pente.
    records.push(rec("30k", "30 km", 30000, 4 * 3600));
    const profile = fitnessProfile(records, null);
    const e = enduranceIndex(records, profile.vdot);
    assert.ok(e.exponent < 1.09, `pente polluée : ${e.exponent}`);
  });

  it("chiffre le ralentissement quand la distance double", () => {
    const e = enduranceIndex(riegelRunner(1.06), fitnessProfile(riegelRunner(1.06), null).vdot, {
      tolerance: 99,
    });
    // 2^1.06 / 2 − 1 ≈ 4,2 %
    assert.ok(Math.abs(e.slowdownPerDoubling - 4.2) < 0.3);
  });
});

// ---------------------------------------------------------------- Vitesse critique

describe("criticalSpeed", () => {
  it("retrouve CS et D′ d'un modèle parfait", () => {
    const cs = 4; // m/s
    const dPrime = 200; // m
    const records = [
      rec("1k", "1 km", 1000, undefined as never),
      rec("2mile", "2 miles", 3218.69, undefined as never),
    ];
    // d = CS·t + D′  ⇒  t = (d − D′)/CS
    const points = [1200, 3000, 5000].map((d, i) =>
      rec(`p${i}`, `${d} m`, d, Math.round((d - dPrime) / cs))
    );
    const res = criticalSpeed(points);
    assert.ok(res);
    assert.ok(Math.abs(res.cs - cs) < 0.05, `CS mesurée ${res.cs}`);
    assert.ok(Math.abs(res.dPrime - dPrime) < 15, `D′ mesuré ${res.dPrime}`);
    assert.ok(res.r2 > 0.99);
    void records;
  });

  it("refuse de modéliser sans écart de durée suffisant", () => {
    const res = criticalSpeed([
      rec("a", "a", 3000, 700),
      rec("b", "b", 3200, 750),
    ]);
    assert.equal(res, null);
  });
});

// ---------------------------------------------------------------- Prédiction

describe("racePrediction", () => {
  const records = riegelRunner(1.06);
  const profile = fitnessProfile(records, null);

  it("un athlète bien entraîné n'est pas pénalisé", () => {
    const p = racePrediction(10000, {
      records,
      profile,
      weeklyKm: 80,
      longestRunKm: 30,
    });
    assert.ok(p);
    assert.equal(p.limiters.length, 0);
    assert.ok(Math.abs(p.realistic - p.potential) <= p.potential * 0.02);
  });

  it("pénalise le marathon quand le volume ne suit pas", () => {
    const low = racePrediction(42195, {
      records,
      profile,
      weeklyKm: 25,
      longestRunKm: 14,
    })!;
    const high = racePrediction(42195, {
      records,
      profile,
      weeklyKm: 90,
      longestRunKm: 34,
    })!;
    assert.ok(low.realistic > high.realistic);
    assert.ok(low.limiters.length >= 2);
    assert.equal(low.confidence, "low");
    assert.match(low.reason, /\d/);
  });

  it("ne pénalise jamais un 5 km pour un manque de volume", () => {
    const p = racePrediction(5000, {
      records,
      profile,
      weeklyKm: 20,
      longestRunKm: 8,
    })!;
    assert.equal(p.limiters.length, 0);
  });

  it("ne prédit jamais plus lent qu'un record réel sur la distance", () => {
    const withPr = [...records];
    const p = racePrediction(21097.5, {
      records: withPr,
      profile,
      weeklyKm: 20,
      longestRunKm: 10,
    })!;
    const pr = withPr.find((r) => r.key === "half")!.seconds!;
    assert.ok(p.realistic <= pr + 1, `prédit ${p.realistic} vs record ${pr}`);
    assert.equal(p.confidence, "high");
  });

  it("encadre la prédiction par une fourchette cohérente", () => {
    const p = racePrediction(42195, {
      records,
      profile,
      weeklyKm: 50,
      longestRunKm: 25,
    })!;
    assert.ok(p.low < p.realistic && p.realistic < p.high);
    assert.ok((p.high - p.low) / p.realistic < 0.2);
  });

  it("reste cohérent avec le VDOT sur la distance de référence", () => {
    const p = racePrediction(5000, { records, profile, weeklyKm: 60, longestRunKm: 20 })!;
    assert.ok(Math.abs(p.potential - timeFromVdot(profile.vdot, 5000)) < 2);
  });
});

describe("volumeNeeded", () => {
  it("croît avec la distance", () => {
    assert.ok(volumeNeeded(5) < volumeNeeded(21.1));
    assert.ok(volumeNeeded(21.1) < volumeNeeded(42.2));
    assert.ok(volumeNeeded(42.2) < volumeNeeded(100));
  });
});

// ---------------------------------------------------------------- Objectif

describe("goalGap", () => {
  const records = riegelRunner(1.06);
  const profile = fitnessProfile(records, null);

  it("détecte un objectif déjà atteint", () => {
    const easy = timeFromVdot(profile.vdot, 10000) + 600;
    const g = goalGap(easy, 10000, profile.vdot, easy - 600, 20);
    assert.ok(g.gap < 0);
    assert.equal(g.weeksNeeded, 0);
    assert.equal(g.feasible, true);
  });

  it("chiffre le temps nécessaire pour un objectif ambitieux", () => {
    const hard = timeFromVdot(profile.vdot, 10000) * 0.88;
    const g = goalGap(hard, 10000, profile.vdot, timeFromVdot(profile.vdot, 10000), 4);
    assert.ok(g.gap > 0);
    assert.ok(g.weeksNeeded > 4);
    assert.equal(g.feasible, false);
    assert.ok(g.secondsToFind > 0);
  });

  it("ralentit la progression attendue quand le niveau est élevé", () => {
    const a = goalGap(1800, 10000, 30, 2000, 52).monthlyVdotGain;
    const b = goalGap(1800, 10000, 60, 2000, 52).monthlyVdotGain;
    assert.ok(a > b);
  });
});

// ---------------------------------------------------------------- Allures

describe("pacingPlan", () => {
  it("tombe exactement sur le chrono visé", () => {
    const splits = pacingPlan(21097.5, 6000);
    assert.ok(Math.abs(splits[splits.length - 1].cumulative - 6000) < 1);
  });

  it("ralentit le début et accélère la fin en négative split", () => {
    const splits = pacingPlan(42195, 3 * 3600);
    assert.ok(splits[0].pace > splits[splits.length - 1].pace);
  });

  it("garde une allure constante en régulier", () => {
    const splits = pacingPlan(10000, 2400, { strategy: "even" });
    const paces = splits.map((s) => s.pace);
    assert.ok(Math.max(...paces) - Math.min(...paces) < 0.5);
  });

  it("découpe le 10 km au kilomètre et le marathon aux 5 km", () => {
    assert.equal(pacingPlan(10000, 2400).length, 10);
    assert.equal(pacingPlan(42195, 10800).length, 9);
  });
});

// ---------------------------------------------------------------- Courbe

describe("durationCurve", () => {
  it("place chaque record face à son modèle", () => {
    const records = riegelRunner(1.06);
    const profile = fitnessProfile(records, null);
    const curve = durationCurve(records, profile, enduranceIndex(records, profile.vdot, { tolerance: 99 }));
    assert.equal(curve.length, records.length);
    for (const p of curve) {
      assert.ok(p.modelPace !== null);
      // Le runner suit exactement le modèle : écart quasi nul.
      assert.ok(Math.abs(p.deltaPct ?? 99) < 1.5, `${p.name} : ${p.deltaPct} %`);
    }
  });

  it("repère une distance nettement sous-performée", () => {
    const records = riegelRunner(1.06);
    const slow = records.map((r) =>
      r.key === "10k" ? rec("10k", "10 km", 10000, (r.seconds as number) * 1.12) : r
    );
    const profile = fitnessProfile(slow, null);
    const curve = durationCurve(slow, profile, enduranceIndex(slow, profile.vdot));
    const tenK = curve.find((p) => p.name === "10 km")!;
    assert.ok((tenK.deltaPct ?? 0) > 5, `écart mesuré ${tenK.deltaPct}`);
  });
});
