import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aerobicEfficiencyTrend,
  buildInsights,
  longestGap,
} from "../src/lib/insights.ts";
import { acwrSeries, type ActivityLike } from "../src/lib/stats.ts";
import { fitnessProfile, personalRecords } from "../src/lib/records.ts";

const NOW = new Date(2026, 8, 21, 12, 0, 0);

const daysAgo = (n: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  d.setHours(10, 0, 0, 0);
  return d;
};

function run(p: Partial<ActivityLike> = {}): ActivityLike {
  return {
    id: Math.random().toString(36).slice(2),
    name: "Sortie",
    type: "Run",
    startDate: daysAgo(1),
    distance: 10000,
    movingTime: 3000,
    elapsedTime: 3000,
    totalElevation: 30,
    averageSpeed: 10000 / 3000,
    maxSpeed: null,
    averageHr: null,
    maxHr: null,
    sufferScore: null,
    averageCadence: null,
    isRace: false,
    ...p,
  };
}

function effort(name: string, distance: number, seconds: number, days: number) {
  return {
    name,
    distance,
    movingTime: seconds,
    startDate: daysAgo(days),
    activityId: `e-${name}-${days}`,
    activity: { name: "Séance" },
  };
}

function input(
  runs: ActivityLike[],
  over: Partial<Parameters<typeof buildInsights>[0]> & {
    efforts?: ReturnType<typeof effort>[];
  } = {}
) {
  const { efforts = [], ...rest } = over;
  const records = personalRecords(efforts, runs);
  return {
    runs,
    load: acwrSeries(runs, 90, NOW),
    profile: fitnessProfile(records, 365, NOW),
    records,
    weeklyGoalKm: 40,
    maxHr: 190,
    now: NOW,
    ...rest,
  };
}

describe("longestGap", () => {
  it("mesure le plus long trou entre deux sorties", () => {
    const list = [run({ startDate: daysAgo(30) }), run({ startDate: daysAgo(10) })];
    assert.equal(longestGap(list, NOW), 20);
  });

  it("prend en compte le temps écoulé depuis la dernière sortie", () => {
    const list = [run({ startDate: daysAgo(40) }), run({ startDate: daysAgo(35) })];
    assert.equal(longestGap(list, NOW), 35);
  });

  it("renvoie 0 sur une liste vide", () => {
    assert.equal(longestGap([], NOW), 0);
  });
});

describe("aerobicEfficiencyTrend", () => {
  it("détecte une amélioration à FC constante", () => {
    const before = Array.from({ length: 4 }, () =>
      run({ distance: 10000, movingTime: 3600, averageSpeed: 10000 / 3600, averageHr: 150 })
    );
    const after = Array.from({ length: 4 }, () =>
      run({ distance: 10000, movingTime: 3000, averageSpeed: 10000 / 3000, averageHr: 150 })
    );
    const trend = aerobicEfficiencyTrend(after, before)!;
    assert.ok(trend > 10, `tendance ${trend}`);
  });

  it("renvoie null si les données cardio sont insuffisantes", () => {
    assert.equal(aerobicEfficiencyTrend([run()], [run()]), null);
  });
});

