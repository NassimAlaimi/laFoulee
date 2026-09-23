/**
 * Frise d'une séance : la structure (échauffement, blocs, récupérations)
 * dépliée en segments proportionnels à leur durée. « 6 × 2 min / 90 s »
 * devient six barres rapides séparées de cinq creux — on lit la séance avant
 * même de lire le texte.
 */
import type { Step } from "./workouts";

export type FriezeSegment = { kind: "easy" | "work" | "rest" | "steady"; minutes: number; label: string };

const toMin = (v: string, unit: string) => {
  const n = Number(v.replace(",", "."));
  return unit.startsWith("s") ? n / 60 : n;
};

/** « 6 × 2 min vite / 90 s lent » → { reps: 6, work: 2, rest: 1.5 } */
export function parseRepeat(label: string): { reps: number; work: number | null; rest: number | null } | null {
  const m = label.match(/(\d+)\s*[×x]\s*(\d+(?:[.,]\d+)?)\s*(min|s)\b/i);
  if (!m) return null;
  const rest = label.match(/\/\s*(\d+(?:[.,]\d+)?)\s*(min|s)\b/i);
  return {
    reps: Number(m[1]),
    work: toMin(m[2], m[3]),
    rest: rest ? toMin(rest[1], rest[2]) : null,
  };
}

function stepMinutes(s: Step, fallbackPace: number): number {
  if (s.durationMin) return s.durationMin;
  if (s.distanceM) return ((s.distanceM / 1000) * (s.pace ?? fallbackPace)) / 60;
  return 0;
}

export function friezeOf(steps: Step[], fallbackPace = 360): FriezeSegment[] {
  const out: FriezeSegment[] = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.kind === "work") {
      const parsed = parseRepeat(s.label);
      const reps = Math.max(1, s.repeat ?? parsed?.reps ?? 1);
      const work = s.durationMin ?? parsed?.work ?? (s.distanceM ? stepMinutes(s, fallbackPace) : 3);
      const next = steps[i + 1];
      const recStep = next?.kind === "recovery" ? next : null;
      const rest = recStep?.durationMin ?? parsed?.rest ?? (reps > 1 ? Math.max(0.5, work * 0.5) : 0);
      for (let r = 0; r < reps; r++) {
        out.push({ kind: "work", minutes: work, label: s.label });
        if (r < reps - 1 && rest > 0) out.push({ kind: "rest", minutes: rest, label: recStep?.label ?? "récupération" });
      }
      if (recStep) i++;
      continue;
    }
    const minutes = stepMinutes(s, fallbackPace) || 2;
    out.push({
      kind: s.kind === "warmup" || s.kind === "cooldown" ? "easy" : s.kind === "recovery" ? "rest" : "steady",
      minutes,
      label: s.label,
    });
  }
  return out;
}
