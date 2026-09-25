import type { Segment } from "@/lib/workout-dsl";

const COLOR = ["", "rgb(var(--sage) / 0.6)", "rgb(var(--slate))", "rgb(var(--ochre))", "rgb(var(--clay))", "rgb(var(--rust))"];
const HEIGHT = ["0%", "38%", "55%", "72%", "88%", "100%"];

/**
 * Profil d'intensité d'une séance : chaque segment a la largeur de sa durée
 * et la hauteur de son intensité. Rendu identique serveur et client.
 */
export function WorkoutProfile({ segments, height = 44 }: { segments: Segment[]; height?: number }) {
  const total = segments.reduce((a, s) => a + s.seconds, 0) || 1;
  return (
    <div className="flex items-end gap-px" style={{ height }} aria-hidden>
      {segments.map((s, i) => (
        <span
          key={i}
          className="min-w-[2px] rounded-t-[2px]"
          style={{
            flexGrow: s.seconds / total,
            flexBasis: 0,
            height: s.role === "recovery" ? "22%" : HEIGHT[s.intensity],
            background: s.role === "recovery" ? "rgb(var(--hair-strong))" : COLOR[s.intensity],
          }}
          title={s.label}
        />
      ))}
    </div>
  );
}
