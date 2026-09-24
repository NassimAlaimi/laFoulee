/**
 * Moteur d'observations automatiques.
 *
 * Chaque règle produit une observation seulement si elle est réellement
 * étayée par les données : pas de message générique, pas de conseil affiché
 * « au cas où ». Chaque observation porte la mesure qui la justifie, pour que
 * tu puisses la vérifier toi-même.
 *
 * Les textes sont des clés i18n (`home.insights.*`) — la lib ne contient
 * aucune chaîne affichable : seulement la logique et ses paramètres.
 */

import { pacePerKm, speedToPace } from "./format";
import type { ActivityLike, LoadPoint } from "./stats";
import { daysBetween, round, trainingLoad } from "./stats";
import type { FitnessProfile, PersonalRecord } from "./records";

export type InsightTone = "good" | "warn" | "risk" | "neutral";

export type Insight = {
  id: string;
  tone: InsightTone;
  /** Clé i18n du titre — `home.insights.<id>.title` par convention */
  titleKey: string;
  titleParams?: Record<string, string | number>;
  detailKey: string;
  /** Mesure chiffrée qui justifie l'observation */
  evidenceKey: string;
  evidenceParams?: Record<string, string | number>;
};

export type InsightInput = {
  runs: ActivityLike[];
  load: LoadPoint[];
  profile: FitnessProfile;
  records: PersonalRecord[];
  weeklyGoalKm: number;
  maxHr: number;
  now?: Date;
};

