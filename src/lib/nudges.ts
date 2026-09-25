/**
 * Rappels contextuels — la bonne fonctionnalité au bon moment.
 *
 * Beaucoup de pages restaient inconnues (plan de course, rétrospective,
 * matériel…). Plutôt qu'un menu de plus, l'accueil suggère **une seule**
 * chose, choisie par priorité selon la situation. Chaque rappel a un
 * identifiant « de période » : l'ignorer le fait taire jusqu'à ce que la
 * situation change (autre course, autre mois…).
 *
 * Fonctions pures, testées dans tests/nudges.test.ts.
 */

export type NudgeInput = {
  now: Date;
  /** prochaine course objectif (kind = race, à venir) */
  nextRace: { id: string; name: string; date: Date; distance: number; hasRacePlan: boolean; hasPlan: boolean } | null;
  /** dernières sorties, les plus récentes d'abord */
  recentRuns: Array<{ id: string; feeling: number | null }>;
  /** chaussures actives : km parcourus et seuil de remplacement */
  shoes: Array<{ name: string; km: number; retireAtKm: number }>;
  /** jours de carnet sur les 7 derniers jours, et depuis toujours */
  logDaysLast7: number;
  logDaysEver: number;
};

export type Nudge = {
  /** identifiant stable pour « ignorer » (inclut la période) */
  id: string;
  /** clé i18n sous `home.nudges.*` */
  key: string;
  params: Record<string, string | number>;
  href: string;
};

const DAY = 86400000;

export function pickNudges(input: NudgeInput): Nudge[] {
  const out: Nudge[] = [];
  const { now, nextRace } = input;
  const month = `${now.getFullYear()}-${now.getMonth() + 1}`;

  if (nextRace) {
    const days = Math.ceil((nextRace.date.getTime() - now.getTime()) / DAY);
    if (days >= 0 && days <= 56 && !nextRace.hasRacePlan) {
      out.push({
        id: `racePlan-${nextRace.id}`,
        key: "racePlan",
        params: { name: nextRace.name, days },
        href: `/goals/${nextRace.id}/race-plan`,
      });
    }
    if (days > 21 && days <= 180 && !nextRace.hasPlan) {
      out.push({
        id: `plan-${nextRace.id}`,
        key: "plan",
        params: { name: nextRace.name, weeks: Math.round(days / 7) },
        href: `/goals/${nextRace.id}`,
      });
    }
  }

  const last5 = input.recentRuns.slice(0, 5);
  const missing = last5.filter((r) => r.feeling === null);
  if (last5.length >= 3 && missing.length >= 3) {
    out.push({
      id: `feeling-${missing[0].id}`,
      key: "feeling",
      params: { n: missing.length },
      href: `/activities/${missing[0].id}`,
    });
  }

  const worn = input.shoes
    .filter((s) => s.retireAtKm > 0 && s.km >= s.retireAtKm * 0.9)
    .sort((a, b) => b.km / b.retireAtKm - a.km / a.retireAtKm)[0];
  if (worn) {
    out.push({
      id: `gear-${worn.name}-${Math.floor(worn.km / 100)}`,
      key: "gear",
      params: { name: worn.name, km: Math.round(worn.km) },
      href: "/gear",
    });
  }

  if (now.getDate() <= 3) {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    out.push({ id: `recap-${month}`, key: "recap", params: { month: prev.getMonth() }, href: "/recap" });
  }

  if (input.logDaysEver > 0 && input.logDaysLast7 === 0) {
    out.push({ id: `log-${month}-${Math.floor(now.getDate() / 7)}`, key: "log", params: {}, href: "/log" });
  }

  return out;
}
