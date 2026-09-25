/**
 * Séances structurées — le format commun (bibliothèque perso, plan, export
 * montre, agent) et sa **saisie rapide en texte**, comme un coureur l'écrit
 * sur un carnet :
 *
 *   20' EF + 3×(6×400 @VMA r=1'30) R=3' + 10' RC
 *   15' échauffement, 3×10' @seuil r=2', 10' RC
 *   2km EF + 5×1km @5:10 r 400m + 2km EF
 *   45' @Z2
 *
 * Règles de lecture :
 * - durées : 20' · 20min · 1h10 · 1'30 · 45" · 45s ; distances : 400 · 400m ·
 *   2km · 2k · 1,5km (un nombre nu ≥ 50 est une distance en mètres) ;
 * - cibles : @VMA @I @R @seuil/@T/@SL @AM/@M @EF/@E, @5:10 (allure),
 *   @150bpm, @Z3, @90%VMA, @RPE7 — ou les mots nus EF, seuil, VMA… ;
 * - répétitions : N×… ou N×(…) ; « r=… » après une répétition simple est la
 *   récupération entre répétitions, « R=… » (majuscule) ou « r=… » après une
 *   parenthèse est la récupération entre séries ;
 * - séparateurs : + , ; ou retour à la ligne.
 *
 * Les cibles restent **relatives** (« @seuil ») : la séance suit la forme de
 * l'utilisateur au lieu de figer des allures. Elles ne sont résolues en s/km
 * qu'à l'affichage, avec le jeu d'allures du moment.
 *
 * Fonctions pures, testées dans tests/workout-dsl.test.ts.
 */

import type { PaceSet, Step } from "./workouts";

export type Role = "warmup" | "work" | "recovery" | "cooldown";

export type Duration = { kind: "time"; seconds: number } | { kind: "distance"; meters: number } | { kind: "open" };

export type RelTarget = "easy" | "marathon" | "threshold" | "interval" | "repetition" | "vma";

export type Target =
  | { kind: "rel"; ref: RelTarget }
  | { kind: "pace"; seconds: number }
  | { kind: "pctVma"; pct: number }
  | { kind: "hr"; bpm: number }
  | { kind: "zone"; zone: number }
  | { kind: "rpe"; rpe: number };

export type WorkoutStep =
  | { type: "step"; role: Role; duration: Duration; target?: Target; note?: string }
  | { type: "repeat"; times: number; steps: WorkoutStep[] };

export type ParseResult = { ok: true; steps: WorkoutStep[] } | { ok: false; error: string; at: number };

// ---------------------------------------------------------------- Lexique

const REL_WORDS: Record<string, RelTarget> = {
  ef: "easy",
  e: "easy",
  endurance: "easy",
  footing: "easy",
  easy: "easy",
  am: "marathon",
  m: "marathon",
  marathon: "marathon",
  seuil: "threshold",
  sl: "threshold",
  t: "threshold",
  tempo: "threshold",
  threshold: "threshold",
  i: "interval",
  vo2: "interval",
  vo2max: "interval",
  r: "repetition",
  vitesse: "repetition",
  vma: "vma",
  mas: "vma",
};

const ROLE_WORDS: Record<string, Role> = {
  "échauffement": "warmup",
  echauffement: "warmup",
  echauf: "warmup",
  "échauf": "warmup",
  warmup: "warmup",
  wu: "warmup",
  rc: "cooldown",
  "retour au calme": "cooldown",
  cooldown: "cooldown",
  cd: "cooldown",
  "récup": "recovery",
  recup: "recovery",
  trot: "recovery",
  marche: "recovery",
  walk: "recovery",
  jog: "recovery",
};

// ---------------------------------------------------------------- Tokens

type Tok =
  | { t: "rep"; n: number; at: number }
  | { t: "lp"; at: number }
  | { t: "rp"; at: number }
  | { t: "sep"; at: number }
  | { t: "amt"; d: Duration; at: number }
  | { t: "target"; v: Target; at: number }
  | { t: "rec"; d: Duration; between: boolean; at: number }
  | { t: "word"; w: string; at: number };