export function buildInsights(input: InsightInput): Insight[] {
  const now = input.now ?? new Date();
  const { runs, load, profile } = input;

  const out: Insight[] = [];
  const within = (d: number) => runs.filter((r) => daysBetween(r.startDate, now) <= d);
  const between = (a: number, b: number) =>
    runs.filter((r) => {
      const d = daysBetween(r.startDate, now);
      return d > a && d <= b;
    });

  const last7 = within(7);
  const prev7 = between(7, 14);
  const last28 = within(28);
  const prev28 = between(28, 56);

  const km = (list: ActivityLike[]) =>
    list.reduce((a, r) => a + r.distance, 0) / 1000;

  // ---------------------------------------------------------------- Charge
  const current = load[load.length - 1];
  if (current?.ready) {
    if (current.zone === "danger") {
      out.push({
        id: "acwr-danger",
        tone: "risk",
        titleKey: "insights.acwr-danger.title",
        detailKey: "insights.acwr-danger.detail",
        evidenceKey: "insights.acwr-danger.evidence",
        evidenceParams: { ratio: current.ratio.toFixed(2) },
      });
    } else if (current.zone === "caution") {
      out.push({
        id: "acwr-caution",
        tone: "warn",
        titleKey: "insights.acwr-caution.title",
        detailKey: "insights.acwr-caution.detail",
        evidenceKey: "insights.acwr-caution.evidence",
        evidenceParams: { ratio: current.ratio.toFixed(2) },
      });
    } else if (current.zone === "detraining" && last28.length >= 4) {
      out.push({
        id: "acwr-low",
        tone: "neutral",
        titleKey: "insights.acwr-low.title",
        detailKey: "insights.acwr-low.detail",
        evidenceKey: "insights.acwr-low.evidence",
        evidenceParams: { ratio: current.ratio.toFixed(2) },
      });
    }
  }

  // ---------------------------------------------------------------- Volume
  const km7 = km(last7);
  const kmPrev7 = km(prev7);
  if (kmPrev7 > 5 && km7 > kmPrev7 * 1.3) {
    out.push({
      id: "volume-jump",
      tone: "warn",
      titleKey: "insights.volume-jump.title",
      detailKey: "insights.volume-jump.detail",
      evidenceKey: "insights.volume-jump.evidence",
      evidenceParams: {
        prev: String(round(kmPrev7, 1)),
        now: String(round(km7, 1)),
        pct: Math.round(((km7 - kmPrev7) / kmPrev7) * 100),
      },
    });
  }

  // ---------------------------------------------------------------- Régularité
  if (last28.length >= 3) {
    const gaps = longestGap(last28, now);
    if (gaps >= 10) {
      out.push({
        id: "gap",
        tone: "warn",
        titleKey: "insights.gap.title",
        detailKey: "insights.gap.detail",
        evidenceKey: "insights.gap.evidence",
        evidenceParams: { days: gaps },
      });
    }
  }

  // ---------------------------------------------------------------- Intensité
  const withHr = last28.filter((r) => r.averageHr);
  if (withHr.length >= 6) {
    const easyThreshold = input.maxHr * 0.76;
    const easy = withHr.filter((r) => (r.averageHr ?? 0) < easyThreshold);
    const easyShare = easy.length / withHr.length;

    if (easyShare < 0.6) {
      out.push({
        id: "too-hard",
        tone: "warn",
        titleKey: "insights.too-hard.title",
        detailKey: "insights.too-hard.detail",
        evidenceKey: "insights.too-hard.evidence",
        evidenceParams: {
          pct: Math.round(easyShare * 100),
          bpm: Math.round(easyThreshold),
        },
      });
    } else if (easyShare > 0.95 && withHr.length >= 8) {
      out.push({
        id: "no-intensity",
        tone: "neutral",
        titleKey: "insights.no-intensity.title",
        detailKey: "insights.no-intensity.detail",
        evidenceKey: "insights.no-intensity.evidence",
        evidenceParams: { pct: Math.round(easyShare * 100) },
      });
    }
  }

  // ---------------------------------------------------------------- Forme
  if (profile.source && profile.vdot > 0) {
    const age = profile.source.date
      ? daysBetween(profile.source.date, now)
      : null;
    if (age !== null && age > 120) {
      out.push({
        id: "stale-reference",
        tone: "neutral",
        titleKey: "insights.stale-reference.title",
        detailKey: "insights.stale-reference.detail",
        evidenceKey: "insights.stale-reference.evidence",
        evidenceParams: { name: profile.source.name, days: age },
      });
    }
  }

  // ---------------------------------------------------------------- Progression
  const pace28 = avgPace(last28);
  const pacePrev28 = avgPace(prev28);
  if (pace28 && pacePrev28 && last28.length >= 5 && prev28.length >= 5) {
    const delta = pacePrev28 - pace28; // positif = plus rapide
    if (delta > 8) {
      out.push({
        id: "pace-improving",
        tone: "good",
        titleKey: "insights.pace-improving.title",
        detailKey: "insights.pace-improving.detail",
        evidenceKey: "insights.pace-improving.evidence",
        evidenceParams: { s: Math.round(delta) },
      });
    } else if (delta < -12) {
      out.push({
        id: "pace-slower",
        tone: "neutral",
        titleKey: "insights.pace-slower.title",
        detailKey: "insights.pace-slower.detail",
        evidenceKey: "insights.pace-slower.evidence",
        evidenceParams: { s: Math.abs(Math.round(delta)) },
      });
    }
  }

  // ---------------------------------------------------------------- Efficience
  const drift = aerobicEfficiencyTrend(last28, prev28);
  if (drift !== null && Math.abs(drift) >= 3) {
    out.push(
      drift > 0
        ? {
            id: "efficiency-up",
            tone: "good",
            titleKey: "insights.efficiency-up.title",
            detailKey: "insights.efficiency-up.detail",
            evidenceKey: "insights.efficiency-up.evidence",
            evidenceParams: { pct: drift },
          }
        : {
            id: "efficiency-down",
            tone: "warn",
            titleKey: "insights.efficiency-down.title",
            detailKey: "insights.efficiency-down.detail",
            evidenceKey: "insights.efficiency-down.evidence",
            evidenceParams: { pct: drift },
          }
    );
  }

  // ---------------------------------------------------------------- Objectif
  const km28 = km(last28);
  const weeklyAvg = km28 / 4;
  if (input.weeklyGoalKm > 0 && last28.length >= 4) {
    if (weeklyAvg >= input.weeklyGoalKm) {
      out.push({
        id: "goal-met",
        tone: "good",
        titleKey: "insights.goal-met.title",
        detailKey: "insights.goal-met.detail",
        evidenceKey: "insights.goal-met.evidence",
        evidenceParams: {
          avg: String(round(weeklyAvg, 1)),
          goal: String(input.weeklyGoalKm),
        },
      });
    } else if (weeklyAvg < input.weeklyGoalKm * 0.6) {
      out.push({
        id: "goal-far",
        tone: "neutral",
        titleKey: "insights.goal-far.title",
        detailKey: "insights.goal-far.detail",
        evidenceKey: "insights.goal-far.evidence",
        evidenceParams: {
          avg: String(round(weeklyAvg, 1)),
          goal: String(input.weeklyGoalKm),
        },
      });
    }
  }

  // ---------------------------------------------------------------- Records
  /*
   * Piège évité ici : quand l'historique est court, TOUS les records sont
   * forcément récents — ce sont des premières, pas des records battus.
   * Annoncer « 11 records battus ce mois-ci » serait flatteur mais faux.
   * On n'émet donc cette observation qu'avec au moins 4 mois de recul, et
   * uniquement sur les distances de référence.
   */
  const firstRun = runs.length
    ? runs.reduce((min, r) => (r.startDate < min ? r.startDate : min), runs[0].startDate)
    : null;
  const historyDays = firstRun ? daysBetween(firstRun, now) : 0;

  if (historyDays >= 120) {
    const recent = input.records.filter(
      (r) =>
        r.major &&
        !r.estimated &&
        r.date &&
        daysBetween(r.date, now) <= 30
    );
    if (recent.length > 0) {
      out.push({
        id: "recent-pr",
        tone: "good",
        titleKey:
          recent.length > 1
            ? "insights.recent-pr.titlePlural"
            : "insights.recent-pr.title",
        titleParams: recent.length > 1 ? { n: recent.length } : undefined,
        detailKey: "insights.recent-pr.detail",
        evidenceKey: "insights.recent-pr.evidence",
        evidenceParams: { names: recent.map((r) => r.name).join(", ") },
      });
    }
  }

  return out;
}

