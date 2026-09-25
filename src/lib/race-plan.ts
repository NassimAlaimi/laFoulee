/**
 * Plan de course — du GPX à la ligne d'arrivée.
 *
 * - **Échantillonnage** : le tracé est ré-échantillonné tous les 50 m,
 *   l'altitude lissée sur ±100 m (le bruit GPS invente sinon des côtes).
 * - **Découpage** : montées, descentes et plats *homogènes* (pas des tranches
 *   fixes de 1 km), classés par difficulté.
 * - **Allures** : l'effort est constant, pas l'allure — chaque morceau reçoit
 *   l'allure plate × coût de la pente (GAP) × stratégie (négative, régulière)
 *   × pénalité de chaleur, puis le tout est remis à l'échelle du chrono visé.
 * - **Scénarios** A (objectif), B (réaliste), C (sauvetage) avec temps de
 *   passage aux points clés et le **signal de bascule** de A vers B.
 * - **Débrief** : l'activité de la course comparée au plan, tronçon par
 *   tronçon, avec des leçons.
 *
 * Fonctions pures, testées dans tests/race-plan.test.ts.
 */

import { haversine } from "./polyline";
import type { GpxPoint } from "./gpx";

export type Sample = { d: number; ele: number; lat: number; lon: number; grade: number };

const STEP = 50;

/** Ré-échantillonnage tous les 50 m + altitude lissée + pente locale (%). */
export function sampleCourse(points: GpxPoint[]): Sample[] {
  if (points.length < 2) return [];
  const cum: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + haversine([points[i - 1].lat, points[i - 1].lon], [points[i].lat, points[i].lon]));
  }
  const total = cum[cum.length - 1];
  const raw: Array<{ d: number; ele: number; lat: number; lon: number }> = [];
  let j = 0;
  for (let d = 0; d <= total; d += STEP) {
    while (j < cum.length - 2 && cum[j + 1] < d) j++;
    const span = cum[j + 1] - cum[j] || 1;
    const f = Math.min(1, Math.max(0, (d - cum[j]) / span));
    const a = points[j];
    const b = points[j + 1];
    raw.push({ d, ele: a.ele + (b.ele - a.ele) * f, lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f });
  }
  if (raw[raw.length - 1].d < total) {
    const last = points[points.length - 1];
    raw.push({ d: total, ele: last.ele, lat: last.lat, lon: last.lon });
  }
  // Lissage de l'altitude sur ±100 m (fenêtre de 5 échantillons).
  const smooth = raw.map((_, i) => {
    const lo = Math.max(0, i - 2);
    const hi = Math.min(raw.length - 1, i + 2);
    let s = 0;
    for (let k = lo; k <= hi; k++) s += raw[k].ele;
    return s / (hi - lo + 1);
  });
  return raw.map((r, i) => {
    const lo = Math.max(0, i - 2);
    const hi = Math.min(raw.length - 1, i + 2);
    const dd = raw[hi].d - raw[lo].d;
    return { ...r, ele: smooth[i], grade: dd > 0 ? ((smooth[hi] - smooth[lo]) / dd) * 100 : 0 };
  });
}

// ---------------------------------------------------------------- Découpage

export type SegmentKind = "up" | "down" | "flat";
export type CourseSegment = {
  kind: SegmentKind;
  startKm: number;
  endKm: number;
  gain: number;
  loss: number;
  /** pente moyenne (%) */
  grade: number;
  /** pente max sur 100 m (%) */
  maxGrade: number;
  /** rang de difficulté parmi les montées (1 = la plus dure), sinon null */
  rank: number | null;
};

const UP = 2.5;
const MIN_SEGMENT = 300;

