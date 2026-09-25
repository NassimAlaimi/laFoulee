/**
 * Le « pourquoi » des séances et le conseil du jour.
 *
 * La bibliothèque sait quoi faire courir ; ici on explique **pourquoi**, en
 * mots simples, et on choisit **un seul** conseil par jour — le plus utile
 * selon l'état (forme, charge, readiness, plan, prochaine course). Les clés
 * renvoyées sont des clés i18n (`coach.*`), jamais du texte figé : la langue
 * de l'utilisateur s'applique.
 *
 * Fonctions pures, testées dans tests/coach.test.ts.
 */

export type SessionForWhy = {
  kind: string;
  phase: string;
  intensity: number;
  durationMin: number;
  distanceKm: number;
  /** le titre peut préciser (fractionné, côte…) */
  title?: string | null;
};

/** Pourquoi cette séance, en une phrase + ce qu'on perd à la sauter. */
export function sessionWhy(s: SessionForWhy): { whyKey: string; skipKey: string; placeKey: string; params: Record<string, string | number> } {
  const whyKey = `why.${s.kind}`;
  const params: Record<string, string | number> = {
    min: Math.round(s.durationMin),
    km: Math.round(s.distanceKm * 10) / 10,
  };
  let skipKey = "skip.quality";
  if (s.intensity <= 2 || ["rest", "recovery", "easy", "cross", "mobility"].includes(s.kind)) skipKey = "skip.easy";
  const placeKey = `place.${s.phase}`;
  return { whyKey, skipKey, placeKey, params };
}

export type AdviceInput = {
  /** fraîcheur (TSB) ou null */
  tsb: number | null;
  /** ratio aiguë/chronique ou null */
  acwr: number | null;
  /** jours de carnet sur 7 jours, ressentis manquants */
  logDays: number;
  feelingMissing: number;
  /** prochaine course (jours restants, distance km) */
  nextRace: { days: number; distanceKm: number; hasRacePlan: boolean } | null;
  /** phase du plan actif */
  phase: string | null;
  /** douleur récente au carnet 0-3 */
  pain: number;
};

export type Advice = {
  key: string;
  params: Record<string, string | number>;
  /** good | warn | bad */
  tone: "good" | "warn" | "bad";
};

export function adviceOfTheDay(input: AdviceInput): Advice | null {
  // 1. Douleur : priorité absolue.
  if (input.pain >= 2) return { key: "pain", params: {}, tone: "bad" };
  // 2. Surcharge.
  if (input.acwr !== null && input.acwr >= 1.5) return { key: "overreach", params: { acwr: Math.round(input.acwr * 10) / 10 }, tone: "bad" };
  if (input.tsb !== null && input.tsb <= -25) return { key: "tired", params: { tsb: Math.round(input.tsb) }, tone: "warn" };
  // 3. Course proche.
  if (input.nextRace && input.nextRace.days <= 7) {
    return { key: "raceWeek", params: { days: input.nextRace.days, km: Math.round(input.nextRace.distanceKm) }, tone: "good" };
  }
  if (input.nextRace && input.nextRace.days <= 56 && !input.nextRace.hasRacePlan) {
    return { key: "racePlan", params: { days: input.nextRace.days, km: Math.round(input.nextRace.distanceKm) }, tone: "warn" };
  }
  // 4. Phase d'affûtage.
  if (input.phase === "taper") return { key: "taper", params: {}, tone: "good" };
  // 5. Carnet et ressentis.
  if (input.feelingMissing >= 3) return { key: "feeling", params: { n: input.feelingMissing }, tone: "warn" };
  if (input.logDays === 0) return { key: "log", params: {}, tone: "warn" };
  // 6. Forme.
  if (input.tsb !== null && input.tsb >= 10) return { key: "fresh", params: { tsb: Math.round(input.tsb) }, tone: "good" };
  // 7. Rien de pressant : base.
  return { key: "base", params: {}, tone: "good" };
}
