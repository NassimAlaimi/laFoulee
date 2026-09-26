"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type OverlayPath = {
  id: string;
  d: string;
  name: string;
  date: string;
  km: number;
  pace: string;
  race: boolean;
};

/**
 * Toutes les sorties d'un secteur, superposées. Chaque tracé est dessiné en
 * trait fin semi-transparent : là où tu cours souvent, les traits
 * s'accumulent et la couleur se densifie — une carte de chaleur vectorielle,
 * sans tuile ni service externe.
 */
export function RouteOverlay({
  paths,
  w,
  h,
}: {
  paths: OverlayPath[];
  w: number;
  h: number;
}) {
  const router = useRouter();
  const [hover, setHover] = useState<string | null>(null);
  const t = useTranslations("common");
  const current = paths.find((p) => p.id === hover);
  // L'opacité de base baisse quand les tracés sont nombreux, pour que la
  // densité reste lisible au lieu de saturer immédiatement.
  const base = Math.max(0.16, Math.min(0.55, 5 / Math.sqrt(paths.length + 1) / 3));

  return (
    <div className="heat-canvas relative overflow-hidden rounded-card">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="block h-auto w-full"
        role="img"
        aria-label={t("tracksOverlaid", { n: paths.length })}
        onMouseLeave={() => setHover(null)}
      >
        <g fill="none" strokeLinecap="round" strokeLinejoin="round" className="heat-lines">
          {paths.map((p) => (
            <path
              key={p.id}
              d={p.d}
              stroke="rgb(var(--heat))"
              strokeWidth={1.6}
              opacity={hover ? (hover === p.id ? 0 : base * 0.45) : base}
              style={{ transition: "opacity .25s" }}
            />
          ))}
        </g>
        {current && (
          <path
            d={current.d}
            fill="none"
            stroke="rgb(var(--heat-hi))"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        <g fill="none">
          {paths.map((p) => (
            <path
              key={`h${p.id}`}
              d={p.d}
              stroke="transparent"
              strokeWidth={10}
              onMouseEnter={() => setHover(p.id)}
              onClick={() => router.push(`/activities/${p.id}`)}
              style={{ cursor: "pointer" }}
            />
          ))}
        </g>
      </svg>

      <div className="pointer-events-none absolute left-4 top-4 max-w-[60%]">
        {current ? (
          <div className="rounded-[7px] border border-hair bg-[rgb(var(--heat-bg)/0.82)] px-3 py-2 backdrop-blur-sm">
            <div className="text-[0.8125rem] font-medium text-[rgb(var(--heat-ink))]">{current.name}</div>
            <div className="mt-0.5 font-mono text-micro text-[rgb(var(--heat-ink)/0.65)]">
              {current.date} · {current.km.toFixed(1)} km · {current.pace}
            </div>
          </div>
        ) : (
          <div className="font-mono text-micro uppercase tracking-[0.14em] text-[rgb(var(--heat-ink)/0.55)]">
            {paths.length} tracés · survole pour identifier
          </div>
        )}
      </div>
    </div>
  );
}
