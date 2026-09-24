/**
 * Export iCalendar (RFC 5545) du plan d'entraînement.
 *
 * Événements « journée entière » : une séance est prévue un jour, pas à une
 * heure — c'est l'athlète qui la place dans sa journée. Les UID sont stables
 * (identifiant de séance) : un agenda abonné met à jour l'événement existant
 * quand le plan se réadapte, au lieu de le dupliquer.
 */

export type IcsSession = {
  id: string;
  date: Date;
  title: string;
  kindLabel: string;
  tagline?: string | null;
  distanceKm: number;
  durationMin: number;
  paceTarget?: number | null;
  status: string;
  steps?: Array<{ label: string; repeat?: number; distanceM?: number; durationMin?: number; pace?: number | null }>;
  url?: string;
};

export type IcsRace = { id: string; name: string; date: Date; distanceKm: number; targetTime?: number | null; url?: string };

const pace = (s: number) => `${Math.floor(s / 60)}'${String(Math.round(s % 60)).padStart(2, "0")}"/km`;

const hms = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  return h ? `${h}h${String(m).padStart(2, "0")}'${String(sec).padStart(2, "0")}` : `${m}'${String(sec).padStart(2, "0")}"`;
};

/** Échappement des valeurs texte (§3.3.11). */
export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/**
 * Repli des lignes à 75 octets (§3.1), sans couper un caractère UTF-8 en deux.
 */
export function foldLine(line: string): string {
  const bytes = (s: string) => Buffer.byteLength(s, "utf8");
  if (bytes(line) <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let limit = 75;
  for (const ch of line) {
    if (bytes(cur + ch) > limit) {
      out.push(cur);
      cur = ch;
      limit = 74; // la ligne de continuation commence par une espace
    } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const ymd = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function allDay(uid: string, date: Date, summary: string, description: string, now: Date, url?: string, extra: string[] = []) {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART;VALUE=DATE:${ymd(date)}`,
    `DTEND;VALUE=DATE:${ymd(next)}`,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(description)}`,
    ...(url ? [`URL:${url}`] : []),
    "TRANSP:TRANSPARENT",
    ...extra,
    "END:VEVENT",
  ];
}

export function sessionSummary(s: IcsSession): string {
  const done = s.status === "done" ? "✓ " : "";
  const dist = s.distanceKm > 0 ? ` · ${Math.round(s.distanceKm * 10) / 10} km` : s.durationMin ? ` · ${s.durationMin} min` : "";
  return `${done}${s.title}${dist}`;
}

export function sessionDescription(s: IcsSession, paceWord = "allure"): string {
  const lines: string[] = [];
  if (s.tagline) lines.push(s.tagline, "");
  lines.push(`${s.kindLabel} · ~${s.durationMin} min${s.paceTarget ? ` · ${paceWord} ${pace(s.paceTarget)}` : ""}`);
  if (s.steps?.length) {
    lines.push("");
    // Le libellé d'une étape est déjà complet (« 4 × 20 s en accélération… ») :
    // on n'y ajoute que l'allure, comme sur la carte de séance.
    for (const st of s.steps) lines.push(`– ${st.label}${st.pace ? ` · ${pace(st.pace)}` : ""}`);
  }
  if (s.url) lines.push("", s.url);
  return lines.join("\n");
}

export function buildCalendar({
  name,
  sessions,
  races,
  now = new Date(),
  paceWord = "allure",
}: {
  name: string;
  sessions: IcsSession[];
  races: IcsRace[];
  now?: Date;
  /** Mot « allure » localisé, pour la description des séances */
  paceWord?: string;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Foulee//Plan d'entrainement//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    "X-WR-TIMEZONE:Europe/Paris",
    // Les clients qui l'honorent se resynchronisent toutes les 6 h
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  for (const s of sessions) {
    if (s.status === "skipped") continue;
    lines.push(...allDay(`${s.id}@foulee`, s.date, sessionSummary(s), sessionDescription(s, paceWord), now, s.url));
  }
  for (const r of races) {
    const desc = [
      `${r.distanceKm} km`,
      r.targetTime ? `Objectif ${hms(r.targetTime)} (${pace(r.targetTime / r.distanceKm)})` : "",
      r.url ?? "",
    ]
      .filter(Boolean)
      .join("\n");
    lines.push(
      ...allDay(`race-${r.id}@foulee`, r.date, `🏁 ${r.name}`, desc, now, r.url, [
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeText(`${r.name} dans 7 jours`)}`,
        "TRIGGER:-P7D",
        "END:VALARM",
      ])
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