export function segmentCourse(samples: Sample[]): CourseSegment[] {
  if (samples.length < 2) return [];
  const kindOf = (g: number): SegmentKind => (g >= UP ? "up" : g <= -UP ? "down" : "flat");
  type Run = { kind: SegmentKind; from: number; to: number };
  let runs: Run[] = [];
  for (let i = 1; i < samples.length; i++) {
    const k = kindOf(samples[i].grade);
    const last = runs[runs.length - 1];
    if (last && last.kind === k) last.to = i;
    else runs.push({ kind: k, from: i - 1, to: i });
  }
  // Les morceaux trop courts sont absorbés par le voisin le plus long, puis on
  // refusionne les voisins de même nature — jusqu'à stabilité.
  for (let pass = 0; pass < 10; pass++) {
    let changed = false;
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      const len = samples[r.to].d - samples[r.from].d;
      if (len >= MIN_SEGMENT || runs.length === 1) continue;
      const prev = runs[i - 1];
      const next = runs[i + 1];
      const target = !prev ? next : !next ? prev : samples[prev.to].d - samples[prev.from].d >= samples[next.to].d - samples[next.from].d ? prev : next;
      if (target === prev) prev.to = r.to;
      else next.from = r.from;
      runs.splice(i, 1);
      changed = true;
      break;
    }
    const merged: Run[] = [];
    for (const r of runs) {
      const last = merged[merged.length - 1];
      if (last && last.kind === r.kind) last.to = r.to;
      else merged.push({ ...r });
    }
    if (merged.length !== runs.length) changed = true;
    runs = merged;
    if (!changed) break;
  }
  const segs: CourseSegment[] = runs.map((r) => {
    let gain = 0;
    let loss = 0;
    let maxGrade = 0;
    for (let i = r.from + 1; i <= r.to; i++) {
      const de = samples[i].ele - samples[i - 1].ele;
      if (de > 0) gain += de;
      else loss -= de;
      if (Math.abs(samples[i].grade) > Math.abs(maxGrade)) maxGrade = samples[i].grade;
    }
    const len = samples[r.to].d - samples[r.from].d;
    const net = samples[r.to].ele - samples[r.from].ele;
    // Le type final suit la pente moyenne réelle (après absorptions).
    const grade = len > 0 ? (net / len) * 100 : 0;
    return {
      kind: grade >= UP * 0.6 ? "up" : grade <= -UP * 0.6 ? "down" : "flat",
      startKm: Math.round(samples[r.from].d / 10) / 100,
      endKm: Math.round(samples[r.to].d / 10) / 100,
      gain: Math.round(gain),
      loss: Math.round(loss),
      grade: Math.round(grade * 10) / 10,
      maxGrade: Math.round(maxGrade * 10) / 10,
      rank: null,
    };
  });
  const climbs = segs.filter((s) => s.kind === "up").sort((a, b) => b.gain * b.grade - a.gain * a.grade);
  climbs.forEach((c, i) => (c.rank = i + 1));
  return segs;
}

// ---------------------------------------------------------------- Allures

/**
 * Coût relatif d'un kilomètre selon la pente (1 = plat), courbe de type
 * « allure ajustée à la pente » : la montée coûte de plus en plus, la
 * descente aide jusqu'à ≈ −10 % puis recommence à freiner.
 */
export function gapFactor(gradePct: number): number {
  const g = Math.max(-30, Math.min(35, gradePct));
  if (g >= 0) return 1 + 0.033 * g + 0.0006 * g * g;
  return Math.max(0.88, 1 + 0.018 * g + 0.0009 * g * g);
}

export type Strategy = "even" | "negative" | "positive";

/** Facteur de stratégie selon la position (0 = départ, 1 = arrivée). ±1,5 %. */
export function strategyFactor(strategy: Strategy, x: number): number {
  if (strategy === "even") return 1;
  const s = strategy === "negative" ? 1 : -1;
  return 1 + s * 0.03 * (0.5 - x);
}

/**
 * Pénalité de chaleur (fraction d'allure) selon température et point de rosée,
 * table de Hadley (somme en °F) : sous 100 rien, au-delà de 180 la course
 * n'est pas raisonnable (on plafonne à 12 %).
 */
export function heatPenalty(tempC: number | null, dewC: number | null): number {
  if (tempC === null) return 0;
  const f = (c: number) => c * 1.8 + 32;
  const sum = f(tempC) + f(dewC ?? tempC - 10);
  const table: Array<[number, number]> = [
    [100, 0],
    [110, 0.005],
    [120, 0.01],
    [130, 0.02],
    [140, 0.03],
    [150, 0.045],
    [160, 0.06],
    [170, 0.08],
    [180, 0.1],
  ];
  if (sum <= 100) return 0;
  for (let i = 1; i < table.length; i++) {
    if (sum <= table[i][0]) {
      const [a, pa] = table[i - 1];
      const [b, pb] = table[i];
      return Math.round((pa + ((sum - a) / (b - a)) * (pb - pa)) * 1000) / 1000;
    }
  }
  return 0.12;
}

export type PacingInput = {
  samples: Sample[];
  targetSeconds: number;
  strategy: Strategy;
  heat?: number;
  /** facteur de pente personnel (E2), sinon gapFactor */
  grade?: (g: number) => number;
};

