/**
 * L'agent qui « prépare des choses » — ici, le brief de la semaine.
 *
 * Principe (feuille de route) : l'agent ne reçoit que des **agrégats** (jamais
 * de tracés GPS, de nom, de mail ou de notes), n'écrit rien sans proposition,
 * et ne calcule pas lui-même. `composeBrief` produit un mot du coach
 * **déterministe** — un texte interprété, pas une redite des chiffres du
 * tableau de bord — qui fonctionne sans LLM ; quand une clé est configurée,
 * le LLM le reformule en prose. Fonctions pures, testées.
 */

export type BriefContext = {
  week: { km: number; sessions: number; goalKm: number; easyShare: number };
  /** km de la semaine précédente (0 si inconnue) */
  prevKm: number;
  acwr: number | null;
  nextWeek: { km: number; sessions: number; key: string[] };
  nextRace: { name: string; days: number; distanceKm: number } | null;
  advice: string;
  pain: number;
  bestRun: { name: string; distanceKm: number; pace: number } | null;
};

export function composeBrief(ctx: BriefContext): string {
  const paras: string[] = [];
  const pct = Math.round(ctx.week.easyShare * 100);

  // 1. La semaine, interprétée (pas seulement les chiffres).
  let lede = `Semaine de ${ctx.week.km} km en ${ctx.week.sessions} sorties`;
  if (ctx.prevKm > 0) {
    const d = ctx.week.km - ctx.prevKm;
    lede += d >= 2 ? ` — ${d} km de plus que la précédente` : d <= -2 ? ` — ${Math.abs(d)} km de moins` : " — volume stable";
  }
  lede += ".";
  if (ctx.week.easyShare < 0.6) lede += ` Seuls ${pct} % en endurance fondamentale : tes footings sont un peu rapides, c'est là qu'est le gisement.`;
  else if (ctx.week.easyShare > 0.9) lede += ` Presque tout en endurance : une base qui se construit bien.`;
  else lede += ` ${pct} % en endurance, une répartition saine.`;
  if (ctx.acwr !== null && ctx.acwr >= 1.4) lede += ` Charge aiguë élevée (${ctx.acwr.toFixed(2)}) : la récupération compte double cette semaine.`;
  paras.push(lede);

  // 2. Le fait marquant.
  if (ctx.bestRun) {
    paras.push(`Ta sortie la plus longue : ${ctx.bestRun.name}, ${ctx.bestRun.distanceKm.toFixed(1)} km à ${formatPace(ctx.bestRun.pace)}.`);
  }

  // 3. La semaine à venir.
  let next = `La semaine prochaine : ${ctx.nextWeek.km} km sur ${ctx.nextWeek.sessions} séances`;
  if (ctx.nextWeek.key.length) next += ` — ${ctx.nextWeek.key.slice(0, 3).join(", ")}`;
  next += ".";
  paras.push(next);

  // 4. L'objectif.
  if (ctx.nextRace) {
    paras.push(`Objectif : ${ctx.nextRace.name} dans ${ctx.nextRace.days} jours (${ctx.nextRace.distanceKm} km).`);
  }
  if (ctx.pain >= 2) paras.push("Douleur signalée au carnet : priorité à la récupération, ne force pas dessus.");

  // 5. Le conseil à retenir.
  paras.push(ctx.advice);
  return paras.join("\n\n");
}

/** Retire le markdown résiduel (titres `#`, puces) d'un texte d'agent. */
export function sanitizeBrief(text: string): string {
  return text
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatPace(sPerKm: number): string {
  const total = Math.round(sPerKm);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}'${String(s).padStart(2, "0")}"/km`;
}

/** Prompt système : l'agent reformule, il n'invente ni chiffre ni structure. */
export const BRIEF_SYSTEM = `Tu es un préparateur course à pied pour une application d'entraînement. On te donne un mot du coach déjà rédigé, factuel et chiffré. Reformule-le en français naturel, chaleureux, en tutoyant l'athlète, en 3 à 5 courts paragraphes séparés par une ligne vide. Garde exactement tous les chiffres fournis, n'en invente aucun. N'utilise aucun markdown (ni # ni puces). Réponds uniquement avec le texte.`;
