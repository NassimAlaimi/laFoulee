"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { scaleBar, viewFor, type AtelierView, type ViewWindow } from "@/lib/route-view";
import { MapControls, ScaleBar, StreetLayer, useMapViewport, useOsmTiles } from "./map-kit";
import { LOOP_COLORS } from "@/lib/route-colors";

type Drawn = { d: string; box: ViewWindow };
export type MapSelection = { kind: "loop" | "straight"; i: number } | null;

const POI_COLOR: Record<string, string> = {
  fountain: "rgb(var(--slate))",
  toilet: "rgb(var(--sage))",
  car: "rgb(var(--plum))",
  bakery: "rgb(var(--ochre))",
  lit: "rgb(var(--clay))",
  danger: "rgb(var(--rust))",
  track: "rgb(var(--sage))",
};

/** Paliers du réseau personnel : passages → épaisseur (px) et opacité. */
const TIERS = [
  { min: 1, w: 1.3, o: 0.5 },
  { min: 2, w: 1.9, o: 0.72 },
  { min: 4, w: 2.7, o: 0.88 },
  { min: 10, w: 3.6, o: 1 },
];

/**
 * La carte de l'atelier : fond de rues OSM hiérarchisé (chargé par tuiles
 * quand elles entrent dans la fenêtre), réseau personnel en terre cuite
 * (épaisseur = fréquence), parcours enregistrés, propositions de boucles,
 * lignes droites, départ habituel, points d'intérêt, échelle.
 *
 * S'ouvre sur le cœur du territoire. Molette, pincement et boutons pour
 * zoomer (sans faire défiler la page), glisser pour se déplacer.
 */