// ------------------------------------------------------------------ Helpers

function avgPace(list: ActivityLike[]): number | null {
  const distance = list.reduce((a, r) => a + r.distance, 0);
  const time = list.reduce((a, r) => a + r.movingTime, 0);
  if (distance < 1000) return null;
  return pacePerKm(distance, time);
}

/** Plus longue période sans sortie, en jours, sur la fenêtre fournie. */
export function longestGap(list: ActivityLike[], now: Date): number {
  if (!list.length) return 0;
  const dates = [...list]
    .map((r) => r.startDate.getTime())
    .sort((a, b) => a - b);

  let max = 0;
  for (let i = 1; i < dates.length; i++) {
    const gap = Math.round((dates[i] - dates[i - 1]) / 86_400_000);
    if (gap > max) max = gap;
  }
  const sinceLast = Math.round((now.getTime() - dates[dates.length - 1]) / 86_400_000);
  return Math.max(max, sinceLast);
}

/**
 * Variation de l'efficience aérobie (vitesse par battement cardiaque)
 * entre deux périodes, en pourcentage. null si données insuffisantes.
 */
export function aerobicEfficiencyTrend(
  current: ActivityLike[],
  previous: ActivityLike[]
): number | null {
  const eff = (list: ActivityLike[]) => {
    const valid = list.filter(
      (r) => r.averageHr && r.averageSpeed && r.distance > 2000
    );
    if (valid.length < 3) return null;
    const sum = valid.reduce(
      (a, r) => a + (r.averageSpeed! * 60) / r.averageHr!,
      0
    );
    return sum / valid.length;
  };

  const a = eff(current);
  const b = eff(previous);
  if (a === null || b === null || b === 0) return null;
  return round(((a - b) / b) * 100, 1);
}

/** Charge totale d'une liste d'activités — utilisé pour les résumés. */
export function totalLoad(list: ActivityLike[]): number {
  return round(list.reduce((a, r) => a + trainingLoad(r), 0), 0);
}

/** Allure moyenne d'une liste, exposée pour l'affichage. */
export function listAvgPace(list: ActivityLike[]): number | null {
  return avgPace(list);
}

export { speedToPace };
