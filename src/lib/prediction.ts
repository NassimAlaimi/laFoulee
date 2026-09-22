/**
 * Prédiction de performance — source unique de vérité.
 *
 * Avant ce module, trois pages calculaient trois chronos différents pour la
 * même course : la page Objectif annonçait le potentiel VDOT brut, la page
 * Performance le même chiffre mais étiqueté « spéculatif », et le plan
 * d'entraînement partait d'une troisième allure. Tout passe désormais par
 * `racePrediction()`.
 *
 * Trois modèles, superposés :
 *
 * 1. **VDOT** (Daniels & Gilbert) — le potentiel physiologique, mesuré sur la
 *    meilleure performance récente.
 * 2. **Riegel personnalisé** — `t2 = t1 × (d2/d1)^k`. L'exposant `k` n'est pas
 *    figé à 1,06 : on le mesure sur les performances réelles de l'athlète. Un
 *    coureur avec beaucoup de volume tient mieux la distance (k bas), un
 *    coureur rapide mais peu endurant s'effondre (k haut).
 * 3. **Contrainte d'endurance** — sur longue distance, le facteur limitant
 *    n'est pas la VO2max mais le volume et la sortie longue. Un 5 km à 20 min
 *    ne donne pas un marathon en 3h07 si on court 30 km par semaine.
 *
 * Le résultat expose *deux* chronos : le **potentiel** (ce que la physiologie
 * autorise) et le **réaliste** (ce que l'entraînement actuel permet vraiment),
 * avec l'écart explicité. C'est cet écart qui rend le plan utile.
 */

import { pacePerKm } from "./format";
import type { PersonalRecord, FitnessProfile } from "./records";
import { volumeTargetFor } from "./training";
import { timeFromVdot, vdotFromPerformance } from "./vdot";

/** Exposant de fatigue de référence (Riegel 1977, sur des milliers de courses). */
export const RIEGEL_DEFAULT = 1.06;
/** Bornes physiologiques : en dehors, la régression a capté du bruit. */
export const RIEGEL_MIN = 1.01;
export const RIEGEL_MAX = 1.18;

export type EnduranceIndex = {
  /** Exposant personnel k de la loi de Riegel */
  exponent: number;
  /** true si mesuré sur les performances, false si valeur de référence */
  measured: boolean;
  /** Nombre de performances utilisées pour la régression */
  samples: number;
  /** Qualité de l'ajustement (R², 0-1) */
  r2: number;
  /** Lecture : négatif = meilleure endurance que la moyenne */
  deltaVsReference: number;
  label: string;
  /** Perte de vitesse en % quand on double la distance */
  slowdownPerDoubling: number;
};

/**
 * Indice d'endurance : régression log-log des performances maximales.
 *
 * `log t = log a + k · log d` — la pente `k` est l'exposant de fatigue.
 * On n'utilise que des efforts réellement maximaux (VDOT proche du meilleur),
 * sinon une sortie longue tranquille ferait croire à une endurance catastrophique.
 */
export function enduranceIndex(
  records: PersonalRecord[],
  profileVdot: number,
  opts: { tolerance?: number; minMeters?: number } = {}
): EnduranceIndex {
  const tolerance = opts.tolerance ?? 4;
  const minMeters = opts.minMeters ?? 1000;

  const points = records.filter(
    (r) =>
      r.seconds !== null &&
      r.vdot !== null &&
      r.meters >= minMeters &&
      // Un effort non maximal biaise la pente vers le haut.
      (profileVdot <= 0 || r.vdot >= profileVdot - tolerance)
  );

  const fallback = (samples: number): EnduranceIndex => ({
    exponent: RIEGEL_DEFAULT,
    measured: false,
    samples,
    r2: 0,
    deltaVsReference: 0,
    label: "Référence (pas assez de performances)",
    slowdownPerDoubling: pctSlowdown(RIEGEL_DEFAULT),
  });

  if (points.length < 3) return fallback(points.length);

  // Écart de distance suffisant : régresser un 5 km contre un 10 km ne dit rien.
  const metersSpan =
    Math.max(...points.map((p) => p.meters)) / Math.min(...points.map((p) => p.meters));
  if (metersSpan < 2.5) return fallback(points.length);

  const xs = points.map((p) => Math.log(p.meters));
  const ys = points.map((p) => Math.log(p.seconds as number));
  const { slope, r2 } = linearFit(xs, ys);

  if (!Number.isFinite(slope) || slope < RIEGEL_MIN || slope > RIEGEL_MAX) {
    return fallback(points.length);
  }

  const delta = slope - RIEGEL_DEFAULT;
  return {
    exponent: slope,
    measured: true,
    samples: points.length,
    r2,
    deltaVsReference: delta,
    label:
      delta <= -0.025
        ? "Endurance marquée"
        : delta <= -0.008
          ? "Plutôt endurant"
          : delta < 0.008
            ? "Profil équilibré"
            : delta < 0.03
              ? "Plutôt rapide"
              : "Vitesse dominante",
    slowdownPerDoubling: pctSlowdown(slope),
  };
}