/** Temps cumulé (s) à chaque échantillon, total = targetSeconds × (1 + chaleur). */
export function pacingCurve(input: PacingInput): number[] {
  const { samples, strategy } = input;
  if (samples.length < 2 || input.targetSeconds <= 0) return [];
  const total = samples[samples.length - 1].d;
  const gf = input.grade ?? gapFactor;
  const costs: number[] = [0];
  for (let i = 1; i < samples.length; i++) {
    const dd = samples[i].d - samples[i - 1].d;
    const x = samples[i].d / total;
    costs.push(dd * gf(samples[i].grade) * strategyFactor(strategy, x));
  }
  const sum = costs.reduce((a, b) => a + b, 0);
  const goal = input.targetSeconds * (1 + (input.heat ?? 0));
  const out: number[] = [];
  let acc = 0;
  for (const c of costs) {
    acc += (c / sum) * goal;
    out.push(acc);
  }
  return out;
}

/** Temps de passage (s) à une distance donnée (m), par interpolation. */
export function timeAt(samples: Sample[], curve: number[], meters: number): number {
  if (!curve.length) return 0;
  if (meters <= 0) return 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].d >= meters) {
      const f = (meters - samples[i - 1].d) / (samples[i].d - samples[i - 1].d || 1);
      return curve[i - 1] + f * (curve[i] - curve[i - 1]);
    }
  }
  return curve[curve.length - 1];
}

export type KmRow = { km: number; seconds: number; cumulative: number; pace: number; grade: number };

/** Tableau kilomètre par kilomètre (dernier km partiel inclus). */
export function kmTable(samples: Sample[], curve: number[]): KmRow[] {
  const total = samples.length ? samples[samples.length - 1].d : 0;
  const rows: KmRow[] = [];
  for (let m = 1000; m < total + 999; m += 1000) {
    const end = Math.min(m, total);
    const start = m - 1000;
    const t0 = timeAt(samples, curve, start);
    const t1 = timeAt(samples, curve, end);
    const len = end - start;
    if (len < 50) break;
    const inKm = samples.filter((s) => s.d > start && s.d <= end);
    const grade = inKm.length ? inKm.reduce((a, s) => a + s.grade, 0) / inKm.length : 0;
    rows.push({ km: Math.round(end / 10) / 100, seconds: Math.round(t1 - t0), cumulative: Math.round(t1), pace: Math.round(((t1 - t0) / len) * 1000), grade: Math.round(grade * 10) / 10 });
  }
  return rows;
}

// ---------------------------------------------------------------- Scénarios

export type Checkpoint = { km: number; kind: "aid" | "cutoff" | "crew" | "mark"; label: string; /** barrière : secondes depuis le départ */ cutoff?: number | null };

export type Scenario = { key: "A" | "B" | "C"; seconds: number; passes: Array<{ km: number; label: string; time: number; margin: number | null }> };

/**
 * Trois scénarios et leurs passages aux points clés. B vaut la prédiction
 * réaliste si elle est plus lente que l'objectif (sinon objectif + 3 %),
 * C = objectif + 8 % (« finir en bon état »).
 */
export function scenarios(opts: {
  samples: Sample[];
  targetSeconds: number;
  realisticSeconds?: number | null;
  strategy: Strategy;
  heat?: number;
  checkpoints: Checkpoint[];
  grade?: (g: number) => number;
}): Scenario[] {
  const total = opts.samples.length ? opts.samples[opts.samples.length - 1].d : 0;
  const b = opts.realisticSeconds && opts.realisticSeconds > opts.targetSeconds * 1.01 ? opts.realisticSeconds : opts.targetSeconds * 1.03;
  const defs: Array<[Scenario["key"], number]> = [
    ["A", opts.targetSeconds],
    ["B", Math.round(b)],
    ["C", Math.round(opts.targetSeconds * 1.08)],
  ];
  // Points de passage : checkpoints + mi-course + marques tous les 5 km.
  const marks: Checkpoint[] = [...opts.checkpoints];
  for (let k = 5; k * 1000 < total - 500; k += 5) if (!marks.some((c) => Math.abs(c.km - k) < 0.3)) marks.push({ km: k, kind: "mark", label: `km ${k}` });
  marks.sort((x, y) => x.km - y.km);
  return defs.map(([key, seconds]) => {
    const curve = pacingCurve({ samples: opts.samples, targetSeconds: seconds, strategy: opts.strategy, heat: opts.heat, grade: opts.grade });
    return {
      key,
      seconds: Math.round(curve[curve.length - 1] ?? seconds),
      passes: marks.map((c) => {
        const time = Math.round(timeAt(opts.samples, curve, c.km * 1000));
        return { km: c.km, label: c.label, time, margin: c.cutoff ? c.cutoff - time : null };
      }),
    };
  });
}

