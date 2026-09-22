/**
 * Moteur d'observations automatiques.
 *
 * Chaque règle produit une observation seulement si elle est réellement
 * étayée par les données : pas de message générique, pas de conseil affiché
 * « au cas où ». Chaque observation porte la mesure qui la justifie, pour que
 * tu puisses la vérifier toi-même.
 */

import { pacePerKm, speedToPace } from "./format";
import type { ActivityLike, LoadPoint } from "./stats";
import { daysBetween, round, trainingLoad } from "./stats";
import type { FitnessProfile, PersonalRecord } from "./records";

export type InsightTone = "good" | "warn" | "risk" | "neutral";

export type Insight = {
  id: string;
  tone: InsightTone;
  title: string;
  detail: string;
  /** Mesure chiffrée qui justifie l'observation */
  evidence: string;
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
        title: "Montée de charge trop rapide",
        detail:
          "Ton volume récent dépasse nettement ce que ton corps a l'habitude d'encaisser. C'est la configuration classique qui précède une blessure. Prévois une semaine allégée de 30 à 40 %.",
        evidence: `Ratio de charge ${current.ratio.toFixed(2)} (zone saine : 0,80 – 1,30)`,
      });
    } else if (current.zone === "caution") {
      out.push({
        id: "acwr-caution",
        tone: "warn",
        title: "Charge en hausse marquée",
        detail:
          "Rien d'alarmant, mais tu es au-dessus de la zone confortable. Stabilise le volume une semaine avant de repartir à la hausse.",
        evidence: `Ratio de charge ${current.ratio.toFixed(2)}`,
      });
    } else if (current.zone === "detraining" && last28.length >= 4) {
      out.push({
        id: "acwr-low",
        tone: "neutral",
        title: "Marge pour augmenter",
        detail:
          "Ta charge récente est en dessous de ton habitude. Tu peux remonter le volume progressivement, sans dépasser +10 % par semaine.",
        evidence: `Ratio de charge ${current.ratio.toFixed(2)}`,
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
      title: "Bond de volume hebdomadaire",
      detail:
        "La règle des +10 % par semaine limite le risque de blessure de surcharge. Tu l'as largement dépassée.",
      evidence: `${round(kmPrev7, 1)} km puis ${round(km7, 1)} km (+${Math.round(
        ((km7 - kmPrev7) / kmPrev7) * 100
      )} %)`,
    });
  }

  // ---------------------------------------------------------------- Régularité
  if (last28.length >= 3) {
    const gaps = longestGap(last28, now);
    if (gaps >= 10) {
      out.push({
        id: "gap",
        tone: "warn",
        title: "Coupure dans l'entraînement",
        detail:
          "Les adaptations aérobies commencent à se perdre après environ 10 jours sans stimulus. Reprends progressivement plutôt que de repartir au niveau d'avant.",
        evidence: `${gaps} jours consécutifs sans sortie sur les 4 dernières semaines`,
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
        title: "Trop d'intensité, pas assez de facile",
        detail:
          "Le modèle polarisé recommande environ 80 % du volume en endurance fondamentale. Courir trop souvent « moyennement dur » fatigue sans développer la base aérobie.",
        evidence: `${Math.round(easyShare * 100)} % de tes séances sous ${Math.round(
          easyThreshold
        )} bpm (cible : 80 %)`,
      });
    } else if (easyShare > 0.95 && withHr.length >= 8) {
      out.push({
        id: "no-intensity",
        tone: "neutral",
        title: "Aucune séance rapide",
        detail:
          "Ta base aérobie est bien travaillée, mais sans séance de seuil ou de VO2max, la vitesse progresse peu. Une séance intense par semaine suffit.",
        evidence: `${Math.round(easyShare * 100)} % des séances en endurance seulement`,
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
        title: "Référence de performance ancienne",
        detail:
          "Ton niveau estimé s'appuie sur un effort qui commence à dater. Un test sur 5 km ou une sortie rapide chronométrée affinerait tes allures cibles.",
        evidence: `Meilleur effort : ${profile.source.name}, il y a ${age} jours`,
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
        title: "Allure moyenne en progrès",
        detail:
          "À volume comparable, tu cours plus vite qu'il y a un mois. C'est le signe que la charge est bien absorbée.",
        evidence: `${Math.round(delta)} s/km gagnées sur 28 jours`,
      });
    } else if (delta < -12) {
      out.push({
        id: "pace-slower",
        tone: "neutral",
        title: "Allure moyenne en baisse",
        detail:
          "Ce n'est pas forcément négatif : cela arrive quand on augmente le volume ou qu'on court davantage en endurance. À surveiller si ça persiste avec une FC élevée.",
        evidence: `${Math.abs(Math.round(delta))} s/km perdues sur 28 jours`,
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
            title: "Efficience aérobie en hausse",
            detail:
              "Tu cours plus vite pour une même fréquence cardiaque : ton moteur aérobie s'améliore.",
            evidence: `+${drift} % de vitesse par battement vs mois précédent`,
          }
        : {
            id: "efficiency-down",
            tone: "warn",
            title: "Efficience aérobie en baisse",
            detail:
              "À FC égale tu cours moins vite. Fatigue accumulée, chaleur ou manque de récupération sont les causes les plus fréquentes.",
            evidence: `${drift} % de vitesse par battement vs mois précédent`,
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
        title: "Objectif hebdomadaire tenu",
        detail: "Tu es au niveau que tu t'es fixé, en moyenne sur le dernier mois.",
        evidence: `${round(weeklyAvg, 1)} km/semaine pour un objectif de ${input.weeklyGoalKm} km`,
      });
    } else if (weeklyAvg < input.weeklyGoalKm * 0.6) {
      out.push({
        id: "goal-far",
        tone: "neutral",
        title: "Loin de l'objectif hebdomadaire",
        detail:
          "Soit l'objectif est trop ambitieux pour le moment, soit il faut ajouter une sortie par semaine. Un objectif irréaliste décourage plus qu'il ne motive.",
        evidence: `${round(weeklyAvg, 1)} km/semaine pour un objectif de ${input.weeklyGoalKm} km`,
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
        title:
          recent.length > 1
            ? `${recent.length} records personnels ce mois-ci`
            : "Nouveau record personnel",
        detail:
          "Tes meilleures performances sur les distances de référence datent du mois dernier — tu es en forme ascendante.",
        evidence: recent.map((r) => r.name).join(", "),
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