/** Perte de vitesse (%) quand la distance double, pour un exposant donné. */
function pctSlowdown(k: number): number {
  return Math.round((Math.pow(2, k) / 2 - 1) * 1000) / 10;
}

// ---------------------------------------------------------------- Vitesse critique

export type CriticalSpeed = {
  /** Vitesse critique en m/s — proche du seuil anaérobie */
  cs: number;
  /** Allure correspondante (s/km) */
  pace: number;
  /** D′ : réserve anaérobie en mètres au-delà de la vitesse critique */
  dPrime: number;
  r2: number;
  samples: number;
  /** Estimation de VMA depuis CS (CS ≈ 88-92 % de la VMA) */
  vmaEstimate: number;
  points: Array<{ meters: number; seconds: number; name: string }>;
};

/**
 * Modèle à deux paramètres : `d = CS · t + D′`.
 *
 * Utilisé en physiologie de l'exercice depuis Monod & Scherrer (1965), c'est
 * le modèle qui sous-tend le « critical power » en cyclisme. Fenêtre de
 * validité : efforts de 2 à 20 minutes. En dessous, la composante anaérobie
 * domine ; au-dessus, la dérive glycogénique casse la linéarité.
 */
export function criticalSpeed(records: PersonalRecord[]): CriticalSpeed | null {
  const points = records
    .filter((r) => r.seconds !== null && r.seconds >= 120 && r.seconds <= 1500)
    .map((r) => ({ meters: r.meters, seconds: r.seconds as number, name: r.name }));

  if (points.length < 2) return null;

  const span = Math.max(...points.map((p) => p.seconds)) / Math.min(...points.map((p) => p.seconds));
  if (span < 1.8) return null;

  const { slope, intercept, r2 } = linearFit(
    points.map((p) => p.seconds),
    points.map((p) => p.meters)
  );

  if (!Number.isFinite(slope) || slope <= 1 || slope > 8) return null;

  return {
    cs: slope,
    pace: 1000 / slope,
    dPrime: Math.max(0, Math.round(intercept)),
    r2,
    samples: points.length,
    // CS se situe autour de 90 % de la vitesse maximale aérobie.
    vmaEstimate: Math.round(((slope * 3.6) / 0.9) * 10) / 10,
    points,
  };
}

// ---------------------------------------------------------------- Prédiction

export type PredictionMethod = "vdot" | "riegel" | "endurance-limited";

export type RacePrediction = {
  meters: number;
  /** Chrono que la physiologie autorise (VDOT pur) */
  potential: number;
  /** Chrono réellement atteignable avec l'entraînement actuel */
  realistic: number;
  /** Fourchette basse / haute autour du réaliste */
  low: number;
  high: number;
  pace: number;
  potentialPace: number;
  method: PredictionMethod;
  confidence: "high" | "medium" | "low";
  /** Raison courte, factuelle, de l'écart entre potentiel et réaliste */
  reason: string;
  /** Facteurs limitants chiffrés */
  limiters: Array<{ label: string; costSeconds: number }>;
  /** Écart réaliste − potentiel, en secondes */
  gap: number;
};

