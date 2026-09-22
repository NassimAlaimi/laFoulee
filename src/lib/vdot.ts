/**
 * Modèle VDOT (Jack Daniels & Jimmy Gilbert).
 *
 * Pourquoi pas Riegel seul : Riegel extrapole une performance depuis UNE distance
 * sans savoir si l'effort était maximal. Une sortie longue tranquille de 21 km
 * produit alors une prédiction absurde sur 5 km.
 *
 * VDOT ramène chaque performance à une valeur de condition physique unique
 * (≈ VO2max effectif). On retient le MEILLEUR VDOT parmi tous les records :
 * une sortie lente donne mécaniquement un VDOT bas et n'influence plus rien.
 */

/** VO2 consommé à une vitesse donnée (m/min). Daniels & Gilbert. */
export function vo2AtVelocity(metersPerMin: number): number {
  return -4.6 + 0.182258 * metersPerMin + 0.000104 * metersPerMin ** 2;
}

/** Fraction de VO2max soutenable pendant `minutes`. */
export function percentMaxForDuration(minutes: number): number {
  return (
    0.8 +
    0.1894393 * Math.exp(-0.012778 * minutes) +
    0.2989558 * Math.exp(-0.1932605 * minutes)
  );
}

/**
 * VDOT d'une performance.
 * @param meters distance en mètres
 * @param seconds temps en secondes
 */
export function vdotFromPerformance(meters: number, seconds: number): number {
  if (meters <= 0 || seconds <= 0) return 0;
  const minutes = seconds / 60;
  const velocity = meters / minutes;
  const vo2 = vo2AtVelocity(velocity);
  const pct = percentMaxForDuration(minutes);
  if (pct <= 0) return 0;
  return vo2 / pct;
}

/**
 * Temps prédit sur une distance pour un VDOT donné.
 * La relation n'est pas inversible analytiquement → recherche dichotomique.
 * Monotone : plus le temps augmente, plus le VDOT implicite baisse.
 */
export function timeFromVdot(vdot: number, meters: number): number {
  if (vdot <= 0 || meters <= 0) return 0;

  let lo = 1; // 1 s
  let hi = 60 * 60 * 12; // 12 h

  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const v = vdotFromPerformance(meters, mid);
    if (v > vdot) lo = mid;
    else hi = mid;
    if (hi - lo < 0.01) break;
  }
  return Math.round((lo + hi) / 2);
}

/**
 * Vitesse aérobie maximale (km/h).
 * vVO2max = vitesse à 100 % de VO2max. On résout vo2AtVelocity(v) = vdot.
 */
export function vmaFromVdot(vdot: number): number {
  if (vdot <= 0) return 0;
  // Résolution de 0.000104 v² + 0.182258 v - (4.6 + vdot) = 0
  const a = 0.000104;
  const b = 0.182258;
  const c = -(4.6 + vdot);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return 0;
  const vMetersPerMin = (-b + Math.sqrt(disc)) / (2 * a);
  return (vMetersPerMin * 60) / 1000; // km/h
}

/** Formule de Riegel, conservée pour comparaison et cas limites. */
export function riegel(
  knownSeconds: number,
  knownMeters: number,
  targetMeters: number,
  exponent = 1.06
): number {
  if (knownMeters <= 0) return 0;
  return knownSeconds * Math.pow(targetMeters / knownMeters, exponent);
}

/**
 * Allures d'entraînement de Daniels, dérivées du VDOT.
 * Chaque allure correspond à un % de VDOT précis, pas à un % de VMA approximatif.
 * Retourne des allures en secondes/km.
 */
export function danielsPaces(vdot: number) {
  // Fractions de vVO2max utilisées par Daniels pour chaque intensité
  const paceFor = (fraction: number) => {
    const vma = vmaFromVdot(vdot); // km/h
    if (vma <= 0) return 0;
    return 3600 / (vma * fraction);
  };

  return [
    {
      key: "easy",
      name: "Endurance fondamentale",
      short: "EF",
      pace: paceFor(0.68),
      paceFast: paceFor(0.74),
      color: "rgb(var(--sage))",
      usage: "Base aérobie, récupération active. 80 % de ton volume.",
    },
    {
      key: "marathon",
      name: "Allure marathon",
      short: "AM",
      pace: paceFor(0.79),
      paceFast: paceFor(0.84),
      color: "rgb(var(--slate))",
      usage: "Blocs longs à allure course, endurance spécifique.",
    },
    {
      key: "threshold",
      name: "Seuil",
      short: "SL",
      pace: paceFor(0.86),
      paceFast: paceFor(0.9),
      color: "rgb(var(--ochre))",
      usage: "Tempo 20 min ou fractions de 5-15 min. Repousse le seuil lactique.",
    },
    {
      key: "interval",
      name: "VO2max",
      short: "VO2",
      pace: paceFor(0.95),
      paceFast: paceFor(1.0),
      color: "rgb(var(--clay))",
      usage: "Fractions de 3-5 min. Développe la cylindrée cardiaque.",
    },
    {
      key: "repetition",
      name: "Vitesse",
      short: "VIT",
      pace: paceFor(1.05),
      paceFast: paceFor(1.15),
      color: "rgb(var(--rust))",
      usage: "Fractions courtes 200-400 m. Économie de course et foulée.",
    },
  ];
}

/**
 * Interprétation qualitative du VDOT.
 * Les couleurs sont des variables CSS : elles suivent le thème clair/sombre.
 */
/** Interprétation qualitative du VDOT (repères indicatifs, coureur loisir → confirmé). */
export function vdotLevel(vdot: number): { label: string; color: string } {
  if (vdot < 30) return { label: "Débutant", color: "rgb(var(--ink-3))" };
  if (vdot < 38) return { label: "Régulier", color: "rgb(var(--sage))" };
  if (vdot < 46) return { label: "Confirmé", color: "rgb(var(--ochre))" };
  if (vdot < 54) return { label: "Avancé", color: "rgb(var(--clay))" };
  if (vdot < 62) return { label: "Compétiteur", color: "rgb(var(--rust))" };
  return { label: "Élite", color: "rgb(var(--plum))" };
}
