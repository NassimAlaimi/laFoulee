"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { scaleBar, type ViewBbox, type ViewWindow } from "@/lib/route-view";
import { MapControls, ScaleBar, StreetLayer, useMapViewport, useOsmTiles, type MapTile } from "./map-kit";

export type OverlayPath = {
  id: string;
  d: string;
  name: string;
  date: string;
  km: number;
  pace: string;
  race: boolean;
};

export type OverlayMap = {
  viewBox: readonly [number, number];
  bbox: ViewBbox;
  pxPerMeter: number;
  /** fenêtre d'ouverture : là où les sorties se concentrent */
  core: ViewWindow;
  tiles: MapTile[];
};

/**
 * Toutes les sorties d'un secteur, superposées, sur un fond de rues OSM
 * hiérarchisé. Chaque tracé est un trait fin semi-transparent : là où tu
 * cours souvent, les traits s'accumulent et la couleur se densifie — une
 * carte de chaleur vectorielle. S'ouvre sur la zone la plus courue ;
 * molette, pincement et glisser, sans faire défiler la page.
 */
export function RouteOverlay({ paths, map: m }: { paths: OverlayPath[]; map: OverlayMap }) {
  const router = useRouter();
  const locale = useLocale();
  const [hover, setHover] = useState<string | null>(null);
  const t = useTranslations("common");
  const current = paths.find((p) => p.id === hover);
  // L'opacité de base baisse quand les tracés sont nombreux, pour que la
  // densité reste lisible au lieu de saturer immédiatement.
  const base = Math.max(0.2, Math.min(0.6, 5 / Math.sqrt(paths.length + 1) / 2.6));

  const [W, H] = m.viewBox;
  const map = useMapViewport({ W, H, core: m.core, aspects: { wide: 1.5, narrow: 0.85 } });
  const { roads, pending } = useOsmTiles(m.tiles, m.bbox, map.vb);
  const metersAcross = map.vb.w / m.pxPerMeter;
  const bar = scaleBar(map.unit / m.pxPerMeter, 100);
  const fmtLen = (x: number) => (x >= 1000 ? `${(x / 1000).toLocaleString(locale)} km` : `${x} m`);

  return (
    <div ref={map.wrapRef} className="heat-canvas relative overflow-hidden rounded-card">
      <svg {...map.svgProps} className="block w-full select-none cursor-grab active:cursor-grabbing" role="img" aria-label={t("tracksOverlaid", { n: paths.length })} onMouseLeave={() => setHover(null)}>
        <StreetLayer roads={roads} color="var(--heat-street)" strength={2.6} showPaths={metersAcross < 7000} />
        <g fill="none" strokeLinecap="round" strokeLinejoin="round" className="heat-lines">
          {paths.map((p) => (
            <path
              key={p.id}
              d={p.d}
              stroke="rgb(var(--heat))"
              strokeWidth={1.8}
              vectorEffect="non-scaling-stroke"
              opacity={hover ? (hover === p.id ? 0 : base * 0.4) : base}
              style={{ transition: "opacity .25s" }}
            />
          ))}
        </g>
        {current && (
          <path d={current.d} fill="none" stroke="rgb(var(--heat-hi))" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        )}
        <g fill="none">
          {paths.map((p) => (
            <path
              key={`h${p.id}`}
              d={p.d}
              stroke="transparent"
              strokeWidth={12}
              vectorEffect="non-scaling-stroke"
              onMouseEnter={() => setHover(p.id)}
              onClick={() => !map.dragged() && router.push(`/activities/${p.id}`)}
              style={{ cursor: "pointer" }}
            />
          ))}
        </g>
      </svg>

      <MapControls
        onZoomIn={() => map.zoom(0.7)}
        onZoomOut={() => map.zoom(1 / 0.7)}
        onHome={() => map.setVb(map.home)}
        labels={{ zoomIn: t("zoomIn"), zoomOut: t("zoomOut"), home: t("resetZoom") }}
      />
      <ScaleBar label={fmtLen(bar.meters)} px={bar.px} className="text-[rgb(var(--heat-ink)/0.65)]" />

      <div className="pointer-events-none absolute left-4 top-4 max-w-[60%]">
        {current ? (
          <div className="rounded-[7px] border border-hair bg-[rgb(var(--heat-bg)/0.82)] px-3 py-2 backdrop-blur-sm">
            <div className="text-[0.8125rem] font-medium text-[rgb(var(--heat-ink))]">{current.name}</div>
            <div className="mt-0.5 font-mono text-micro text-[rgb(var(--heat-ink)/0.65)]">
              {current.date} · {current.km.toLocaleString(locale, { maximumFractionDigits: 1 })} km · {current.pace}
            </div>
          </div>
        ) : (
          <div className="font-mono text-micro uppercase tracking-[0.14em] text-[rgb(var(--heat-ink)/0.55)]">
            {t("hoverIdentify", { n: paths.length })}
          </div>
        )}
      </div>
      {pending > 0 && (
        <span className="pointer-events-none absolute bottom-3 left-3 font-mono text-micro text-[rgb(var(--heat-ink)/0.55)]" role="status">
          {t("streetsLoading")}
        </span>
      )}
    </div>
  );
}
