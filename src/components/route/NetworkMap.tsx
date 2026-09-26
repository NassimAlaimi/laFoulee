"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseRoad } from "@/lib/osm";
import {
  boxesIntersect,
  coverWindow,
  fitWindow,
  polylinePath,
  scaleBar,
  viewFor,
  zoomWindow,
  type AtelierView,
  type ViewBbox,
  type ViewWindow,
} from "@/lib/route-view";
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

/** Fond de rues par classe : chemins, rues, grands axes (les axes au-dessus). */
const ROAD_STYLE = [
  { cls: 2, w: 0.8, o: 0.13 },
  { cls: 3, w: 0.8, o: 0.1 },
  { cls: 1, w: 1.1, o: 0.24 },
  { cls: 0, w: 2.1, o: 0.36 },
] as const;

type Tile = { bbox: ViewBbox; box: ViewWindow; detail: "streets" | "all"; depth: number; key: string };

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
  // Ordinateur : carte large ; mobile : carte haute qu'on déplace au doigt.
  const [aspect, setAspect] = useState(1.7);
  const fit = useMemo(() => fitWindow(W, H, aspect, "contain"), [W, H, aspect]);
  const home = useMemo(() => openOn(view.core, aspect, fit), [view.core, aspect, fit]);
  const [vb, setVb] = useState<ViewWindow>(() => openOn(view.core, 1.7, fitWindow(W, H, 1.7, "contain")));
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => {
      const a = mq.matches ? 0.8 : 1.7;
      setAspect(a);
      setVb(openOn(view.core, a, fitWindow(W, H, a, "contain")));
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [W, H, view.core]);

  // Cadrage demandé de l'extérieur (propositions générées, ligne choisie).
  useEffect(() => {
    if (frame) setVb(openOn(frame.box, aspect, fit, 0.1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame?.n]);

  // Largeur réelle à l'écran : échelle graphique et tailles constantes.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [pxWidth, setPxWidth] = useState(1000);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPxWidth(el.clientWidth || 1000));
    ro.observe(el);
    setPxWidth(el.clientWidth || 1000);
    return () => ro.disconnect();
  }, []);
  const unit = vb.w / pxWidth; // unités de carte par pixel écran
  const metersAcross = vb.w / view.pxPerMeter;

  const zoom = (factor: number, cx?: number, cy?: number) =>
    setVb((cur) => zoomWindow(cur, factor, cx ?? cur.x + cur.w / 2, cy ?? cur.y + cur.h / 2, fit));

  // ------------------------------------------------------------ Gestes
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Molette : écouteur natif non passif, sinon la page défile en même temps.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const fx = (e.clientX - rect.left) / rect.width;
      const fy = (e.clientY - rect.top) / rect.height;
      const f = e.deltaY < 0 ? 0.82 : 1 / 0.82;
      setVb((cur) => zoomWindow(cur, f, cur.x + fx * cur.w, cur.y + fy * cur.h, fit));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [fit]);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; vb: ViewWindow; moved: boolean; pinch?: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.current = { x: e.clientX, y: e.clientY, vb, moved: false };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      drag.current.pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current;
    if (!d) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (pointers.current.size === 2 && d.pinch) {
      // Pincement : zoom autour du milieu des deux doigts.
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > 0) {
        const mx = ((a.x + b.x) / 2 - rect.left) / rect.width;
        const my = ((a.y + b.y) / 2 - rect.top) / rect.height;
        const f = d.pinch / dist;
        d.pinch = dist;
        d.moved = true;
        setVb((cur) => zoomWindow(cur, f, cur.x + mx * cur.w, cur.y + my * cur.h, fit));
      }
      return;
    }
    const dx = ((e.clientX - d.x) / rect.width) * d.vb.w;
    const dy = ((e.clientY - d.y) / rect.height) * d.vb.h;
    if (!d.moved && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) {
      // Capture seulement une fois le glissé engagé : un simple clic garde
      // sa cible (une boucle, une ligne droite, un point d'intérêt).
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (!d.moved) return;
    setVb((cur) => ({ ...cur, x: d.vb.x - dx, y: d.vb.y - dy }));
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) setTimeout(() => (drag.current = null), 0);
    else if (drag.current) {
      // On repart du doigt restant, sans saut.
      const [p] = [...pointers.current.values()];
      drag.current = { x: p.x, y: p.y, vb, moved: true };
    }
  };

  const click = async (e: React.MouseEvent<SVGSVGElement>) => {
    if (drag.current?.moved) return;
    if (mode !== "add") return;
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
  // Tuiles chargées quand elles entrent dans la fenêtre (du centre vers les
  // bords) ; une tuile refusée par Overpass est redécoupée en quatre.
  const [roads, setRoads] = useState<Array<{ key: string; byClass: string[] }>>([]);
  const [pendingTiles, setPendingTiles] = useState(0);
  const [failedTiles, setFailedTiles] = useState(0);
  const requested = useRef(new Set<string>());
  const queue = useRef<Tile[]>([]);
  const active = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const pump = () => {
    while (active.current < 2 && queue.current.length) {
      const tile = queue.current.shift()!;
      active.current++;
      void loadTile(tile).finally(() => {
        active.current--;
        if (alive.current) {
          setPendingTiles(queue.current.length + active.current);
          pump();
        }
      });
    }
  };
  const loadTile = async (tile: Tile) => {
    const q = new URLSearchParams({
      minLat: String(tile.bbox.minLat),
      maxLat: String(tile.bbox.maxLat),
      minLon: String(tile.bbox.minLon),
      maxLon: String(tile.bbox.maxLon),
      detail: tile.detail,
    });
    let ok = false;
    try {
      const j = (await (await fetch(`/api/routes/osm?${q}`)).json()) as { ok: boolean; roads: string[] };
      if (!alive.current) return;
      const byClass = ["", "", "", ""];
      for (const r of j.roads) {
        const { cls, polyline } = parseRoad(r);
        byClass[cls] += polylinePath(polyline, view.bbox);
      }
      if (j.roads.length) setRoads((cur) => [...cur, { key: tile.key, byClass }]);
      ok = j.ok;
    } catch {
      ok = false;
    }
    if (!alive.current || ok) return;
    if (tile.depth === 0) {
      queue.current.push(...splitTile(tile));
    } else {
      setFailedTiles((n) => n + 1);
    }
  };
  // Fenêtre stabilisée (pas une requête par image pendant un glissé).
  const [settled, setSettled] = useState(vb);
  useEffect(() => {
    const id = setTimeout(() => setSettled(vb), 250);
    return () => clearTimeout(id);
  }, [vb]);
  useEffect(() => {
    if (!showStreets) return;
    const cx = settled.x + settled.w / 2;
    const cy = settled.y + settled.h / 2;
    const fresh = view.tiles
      .map((tl, i) => ({ ...tl, depth: 0, key: `t${i}` }))
      .filter((tl) => !requested.current.has(tl.key) && boxesIntersect(tl.box, settled))
      .sort((a, b) => dist(a.box, cx, cy) - dist(b.box, cx, cy));
    if (!fresh.length) return;
    for (const tl of fresh) requested.current.add(tl.key);
    queue.current.push(...fresh);
    setPendingTiles(queue.current.length + active.current);
    pump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, showStreets]);

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

      <div ref={wrapRef} className="relative overflow-hidden rounded-[14px] border border-hair bg-panel">
        <svg
          ref={svgRef}
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          className={`block w-full select-none ${mode === "add" ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
          style={{ touchAction: "none", aspectRatio: String(aspect) }}
          preserveAspectRatio="xMidYMid slice"
          role="img"
          aria-label={t("mapAria")}
          onClick={click}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={(e) => e.pointerType === "mouse" && onPointerUp(e)}
        >
          <rect x={vb.x - vb.w} y={vb.y - vb.h} width={vb.w * 3} height={vb.h * 3} fill="rgb(var(--panel))" />

          {showStreets &&
            ROAD_STYLE.map((st) =>
              st.cls >= 2 && !showPaths
                ? null
                : roads.map((r) =>
                    r.byClass[st.cls] ? (
                      <path
                        key={`${r.key}-${st.cls}`}
                        d={r.byClass[st.cls]}
                        fill="none"
                        stroke={`rgb(var(--ink) / ${(dimOthers ? st.o * 0.7 : st.o).toFixed(2)})`}
                        strokeWidth={st.w}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null
                  )
            )}

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

        {/* Zoom, en surimpression (coin haut droit), comme sur toute carte. */}
        <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-[8px] border border-hair bg-panel/90 shadow-sm backdrop-blur">
          <button type="button" className="px-2.5 py-1.5 text-[1.05rem] leading-none text-ink2 hover:bg-sunken hover:text-ink" onClick={() => zoom(0.7)} aria-label={t("zoomIn")} title={t("zoomIn")}>
            +
          </button>
          <button type="button" className="border-y border-hair px-2.5 py-1.5 text-[1.05rem] leading-none text-ink2 hover:bg-sunken hover:text-ink" onClick={() => zoom(1 / 0.7)} aria-label={t("zoomOut")} title={t("zoomOut")}>
            −
          </button>
          <button type="button" className="px-2.5 py-1.5 text-[0.85rem] leading-none text-ink2 hover:bg-sunken hover:text-ink" onClick={() => setVb(home)} aria-label={t("resetZoom")} title={t("resetZoom")}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" className="mx-auto">
              <circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="8" cy="8" r="1.5" fill="currentColor" />
              <path d="M8 0.5v3M8 12.5v3M0.5 8h3M12.5 8h3" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>

        {/* Échelle graphique */}
        <div className="pointer-events-none absolute bottom-3 right-3 flex flex-col items-end gap-1 font-mono text-[0.6875rem] text-ink2">
          <span>{fmtLen(bar.meters)}</span>
          <span className="block h-[5px] border-x border-b border-ink2" style={{ width: bar.px }} />
        </div>

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

/** Fenêtre d'ouverture sur une boîte (marge), au ratio de l'écran, bornée par la carte entière. */
function openOn(box: ViewWindow, aspect: number, fit: ViewWindow, pad = 0.04): ViewWindow {
  const minSide = fit.w / 14; // pas plus serré qu'un quartier
  const w = Math.max(box.w * (1 + 2 * pad), minSide);
  const h = Math.max(box.h * (1 + 2 * pad), minSide / aspect);
  const c = coverWindow({ x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h }, aspect);
  return c.w > fit.w ? fit : c;
}

function dist(b: ViewWindow, x: number, y: number) {
  return Math.hypot(b.x + b.w / 2 - x, b.y + b.h / 2 - y);
}

function splitTile(tl: Tile): Tile[] {
  const midLat = (tl.bbox.minLat + tl.bbox.maxLat) / 2;
  const midLon = (tl.bbox.minLon + tl.bbox.maxLon) / 2;
  const hw = tl.box.w / 2;
  const hh = tl.box.h / 2;
  const q = (minLat: number, maxLat: number, minLon: number, maxLon: number, x: number, y: number, n: number): Tile => ({
    bbox: { minLat, maxLat, minLon, maxLon },
    box: { x, y, w: hw, h: hh },
    detail: tl.detail,
    depth: tl.depth + 1,
    key: `${tl.key}.${n}`,
  });
  const { minLat, maxLat, minLon, maxLon } = tl.bbox;
  return [
    q(midLat, maxLat, minLon, midLon, tl.box.x, tl.box.y, 0),
    q(midLat, maxLat, midLon, maxLon, tl.box.x + hw, tl.box.y, 1),
    q(minLat, midLat, minLon, midLon, tl.box.x, tl.box.y + hh, 2),
    q(minLat, midLat, midLon, maxLon, tl.box.x + hw, tl.box.y + hh, 3),
  ];
}
