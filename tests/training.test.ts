import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assessFeasibility,
  autoDays,
  buildBlueprint,
  composeWeek,
  currentFitness,
  DEFAULT_RAMP,
  daysForWeek,
  daysSchedule,
  FOCUS_PRESETS,
  intensityBalance,
  MAX_STEP_KM,
  planAdaptation,
  reachablePeak,
  startFromPriorWeeks,
  suggestDaysPerWeek,
  volumeTargetFor,
  weekCompliance,
  weekLayout,
  weeklyVolumes,
  weeksToReach,
  type CurrentFitness,
} from "../src/lib/training.ts";
import { buildWorkout, isQuality, paceSet } from "../src/lib/workouts.ts";
import { startOfWeek, type ActivityLike } from "../src/lib/stats.ts";

const MONDAY = startOfWeek(new Date("2025-03-10T12:00:00Z"));

const daysAgo = (n: number, from = new Date("2025-03-12T12:00:00Z")) => {
  const d = new Date(from);
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
    totalElevation: 30,
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

const fitness = (over: Partial<CurrentFitness> = {}): CurrentFitness => ({
  weeklyKm: 35,
  weeklyKm4w: 34,
  longestRunKm: 16,
  sessionsPerWeek: 4,
  consistency: 100,
  avgPace: 330,
  weeklyHistory: [33, 36, 35, 34, 37, 35],
  thin: false,
  ...over,
});

// ---------------------------------------------------------------- Volumes

describe("weeklyVolumes", () => {
  it("démarre exactement au volume actuel, sans saut", () => {
    const weeks = weeklyVolumes({
      startKm: 35,
      targetPeakKm: 90,
      weeks: 12,
      startMonday: MONDAY,
    });
    assert.equal(weeks[0].km, 35);
  });

  it("ne dépasse jamais la progression autorisée entre deux semaines de charge", () => {
    const weeks = weeklyVolumes({
      startKm: 35,
      targetPeakKm: 200,
      weeks: 30,
      startMonday: MONDAY,
      rampPct: DEFAULT_RAMP,
    });

    let lastBuild = weeks[0].km;
    for (const w of weeks.slice(1)) {
      if (w.phase === "deload") continue;
      // +0.15 : les volumes sont arrondis au dixième, l'écart d'arrondi reste borné
      const maxAllowed = Math.min(lastBuild * (1 + DEFAULT_RAMP), lastBuild + MAX_STEP_KM);
      assert.ok(
        w.km <= maxAllowed + 0.15,
        `semaine ${w.weekNumber} : ${w.km} km alors que le plafond est ${maxAllowed.toFixed(1)}`
      );
      lastBuild = w.km;
    }
  });

  it("place une semaine de décharge toutes les 4 semaines", () => {
    const weeks = weeklyVolumes({
      startKm: 40,
      targetPeakKm: 80,
      weeks: 12,
      startMonday: MONDAY,
    });
    assert.equal(weeks[3].phase, "deload");
    assert.equal(weeks[7].phase, "deload");
    assert.ok(weeks[3].km < weeks[2].km);
  });

  it("respecte le plafond personnel", () => {
    const weeks = weeklyVolumes({
      startKm: 40,
      targetPeakKm: 120,
      weeks: 30,
      startMonday: MONDAY,
      ceilingKm: 55,
    });
    assert.ok(Math.max(...weeks.map((w) => w.km)) <= 55.01);
  });

  it("redescend à l'affûtage depuis le pic atteint", () => {
    const weeks = weeklyVolumes({
      startKm: 40,
      targetPeakKm: 70,
      weeks: 16,
      startMonday: MONDAY,
      taperWeeks: 3,
    });
    const peak = Math.max(...weeks.map((w) => w.km));
    const last = weeks[weeks.length - 1];
    assert.equal(last.phase, "race");
    assert.ok(last.km < peak * 0.5, "la semaine de course doit être allégée");
  });
});

describe("reachablePeak / weeksToReach", () => {
  it("croît avec le temps disponible", () => {
    assert.ok(reachablePeak(35, 8) < reachablePeak(35, 20));
  });

  it("indique un nombre de semaines cohérent avec la progression", () => {
    const weeks = weeksToReach(35, 70);
    assert.ok(weeks >= 10 && weeks <= 26, `attendu 10-26 semaines, obtenu ${weeks}`);
  });

  it("renvoie 1 quand la cible est déjà atteinte", () => {
    assert.equal(weeksToReach(50, 40), 1);
  });
});

// ---------------------------------------------------------------- Faisabilité

describe("assessFeasibility", () => {
  const now = new Date("2025-01-06T00:00:00Z");

  it("un 100 km dans un an depuis 35 km/sem reste réaliste", () => {
    const f = assessFeasibility({
      raceKm: 100,
      raceDate: new Date("2026-01-04T00:00:00Z"),
      fitness: fitness(),
      now,
    });
    assert.ok(["comfortable", "realistic"].includes(f.level), `niveau obtenu : ${f.level}`);
    assert.ok(f.ratio >= 1);
  });

  it("le même 100 km dans trois mois ne l'est plus", () => {
    const f = assessFeasibility({
      raceKm: 100,
      raceDate: new Date("2025-04-06T00:00:00Z"),
      fitness: fitness(),
      now,
    });
    assert.ok(["hard", "unreachable"].includes(f.level), `niveau obtenu : ${f.level}`);
    assert.ok(f.comfortableDate instanceof Date);
    assert.ok(f.reachablePeakKm < f.requiredPeakKm);
  });

  it("donne des faits chiffrés, pas des jugements", () => {
    const f = assessFeasibility({
      raceKm: 42.2,
      raceDate: new Date("2025-09-07T00:00:00Z"),
      fitness: fitness(),
      now,
    });
    assert.ok(f.facts.length >= 2);
    for (const fact of f.facts) {
      assert.match(fact, /\d/, "chaque ligne doit contenir un chiffre");
      assert.doesNotMatch(fact, /impossible|irréaliste|fou|jamais/i);
    }
  });

  it("augmente le volume de référence avec la distance", () => {
    assert.ok(volumeTargetFor(5).min < volumeTargetFor(42.2).min);
    assert.ok(volumeTargetFor(42.2).min < volumeTargetFor(100).min);
    assert.equal(volumeTargetFor(21.1).longRun, 22);
  });
});

// ---------------------------------------------------------------- Semaine

describe("weekLayout", () => {
  it("respecte le nombre de jours demandé", () => {
    for (let d = 3; d <= 6; d++) {
      const roles = weekLayout(d, 6, 2);
      assert.equal(roles.filter((r) => r !== "rest").length, d);
    }
  });

  it("place la sortie longue le jour demandé", () => {
    const roles = weekLayout(4, 5, 1);
    assert.equal(roles[5], "long");
  });

  it("n'enchaîne jamais deux séances de qualité", () => {
    const roles = weekLayout(6, 6, 2);
    for (let i = 0; i < 6; i++) {
      if (roles[i] === "quality") assert.notEqual(roles[i + 1], "quality");
    }
  });
});

describe("composeWeek", () => {
  const paces = paceSet(45);

  it("répartit le volume hebdomadaire sur les séances", () => {
    const sessions = composeWeek({
      week: { weekNumber: 5, weekStart: MONDAY, phase: "build", km: 50, buildKm: 50 },
      paces,
      daysPerWeek: 5,
      longRunDay: 6,
      focus: FOCUS_PRESETS.base,
    });
    const total = sessions.reduce((a, s) => a + s.km, 0);
    assert.ok(Math.abs(total - 50) < 3, `volume réparti : ${total}`);
  });

  it("supprime toute intensité quand l'adaptation l'impose", () => {
    const sessions = composeWeek({
      week: { weekNumber: 5, weekStart: MONDAY, phase: "build", km: 50, buildKm: 50 },
      paces,
      daysPerWeek: 5,
      longRunDay: 6,
      focus: FOCUS_PRESETS.speed,
      adaptation: {
        volumeFactor: 0.7,
        qualityCap: 0,
        dropIntensity: true,
        holdProgression: true,
        crossTrain: false,
        daysOverride: null,
        tone: "ease",
        reasons: ["douleur"],
        headline: "−30 %",
      },
    });
    assert.equal(sessions.filter((s) => isQuality(s.kind)).length, 0);
  });

  it("limite la sortie longue au plafond de progression", () => {
    const sessions = composeWeek({
      week: { weekNumber: 9, weekStart: MONDAY, phase: "peak", km: 80, buildKm: 80 },
      paces,
      daysPerWeek: 5,
      longRunDay: 6,
      focus: FOCUS_PRESETS.endurance,
      longRunCapKm: 20,
    });
    const long = sessions.find((s) => s.kind === "long");
    assert.ok(long);
    assert.ok(long.km <= 20.01, `sortie longue : ${long.km} km`);
  });
});

// ---------------------------------------------------------------- Adaptation

describe("planAdaptation", () => {
  const base = { fatigue: 3, motivation: 3, sleep: 3, painLevel: 0 };

  it("ne change rien quand tout va bien", () => {
    const a = planAdaptation({ checkin: { ...base }, compliance: 0.95 });
    assert.equal(a.volumeFactor, 1);
    assert.equal(a.reasons.length, 0);
  });

  it("coupe l'intensité et le volume sur douleur marquée", () => {
    const a = planAdaptation({ checkin: { ...base, painLevel: 2, painArea: "genou" } });
    assert.ok(a.volumeFactor <= 0.7);
    assert.equal(a.dropIntensity, true);
    assert.equal(a.qualityCap, 0);
    assert.match(a.reasons[0], /genou/);
  });

  it("bascule sur du cross-training si la douleur empêche de courir", () => {
    const a = planAdaptation({ checkin: { ...base, painLevel: 3 } });
    assert.equal(a.crossTrain, true);
    assert.equal(a.tone, "stop");
    assert.ok(a.volumeFactor < 0.5);
  });

  it("gèle la progression quand la semaine n'a pas été suivie", () => {
    const a = planAdaptation({ checkin: { ...base }, compliance: 0.5 });
    assert.equal(a.holdProgression, true);
    assert.ok(a.volumeFactor < 1);
  });

  it("autorise un peu plus quand tout est bouclé et que le ressenti est bon", () => {
    const a = planAdaptation({
      checkin: { ...base, fatigue: 2, motivation: 5 },
      compliance: 1,
    });
    assert.ok(a.volumeFactor > 1);
    assert.equal(a.tone, "push");
  });

  it("réagit à une charge aiguë excessive", () => {
    const a = planAdaptation({ checkin: { ...base }, compliance: 0.95, acwr: 1.7 });
    assert.ok(a.volumeFactor < 1);
    assert.match(a.reasons.join(" "), /charge aiguë/i);
  });

  it("redistribue la semaine sur les jours réellement disponibles", () => {
    const a = planAdaptation({ checkin: { ...base, availableDays: 3 } });
    assert.equal(a.daysOverride, 3);
  });
});

// ---------------------------------------------------------------- Blueprint

describe("buildBlueprint", () => {
  it("ne propose jamais un bond de volume le premier jour du plan", () => {
    const bp = buildBlueprint({
      mode: "race",
      focus: "endurance",
      startMonday: MONDAY,
      weeks: 52,
      startWeeklyKm: 35,
      targetPeakKm: 80,
      daysPerWeek: 4,
      longRunDay: 6,
      vdot: 45,
      raceKm: 100,
      currentLongRunKm: 16,
    });

    assert.ok(bp.weeks[0].km <= 36, `première semaine : ${bp.weeks[0].km} km`);
    assert.ok(bp.weeks[0].km >= 34);
    // Le pic n'arrive pas au début du plan
    const peakWeek = bp.weeks.find((w) => w.km === bp.peakKm)!;
    assert.ok(peakWeek.weekNumber > bp.weeks.length * 0.6);
  });

  it("fait progresser la sortie longue graduellement", () => {
    const bp = buildBlueprint({
      mode: "race",
      focus: "endurance",
      startMonday: MONDAY,
      weeks: 24,
      startWeeklyKm: 40,
      targetPeakKm: 75,
      daysPerWeek: 5,
      longRunDay: 6,
      vdot: 45,
      raceKm: 42.2,
      currentLongRunKm: 14,
    });

    const longs = bp.sessions.filter((s) => s.kind === "long").map((s) => s.km);
    assert.ok(longs[0] <= 16, `première sortie longue : ${longs[0]} km`);
    assert.ok(bp.longRunPeakKm <= 32.01);
    assert.ok(bp.longRunPeakKm > longs[0]);
  });

  it("génère des séances tous les jours prévus, sans plus", () => {
    const bp = buildBlueprint({
      mode: "open",
      focus: "speed",
      startMonday: MONDAY,
      weeks: 8,
      startWeeklyKm: 40,
      targetPeakKm: 50,
      daysPerWeek: 4,
      longRunDay: 6,
      strengthPerWeek: 0,
      vdot: 50,
    });
    const week1 = bp.sessions.filter((s) => s.weekNumber === 1 && s.km > 0);
    assert.equal(week1.length, 4);
  });

  it("garde un plan libre dans un couloir de volume raisonnable", () => {
    const bp = buildBlueprint({
      mode: "open",
      focus: "maintain",
      startMonday: MONDAY,
      weeks: 12,
      startWeeklyKm: 40,
      targetPeakKm: 999,
      daysPerWeek: 4,
      longRunDay: 6,
      vdot: 45,
    });
    assert.ok(bp.peakKm <= 40 * FOCUS_PRESETS.maintain.ceilingFactor + 0.1);
  });
});

// ---------------------------------------------------------------- Divers

describe("currentFitness", () => {
  it("ignore les semaines vides pour établir le volume de référence", () => {
    const now = new Date("2025-03-12T12:00:00Z");
    const runs: ActivityLike[] = [];
    // 4 semaines pleines à 40 km, une semaine blanche au milieu
    const monday = startOfWeek(now);
    for (let w = 1; w <= 5; w++) {
      if (w === 3) continue;
      for (let i = 0; i < 4; i++) {
        const d = new Date(monday);
        d.setDate(d.getDate() - 7 * w + i);
        d.setHours(12, 0, 0, 0);
        runs.push(run({ startDate: d, distance: 10000 }));
      }
    }
    const f = currentFitness(runs, now);
    assert.ok(f.weeklyKm >= 35, `volume de référence : ${f.weeklyKm}`);
  });

  it("signale un historique trop mince", () => {
    const f = currentFitness([run()], new Date("2025-03-12T12:00:00Z"));
    assert.equal(f.thin, true);
  });
});

describe("weekCompliance", () => {
  it("compare le réalisé au planifié sans compter le renfo", () => {
    const c = weekCompliance(
      [
        { distanceKm: 10, status: "done", kind: "easy" },
        { distanceKm: 15, status: "planned", kind: "long" },
        { distanceKm: 0, status: "done", kind: "strength" },
      ],
      20
    );
    assert.equal(c.plannedKm, 25);
    assert.equal(c.sessionsPlanned, 2);
    assert.equal(c.ratio, 0.8);
  });
});

describe("intensityBalance", () => {
  it("détecte un excès d'intensité", () => {
    const b = intensityBalance([
      { distanceKm: 10, kind: "intervals" },
      { distanceKm: 10, kind: "threshold" },
      { distanceKm: 10, kind: "easy" },
    ]);
    assert.equal(b.verdict, "Trop d'intensité");
  });

  it("valide une répartition polarisée", () => {
    const b = intensityBalance([
      { distanceKm: 10, kind: "threshold" },
      { distanceKm: 40, kind: "easy" },
      { distanceKm: 20, kind: "long" },
    ]);
    assert.equal(b.verdict, "Équilibré");
    assert.ok(b.easyPct >= 80);
  });
});

describe("buildWorkout", () => {
  const paces = paceSet(45);

  it("produit une structure détaillée pour une séance de seuil", () => {
    const w = buildWorkout("threshold", { km: 12, paces, phase: "build", weekNumber: 1 });
    assert.ok(w.steps.length >= 3);
    assert.ok(w.steps.some((s) => s.kind === "warmup"));
    assert.ok(w.steps.some((s) => s.kind === "work"));
    assert.equal(w.intensity, 4);
    assert.ok(w.paceTarget && w.paceTarget < paces.easy);
  });

  it("fait varier la séance d'une semaine à l'autre", () => {
    const a = buildWorkout("intervals", { km: 10, paces, phase: "peak", weekNumber: 1 });
    const b = buildWorkout("intervals", { km: 10, paces, phase: "peak", weekNumber: 2 });
    assert.notEqual(a.title, b.title);
  });

  it("estime une durée cohérente avec la distance", () => {
    const w = buildWorkout("easy", { km: 10, paces, phase: "base", weekNumber: 2 });
    assert.ok(w.minutes > 40 && w.minutes < 80, `durée estimée : ${w.minutes} min`);
  });

  it("fournit des allures même sans VDOT", () => {
    const p = paceSet(0, 360);
    assert.equal(p.derived, false);
    assert.ok(p.threshold < p.easy);
    assert.ok(p.interval < p.threshold);
  });
});

// ---------------------------------------------------------------- Jours auto

describe("autoDays", () => {
  it("garde la sortie moyenne dans une fourchette utile", () => {
    for (const km of [12, 20, 35, 55, 80, 110]) {
      const d = autoDays(km);
      const avg = km / d;
      assert.ok(d >= 3 && d <= 6, `${km} km → ${d} jours`);
      assert.ok(avg >= 4 && avg <= 20, `${km} km sur ${d} jours = ${avg.toFixed(1)} km/sortie`);
    }
  });

  it("ne fait jamais reculer le nombre de sorties quand le volume monte", () => {
    let prev = 0;
    for (let km = 10; km <= 120; km += 5) {
      const d = autoDays(km);
      assert.ok(d >= prev);
      prev = d;
    }
  });
});

describe("suggestDaysPerWeek", () => {
  it("ne saute pas de 3 à 6 sorties d'un coup", () => {
    const d = suggestDaysPerWeek({ weeklyKm: 70, sessionsPerWeek: 3 });
    assert.equal(d, 4);
  });

  it("suit le volume quand l'historique est absent", () => {
    assert.equal(suggestDaysPerWeek({ weeklyKm: 60, sessionsPerWeek: 0 }), autoDays(60));
  });

  it("n'impose pas moins de 3 sorties", () => {
    assert.ok(suggestDaysPerWeek({ weeklyKm: 12, sessionsPerWeek: 1 }) >= 3);
  });
});

describe("daysSchedule", () => {
  it("annonce des paliers croissants, sans faux palier de décharge", () => {
    const weeks = [
      { weekNumber: 1, km: 30 },
      { weekNumber: 2, km: 33 },
      { weekNumber: 3, km: 36 },
      { weekNumber: 4, km: 26 }, // décharge
      { weekNumber: 5, km: 48 },
      { weekNumber: 6, km: 52 },
    ];
    const steps = daysSchedule(weeks, 4);
    assert.ok(steps.length >= 1);
    for (let i = 1; i < steps.length; i++) {
      assert.ok(steps[i].days > steps[i - 1].days);
      assert.ok(steps[i].fromWeek > steps[i - 1].fromWeek);
    }
  });

  it("plafonne la hausse à +2 sorties", () => {
    assert.equal(daysForWeek(200, 3), 5);
  });
});

// ---------------------------------------------------------------- Charge déclarée

describe("startFromPriorWeeks", () => {
  it("prend la médiane des semaines actives", () => {
    assert.equal(startFromPriorWeeks([40, 42, 38, 40]), 40);
  });

  it("ignore les semaines blanches", () => {
    const v = startFromPriorWeeks([0, 40, 42, 41]);
    assert.ok(v !== null && v >= 40);
  });

  it("ne repart pas du volume d'avant une coupure", () => {
    // Retour à 15 km après 3 semaines à 50 : on repart d'à peine plus de 15.
    const v = startFromPriorWeeks([50, 50, 50, 15])!;
    assert.ok(v <= 18, `point de départ ${v}`);
  });

  it("renvoie null si rien n'est déclaré", () => {
    assert.equal(startFromPriorWeeks([0, 0, 0, 0]), null);
  });
});

// ---------------------------------------------------------------- Semaine de course

describe("semaine de course", () => {
  const monday = startOfWeek(new Date("2025-03-10T12:00:00Z"));
  const raceDate = new Date(monday);
  raceDate.setDate(raceDate.getDate() + 6); // dimanche

  function raceWeek(raceKm: number, weekKm = 30) {
    return composeWeek({
      week: { weekNumber: 12, weekStart: monday, phase: "race", km: weekKm, buildKm: weekKm },
      paces: paceSet(45),
      daysPerWeek: 5,
      longRunDay: 6,
      focus: FOCUS_PRESETS.endurance,
      raceKm,
      raceDate,
      racePace: 300,
      raceName: "Test",
    });
  }

  it("place la course le jour J avec sa distance", () => {
    const sessions = raceWeek(42.195);
    const race = sessions.find((s) => s.kind === "race");
    assert.ok(race, "la séance de course doit exister");
    assert.equal(race.date.getDay(), 0); // dimanche
    assert.ok(Math.abs(race.km - 42.2) < 0.1);
  });

  it("compte les kilomètres de la course dans la semaine", () => {
    const total = raceWeek(42.195).reduce((a, s) => a + s.km, 0);
    assert.ok(total >= 42.2, `volume de la semaine : ${total}`);
  });

  it("n'ajoute aucune intensité ni sortie longue avant la course", () => {
    const sessions = raceWeek(21.1);
    for (const s of sessions) {
      if (s.kind === "race") continue;
      assert.ok(!isQuality(s.kind), `séance de qualité trouvée : ${s.kind}`);
      assert.ok(s.km <= 8.01, `séance trop longue avant la course : ${s.km} km`);
    }
  });

  it("transmet l'allure cible à la séance de course", () => {
    const race = raceWeek(42.195).find((s) => s.kind === "race")!;
    assert.equal(race.paceTarget, 300);
    assert.ok(race.steps.length >= 3, "le jour J doit être découpé en segments");
    assert.match(race.title, /Test/);
  });

  it("gère une course un jour de semaine", () => {
    const wed = new Date(monday);
    wed.setDate(wed.getDate() + 2);
    const sessions = composeWeek({
      week: { weekNumber: 8, weekStart: monday, phase: "race", km: 25, buildKm: 25 },
      paces: paceSet(45),
      daysPerWeek: 5,
      longRunDay: 6,
      focus: FOCUS_PRESETS.base,
      raceKm: 10,
      raceDate: wed,
    });
    const race = sessions.find((s) => s.kind === "race")!;
    assert.equal(race.date.getDay(), 3); // mercredi
    assert.ok(sessions.every((s) => s.date >= monday));
  });

  it("intègre la course dans le blueprint complet", () => {
    const start = startOfWeek(new Date("2025-01-06T12:00:00Z"));
    const race = new Date(start);
    race.setDate(race.getDate() + 7 * 11 + 6);
    const bp = buildBlueprint({
      mode: "race",
      focus: "endurance",
      startMonday: start,
      weeks: 12,
      startWeeklyKm: 40,
      targetPeakKm: 70,
      daysPerWeek: 0,
      longRunDay: 6,
      vdot: 45,
      raceKm: 21.1,
      raceDate: race,
      currentLongRunKm: 14,
    });
    const races = bp.sessions.filter((s) => s.kind === "race");
    assert.equal(races.length, 1);
    assert.equal(races[0].date.getTime(), race.getTime());
    // Le pic annoncé ne doit pas être la semaine de course.
    const raceWeekKm = bp.weeks[bp.weeks.length - 1].km;
    assert.ok(bp.peakKm <= raceWeekKm + 40);
  });
});
