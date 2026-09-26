/**
 * Modèle forme / fatigue (impulse-response de Banister, 1975).
 *
 * Trois courbes dérivées de la charge quotidienne :
 *
 * - **CTL** (Chronic Training Load) — moyenne mobile exponentielle sur 42
 *   jours. C'est la « condition physique » : elle monte lentement et se perd
 *   lentement.
 * - **ATL** (Acute Training Load) — même chose sur 7 jours. C'est la fatigue :
 *   elle monte vite et se dissipe vite.
 * - **TSB** (Training Stress Balance) = CTL − ATL, la « fraîcheur ». Négative
 *   en période de charge, elle remonte à l'affûtage. C'est le chiffre que
 *   regardent les entraîneurs pour placer un pic de forme.
 *
 * L'intérêt par rapport à l'ACWR : l'ACWR dit si la progression est dangereuse,
 * le TSB dit si on est frais le jour J. Les deux répondent à des questions
 * différentes et se complètent.
 *
 * Le modèle est volontairement calibré sur la charge que l'app sait déjà
 * calculer (`trainingLoad`), pour ne pas introduire une deuxième unité.
 */

import { trainingLoad, type ActivityLike } from "./stats";

export const CTL_DAYS = 42;
export const ATL_DAYS = 7;

export type FormPoint = {
  date: Date;
  label: string;
  /** Charge du jour */
  load: number;
  /** Condition physique (moyenne exponentielle 42 j) */
  ctl: number;
  /** Fatigue (moyenne exponentielle 7 j) */
  atl: number;
  /** Fraîcheur = CTL − ATL */
  tsb: number;
  /** true si le point est une projection issue du plan */
  projected: boolean;
  zone: FormZone;
};

export type FormZone = "fresh" | "optimal" | "neutral" | "productive" | "overreaching";

/**
 * Zones de TSB, exprimées en % de la CTL pour rester valables quel que soit le
 * niveau : +10 de TSB ne veut pas dire la même chose à 30 ou à 90 de CTL.
 */
export function formZone(tsb: number, ctl: number): FormZone {
  const rel = ctl > 5 ? (tsb / ctl) * 100 : tsb;
  if (rel > 25) return "fresh"; // frais mais la condition se perd
  if (rel > 5) return "optimal"; // fenêtre de performance
  if (rel > -10) return "neutral";
  if (rel > -30) return "productive"; // charge qui construit
  return "overreaching"; // surcharge, terrain de blessure
}

/** Libellés de zone de forme — clés i18n `common.formZone.*`. */
export const ZONE_LABEL: Record<FormZone, string> = {
  fresh: "formZone.fresh",
  optimal: "formZone.optimal",
  neutral: "formZone.neutral",
  productive: "formZone.productive",
  overreaching: "formZone.overreaching",
};

export const ZONE_TONE: Record<FormZone, string> = {
  fresh: "text-slate",
  optimal: "text-sage",
  neutral: "text-ink2",
  productive: "text-ochre",
  overreaching: "text-rust",
};

type DailyLoad = Map<string, number>;

const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Charge quotidienne agrégée depuis les activités. */
export function dailyLoad(
  activities: ActivityLike[],
  opts: { maxHr?: number; restHr?: number } = {}
): DailyLoad {
  const map: DailyLoad = new Map();
  for (const a of activities) {
    const k = key(a.startDate);
    map.set(k, (map.get(k) ?? 0) + trainingLoad(a, opts));
  }
  return map;
}

/**
 * Série forme/fatigue sur `days` jours, prolongée par `future` si des séances
 * sont planifiées. La projection utilise la charge estimée des séances à venir :
 * c'est ce qui permet de répondre à « serai-je frais le jour de la course ? »
 * avant la course.
 */
export function formSeries(opts: {
  activities: ActivityLike[];
  days?: number;
  now?: Date;
  /** Séances planifiées à venir : date + charge estimée */
  future?: Array<{ date: Date; load: number }>;
  maxHr?: number;
  restHr?: number;
  /** Langue des étiquettes de dates. */
  locale?: string;
}): FormPoint[] {
  const now = opts.now ?? new Date();
  const days = opts.days ?? 180;

  const loads = dailyLoad(opts.activities, { maxHr: opts.maxHr, restHr: opts.restHr });
  const futureMap: DailyLoad = new Map();
  for (const f of opts.future ?? []) {
    futureMap.set(key(f.date), (futureMap.get(key(f.date)) ?? 0) + f.load);
  }

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // On démarre l'accumulation bien avant la fenêtre affichée pour que la CTL
  // ne parte pas de zéro (sinon les 42 premiers jours sont faux).
  const warmup = CTL_DAYS * 2;
  const start = new Date(today);
  start.setDate(start.getDate() - days - warmup);

  const lastFuture = (opts.future ?? []).reduce(
    (max, f) => (f.date > max ? f.date : max),
    today
  );
  const end = new Date(lastFuture);
  end.setHours(0, 0, 0, 0);

  const kCtl = 1 - Math.exp(-1 / CTL_DAYS);
  const kAtl = 1 - Math.exp(-1 / ATL_DAYS);

  let ctl = 0;
  let atl = 0;
  const out: FormPoint[] = [];

  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const projected = d > today;
    const load = projected ? (futureMap.get(key(d)) ?? 0) : (loads.get(key(d)) ?? 0);

    ctl += (load - ctl) * kCtl;
    atl += (load - atl) * kAtl;
    const tsb = ctl - atl;

    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - days);
    if (d < cutoff) continue;

    out.push({
      date: new Date(d),
      label: d.toLocaleDateString(opts.locale ?? "fr-FR", { day: "2-digit", month: "short" }),
      load: Math.round(load),
      ctl: Math.round(ctl * 10) / 10,
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round(tsb * 10) / 10,
      projected,
      zone: formZone(tsb, ctl),
    });
  }

  return out;
}

