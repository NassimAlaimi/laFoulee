import { routePath } from "@/lib/polyline";

/**
 * Silhouette d'un tracé, en SVG pur rendu côté serveur. Sert de vignette
 * dans les listes : la forme d'une sortie se reconnaît plus vite que son nom
 * (« Course à pied en soirée » × 30).
 */
export function RouteGlyph({
  polyline,
  size = 36,
  stroke = "currentColor",
  strokeWidth = 1.6,
  className = "",
  dot = true,
}: {
  polyline: string | null | undefined;
  size?: number;
  stroke?: string;
  strokeWidth?: number;
  className?: string;
  dot?: boolean;
}) {
  const r = routePath(polyline, size, size, strokeWidth + 2);
  if (!r.d) {
    // Pas de GPS : un simple tiret, pour garder l'alignement des colonnes
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className} aria-hidden>
        <line
          x1={size * 0.3}
          x2={size * 0.7}
          y1={size / 2}
          y2={size / 2}
          stroke="rgb(var(--hair-strong))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className} aria-hidden>
      <path
        d={r.d}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {dot && r.start && <circle cx={r.start[0]} cy={r.start[1]} r={strokeWidth + 0.6} fill="rgb(var(--clay))" />}
    </svg>
  );
}