/**
 * Signal de bascule : au point le plus proche de la mi-course, l'heure de
 * passage au-delà de laquelle viser B (milieu entre A et B à ce point).
 */
export function switchSignal(sc: Scenario[]): { km: number; after: number } | null {
  const a = sc.find((s) => s.key === "A");
  const b = sc.find((s) => s.key === "B");
  if (!a || !b || !a.passes.length) return null;
  const totalKm = a.passes[a.passes.length - 1].km;
  let best = 0;
  for (let i = 0; i < a.passes.length; i++) if (Math.abs(a.passes[i].km - totalKm / 2) < Math.abs(a.passes[best].km - totalKm / 2)) best = i;
  return { km: a.passes[best].km, after: Math.round((a.passes[best].time + b.passes[best].time) / 2) };
}

// ---------------------------------------------------------------- Débrief

export type DebriefRow = { fromKm: number; toKm: number; planned: number; actual: number; delta: number };
export type Lesson = "fastStart" | "strongFinish" | "fade" | "climbsCostly" | "descentsSlow" | "onPlan";

/**
 * Compare la course réelle (km-splits) au plan, par tiers de course et par
 * tronçon homogène, et en tire au plus trois leçons.
 */
export function debrief(opts: {
  samples: Sample[];
  curve: number[];
  segments: CourseSegment[];
  splits: Array<{ distance: number; elapsedTime: number }>;
}): { rows: DebriefRow[]; thirds: number[]; lessons: Lesson[]; total: { planned: number; actual: number } } | null {
  const { samples, curve, segments, splits } = opts;
  if (!splits.length || !curve.length) return null;
  const cumD: number[] = [0];
  const cumT: number[] = [0];
  for (const s of splits) {
    cumD.push(cumD[cumD.length - 1] + s.distance);
    cumT.push(cumT[cumT.length - 1] + s.elapsedTime);
  }
  const actualAt = (m: number) => {
    for (let i = 1; i < cumD.length; i++) {
      if (cumD[i] >= m) {
        const f = (m - cumD[i - 1]) / (cumD[i] - cumD[i - 1] || 1);
        return cumT[i - 1] + f * (cumT[i] - cumT[i - 1]);
      }
    }
    return cumT[cumT.length - 1];
  };
  const total = Math.min(samples[samples.length - 1].d, cumD[cumD.length - 1]);
  const rows: DebriefRow[] = segments
    .filter((s) => s.endKm * 1000 <= total + 200)
    .map((s) => {
      const planned = timeAt(samples, curve, s.endKm * 1000) - timeAt(samples, curve, s.startKm * 1000);
      const actual = actualAt(s.endKm * 1000) - actualAt(s.startKm * 1000);
      return { fromKm: s.startKm, toKm: s.endKm, planned: Math.round(planned), actual: Math.round(actual), delta: Math.round(actual - planned) };
    });
  const thirds = [0, 1, 2].map((k) => {
    const a = (total * k) / 3;
    const b = (total * (k + 1)) / 3;
    const p = timeAt(samples, curve, b) - timeAt(samples, curve, a);
    const r = actualAt(b) - actualAt(a);
    return p > 0 ? Math.round(((r - p) / p) * 1000) / 10 : 0;
  });
  const lessons: Lesson[] = [];
  if (thirds[0] < -2 && thirds[2] > 2) lessons.push("fastStart");
  else if (thirds[2] > 4) lessons.push("fade");
  if (thirds[2] < -1.5) lessons.push("strongFinish");
  const ups = rows.filter((_, i) => segments[i]?.kind === "up");
  const downs = rows.filter((_, i) => segments[i]?.kind === "down");
  const rel = (list: DebriefRow[]) => {
    const p = list.reduce((a, r) => a + r.planned, 0);
    return p > 0 ? list.reduce((a, r) => a + r.delta, 0) / p : 0;
  };
  if (ups.length && rel(ups) > 0.05) lessons.push("climbsCostly");
  if (downs.length && rel(downs) > 0.05) lessons.push("descentsSlow");
  if (!lessons.length) lessons.push("onPlan");
  return {
    rows,
    thirds,
    lessons: lessons.slice(0, 3),
    total: { planned: Math.round(timeAt(samples, curve, total)), actual: Math.round(actualAt(total)) },
  };
}
