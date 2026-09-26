"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

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
 * Toutes les sorties d'un secteur, superposées, sur un fond de rues OSM.
 * Chaque tracé est dessiné en trait fin semi-transparent : là où tu cours
 * souvent, les traits s'accumulent et la couleur se densifie — une carte de
 * chaleur vectorielle, zoomable et déplaçable.
 */
export function RouteOverlay({
  paths,
  osm = [],
  w,
  h,
}: {
  paths: OverlayPath[];
  osm?: string[];
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

  // Fenêtre de vue (zoom / déplacement), dans l'espace 0..w / 0..h.
  const [vb, setVb] = useState({ x: 0, y: 0, w, h });
  const drag = useRef<{ startX: number; startY: number; vbX: number; vbY: number } | null>(null);

  const zoom = (factor: number, cx = w / 2, cy = h / 2) => {
    setVb((cur) => {
      const nw = Math.max(w / 40, Math.min(w, cur.w * factor));
      const nh = Math.max(h / 40, Math.min(h, cur.h * factor));
      const kx = nw / cur.w;
      const ky = nh / cur.h;
      return { x: cx - (cx - cur.x) * kx, y: cy - (cy - cur.y) * ky, w: nw, h: nh };
    });
  };

  return (
    <div>
      <div className="mb-2 flex justify-end gap-1">
        <button type="button" className="btn-quiet px-2" onClick={() => zoom(0.7)} aria-label="Zoomer en arrière">
          −
        </button>
        <button type="button" className="btn-quiet px-2" onClick={() => setVb({ x: 0, y: 0, w, h })} aria-label="Réinitialiser le zoom">
          ⤢
        </button>
        <button type="button" className="btn-quiet px-2" onClick={() => zoom(1 / 0.7)} aria-label="Zoomer">
          +
        </button>
      </div>

      <div className="heat-canvas relative overflow-hidden rounded-card">
        <svg
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          className="block h-auto w-full"
          role="img"
          aria-label={t("tracksOverlaid", { n: paths.length })}
          onMouseLeave={() => setHover(null)}
          onWheel={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const cx = ((e.clientX - rect.left) / rect.width) * vb.w + vb.x;
            const cy = ((e.clientY - rect.top) / rect.height) * vb.h + vb.y;
            zoom(e.deltaY < 0 ? 0.82 : 1 / 0.82, cx, cy);
          }}
          onPointerDown={(e) => {
            drag.current = { startX: e.clientX, startY: e.clientY, vbX: vb.x, vbY: vb.y };
            (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const dx = ((e.clientX - d.startX) / rect.width) * vb.w;
            const dy = ((e.clientY - d.startY) / rect.height) * vb.h;
            setVb((cur) => ({ ...cur, x: d.vbX - dx, y: d.vbY - dy }));
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerLeave={() => (drag.current = null)}
        >
          <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="transparent" />
          {osm.map((d, i) => (
            <path key={`o${i}`} d={d} fill="none" stroke="rgb(var(--heat-street))" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          ))}
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
    </div>
  );
}
