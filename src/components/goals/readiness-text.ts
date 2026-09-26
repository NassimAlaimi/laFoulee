/**
 * Textes de préparation (lib/goal) traduits : lib/goal produit des libellés
 * français stables, l'interface les rend dans la langue de l'utilisateur
 * (namespace « goals »).
 */
import type { RaceReadiness } from "@/lib/goal";

/** Libellé français d'un prérequis (lib/goal) → clé de traduction. */
/** Phase (libellé français de lib/goal) → clé goals.racePhase.* */
export const PHASE_KEY: Record<string, "prep" | "specific" | "taper" | "raceDay" | "past"> = {
  Préparation: "prep",
  Spécifique: "specific",
  Affûtage: "taper",
  "Jour J": "raceDay",
  Passée: "past",
};

export const FACTOR_KEY: Record<string, string> = {
  "Sortie longue": "longRun",
  "Volume hebdo": "volume",
  "Niveau d'allure": "pace",
};

/** Verdict chiffré (équivalent traduit de readinessFacts). */
export function factLines(
  r: RaceReadiness,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: any, values?: any) => string
): string[] {
  const out: string[] = [];
  for (const f of r.factors) {
    if (f.ok || f.target === 0) continue;
    if (f.label === "Sortie longue") out.push(t("factLongRun", { value: Math.round(f.value), target: Math.round(f.target) }));
    else if (f.label === "Volume hebdo") out.push(t("factVolume", { value: Math.round(f.value), target: Math.round(f.target) }));
  }
  if (r.gap && r.gap.secondsToFind > 0) {
    const min = Math.floor(r.gap.secondsToFind / 60);
    const sec = r.gap.secondsToFind % 60;
    out.push(t("factGap", { min, sec, needed: r.gap.weeksNeeded, available: r.weeksRemaining }));
  }
  if (out.length === 0) out.push(t("factAllGood"));
  return out;
}
