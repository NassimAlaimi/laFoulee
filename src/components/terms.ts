/**
 * Traduction des termes produits par lib/ (niveaux, allures, distances,
 * fiabilité, facteurs limitants). lib/ reste pur et en français ; chaque
 * résultat porte une clé que l'interface traduit ici (namespace « terms »).
 * Utilisable côté serveur (getTranslations) comme client (useTranslations).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type T = (key: any, values?: any) => string;

const DISTANCE_KEYS = new Set(["mile", "2mile", "10mile", "half", "marathon"]);

/** Nom d'une distance standard ; les distances métriques restent telles quelles. */
export function distanceName(t: T, key: string | null | undefined, fallback: string): string {
  return key && DISTANCE_KEYS.has(key) ? t(`distance.${key}`) : fallback;
}

export const levelLabel = (t: T, key: string) => t(`level.${key}`);
export const confidenceLabel = (t: T, c: "high" | "medium" | "low") => t(`confidence.${c}`);
export const paceName = (t: T, key: string) => t(`pace.${key}.name`);
export const paceUsage = (t: T, key: string) => t(`pace.${key}.usage`);
export const enduranceLabel = (t: T, key: string) => t(`endurance.${key}`);

export function limiterLabel(
  t: T,
  l: { code: "endurance" | "volume" | "longRun"; params: Record<string, string | number> }
): string {
  if (l.code === "endurance") {
    return t("limiter.endurance", { profile: enduranceLabel(t, String(l.params.profile)), exponent: l.params.exponent });
  }
  return t(`limiter.${l.code}`, l.params);
}

export function predictionReason(
  t: T,
  p: {
    reasonCode: "own" | "limiter" | "extrapolated" | "measured";
    reasonBase: string | null;
    limiters: Array<{ code: "endurance" | "volume" | "longRun"; params: Record<string, string | number> }>;
  },
  baseName: string
): string {
  if (p.reasonCode === "limiter" && p.limiters[0]) return limiterLabel(t, p.limiters[0]);
  if (p.reasonCode === "own") return t("reason.own");
  return t(`reason.${p.reasonCode}`, { base: distanceName(t, p.reasonBase, baseName) });
}
