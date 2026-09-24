import { longestDayStreak, whenYouRun } from "./recap";
import { periodStats, type ActivityLike } from "./stats";

/**
 * La saison dite en une phrase, comme le chapô d'un article : à quel rythme
 * tu cours, à quel moment, combien de kilomètres sur trois mois, et l'élan.
 * Rien de normatif — c'est un constat, pas un conseil.
 *
 * Les textes sont des clés i18n (`season.*`) : la lib renvoie la liste
 * des fragments à assembler (virgules en série, pas de conjonction finale).
 *
 * Renvoie null tant qu'il n'y a pas assez de sorties récentes pour en dire
 * quelque chose d'honnête (moins de 4 sur 90 jours).
 */
export type SentencePart = {
  key: string;
  params?: Record<string, string | number>;
};

export function seasonSentence(
  activities: ActivityLike[],
  now = new Date(),
  locale = "fr-FR"
): SentencePart[] | null {
  const start = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    return d;
  };
  const recent = activities.filter((a) => a.startDate >= start(90));
  if (recent.length < 4) return null;

  const prev = activities.filter((a) => a.startDate >= start(180) && a.startDate < start(90));
  const r = periodStats(recent);
  const p = periodStats(prev);
  const when = whenYouRun(recent);
  const streak = longestDayStreak(recent.map((a) => a.startDate));

  const perWeek = r.sessions / (90 / 7);
  const freq =
    perWeek >= 5 ? 5
    : perWeek >= 4 ? 4
    : perWeek >= 3 ? 3
    : perWeek >= 2 ? 2
    : 1;

  const parts: SentencePart[] = [{ key: `season.youRun${freq}` }];
  if (when.favoriteSlot !== null) {
    parts.push({ key: `season.slot${when.favoriteSlot}` });
  }
  parts.push({ key: "season.km", params: { km: fmt(r.km, locale) } });
  const delta = volumeDelta(r.km, p.km, p.sessions, locale);
  if (delta) parts.push(delta);
  if (streak.days >= 5) {
    parts.push({ key: "season.streak", params: { days: streak.days } });
  }

  return parts;
}

/** « +12 % », « −30 % », « stable », ou « soit 3,8 fois » pour les grands écarts. */
function volumeDelta(
  current: number,
  previous: number,
  previousSessions: number,
  locale = "fr-FR"
): SentencePart | null {
  if (previous < 1 || previousSessions < 4) return null;
  const diff = current - previous;
  const pct = Math.round((Math.abs(diff) / previous) * 100);
  if (pct < 5) return { key: "season.stable" };
  if (diff > 0) {
    return pct < 60
      ? { key: "season.deltaUp", params: { pct } }
      : { key: "season.deltaBig", params: { x: fmt(round1(current / previous), locale) } };
  }
  return { key: "season.deltaDown", params: { pct } };
}

const fmt = (n: number, locale: string) =>
  n.toLocaleString(locale, { maximumFractionDigits: 1 });
const round1 = (n: number) => Math.round(n * 10) / 10;