export type PredictionContext = {
  records: PersonalRecord[];
  profile: FitnessProfile;
  /** Volume hebdomadaire de référence (km) */
  weeklyKm: number;
  /** Sortie la plus longue récente (km) */
  longestRunKm: number;
  /** Indice d'endurance, calculé une fois et réutilisé */
  endurance?: EnduranceIndex;
};

/**
 * Prédiction pour une distance donnée.
 *
 * L'ordre compte : on part du potentiel VDOT, on applique l'exposant personnel
 * pour l'extrapolation, puis on ajoute le coût des facteurs limitants.
 */
export function racePrediction(meters: number, ctx: PredictionContext): RacePrediction | null {
  const { profile, records } = ctx;
  if (!profile.source || profile.vdot <= 0 || !profile.source.seconds) return null;

  const km = meters / 1000;
  const endurance = ctx.endurance ?? enduranceIndex(records, profile.vdot);

  const potential = timeFromVdot(profile.vdot, meters);

  // Extrapolation Riegel personnalisée depuis la meilleure performance.
  const base = profile.source;
  const riegel =
    (base.seconds as number) * Math.pow(meters / base.meters, endurance.exponent);

  // Un record déjà couru sur CETTE distance vaut mieux que n'importe quel modèle.
  const own = records.find((r) => Math.abs(r.meters - meters) / meters < 0.01);
  const ownMaximal =
    own?.seconds != null && own.vdot != null && own.vdot >= profile.vdot - 1.5 && !own.estimated;

  const limiters: Array<{ label: string; costSeconds: number }> = [];
  // Un facteur qui coûte quelques secondes n'est pas un facteur limitant :
  // l'annoncer donnerait une fausse impression de précision.
  const meaningful = Math.max(12, potential * 0.008);
  const note = (label: string, costSeconds: number) => {
    if (costSeconds >= meaningful) limiters.push({ label, costSeconds: Math.round(costSeconds) });
  };

  // Modèle de base : le plus pessimiste des deux, car la physiologie ne suffit
  // pas si l'extrapolation est lointaine.
  const extrapolation = meters / base.meters;
  let realistic = extrapolation > 1.25 ? Math.max(potential, riegel) : potential;
  let method: PredictionMethod = realistic === riegel && riegel > potential ? "riegel" : "vdot";

  if (riegel > potential && extrapolation > 1.25) {
    note(`${endurance.label} · exposant ${endurance.exponent.toFixed(3)}`, riegel - potential);
  }

  // --- Contrainte de volume (dominante au-delà du semi)
  if (km >= 15 && ctx.weeklyKm > 0) {
    const needed = volumeNeeded(km);
    if (ctx.weeklyKm < needed) {
      // Jusqu'à +12 % de temps quand le volume est à la moitié du nécessaire.
      const deficit = Math.min(1, (needed - ctx.weeklyKm) / needed);
      const cost = realistic * deficit * 0.12;
      note(`Volume ${Math.round(ctx.weeklyKm)} km/sem (${Math.round(needed)} attendus)`, cost);
      realistic += cost;
      if (cost >= meaningful) method = "endurance-limited";
    }
  }

  // --- Contrainte de sortie longue
  if (km >= 15 && ctx.longestRunKm > 0) {
    const needed = longRunNeeded(km);
    if (ctx.longestRunKm < needed) {
      const deficit = Math.min(1, (needed - ctx.longestRunKm) / needed);
      const cost = realistic * deficit * 0.1;
      note(
        `Sortie longue ${Math.round(ctx.longestRunKm)} km (${Math.round(needed)} attendus)`,
        cost
      );
      realistic += cost;
      if (cost >= meaningful) method = "endurance-limited";
    }
  }

  if (ownMaximal && (own?.seconds as number) < realistic) {
    // Déjà fait mieux en vrai : le modèle ne peut pas être plus pessimiste
    // que la réalité mesurée.
    realistic = own?.seconds as number;
    method = "vdot";
    limiters.length = 0;
  }

  const confidence = predictionConfidence({
    extrapolation,
    ownMaximal: Boolean(ownMaximal),
    limiters: limiters.length,
    enduranceMeasured: endurance.measured,
    km,
  });

  // Fourchette : plus l'extrapolation est lointaine, plus elle s'élargit.
  const spread =
    confidence === "high" ? 0.015 : confidence === "medium" ? 0.035 : 0.06;

  // Le facteur limitant annoncé est le plus coûteux, pas le premier trouvé.
  const ranked = [...limiters].sort((a, b) => b.costSeconds - a.costSeconds);
  const reason = ownMaximal
    ? "Performance maximale déjà réalisée sur la distance"
    : ranked.length > 0
      ? ranked[0].label
      : extrapolation > 1.25
        ? `Extrapolé depuis ${base.name}`
        : `Mesuré sur ${base.name}`;

  return {
    meters,
    potential: Math.round(potential),
    realistic: Math.round(realistic),
    low: Math.round(realistic * (1 - spread)),
    high: Math.round(realistic * (1 + spread)),
    pace: pacePerKm(meters, realistic),
    potentialPace: pacePerKm(meters, potential),
    method,
    confidence,
    reason,
    limiters: ranked,
    gap: Math.round(realistic - potential),
  };
}