const AMOUNT_RE =
  /^(?:(\d+)\s*h\s*(\d{1,2})?(?!\d)|(\d+)\s*['′’]\s*(\d{1,2})?\s*(?:["″”])?|(\d+)\s*min\b|(\d+)\s*(?:["″”]|s\b|sec\b)|(\d+(?:[.,]\d+)?)\s*(?:km|k)\b|(\d+)\s*m\b(?!in)|(\d{2,5})(?![\d'′’"″h:.,]|\s*(?:x|×|\*|min|s\b|sec|km|k\b|m\b)))/i;

function readAmount(src: string): { d: Duration; len: number } | null {
  const m = AMOUNT_RE.exec(src);
  if (!m) return null;
  const len = m[0].length;
  if (m[1] !== undefined) return { d: { kind: "time", seconds: +m[1] * 3600 + (m[2] ? +m[2] * 60 : 0) }, len };
  if (m[3] !== undefined) return { d: { kind: "time", seconds: +m[3] * 60 + (m[4] ? +m[4] : 0) }, len };
  if (m[5] !== undefined) return { d: { kind: "time", seconds: +m[5] * 60 }, len };
  if (m[6] !== undefined) return { d: { kind: "time", seconds: +m[6] }, len };
  if (m[7] !== undefined) return { d: { kind: "distance", meters: Math.round(parseFloat(m[7].replace(",", ".")) * 1000) }, len };
  if (m[8] !== undefined) return { d: { kind: "distance", meters: +m[8] }, len };
  if (m[9] !== undefined && +m[9] >= 50) return { d: { kind: "distance", meters: +m[9] }, len };
  return null;
}

function readTarget(spec: string): Target | null {
  const s = spec.toLowerCase().replace(/\s+/g, "");
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{1,2})[:'′’](\d{2})(?:\/km)?$/))) return { kind: "pace", seconds: +m[1] * 60 + +m[2] };
  if ((m = s.match(/^(\d{2,3})bpm$/))) return { kind: "hr", bpm: +m[1] };
  if ((m = s.match(/^z([1-5])$/))) return { kind: "zone", zone: +m[1] };
  if ((m = s.match(/^rpe(\d{1,2})$/))) return { kind: "rpe", rpe: Math.min(10, +m[1]) };
  if ((m = s.match(/^(\d{2,3})%(?:vma|mas)?$/))) return { kind: "pctVma", pct: +m[1] };
  if (REL_WORDS[s]) return { kind: "rel", ref: REL_WORDS[s] };
  return null;
}

export function tokenize(input: string): { ok: true; toks: Tok[] } | { ok: false; error: string; at: number } {
  const toks: Tok[] = [];
  let i = 0;
  const src = input.replace(/\u00a0/g, " ");
  while (i < src.length) {
    const rest = src.slice(i);
    const ws = rest.match(/^[ \t]+/);
    if (ws) {
      i += ws[0].length;
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^[+,;\n\r]+/))) {
      toks.push({ t: "sep", at: i });
      i += m[0].length;
      continue;
    }
    if (rest[0] === "(") {
      toks.push({ t: "lp", at: i });
      i++;
      continue;
    }
    if (rest[0] === ")") {
      toks.push({ t: "rp", at: i });
      i++;
      continue;
    }
    if ((m = rest.match(/^(\d+)\s*[x×*]\s*(?=[\d(])/i))) {
      toks.push({ t: "rep", n: +m[1], at: i });
      i += m[0].length;
      continue;
    }
    // Récupération : r=1'30, R=3', r 200m, récup 1'
    if ((m = rest.match(/^(R|r|récup|recup|rec)\s*(?:[=:]\s*|\s+(?=\d))/))) {
      const amt = readAmount(rest.slice(m[0].length));
      if (!amt) return { ok: false, error: "recovery", at: i };
      toks.push({ t: "rec", d: amt.d, between: m[1] === "R", at: i });
      i += m[0].length + amt.len;
      continue;
    }
    if (rest[0] === "@") {
      const sm = rest.slice(1).match(/^\s*(\d{2,3}\s*%\s*(?:vma|mas)?|[^\s+,;()]+)/i);
      const target = sm ? readTarget(sm[1]) : null;
      if (!target) return { ok: false, error: "target", at: i };
      toks.push({ t: "target", v: target, at: i });
      i += 1 + sm![0].length;
      continue;
    }
    const amt = readAmount(rest);
    if (amt) {
      toks.push({ t: "amt", d: amt.d, at: i });
      i += amt.len;
      continue;
    }
    if ((m = rest.match(/^retour\s+au\s+calme/i))) {
      toks.push({ t: "word", w: "retour au calme", at: i });
      i += m[0].length;
      continue;
    }
    if ((m = rest.match(/^(\d{1,2}[:'′’]\d{2})(?:\/km)?/))) {
      toks.push({ t: "target", v: readTarget(m[1])!, at: i });
      i += m[0].length;
      continue;
    }
    if ((m = rest.match(/^[a-zA-Zà-ÿÀ-Ÿ0-9%]+/))) {
      toks.push({ t: "word", w: m[0].toLowerCase(), at: i });
      i += m[0].length;
      continue;
    }
    return { ok: false, error: "char", at: i };
  }
  return { ok: true, toks };
}

// ---------------------------------------------------------------- Analyse

class ParseError extends Error {
  constructor(
    public code: string,
    public at: number
  ) {
    super(code);
  }
}

export function parseWorkout(input: string): ParseResult {
  const lex = tokenize(input);
  if (!lex.ok) return { ok: false, error: lex.error, at: lex.at };
  const toks = lex.toks;
  let p = 0;
  const peek = () => toks[p];

  const seq = (closing: boolean): WorkoutStep[] => {
    const items: WorkoutStep[] = [];
    while (p < toks.length) {
      const tk = peek();
      if (tk.t === "sep") {
        p++;
        continue;
      }
      if (tk.t === "rp") {
        if (!closing) throw new ParseError("paren", tk.at);
        return items;
      }
      items.push(...item());
    }
    if (closing) throw new ParseError("unclosed", input.length);
    return items;
  };

  const item = (): WorkoutStep[] => {
    const tk = peek();
    if (tk.t === "rep") {
      p++;
      if (tk.n < 1 || tk.n > 99) throw new ParseError("times", tk.at);
      let body: WorkoutStep[];
      let group = false;
      if (peek()?.t === "lp") {
        p++;
        body = seq(true);
        p++; // ')'
        group = true;
      } else {
        body = [step()];
      }
      if (body.length === 0) throw new ParseError("empty", tk.at);
      // Récupérations qui suivent : entre répétitions (simple) ou entre séries.
      let inner: Duration | null = null;
      let between: Duration | null = null;
      while (peek()?.t === "rec") {
        const r = peek() as Extract<Tok, { t: "rec" }>;
        p++;
        if (r.between || group) between = r.d;
        else inner = r.d;
      }
      for (const b of body) if (b.type === "step" && b.role !== "recovery") b.role = "work";
      // La récupération devient la dernière étape du corps répété : elle
      // sépare les répétitions (ou les séries) et saute après la dernière.
      const rec = inner ?? between;
      if (rec) body.push({ type: "step", role: "recovery", duration: rec });
      return [{ type: "repeat", times: tk.n, steps: body }];
    }
    if (tk.t === "rec") {
      p++;
      return [{ type: "step", role: "recovery", duration: tk.d }];
    }
    return [step()];
  };

  const step = (): WorkoutStep => {
    const start = peek();
    if (!start) throw new ParseError("end", input.length);
    let duration: Duration | null = null;
    let target: Target | undefined;
    let role: Role | null = null;
    const notes: string[] = [];
    let consumed = 0;
    while (p < toks.length) {
      const tk = peek();
      if (tk.t === "amt" && !duration) {
        duration = tk.d;
      } else if (tk.t === "target" && !target) {
        target = tk.v;
      } else if (tk.t === "word") {
        const w = tk.w;
        if (ROLE_WORDS[w] && !role) {
          role = ROLE_WORDS[w];
          if (role === "warmup" || role === "cooldown") target ??= { kind: "rel", ref: "easy" };
        } else if (REL_WORDS[w] && !target && w.length > 1) target = { kind: "rel", ref: REL_WORDS[w] };
        else if (REL_WORDS[w] && !target && consumed > 0) target = { kind: "rel", ref: REL_WORDS[w] };
        else if (readTarget(w) && !target) target = readTarget(w)!;
        else notes.push(w);
      } else break;
      p++;
      consumed++;
    }
    if (consumed === 0) throw new ParseError("unexpected", start.at);
    return {
      type: "step",
      role: role ?? "work",
      duration: duration ?? { kind: "open" },
      ...(target ? { target } : {}),
      ...(notes.length ? { note: notes.join(" ") } : {}),
    };
  };

  try {
    const steps = seq(false);
    if (steps.length === 0) return { ok: false, error: "empty", at: 0 };
    inferRoles(steps);
    return { ok: true, steps };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.code, at: e.at };
    throw e;
  }
}

/** Premier bloc facile = échauffement, dernier = retour au calme. */
function inferRoles(steps: WorkoutStep[]) {
  if (steps.length < 2) return;
  const easy = (s: WorkoutStep) =>
    s.type === "step" && s.role === "work" && (!s.target || (s.target.kind === "rel" && s.target.ref === "easy") || (s.target.kind === "zone" && s.target.zone <= 2));
  const first = steps[0];
  const last = steps[steps.length - 1];
  if (easy(first) && first.type === "step") {
    first.role = "warmup";
    first.target ??= { kind: "rel", ref: "easy" };
  }
  if (easy(last) && last.type === "step") {
    last.role = "cooldown";
    last.target ??= { kind: "rel", ref: "easy" };
  }
}

// ---------------------------------------------------------------- Écriture

export function fmtDuration(d: Duration): string {
  if (d.kind === "open") return "";
  if (d.kind === "distance") {
    return d.meters >= 1000 && d.meters % 100 === 0 ? `${String(d.meters / 1000).replace(".", ",")}km` : `${d.meters}m`;
  }
  const s = d.seconds;
  if (s >= 3600) return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
  if (s < 60) return `${s}"`;
  return s % 60 ? `${Math.floor(s / 60)}'${String(s % 60).padStart(2, "0")}` : `${s / 60}'`;
}

const REL_SHORT: Record<RelTarget, string> = {
  easy: "EF",
  marathon: "AM",
  threshold: "seuil",
  interval: "I",
  repetition: "R",
  vma: "VMA",
};

export function fmtTarget(t: Target): string {
  switch (t.kind) {
    case "rel":
      return REL_SHORT[t.ref];
    case "pace":
      return `${Math.floor(t.seconds / 60)}:${String(t.seconds % 60).padStart(2, "0")}`;
    case "pctVma":
      return `${t.pct}%VMA`;
    case "hr":
      return `${t.bpm}bpm`;
    case "zone":
      return `Z${t.zone}`;
    case "rpe":
      return `RPE${t.rpe}`;
  }
}

/** Réécriture canonique (idempotente) — sert à normaliser la saisie. */
export function toDsl(steps: WorkoutStep[]): string {
  const one = (s: WorkoutStep): string => {
    if (s.type === "repeat") {
      const rec = s.steps.length >= 2 && s.steps[s.steps.length - 1].type === "step" && (s.steps[s.steps.length - 1] as { role: Role }).role === "recovery"
        ? (s.steps[s.steps.length - 1] as Extract<WorkoutStep, { type: "step" }>)
        : null;
      const body = rec ? s.steps.slice(0, -1) : s.steps;
      const inner = body.length === 1 && body[0].type === "step" ? one(body[0]) : `(${body.map(one).join(" + ")})`;
      const group = inner.startsWith("(");
      return `${s.times}×${inner}${rec ? ` ${group ? "R" : "r"}=${fmtDuration(rec.duration)}` : ""}`;
    }
    const parts: string[] = [];
    const d = fmtDuration(s.duration);
    if (d) parts.push(d);
    if (s.role === "warmup") parts.push("échauffement");
    else if (s.role === "cooldown") parts.push("RC");
    else if (s.role === "recovery") parts.push("récup");
    if (s.target && !(s.role !== "work" && s.target.kind === "rel" && s.target.ref === "easy")) parts.push(`@${fmtTarget(s.target)}`);
    if (s.note) parts.push(s.note);
    return parts.join(" ");
  };
  return steps.map(one).join(" + ");
}

// ---------------------------------------------------------------- Résolution

/** Allure (s/km) d'une cible pour un jeu d'allures donné. */
export function targetPace(t: Target | undefined, paces: PaceSet, role: Role): number {
  if (!t) return role === "recovery" ? paces.easy * 1.12 : role === "work" ? paces.easy : paces.easy;
  switch (t.kind) {
    case "pace":
      return t.seconds;
    case "pctVma":
      return 3600 / ((paces.vma * t.pct) / 100);
    case "rel":
      return t.ref === "vma" ? 3600 / paces.vma : paces[t.ref];
    case "zone":
      return [paces.easy * 1.08, paces.easy, paces.marathon, paces.threshold, paces.interval][t.zone - 1];
    case "hr":
    case "rpe": {
      const r = t.kind === "rpe" ? t.rpe : 0;
      if (t.kind === "rpe") return r <= 3 ? paces.easy : r <= 5 ? paces.marathon : r <= 7 ? paces.threshold : paces.interval;
      return paces.easy;
    }
  }
}

/** Niveau d'intensité 1-5 d'une étape, pour le profil et la charge. */
export function stepIntensity(s: Extract<WorkoutStep, { type: "step" }>, paces: PaceSet): number {
  if (s.role === "recovery") return 1;
  if (s.role === "warmup" || s.role === "cooldown") return 1;
  const pace = targetPace(s.target, paces, s.role);
  if (pace >= paces.easy * 0.97) return 1;
  if (pace >= paces.marathon * 0.99) return 2;
  if (pace >= paces.threshold * 0.99) return 3;
  if (pace >= paces.interval * 0.99) return 4;
  return 5;
}

export type Segment = { role: Role; seconds: number; meters: number; intensity: number; label: string };

/** Déplie la séance en segments datés, avec allures résolues. */
export function expand(steps: WorkoutStep[], paces: PaceSet, openSeconds = 600): Segment[] {
  const out: Segment[] = [];
  const walk = (list: WorkoutStep[]) => {
    for (const s of list) {
      if (s.type === "repeat") {
        for (let i = 0; i < s.times; i++) {
          // La récupération de la dernière répétition n'est pas courue.
          const last = i === s.times - 1;
          const body = last && s.steps.length > 1 && s.steps[s.steps.length - 1].type === "step" && (s.steps[s.steps.length - 1] as { role: Role }).role === "recovery"
            ? s.steps.slice(0, -1)
            : s.steps;
          walk(body);
        }
        continue;
      }
      const pace = targetPace(s.target, paces, s.role);
      let seconds: number;
      let meters: number;
      if (s.duration.kind === "time") {
        seconds = s.duration.seconds;
        meters = (seconds / pace) * 1000;
      } else if (s.duration.kind === "distance") {
        meters = s.duration.meters;
        seconds = (meters / 1000) * pace;
      } else {
        seconds = openSeconds;
        meters = (seconds / pace) * 1000;
      }
      out.push({
        role: s.role,
        seconds: Math.round(seconds),
        meters: Math.round(meters),
        intensity: stepIntensity(s, paces),
        label: [fmtDuration(s.duration), s.target ? `@${fmtTarget(s.target)}` : "", s.note ?? ""].filter(Boolean).join(" "),
      });
    }
  };
  walk(steps);
  return out;
}

export type WorkoutSummary = {
  seconds: number;
  meters: number;
  /** minutes passées à intensité ≥ 3 */
  hardMinutes: number;
  /** intensité globale 1-5 (max des blocs soutenus ≥ 3 min cumulées) */
  intensity: number;
  /** charge estimée, même échelle que plannedLoad (min × facteur d'intensité) */
  load: number;
};

const LOAD_FACTOR = [0, 1, 1.5, 2.2, 3, 3.6];

export function summarize(steps: WorkoutStep[], paces: PaceSet): WorkoutSummary {
  const seg = expand(steps, paces);
  const seconds = seg.reduce((a, s) => a + s.seconds, 0);
  const meters = seg.reduce((a, s) => a + s.meters, 0);
  const byLevel = [0, 0, 0, 0, 0, 0];
  for (const s of seg) byLevel[s.intensity] += s.seconds;
  let intensity = 1;
  for (let l = 5; l >= 2; l--) if (byLevel[l] >= 180) {
    intensity = l;
    break;
  }
  return {
    seconds,
    meters,
    hardMinutes: Math.round((byLevel[3] + byLevel[4] + byLevel[5]) / 60),
    intensity,
    load: Math.round(seg.reduce((a, s) => a + (s.seconds / 60) * LOAD_FACTOR[s.intensity], 0)),
  };
}

/** Type de séance du plan déduit de la structure. */
export function inferKind(steps: WorkoutStep[], paces: PaceSet): "easy" | "long" | "tempo" | "threshold" | "intervals" | "fartlek" {
  const sum = summarize(steps, paces);
  const hasRepeat = steps.some((s) => s.type === "repeat");
  if (sum.intensity >= 4) return "intervals";
  if (sum.intensity === 3) return hasRepeat ? "threshold" : "tempo";
  if (sum.intensity === 2) return hasRepeat ? "fartlek" : "tempo";
  return sum.seconds >= 75 * 60 ? "long" : "easy";
}

/**
 * Conversion vers les étapes « plan » (lib/workouts Step) : une étape par bloc
 * de premier niveau, allures résolues, pour poser la séance dans un plan.
 */
export function toPlanSteps(steps: WorkoutStep[], paces: PaceSet): Step[] {
  const out: Step[] = [];
  for (const s of steps) {
    const seg = expand([s], paces);
    const seconds = seg.reduce((a, x) => a + x.seconds, 0);
    const meters = seg.reduce((a, x) => a + x.meters, 0);
    if (s.type === "repeat") {
      const work = seg.filter((x) => x.role === "work");
      const pace = work.length ? work.reduce((a, x) => a + x.seconds, 0) / (work.reduce((a, x) => a + x.meters, 0) / 1000) : null;
      out.push({
        kind: "work",
        label: toDsl([s]),
        repeat: s.times,
        distanceM: Math.round(meters),
        durationMin: Math.round((work.reduce((a, x) => a + x.seconds, 0) / Math.max(1, s.times) / 60) * 10) / 10,
        pace: pace ? Math.round(pace) : null,
      });
      continue;
    }
    out.push({
      kind: s.role === "work" ? "block" : s.role,
      label: toDsl([s]),
      distanceM: Math.round(meters),
      durationMin: Math.round(seconds / 60),
      pace: Math.round(targetPace(s.target, paces, s.role)),
    });
  }
  return out;
}