/** Charge estimée d'une séance planifiée, dans la même unité que `trainingLoad`. */
export function plannedLoad(session: {
  distanceKm: number;
  durationMin: number | null;
  intensity: number;
  kind: string;
}): number {
  if (session.kind === "rest") return 0;

  // Renfo et cross : la charge n'est pas kilométrique.
  if (session.kind === "strength" || session.kind === "mobility") {
    return (session.durationMin ?? 40) * 0.6;
  }
  if (session.kind === "cross") {
    return (session.durationMin ?? 45) * 0.8;
  }

  // Course : équivalent-km pondéré par l'intensité (1 = récup … 5 = course).
  // Le facteur suit l'échelle de `trainingLoad` (≈ 10 points par km facile).
  const intensityFactor = 0.85 + (session.intensity - 2) * 0.18;
  return session.distanceKm * 10 * Math.max(0.7, intensityFactor);
}

export type FormSummary = {
  ctl: number;
  atl: number;
  tsb: number;
  zone: FormZone;
  /** Variation de CTL sur 28 jours */
  ctlDelta28: number;
  /** Ramp rate : gain de CTL par semaine (au-delà de 7-8, risque accru) */
  rampPerWeek: number;
};

export function formSummary(series: FormPoint[], now = new Date()): FormSummary | null {
  const past = series.filter((p) => !p.projected);
  if (past.length === 0) return null;

  const last = past[past.length - 1];
  const ref = past[Math.max(0, past.length - 29)];
  const delta = last.ctl - ref.ctl;
  const spanDays = Math.max(1, past.length - 1 >= 28 ? 28 : past.length - 1);

  return {
    ctl: last.ctl,
    atl: last.atl,
    tsb: last.tsb,
    zone: last.zone,
    ctlDelta28: Math.round(delta * 10) / 10,
    rampPerWeek: Math.round(((delta / spanDays) * 7) * 10) / 10,
  };
}

/** Point de la série correspondant à une date (jour J de la course). */
export function formOn(series: FormPoint[], date: Date): FormPoint | null {
  const k = key(date);
  return series.find((p) => key(p.date) === k) ?? null;
}

/**
 * Meilleure fenêtre de forme dans une plage : le pic de TSB avec une CTL encore
 * élevée. Utile pour vérifier que l'affûtage tombe au bon moment — un affûtage
 * trop long fait remonter la fraîcheur mais efface la condition.
 */
export function peakForm(
  series: FormPoint[],
  from: Date,
  to: Date
): FormPoint | null {
  const window = series.filter((p) => p.date >= from && p.date <= to);
  if (window.length === 0) return null;
  // Score = fraîcheur pondérée par la condition conservée.
  return window.reduce((best, p) =>
    p.tsb + p.ctl * 0.35 > best.tsb + best.ctl * 0.35 ? p : best
  );
}

/**
 * Fraîcheur au départ d'une course : celle du matin, donc celle de la veille
 * au soir. Le point du jour J intègre déjà la charge de la course elle-même
 * (un 50 km pèse lourd) et afficherait une « surcharge » absurde sur la ligne
 * de départ. Le libellé reste celui du jour J pour le repère du graphique.
 */
export function formAtStart(series: FormPoint[], raceDate: Date): FormPoint | null {
  const k = key(raceDate);
  const i = series.findIndex((p) => key(p.date) === k);
  if (i < 0) return null;
  if (i === 0) return series[0];
  return { ...series[i - 1], label: series[i].label, date: series[i].date };
}

/**
 * L'état de forme dit en une phrase, pour l'ouverture de la bande « forme »
 * du tableau de bord : un titre court et une explication qui cite le chiffre.
 */
export type HeadlinePart = {
  key: string;
  params?: Record<string, string | number>;
};

/** Titre et corps de la bande « forme » — clés i18n `home.headline.*`. */
export function formHeadline(
  f: Pick<FormSummary, "tsb" | "ctl" | "zone" | "rampPerWeek">,
  acwr?: "insufficient" | "detraining" | "optimal" | "caution" | "danger"
): { titleKey: string; bodyParts: HeadlinePart[] } {
  const gap = Math.abs(Math.round(f.tsb));
  const base: Record<FormZone, { titleKey: string; bodyKey: string }> = {
    overreaching: {
      titleKey: "headline.overreaching.title",
      bodyKey: "headline.overreaching.body",
    },
    productive: {
      titleKey: "headline.productive.title",
      bodyKey: "headline.productive.body",
    },
    neutral: {
      titleKey: "headline.neutral.title",
      bodyKey: "headline.neutral.body",
    },
    optimal: {
      titleKey: "headline.optimal.title",
      bodyKey: "headline.optimal.body",
    },
    fresh: {
      titleKey: "headline.fresh.title",
      bodyKey: "headline.fresh.body",
    },
  };
  const bodyParts: HeadlinePart[] = [
    { key: base[f.zone].bodyKey, params: { gap, ctl: Math.round(f.ctl) } },
  ];
  if (acwr === "danger") {
    bodyParts.push({ key: "headline.dangerTail" });
  } else if (f.rampPerWeek > 7) {
    bodyParts.push({ key: "headline.rampTail", params: { ramp: f.rampPerWeek } });
  }
  return { titleKey: base[f.zone].titleKey, bodyParts };
}