export function NetworkMap({
  view,
  kinds,
  routes = [],
  loops = [],
  straights = [],
  selected,
  onSelect,
  onlyProposals,
  setOnlyProposals,
  frame,
}: {
  view: AtelierView;
  kinds: Array<[string, string]>;
  routes?: Array<{ id: string; d: string; name: string; meters: number }>;
  loops?: Array<Drawn & { meters: number }>;
  straights?: Drawn[];
  selected: MapSelection;
  onSelect: (s: MapSelection) => void;
  onlyProposals: boolean;
  setOnlyProposals: (v: boolean) => void;
  /** demande de cadrage (change de `n` à chaque demande) */
  frame: { box: ViewWindow; n: number } | null;
}) {
  const t = useTranslations("routes");
  const locale = useLocale();
  const router = useRouter();
  const [W, H] = view.viewBox;

  // ------------------------------------------------------------ Calques
  const [showNetwork, setShowNetwork] = useState(true);
  const [showStreets, setShowStreets] = useState(true);
  const [showSaved, setShowSaved] = useState(true);
  const [showStraights, setShowStraights] = useState(false);
  const [mode, setMode] = useState<"view" | "add">("view");
  const [kind, setKind] = useState("fountain");
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);

  // ------------------------------------------------------------ Fenêtre
  const map = useMapViewport({ W, H, core: view.core });
  const { vb, unit } = map;
  const metersAcross = vb.w / view.pxPerMeter;

  // Cadrage demandé de l'extérieur (propositions générées, ligne choisie).
  useEffect(() => {
    if (frame) map.frameTo(frame.box);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame?.n]);

  const click = async (e: React.MouseEvent<SVGSVGElement>) => {
    if (map.dragged() || mode !== "add") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = vb.x + ((e.clientX - rect.left) / rect.width) * vb.w;
    const fy = vb.y + ((e.clientY - rect.top) / rect.height) * vb.h;
    setPending({ x: fx, y: fy });
    const { lat, lng } = viewFor(view.bbox).unproject(fx, fy);
    await fetch("/api/routes/pois", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, lat, lng }) });
    setPending(null);
    router.refresh();
  };
  const removePoi = async (id: string) => {
    await fetch(`/api/routes/pois?id=${id}`, { method: "DELETE" });
    router.refresh();
  };

  // ------------------------------------------------------------ Fond OSM
  const { roads, pending: pendingTiles, failed: failedTiles } = useOsmTiles(view.tiles, view.bbox, vb, showStreets);

  // ------------------------------------------------------------ Réseau
  const networkLayers = useMemo(() => {
    const parts = TIERS.map(() => [] as string[]);
    for (const e of view.edges) {
      let k = 0;
      for (let i = 0; i < TIERS.length; i++) if (e.passes >= TIERS[i].min) k = i;
      parts[k].push(`M${e.x1},${e.y1}L${e.x2},${e.y2}`);
    }
    return TIERS.map((tier, i) => ({ ...tier, d: parts[i].join("") }));
  }, [view.edges]);

  const hasSel = selected !== null;
  const dimOthers = hasSel || onlyProposals;
  const showPaths = metersAcross < 7000;
  const bar = scaleBar(1 / (view.pxPerMeter / unit), 110);
  const fmtLen = (m: number) =>
    m >= 1000 ? `${(m / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })} km` : `${m} m`;

  const chip = (on: boolean) => `btn-quiet ${on ? "bg-clay/10 text-clay" : "text-ink3"}`;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {loops.length > 0 && (
          <button type="button" className={`${chip(onlyProposals)} font-semibold`} aria-pressed={onlyProposals} onClick={() => setOnlyProposals(!onlyProposals)}>
            {t("onlyProposed")}
          </button>
        )}
        {!onlyProposals && (
          <>
            <button type="button" className={chip(showNetwork)} aria-pressed={showNetwork} onClick={() => setShowNetwork(!showNetwork)}>
              {t("layerNetwork")}
            </button>
            <button type="button" className={chip(showStreets)} aria-pressed={showStreets} onClick={() => setShowStreets(!showStreets)}>
              {t("streets")}
            </button>
            {routes.length > 0 && (
              <button type="button" className={chip(showSaved)} aria-pressed={showSaved} onClick={() => setShowSaved(!showSaved)}>
                {t("layerSaved")}
              </button>
            )}
            {straights.length > 0 && (
              <button type="button" className={chip(showStraights)} aria-pressed={showStraights} onClick={() => setShowStraights(!showStraights)}>
                {t("layerStraights")}
              </button>
            )}
          </>
        )}
        {hasSel && (
          <button type="button" className="btn-quiet text-ink2" onClick={() => onSelect(null)}>
            {t("showAll")}
          </button>
        )}
        <div className="ml-auto flex items-center gap-1">
          {mode === "view" ? (
            <button type="button" className="btn-quiet text-ink2" onClick={() => setMode("add")}>
              + {t("addPoi")}
            </button>
          ) : (
            <>
              <select className="field w-auto py-1" value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t("addPoi")}>
                {kinds.map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
              <button type="button" className="btn-quiet" onClick={() => setMode("view")}>
                {t("done")}
              </button>
            </>
          )}
        </div>
      </div>

      <div ref={map.wrapRef} className="relative overflow-hidden rounded-[14px] border border-hair bg-panel">
        <svg
          {...map.svgProps}
          className={`block w-full select-none ${mode === "add" ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
          role="img"
          aria-label={t("mapAria")}
          onClick={click}
        >
          <rect x={vb.x - vb.w} y={vb.y - vb.h} width={vb.w * 3} height={vb.h * 3} fill="rgb(var(--panel))" />

          {showStreets && <StreetLayer roads={roads} strength={dimOthers ? 0.7 : 1} showPaths={showPaths} />}

          {showNetwork && !onlyProposals && (
            <g opacity={hasSel ? 0.35 : 1}>
              {/* Halo sous les rues les plus courues : le territoire a du relief. */}
              <path d={networkLayers[2].d + networkLayers[3].d} fill="none" stroke="rgb(var(--clay) / 0.13)" strokeWidth={9} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              {networkLayers.map((l) => (
                <path key={l.min} d={l.d} fill="none" stroke={`rgb(var(--clay) / ${l.o})`} strokeWidth={l.w} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              ))}
            </g>
          )}

          {showSaved && !onlyProposals &&
            routes.map((r) => (
              <g key={r.id} opacity={hasSel ? 0.35 : 1}>
                <path d={r.d} fill="none" stroke="rgb(var(--panel))" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                <path d={r.d} fill="none" stroke="rgb(var(--ink))" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke">
                  <title>{`${r.name} · ${fmtLen(r.meters)}`}</title>
                </path>
              </g>
            ))}

          {!onlyProposals &&
            straights.map((s, i) => {
              const sel = selected?.kind === "straight" && selected.i === i;
              if (!sel && !showStraights) return null;
              return (
                <g key={`s${i}`} className="cursor-pointer" onClick={(e) => (e.stopPropagation(), onSelect({ kind: "straight", i }))}>
                  <path d={s.d} fill="none" stroke="rgb(var(--panel))" strokeWidth={sel ? 10 : 7} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  <path d={s.d} fill="none" stroke="rgb(var(--plum))" strokeWidth={sel ? 5 : 3.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                </g>
              );
            })}

          {loops.map((l, i) => {
            const sel = selected?.kind === "loop" && selected.i === i;
            const faded = hasSel && !sel;
            return (
              <g key={`l${i}`} opacity={faded ? 0.28 : 1} className="cursor-pointer" onClick={(e) => (e.stopPropagation(), onSelect({ kind: "loop", i }))}>
                <path d={l.d} fill="none" stroke="rgb(var(--panel))" strokeWidth={sel ? 9 : 7} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                <path d={l.d} fill="none" stroke={LOOP_COLORS[i % LOOP_COLORS.length]} strokeWidth={sel ? 4.5 : 3.2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke">
                  <title>{`${t("loopN", { n: i + 1 })} · ${fmtLen(l.meters)}`}</title>
                </path>
              </g>
            );
          })}

          {view.start && (
            <g pointerEvents="none">
              <circle cx={view.start.x} cy={view.start.y} r={9 * unit} fill="rgb(var(--clay) / 0.18)" />
              <circle cx={view.start.x} cy={view.start.y} r={4.5 * unit} fill="rgb(var(--clay))" stroke="rgb(var(--panel))" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            </g>
          )}

          {!onlyProposals &&
            view.pois.map((p) => (
              <g key={p.id} onClick={(e) => e.stopPropagation()}>
                <circle cx={p.x} cy={p.y} r={6 * unit} fill={POI_COLOR[p.kind]} stroke="rgb(var(--panel))" strokeWidth="2" vectorEffect="non-scaling-stroke">
                  <title>{`${t(`poi_${p.kind}`)}${p.note ? ` — ${p.note}` : ""}`}</title>
                </circle>
                {mode === "add" && (
                  <text x={p.x + 9 * unit} y={p.y + 4 * unit} fontSize={13 * unit} fill={POI_COLOR[p.kind]} onClick={() => removePoi(p.id)} className="cursor-pointer">
                    ✕
                  </text>
                )}
              </g>
            ))}
          {pending && <circle cx={pending.x} cy={pending.y} r={8 * unit} fill="none" stroke="rgb(var(--rust))" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
        </svg>

        <MapControls
          onZoomIn={() => map.zoom(0.7)}
          onZoomOut={() => map.zoom(1 / 0.7)}
          onHome={() => map.setVb(map.home)}
          labels={{ zoomIn: t("zoomIn"), zoomOut: t("zoomOut"), home: t("resetZoom") }}
        />
        <ScaleBar label={fmtLen(bar.meters)} px={bar.px} />

        {showStreets && (pendingTiles > 0 || (failedTiles > 0 && roads.length === 0)) && (
          <span className="pointer-events-none absolute bottom-3 left-3 rounded bg-panel/85 px-1.5 py-0.5 font-mono text-micro text-ink3" role="status">
            {pendingTiles > 0 ? t("streetsLoading") : t("streetsFailed")}
          </span>
        )}
        {onlyProposals && loops.length === 0 && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-[0.8125rem] text-ink3">
            {t("onlyProposedEmpty")}
          </p>
        )}
        {mode === "add" && (
          <span className="pointer-events-none absolute left-3 top-3 rounded bg-panel/90 px-2 py-1 text-micro text-ink2">{t("clickMap")}</span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-micro text-ink3">
        {showNetwork && !onlyProposals && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-end gap-[2px]">
              {TIERS.map((tier) => (
                <span key={tier.min} className="inline-block w-2 rounded-full" style={{ height: tier.w + 0.5, background: `rgb(var(--clay) / ${tier.o})` }} />
              ))}
            </span>
            {t("legendNetwork")}
          </span>
        )}
        {view.start && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-clay ring-2 ring-clay/20" />
            {t("legendStart")}
          </span>
        )}
        {showSaved && !onlyProposals && routes.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-[3px] w-5 rounded-full bg-ink" />
            {t("legendSaved")}
          </span>
        )}
        {loops.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex gap-[2px]">
              {loops.map((_, i) => (
                <span key={i} className="inline-block h-[3px] w-2.5 rounded-full" style={{ background: LOOP_COLORS[i % LOOP_COLORS.length] }} />
              ))}
            </span>
            {t("legendLoops")}
          </span>
        )}
        {!onlyProposals && (showStraights || selected?.kind === "straight") && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-[3px] w-5 rounded-full" style={{ background: "rgb(var(--plum))" }} />
            {t("legendStraight")}
          </span>
        )}
      </div>
    </div>
  );
}
