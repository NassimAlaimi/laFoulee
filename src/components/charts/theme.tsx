"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useNight } from "@/components/ui/NightScope";

/** Palette de la bande « nuit » — miroir des variables de `.night` (globals.css). */
const NIGHT = {
  grid: "rgb(56 51 46)",
  axis: "rgb(134 127 117)",
  ink: "rgb(244 239 231)",
  clay: "rgb(236 122 84)",
  ochre: "rgb(214 176 80)",
  sage: "rgb(150 182 112)",
  slate: "rgb(140 172 196)",
  plum: "rgb(186 146 178)",
  rust: "rgb(226 102 82)",
  faint: "rgb(80 74 67)",
};

/**
 * Les graphiques lisent les variables CSS du thème pour rester cohérents
 * en clair comme en sombre, plutôt que d'embarquer des couleurs en dur.
 */
export function useChartTheme() {
  const night = useNight();
  const [t, setT] = useState({
    grid: "#E2DDD4",
    axis: "#969188",
    ink: "#1A1917",
    clay: "#BA4C2A",
    ochre: "#AE8426",
    sage: "#688547",
    slate: "#4F697C",
    plum: "#7E5574",
    rust: "#A63D2D",
    faint: "#CDC6BA",
  });

  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      const v = (name: string) => {
        const raw = cs.getPropertyValue(name).trim();
        return raw ? `rgb(${raw})` : "#888";
      };
      setT({
        grid: v("--hair"),
        axis: v("--ink-3"),
        ink: v("--ink"),
        clay: v("--clay"),
        ochre: v("--ochre"),
        sage: v("--sage"),
        slate: v("--slate"),
        plum: v("--plum"),
        rust: v("--rust"),
        faint: v("--hair-strong"),
      });
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, []);

  return night ? NIGHT : t;
}

export function axisProps(color: string) {
  return {
    stroke: color,
    fontSize: 11,
    tickLine: false,
    axisLine: false,
    tick: { fill: color },
  } as const;
}

/** Infobulle sobre : fond plein, filet fin, pas d'ombre portée marquée. */
export function Tip({
  label,
  rows,
}: {
  label?: ReactNode;
  rows: Array<{ label: string; value: ReactNode; color?: string }>;
}) {
  return (
    <div className="min-w-[150px] rounded-[7px] border border-hairStrong bg-panel px-3 py-2">
      {label != null && (
        <div className="mb-1.5 border-b border-hair pb-1.5 text-micro font-medium uppercase tracking-[0.08em] text-ink3">
          {label}
        </div>
      )}
      <div className="space-y-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-baseline gap-3 text-[0.8125rem]">
            {r.color && (
              <span
                className="h-[3px] w-[10px] shrink-0 translate-y-[-2px]"
                style={{ background: r.color }}
              />
            )}
            <span className="flex-1 whitespace-nowrap text-ink2">{r.label}</span>
            <span className="font-mono text-[0.8125rem] font-medium tabular-nums text-ink">
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Legend({
  items,
}: {
  items: Array<{ label: string; color: string; dashed?: boolean }>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5 text-micro text-ink2">
          <span
            className="h-[2px] w-3.5"
            style={
              i.dashed
                ? {
                    backgroundImage: `repeating-linear-gradient(90deg, ${i.color} 0 3px, transparent 3px 6px)`,
                  }
                : { background: i.color }
            }
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}
