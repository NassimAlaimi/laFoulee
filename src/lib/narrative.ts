import { longestDayStreak, whenYouRun } from "./recap";
import { periodStats, type ActivityLike } from "./stats";

/**
 * La saison dite en une phrase, comme le chapô d'un article : à quel rythme
 * tu cours, à quel moment, combien de kilomètres sur trois mois, et l'élan.
 * Rien de normatif — c'est un constat, pas un conseil.
 *
 * Renvoie null tant qu'il n'y a pas assez de sorties récentes pour en dire
 * quelque chose d'honnête (moins de 4 sur 90 jours).
 */
export function seasonSentence(activities: ActivityLike[], now = new Date()): string | null {
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
    perWeek >= 5 ? "5 fois par semaine ou plus"
    : perWeek >= 4 ? "environ 4 fois par semaine"
    : perWeek >= 3 ? "environ 3 fois par semaine"
    : perWeek >= 2 ? "environ 2 fois par semaine"
    : "environ 1 fois par semaine";

  const parts: string[] = [`Tu cours ${freq}`];
  if (when.favoriteSlot !== null) parts.push(`surtout ${TIME_PHRASE[when.favoriteSlot]}`);
  parts.push(`${fr(r.km)} km sur 3 mois`);
  if (p.km >= 1 && p.sessions >= 4) parts.push(volumeDelta(r.km, p.km));
  if (streak.days >= 5) parts.push(`dont ${streak.days} jours d'affilée`);

  // « Tu cours … , surtout … , N km … , dont … . » — les virgules en série,
  // pas de conjonction finale.
  return parts.join(", ") + ".";
}

const TIME_PHRASE = [
  "tôt le matin",
  "en matinée",
  "à la mi-journée",
  "l'après-midi",
  "le soir",
  "tard le soir",
];

/** « +12 % », « −30 % », « stable », ou « soit 3,8 fois » pour les grands écarts. */
function volumeDelta(current: number, previous: number): string {
  const diff = current - previous;
  const pct = Math.round((Math.abs(diff) / previous) * 100);
  if (pct < 5) return "stable";
  if (diff > 0) {
    return pct < 60 ? `+${pct} % vs les 3 mois d'avant` : `soit ${fr(round1(current / previous))} fois les 3 mois d'avant`;
  }
  return `−${pct} % vs les 3 mois d'avant`;
}

const fr = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const round1 = (n: number) => Math.round(n * 10) / 10;
