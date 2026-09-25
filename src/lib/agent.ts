/**
 * L'agent qui « prépare des choses » — ici, le brief.
 *
 * Principe de sécurité (consigné dans la feuille de route) : l'agent ne
 * reçoit que des **agrégats** (jamais de tracés GPS, jamais de nom, de mail
 * ou de notes), n'écrit rien sans proposition, et ne calcule pas lui-même —
 * les chiffres viennent de `lib`. `composeBrief` produit un brief
 * **déterministe** (règles) qui fonctionne sans LLM ; quand une clé est
 * configurée, le LLM le met en forme. Fonctions pures, testées.
 */

export type BriefContext = {
  week: { km: number; sessions: number; goalKm: number; easyShare: number };
  form: { tsb: number; zone: string } | null;
  acwr: number | null;
  nextWeek: { km: number; sessions: number; key: string[] };
  nextRace: { name: string; days: number; distanceKm: number } | null;
  advice: string;
  pain: number;
  bestRun: { name: string; distanceKm: number; pace: number } | null;
};

export function composeBrief(ctx: BriefContext): string {
  const lines: string[] = [];
  const w = ctx.week;
  lines.push(`# Bilan de la semaine`);
  lines.push(
    `${w.km} km en ${w.sessions} sorties${w.goalKm ? ` (objectif ${w.goalKm} km)` : ""}. ` +
      `${Math.round(w.easyShare * 100)} % du temps en endurance fondamentale.`
  );
  if (ctx.form) lines.push(`Fraîcheur : ${ctx.form.tsb > 0 ? "+" : ""}${ctx.form.tsb}.`);
  if (ctx.acwr !== null) lines.push(`Charge aiguë/chronique : ${ctx.acwr.toFixed(2)}.`);

  lines.push(``);
  lines.push(`# Semaine à venir`);
  lines.push(`${ctx.nextWeek.km} km sur ${ctx.nextWeek.sessions} séances.`);
  for (const k of ctx.nextWeek.key.slice(0, 4)) lines.push(`- ${k}`);
  if (ctx.pain >= 2) lines.push(`⚠ Douleur signalée au carnet : priorité à la récupération.`);

  if (ctx.nextRace) {
    lines.push(``);
    lines.push(`# Objectif`);
    lines.push(`${ctx.nextRace.name} dans ${ctx.nextRace.days} jours (${ctx.nextRace.distanceKm} km).`);
  }

  lines.push(``);
  lines.push(`# Conseil`);
  lines.push(ctx.advice);

  if (ctx.bestRun) {
    lines.push(``);
    lines.push(`# Sortie du jour`);
    lines.push(`${ctx.bestRun.name} · ${ctx.bestRun.distanceKm.toFixed(1)} km à ${formatPace(ctx.bestRun.pace)}.`);
  }

  return lines.join("\n");
}

function formatPace(sPerKm: number): string {
  const total = Math.round(sPerKm);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}'${String(s).padStart(2, "0")}"/km`;
}

/** Prompt système du brief : l'agent met en forme, il n'invente rien. */
export const BRIEF_SYSTEM = `Tu es un préparateur course à pied pour une application d'entraînement. On te donne un brief factuel déjà calculé (kilomètres, forme, charge, objectif, conseil). Réécris-le en un texte clair et chaleureux, en français, dans la même structure (Bilan / Semaine à venir / Objectif / Conseil). N'invente AUCUN chiffre : garde exactement ceux fournis. Reste concis (250 mots max), tutoie l'athlète. Réponds uniquement avec le texte du brief.`;