function predictionConfidence(a: {
  extrapolation: number;
  ownMaximal: boolean;
  limiters: number;
  enduranceMeasured: boolean;
  km: number;
}): "high" | "medium" | "low" {
  if (a.ownMaximal) return "high";
  if (a.extrapolation > 4 || a.extrapolation < 0.25) return "low";
  if (a.limiters >= 2) return "low";
  if (a.extrapolation > 2 || a.extrapolation < 0.5) return "medium";
  return a.enduranceMeasured ? "high" : "medium";
}

/**
 * Volume hebdomadaire et sortie longue attendus : on réutilise la table de
 * `training.ts`, pour que la prédiction, le plan et la checklist de l'objectif
 * parlent des mêmes seuils.
 */
export function volumeNeeded(raceKm: number): number {
  return volumeTargetFor(raceKm).min;
}

export function longRunNeeded(raceKm: number): number {
  return volumeTargetFor(raceKm).longRun;
}

// ---------------------------------------------------------------- Courbe allure-durée

export type DurationCurvePoint = {
  meters: number;
  name: string;
  seconds: number;
  pace: number;
  /** Allure prédite par le modèle personnel, pour repérer les trous */
  modelPace: number | null;
  date: Date | null;
  /** Écart au modèle en % (négatif = meilleur que le modèle) */
  deltaPct: number | null;
};

/**
 * Courbe allure-durée : l'équivalent course à pied de la courbe de puissance
 * en cyclisme. Elle montre d'un coup d'œil où le profil est solide et où il
 * est creux — un trou sur 10 km signale rarement un manque de talent, plutôt
 * une distance jamais courue à fond.
 */
export function durationCurve(
  records: PersonalRecord[],
  profile: FitnessProfile,
  endurance: EnduranceIndex
): DurationCurvePoint[] {
  const base = profile.source;

  return records
    .filter((r) => r.seconds !== null)
    .map((r) => {
      const seconds = r.seconds as number;
      const model =
        base && base.seconds
          ? (base.seconds as number) * Math.pow(r.meters / base.meters, endurance.exponent)
          : null;
      return {
        meters: r.meters,
        name: r.name,
        seconds,
        pace: pacePerKm(r.meters, seconds),
        modelPace: model ? pacePerKm(r.meters, model) : null,
        date: r.date,
        deltaPct: model ? Math.round(((seconds - model) / model) * 1000) / 10 : null,
      };
    })
    .sort((a, b) => a.meters - b.meters);
}

// ---------------------------------------------------------------- Objectif ↔ niveau

export type GoalGap = {
  /** VDOT nécessaire pour le chrono visé */
  requiredVdot: number;
  currentVdot: number;
  /** Écart de VDOT à combler */
  gap: number;
  /** Semaines nécessaires à un rythme de progression réaliste */
  weeksNeeded: number;
  /** Chrono visé − chrono réaliste actuel, en secondes */
  secondsToFind: number;
  feasible: boolean;
  /** Progression typique : +1 point de VDOT par mois de travail bien mené */
  monthlyVdotGain: number;
};

