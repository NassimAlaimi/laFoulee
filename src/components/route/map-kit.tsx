"use client";

/**
 * Socle commun des cartes (atelier de parcours, carte des activités) :
 * - `useMapViewport` : fenêtre de vue au ratio de l'écran, ouverte sur le
 *   cœur ; molette (sans faire défiler la page), glisser, pincement ;
 * - `useOsmTiles` : fond de rues chargé par tuiles quand elles entrent dans
 *   la fenêtre (une tuile refusée par Overpass est redécoupée en quatre) ;
 * - `StreetLayer`, `MapControls`, `ScaleBar`.
 *
 * Les calculs (projection, fenêtres, échelle) sont dans lib/route-view.ts.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { parseRoad } from "@/lib/osm";
import { boxesIntersect, coverWindow, fitWindow, polylinePath, zoomWindow, type ViewBbox, type ViewWindow } from "@/lib/route-view";

// ------------------------------------------------------------------ Fenêtre

/** Fenêtre d'ouverture sur une boîte (marge), au ratio de l'écran, bornée par la carte entière. */
export function openOn(box: ViewWindow, aspect: number, fit: ViewWindow, pad = 0.04): ViewWindow {
  const minSide = fit.w / 14; // pas plus serré qu'un quartier
  const w = Math.max(box.w * (1 + 2 * pad), minSide);
  const h = Math.max(box.h * (1 + 2 * pad), minSide / aspect);
  const c = coverWindow({ x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h }, aspect);
  return c.w > fit.w ? fit : c;
}

export function useMapViewport({
  W,
  H,
  core,
  aspects = { wide: 1.7, narrow: 0.8 },
}: {
  W: number;
  H: number;
  core: ViewWindow;
  aspects?: { wide: number; narrow: number };
}) {
  const [aspect, setAspect] = useState(aspects.wide);
  const fit = useMemo(() => fitWindow(W, H, aspect, "contain"), [W, H, aspect]);
  const home = useMemo(() => openOn(core, aspect, fit), [core, aspect, fit]);
  const [vb, setVb] = useState<ViewWindow>(() => openOn(core, aspects.wide, fitWindow(W, H, aspects.wide, "contain")));

  // Ordinateur : carte large ; mobile : carte haute qu'on déplace au doigt.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => {
      const a = mq.matches ? aspects.narrow : aspects.wide;
      setAspect(a);
      setVb(openOn(core, a, fitWindow(W, H, a, "contain")));
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H, core, aspects.wide, aspects.narrow]);

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

  const zoom = (factor: number, cx?: number, cy?: number) =>
    setVb((cur) => zoomWindow(cur, factor, cx ?? cur.x + cur.w / 2, cy ?? cur.y + cur.h / 2, fit));

  // Molette : écouteur natif non passif, sinon la page défile en même temps.
  const svgRef = useRef<SVGSVGElement | null>(null);
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

  // Glisser (un doigt / souris) et pincement (deux doigts).
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; vb: ViewWindow; moved: boolean; pinch?: number } | null>(null);
  const handlers = {
    onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      drag.current = { x: e.clientX, y: e.clientY, vb, moved: false };
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        drag.current.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    },
    onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const d = drag.current;
      if (!d) return;
      const rect = e.currentTarget.getBoundingClientRect();
      if (pointers.current.size === 2 && d.pinch) {
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
      if (!d.moved && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) {
        // Capture seulement une fois le glissé engagé : un simple clic garde
        // sa cible (un tracé, une boucle, un point d'intérêt).
        d.moved = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      if (!d.moved) return;
      const dx = ((e.clientX - d.x) / rect.width) * d.vb.w;
      const dy = ((e.clientY - d.y) / rect.height) * d.vb.h;
      setVb((cur) => ({ ...cur, x: d.vb.x - dx, y: d.vb.y - dy }));
    },
    onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size === 0) setTimeout(() => (drag.current = null), 0);
      else if (drag.current) {
        const [p] = [...pointers.current.values()];
        drag.current = { x: p.x, y: p.y, vb, moved: true };
      }
    },
  };

  return {
    vb,
    setVb,
    aspect,
    fit,
    home,
    zoom,
    svgRef,
    wrapRef,
    pxWidth,
    /** unités de carte par pixel écran */
    unit: vb.w / pxWidth,
    /** vrai si le geste en cours est un glissé (le clic ne doit pas agir) */
    dragged: () => Boolean(drag.current?.moved),
    /** cadre la fenêtre sur une boîte */
    frameTo: (box: ViewWindow, pad = 0.1) => setVb(openOn(box, aspect, fit, pad)),
    svgProps: {
      ref: svgRef,
      viewBox: `${vb.x} ${vb.y} ${vb.w} ${vb.h}`,
      style: { touchAction: "none" as const, aspectRatio: String(aspect) },
      preserveAspectRatio: "xMidYMid slice",
      onPointerDown: handlers.onPointerDown,
      onPointerMove: handlers.onPointerMove,
      onPointerUp: handlers.onPointerUp,
      onPointerCancel: handlers.onPointerUp,
    },
  };
}

// ------------------------------------------------------------------ Rues

