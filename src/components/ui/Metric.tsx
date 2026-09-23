import type { ReactNode } from "react";
import type { Trend } from "@/lib/stats";

/**
 * Bandeau de métriques : colonnes séparées par des filets verticaux,
 * sans aucune carte. La hiérarchie vient de la taille des chiffres.
 */
export function MetricBand({ children }: { children: ReactNode }) {
  return (
    <div className="metric-band grid grid-cols-2 border-t border-hair lg:grid-cols-4">
      {children}
    </div>
  );
}

export function Metric({
  label,
  value,
  unit,
  note,
  trend,
  lowerIsBetter = false,
  visual,
  size = "d3",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  note?: ReactNode;
  trend?: Trend;
  lowerIsBetter?: boolean;
  visual?: ReactNode;
  size?: "d2" | "d3";
}) {
  return (
    <div className="min-w-0 px-5 py-5 lg:px-6">
      <div className="eyebrow">{label}</div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-1.5">
          <span className={`display text-${size}`}>{value}</span>
          {unit && <span className="text-sm text-ink3">{unit}</span>}
        </div>
        {visual && <div className="hidden shrink-0 pb-1 sm:block">{visual}</div>}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {trend && <TrendMark trend={trend} lowerIsBetter={lowerIsBetter} />}
        {note && <span className="text-[0.8125rem] text-ink3">{note}</span>}
      </div>
    </div>
  );
}

/**
 * Variation : un triangle fin + le pourcentage, coloré seulement quand
 * l'information est significative. Pas de pastille pleine.
 */
export function TrendMark({
  trend,
  lowerIsBetter = false,
}: {
  trend: Trend;
  lowerIsBetter?: boolean;
}) {
  if (trend.direction === "flat") {
    return <span className="text-[0.8125rem] text-ink3">stable</span>;
  }
  const up = trend.direction === "up";
  const good = lowerIsBetter ? !up : up;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[0.8125rem] font-medium ${
        good ? "text-sage" : "text-rust"
      }`}
      title={`${trend.previous} → ${trend.current}`}
    >
      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
        <path
          d={up ? "M4 0.5 7.5 7 0.5 7Z" : "M4 7.5 0.5 1 7.5 1Z"}
          fill="currentColor"
        />
      </svg>
      {Math.abs(trend.percent)} %
    </span>
  );
}

/** Ligne clé/valeur séparée par un filet, pour les listes denses. */
export function Row({
  label,
  value,
  note,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: "default" | "sage" | "ochre" | "rust";
}) {
  const toneClass = {
    default: "text-ink",
    sage: "text-sage",
    ochre: "text-ochre",
    rust: "text-rust",
  }[tone];

  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hair py-2 last:border-b-0">
      <span className="text-[0.8125rem] text-ink2">{label}</span>
      <span className="flex items-baseline gap-2">
        {note && <span className="text-micro text-ink3">{note}</span>}
        <span className={`text-[0.8125rem] font-medium ${toneClass}`}>{value}</span>
      </span>
    </div>
  );
}

/** Barre de progression fine, sans arrondi excessif. */
export function Bar({
  value,
  max = 100,
  tone,
  height = 3,
}: {
  value: number;
  max?: number;
  tone?: string;
  height?: number;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const auto =
    pct >= 80 ? "rgb(var(--sage))" : pct >= 45 ? "rgb(var(--ochre))" : "rgb(var(--rust))";
  return (
    <div className="w-full" style={{ height, background: "rgb(var(--hair))" }}>
      <div
        className="h-full transition-[width] duration-700 ease-out"
        style={{ width: `${pct}%`, background: tone ?? auto }}
      />
    </div>
  );
}