/**
 * Écart entre le chrono visé et le niveau actuel.
 *
 * Le gain de VDOT est volontairement prudent : +1 point par mois est déjà un
 * bon rythme pour un coureur entraîné, +2 pour un débutant. On module selon le
 * niveau de départ, car la marge se réduit quand on monte.
 */
export function goalGap(
  targetSeconds: number,
  meters: number,
  currentVdot: number,
  realisticSeconds: number,
  weeksAvailable: number
): GoalGap {
  const requiredVdot = vdotFromPerformance(meters, targetSeconds);
  const gap = requiredVdot - currentVdot;

  // Marge de progression : d'autant plus faible que le niveau est élevé.
  const monthlyVdotGain = currentVdot <= 0 ? 1 : currentVdot < 35 ? 1.6 : currentVdot < 45 ? 1.2 : currentVdot < 55 ? 0.8 : 0.5;

  const weeksNeeded = gap <= 0 ? 0 : Math.ceil((gap / monthlyVdotGain) * 4.35);

  return {
    requiredVdot: Math.round(requiredVdot * 10) / 10,
    currentVdot: Math.round(currentVdot * 10) / 10,
    gap: Math.round(gap * 10) / 10,
    weeksNeeded,
    secondsToFind: Math.round(realisticSeconds - targetSeconds),
    feasible: weeksNeeded <= weeksAvailable,
    monthlyVdotGain,
  };
}

// ---------------------------------------------------------------- Stratégie de course

export type Split = {
  km: number;
  /** Allure cible du segment (s/km) */
  pace: number;
  /** Temps cumulé au passage (s) */
  cumulative: number;
  label: string;
};

/**
 * Plan d'allure : découpage de la course en segments avec temps de passage.
 *
 * Stratégie par défaut : négative split légère (premier tiers 1,5 % plus lent,
 * dernier tiers 1,5 % plus rapide). Sur les records du monde comme sur les
 * courses populaires, la stratégie régulière ou légèrement négative bat
 * systématiquement le départ rapide.
 */
export function pacingPlan(
  meters: number,
  targetSeconds: number,
  opts: { strategy?: "even" | "negative" | "positive"; segmentKm?: number } = {}
): Split[] {
  const strategy = opts.strategy ?? "negative";
  const km = meters / 1000;
  const seg = opts.segmentKm ?? (km <= 12 ? 1 : km <= 25 ? 5 : 5);
  const avg = targetSeconds / km;

  const factor = (position: number): number => {
    // position ∈ [0,1] : avancement au milieu du segment
    if (strategy === "even") return 1;
    const amplitude = strategy === "negative" ? 0.015 : -0.015;
    return 1 + amplitude * (1 - 2 * position);
  };

  const splits: Split[] = [];
  let cumulative = 0;
  let done = 0;

  while (done < km - 0.001) {
    const len = Math.min(seg, km - done);
    const mid = (done + len / 2) / km;
    const pace = avg * factor(mid);
    cumulative += pace * len;
    done += len;
    splits.push({
      km: Math.round(done * 10) / 10,
      pace,
      cumulative,
      label: len === seg ? `${Math.round(done)} km` : `${Math.round(done * 10) / 10} km`,
    });
  }

  // Le cumul doit retomber exactement sur le chrono visé.
  const drift = targetSeconds / cumulative;
  return splits.map((s) => ({ ...s, cumulative: s.cumulative * drift, pace: s.pace * drift }));
}

// ---------------------------------------------------------------- Régression

/** Moindres carrés : y = a + b·x, avec coefficient de détermination. */
export function linearFit(
  xs: number[],
  ys: number[]
): { slope: number; intercept: number; r2: number } {
  const n = xs.length;
  if (n < 2) return { slope: NaN, intercept: NaN, r2: 0 };

  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den === 0 ? NaN : num / den;
  const intercept = my - slope * mx;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * xs[i];
    ssRes += (ys[i] - pred) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }

  return {
    slope,
    intercept,
    r2: ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot),
  };
}
