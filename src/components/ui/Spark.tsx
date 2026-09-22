/**
 * Micro-visualisations en SVG pur, rendues côté serveur.
 * Monochrome par défaut : la couleur ne sert qu'à désigner la valeur courante.
 */

export function Sparkline({
  data,
  width = 88,
  height = 26,
  stroke = "rgb(var(--ink-3))",
}: {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
}) {
  const pts = data.filter((n) => Number.isFinite(n));
  if (pts.length < 2) return <div style={{ width, height }} aria-hidden />;

  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const pad = 2;
  const x = (i: number) => (i / (pts.length - 1)) * (width - pad * 2) + pad;
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);

  const d = pts
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.25" strokeLinejoin="round" />
      <circle
        cx={x(pts.length - 1)}
        cy={y(pts[pts.length - 1])}
        r="2"
        fill="rgb(var(--clay))"
      />
    </svg>
  );
}

/** Histogramme minimal : barres grises, dernière barre en accent. */
export function MiniBars({
  data,
  width = 88,
  height = 26,
}: {
  data: number[];
  width?: number;
  height?: number;
}) {
  if (!data.length) return <div style={{ width, height }} aria-hidden />;
  const max = Math.max(...data, 1);
  const gap = 1.5;
  const bw = Math.max(1, (width - gap * (data.length - 1)) / data.length);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      {data.map((v, i) => {
        const h = Math.max(1, (v / max) * height);
        const last = i === data.length - 1;
        return (
          <rect
            key={i}
            x={i * (bw + gap)}
            y={height - h}
            width={bw}
            height={h}
            fill={last ? "rgb(var(--clay))" : "rgb(var(--hair-strong))"}
          />
        );
      })}
    </svg>
  );
}
