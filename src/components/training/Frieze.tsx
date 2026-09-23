import { friezeOf } from "@/lib/frieze";
import type { Step } from "@/lib/workouts";

const TONE = {
  easy: "rgb(var(--sage) / 0.55)",
  steady: "rgb(var(--ochre))",
  work: "rgb(var(--clay))",
  rest: "rgb(var(--hair-strong))",
};
const HEIGHT = { easy: "55%", steady: "75%", work: "100%", rest: "30%" };

/**
 * Frise d'une séance : chaque segment a la largeur de sa durée et la hauteur
 * de son intensité. Utilisable côté serveur comme côté client.
 */
export function Frieze({
  steps,
  fallbackPace = 360,
  height = 28,
  scale = true,
  className = "",
}: {
  steps: Step[];
  fallbackPace?: number;
  height?: number;
  scale?: boolean;
  className?: string;
}) {
  const f = friezeOf(steps, fallbackPace);
  if (!f.length) return null;
  const total = f.reduce((a, b) => a + b.minutes, 0) || 1;
  return (
    <div className={className}>
      <div className="flex items-end gap-[2px]" style={{ height }} aria-hidden>
        {f.map((s, i) => (
          <span
            key={i}
            className="min-w-[3px] rounded-[2px]"
            style={{ flexGrow: s.minutes / total, flexBasis: 0, height: HEIGHT[s.kind], background: TONE[s.kind] }}
            title={s.label}
          />
        ))}
      </div>
      {scale && (
        <div className="mt-1 flex justify-between font-mono text-[10px] text-ink3">
          <span>0</span>
          <span>~{Math.round(total)} min</span>
        </div>
      )}
    </div>
  );
}