export type MapTile = { bbox: ViewBbox; box: ViewWindow; detail: "streets" | "all" };
type Tile = MapTile & { depth: number; key: string };
export type TileRoads = { key: string; byClass: string[] };

export function useOsmTiles(tiles: MapTile[], bbox: ViewBbox, vb: ViewWindow, enabled = true) {
  const [roads, setRoads] = useState<TileRoads[]>([]);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
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

  const load = async (tile: Tile) => {
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
      // Une tuile = un <path> par classe de voie : des milliers de rues sans
      // des milliers de nœuds DOM.
      const byClass = ["", "", "", ""];
      for (const r of j.roads) {
        const { cls, polyline } = parseRoad(r);
        byClass[cls] += polylinePath(polyline, bbox);
      }
      if (j.roads.length) setRoads((cur) => [...cur, { key: tile.key, byClass }]);
      ok = j.ok;
    } catch {
      ok = false;
    }
    if (!alive.current || ok) return;
    if (tile.depth === 0) queue.current.push(...splitTile(tile));
    else setFailed((n) => n + 1);
  };
  const pump = () => {
    while (active.current < 2 && queue.current.length) {
      const tile = queue.current.shift()!;
      active.current++;
      void load(tile).finally(() => {
        active.current--;
        if (alive.current) {
          setPending(queue.current.length + active.current);
          pump();
        }
      });
    }
  };

  // Fenêtre stabilisée : pas une requête par image pendant un glissé.
  const [settled, setSettled] = useState(vb);
  useEffect(() => {
    const id = setTimeout(() => setSettled(vb), 250);
    return () => clearTimeout(id);
  }, [vb]);
  useEffect(() => {
    if (!enabled) return;
    const cx = settled.x + settled.w / 2;
    const cy = settled.y + settled.h / 2;
    const fresh = tiles
      .map((tl, i) => ({ ...tl, depth: 0, key: `t${i}` }))
      .filter((tl) => !requested.current.has(tl.key) && boxesIntersect(tl.box, settled))
      .sort((a, b) => dist(a.box, cx, cy) - dist(b.box, cx, cy));
    if (!fresh.length) return;
    for (const tl of fresh) requested.current.add(tl.key);
    queue.current.push(...fresh);
    setPending(queue.current.length + active.current);
    pump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, enabled]);

  return { roads, pending, failed };
}

/** Fond de rues par classe : chemins, escaliers, rues, grands axes (les axes au-dessus). */
const ROAD_STYLE = [
  { cls: 2, w: 0.8, o: 0.13 },
  { cls: 3, w: 0.8, o: 0.1 },
  { cls: 1, w: 1.1, o: 0.24 },
  { cls: 0, w: 2.1, o: 0.36 },
] as const;

/**
 * Rues hiérarchisées. `color` : triplet CSS (« var(--ink) ») ; `strength`
 * multiplie les opacités ; les chemins disparaissent en vue large
 * (`showPaths`), sinon ils font une bouillie grise.
 */
export function StreetLayer({
  roads,
  color = "var(--ink)",
  strength = 1,
  showPaths = true,
}: {
  roads: TileRoads[];
  color?: string;
  strength?: number;
  showPaths?: boolean;
}) {
  return (
    <>
      {ROAD_STYLE.map((st) =>
        st.cls >= 2 && !showPaths
          ? null
          : roads.map((r) =>
              r.byClass[st.cls] ? (
                <path
                  key={`${r.key}-${st.cls}`}
                  d={r.byClass[st.cls]}
                  fill="none"
                  stroke={`rgb(${color} / ${Math.min(1, st.o * strength).toFixed(2)})`}
                  strokeWidth={st.w}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null
            )
      )}
    </>
  );
}

// ------------------------------------------------------------------ Contrôles

/** Zoom en surimpression (coin haut droit), comme sur toute carte. */
export function MapControls({
  onZoomIn,
  onZoomOut,
  onHome,
  labels,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onHome: () => void;
  labels: { zoomIn: string; zoomOut: string; home: string };
}) {
  const btn = "px-2.5 py-1.5 text-[1.05rem] leading-none text-ink2 hover:bg-sunken hover:text-ink";
  return (
    <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-[8px] border border-hair bg-panel/90 shadow-sm backdrop-blur">
      <button type="button" className={btn} onClick={onZoomIn} aria-label={labels.zoomIn} title={labels.zoomIn}>
        +
      </button>
      <button type="button" className={`${btn} border-y border-hair`} onClick={onZoomOut} aria-label={labels.zoomOut} title={labels.zoomOut}>
        −
      </button>
      <button type="button" className={btn} onClick={onHome} aria-label={labels.home} title={labels.home}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" className="mx-auto">
          <circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="8" cy="8" r="1.5" fill="currentColor" />
          <path d="M8 0.5v3M8 12.5v3M0.5 8h3M12.5 8h3" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
    </div>
  );
}

/** Échelle graphique (coin bas droit). */
export function ScaleBar({ label, px, className = "text-ink2" }: { label: string; px: number; className?: string }) {
  return (
    <div className={`pointer-events-none absolute bottom-3 right-3 flex flex-col items-end gap-1 font-mono text-[0.6875rem] ${className}`}>
      <span>{label}</span>
      <span className="block h-[5px] border-x border-b border-current" style={{ width: px }} />
    </div>
  );
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