describe("buildInsights", () => {
  it("ne produit aucune observation sans données", () => {
    assert.deepEqual(buildInsights(input([])), []);
  });

  it("signale une montée de charge dangereuse", () => {
    const runs: ActivityLike[] = [];
    for (let d = 120; d > 7; d -= 3) runs.push(run({ startDate: daysAgo(d), distance: 4000 }));
    for (let d = 6; d >= 0; d--) runs.push(run({ startDate: daysAgo(d), distance: 22000 }));

    const ids = buildInsights(input(runs)).map((i) => i.id);
    assert.ok(
      ids.includes("acwr-danger") || ids.includes("volume-jump"),
      `observations obtenues : ${ids.join(", ")}`
    );
  });

  it("signale une coupure prolongée", () => {
    const runs = [
      run({ startDate: daysAgo(27) }),
      run({ startDate: daysAgo(26) }),
      run({ startDate: daysAgo(2) }),
    ];
    const found = buildInsights(input(runs)).find((i) => i.id === "gap");
    assert.ok(found, "la coupure de 24 jours doit être signalée");
    assert.ok(found!.evidenceParams && Number(found!.evidenceParams.days) >= 10);
  });

  it("signale un excès d'intensité", () => {
    // 8 séances toutes au-dessus de 76 % de FCmax (144 bpm)
    const runs = Array.from({ length: 8 }, (_, i) =>
      run({ startDate: daysAgo(i * 3), averageHr: 168 })
    );
    const ids = buildInsights(input(runs)).map((i) => i.id);
    assert.ok(ids.includes("too-hard"), `obtenu : ${ids.join(", ")}`);
  });

  it("signale l'absence totale d'intensité", () => {
    const runs = Array.from({ length: 10 }, (_, i) =>
      run({ startDate: daysAgo(i * 2), averageHr: 128 })
    );
    const ids = buildInsights(input(runs)).map((i) => i.id);
    assert.ok(ids.includes("no-intensity"), `obtenu : ${ids.join(", ")}`);
  });

  it("chaque observation porte une preuve chiffrée non vide", () => {
    const runs = Array.from({ length: 12 }, (_, i) =>
      run({ startDate: daysAgo(i * 2), averageHr: 165 })
    );
    const list = buildInsights(input(runs));
    assert.ok(list.length > 0);
    for (const i of list) {
      assert.ok(i.evidenceKey.trim().length > 0, `${i.id} sans preuve`);
      assert.ok(i.titleKey.trim().length > 0);
      assert.ok(i.detailKey.trim().length > 0);
    }
  });

  it("n'émet pas d'alerte de charge tant que l'historique est insuffisant", () => {
    const runs = Array.from({ length: 6 }, (_, i) =>
      run({ startDate: daysAgo(i), distance: 20000 })
    );
    const ids = buildInsights(input(runs)).map((i) => i.id);
    assert.ok(
      !ids.includes("acwr-danger") && !ids.includes("acwr-caution"),
      `ne doit pas alerter sur 6 jours d'historique : ${ids.join(", ")}`
    );
  });

  it("n'annonce pas de « records battus » quand l'historique est trop court", () => {
    // 2 mois de données : tous les records sont des premières, pas des records
    // battus. Le dire serait flatteur mais faux.
    const runs = Array.from({ length: 20 }, (_, i) =>
      run({ startDate: daysAgo(i * 3), distance: 5000, movingTime: 1500 })
    );
    const ids = buildInsights(input(runs)).map((i) => i.id);
    assert.ok(
      !ids.includes("recent-pr"),
      `ne doit pas revendiquer de records : ${ids.join(", ")}`
    );
  });

  it("annonce un record récent lorsque l'historique est suffisant", () => {
    const runs: ActivityLike[] = [];
    for (let d = 240; d > 40; d -= 5) {
      runs.push(run({ startDate: daysAgo(d), distance: 5000, movingTime: 1900 }));
    }
    runs.push(run({ startDate: daysAgo(5), distance: 5000, movingTime: 1400 }));

    // Un effort chronométré récent : c'est ce qui autorise à parler de record
    const ids = buildInsights(
      input(runs, { efforts: [effort("5K", 5000, 1400, 5)] })
    ).map((i) => i.id);
    assert.ok(ids.includes("recent-pr"), `obtenu : ${ids.join(", ")}`);
  });

  it("ne revendique pas de record sur une performance seulement estimée", () => {
    // Même scénario mais sans effort chronométré : le record est déduit d'une
    // activité entière, ce n'est pas une preuve de performance maximale.
    const runs: ActivityLike[] = [];
    for (let d = 240; d > 40; d -= 5) {
      runs.push(run({ startDate: daysAgo(d), distance: 5000, movingTime: 1900 }));
    }
    runs.push(run({ startDate: daysAgo(5), distance: 5000, movingTime: 1400 }));

    const ids = buildInsights(input(runs)).map((i) => i.id);
    assert.ok(!ids.includes("recent-pr"), `obtenu : ${ids.join(", ")}`);
  });

  it("produit des identifiants uniques", () => {
    const runs = Array.from({ length: 14 }, (_, i) =>
      run({ startDate: daysAgo(i * 2), averageHr: 150 + (i % 3) * 12 })
    );
    const ids = buildInsights(input(runs)).map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("buildInsights — intensité au temps passé", () => {
  it("utilise la répartition fournie plutôt que la FC moyenne", async () => {
    const { buildInsights } = await import("../src/lib/insights.ts");
    const base = { runs: [], load: [], profile: { vdot: 0, vma: 0, source: null } as never, records: [], weeklyGoalKm: 40, maxHr: 190 };
    const hard = buildInsights({ ...base, intensity: { easyPct: 55, verdict: "tooMuchMid" } });
    assert.ok(hard.some((i) => i.id === "too-hard" && i.evidenceKey.endsWith("evidenceTime")));
    const thin = buildInsights({ ...base, intensity: { easyPct: 40, verdict: "thin" } });
    assert.ok(!thin.some((i) => i.id === "too-hard"));
  });
});
