/**
 * Score de préparation quotidien — « dans quel état j'aborde la journée ? »
 *
 * Un score 0-100 construit par pénalités successives : on part de 100 et le
 * sommeil, la fatigue, le moral et la douleur retirent des points. Le modèle
 * est volontairement simple et transparent : chaque retrait est expliqué dans
 * `breakdown`, pour que le chiffre se défende tout seul.
 *
 * Les seuils sont des ordres de grandeur de terrain (un sommeil sous 6 h
 * pèse plus qu'une gêne musculaire), pas des constantes physiologiques —
 * ils sont documentés ici pour pouvoir être discutés et ajustés.
 */

import { round } from "./stats";

export type DailyLogInput = {
  sleepHours?: number | null;
  /** 1 = très mauvais … 5 = excellent */
  sleepQuality?: number | null;
  /** ms */
  hrv?: number | null;
  /** bpm au réveil */
  restHr?: number | null;
  weightKg?: number | null;
  /** 1-10, ressenti général du jour */
  rpe?: number | null;
  /** 1 = frais … 5 = vidé */
  fatigue?: number | null;
  /** 1 = très mauvais … 5 = excellent */
  mood?: number | null;
  /** 0 = rien, 1 = gêne, 2 = douleur qui gêne, 3 = empêche */
  painLevel?: number;
};

export type ReadinessZone = "ready" | "solid" | "fragile" | "recover";

/** Libellés de préparation — clés i18n `common.readiness.*`. */
export const READINESS_LABEL: Record<ReadinessZone, string> = {
  ready: "common.readiness.ready",
  solid: "common.readiness.solid",
  fragile: "common.readiness.fragile",
  recover: "common.readiness.recover",
};

export const READINESS_COLOR: Record<ReadinessZone, string> = {
  ready: "rgb(var(--sage))",
  solid: "rgb(var(--clay))",
  fragile: "rgb(var(--ochre))",
  recover: "rgb(var(--rust))",
};

export type Readiness = {
  score: number;
  zone: ReadinessZone;
  /** Facteurs qui pèsent sur le score, en clair */
  breakdown: string[];
};

/** Pénalités de douleur par niveau (0-3). */
const PAIN_PENALTY = [0, 8, 16, 30];

export function readinessScore(log: DailyLogInput): Readiness {
  let score = 100;
  const breakdown: string[] = [];

  if (log.sleepHours != null) {
    if (log.sleepHours >= 8) breakdown.push("sommeil complet");
    else if (log.sleepHours >= 7) score -= 5;
    else if (log.sleepHours >= 6) {
      score -= 15;
      breakdown.push("sommeil court");
    } else {
      score -= 28;
      breakdown.push("sommeil très court");
    }
  }

  if (log.sleepQuality != null && log.sleepQuality <= 2) {
    score -= 8;
    breakdown.push("sommeil agité");
  }

  if (log.fatigue != null && log.fatigue >= 4) {
    score -= log.fatigue >= 5 ? 20 : 12;
    breakdown.push(log.fatigue >= 5 ? "fatigue maximale" : "fatigue marquée");
  }

  if (log.mood != null && log.mood <= 2) {
    score -= 6;
    breakdown.push("moral bas");
  }

  const pain = PAIN_PENALTY[Math.max(0, Math.min(3, log.painLevel ?? 0))];
  if (pain > 0) {
    score -= pain;
    breakdown.push("douleur");
  }

  if (log.rpe != null && log.rpe >= 8) {
    score -= 6;
    breakdown.push("journée éprouvante");
  }

  score = Math.max(0, Math.min(100, score));
  const zone: ReadinessZone =
    score >= 80 ? "ready" : score >= 65 ? "solid" : score >= 50 ? "fragile" : "recover";

  return { score, zone, breakdown };
}

export type ReadinessPoint = {
  date: Date;
  score: number;
  zone: ReadinessZone;
  sleepHours: number | null;
};

/** Série des scores sur les derniers jours renseignés (ordre chronologique). */
export function readinessSeries(
  logs: Array<DailyLogInput & { date: Date }>,
  days = 14
): ReadinessPoint[] {
  const cutoff = Date.now() - days * 86400000;
  return logs
    .filter((l) => l.date.getTime() >= cutoff)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((l) => {
      const r = readinessScore(l);
      return { date: l.date, score: r.score, zone: r.zone, sleepHours: l.sleepHours ?? null };
    });
}

/** Moyenne de sommeil sur la série (null si aucune donnée). */
export function averageSleep(
  logs: Array<DailyLogInput & { date: Date }>,
  days = 7
): number | null {
  const recent = logs.filter((l) => l.date.getTime() >= Date.now() - days * 86400000);
  const hours = recent.filter((l) => l.sleepHours != null).map((l) => l.sleepHours!);
  if (hours.length === 0) return null;
  return round(hours.reduce((a, b) => a + b, 0) / hours.length, 1);
}

/**
 * Corrélation linéaire de Pearson entre deux séries alignées par jour.
 * Renvoie null si moins de 4 points ou si l'une des séries est constante.
 */
export function correlation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 4) return null;
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  if (dx === 0 || dy === 0) return null;
  return round(num / Math.sqrt(dx * dy), 2);
}
