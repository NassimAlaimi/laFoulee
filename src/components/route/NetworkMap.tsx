"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { fitWindow, polylinePath, zoomWindow, type ViewWindow } from "@/lib/route-view";

type View = {
  viewBox: readonly [number, number];
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  edges: Array<{ x1: number; y1: number; x2: number; y2: number; passes: number }>;
  osm: string[];
  /** Tuiles du fond de rues à charger après affichage (voir /api/routes/osm). */
  osmTiles?: Array<{ minLat: number; maxLat: number; minLon: number; maxLon: number }>;
  osmDetail?: "streets" | "all";
  pois: Array<{ id: string; kind: string; x: number; y: number; note: string | null }>;
};

type Loop = { id: string; d: string; meters: number };
type Route = { id: string; d: string; name: string; meters: number };

const POI_COLOR: Record<string, string> = {
  fountain: "rgb(var(--slate))",
  toilet: "rgb(var(--sage))",
  car: "rgb(var(--plum))",
  bakery: "rgb(var(--ochre))",
  lit: "rgb(var(--clay))",
  danger: "rgb(var(--rust))",
  track: "rgb(var(--sage))",
};

const LOOP_COLOR = ["rgb(var(--sage))", "rgb(var(--slate))", "rgb(var(--ochre))"];

/**
 * Le territoire : le réseau des rues déjà courues (épaisseur = fréquence),
 * les parcours enregistrés (trait plein) et les boucles proposées (pointillés),
 * les points d'intérêt, et un clic pour poser un point. Zoomable (molette,
 * boutons, pincement natif) et déplaçable (glisser).
 */
export function NetworkMap({
  view,
  kinds,
  loops = [],
  routes = [],
}: {
  view: View;
  kinds: Array<[string, string]>;
  loops?: Loop[];
  routes?: Route[];
}) {
  const t = useTranslations("routes");
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "add">("view");
  const [showStreets, setShowStreets] = useState(true);
  const [onlyProposed, setOnlyProposed] = useState(false);
  const [kind, setKind] = useState("fountain");
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [W, H] = view.viewBox;

  // Fond de rues : chargé tuile par tuile après l'affichage (la carte et le
  // réseau sont là tout de suite, les rues arrivent au fil de l'eau, du centre
  // vers les bords). Une tuile en échec n'empêche pas les autres.
  const tiles = view.osmTiles ?? [];
  const [osm, setOsm] = useState<string[]>(view.osm);
  const [osmTotal, setOsmTotal] = useState(tiles.length);
  const [osmDone, setOsmDone] = useState(0);
  const [osmFailed, setOsmFailed] = useState(0);
  const tilesKey = JSON.stringify(tiles);
  useEffect(() => {
    if (view.osm.length || !tiles.length) return;
    let alive = true;
    const frame = view.bbox;
    const queue = tiles.map((b) => ({ b, depth: 0 }));
    const worker = async () => {
      for (let item = queue.shift(); item && alive; item = queue.shift()) {
        const { b: tile, depth } = item;
        const q = new URLSearchParams({
          minLat: String(tile.minLat),
          maxLat: String(tile.maxLat),
          minLon: String(tile.minLon),
          maxLon: String(tile.maxLon),
          detail: view.osmDetail ?? "all",
        });
        let ok = false;
        try {
          const j = (await (await fetch(`/api/routes/osm?${q}`)).json()) as { ok: boolean; roads: string[] };
          if (!alive) return;
          // Une tuile = un seul <path> (sous-chemins « M… ») : des milliers de
          // rues sans des milliers de nœuds DOM.
          const d = j.roads.map((r) => polylinePath(r, frame)).join("");
          if (d) setOsm((cur) => [...cur, d]);
          ok = j.ok;
        } catch {
          ok = false;
        }
        if (!alive) return;
        if (!ok && depth === 0) {
          // Tuile refusée (serveur chargé, quartier dense) : quatre plus petites.
          const subs = splitInFour(tile).map((b) => ({ b, depth: 1 }));
          queue.push(...subs);
          setOsmTotal((n) => n + subs.length);
        } else if (!ok) {
          setOsmFailed((n) => n + 1);
        }
        setOsmDone((n) => n + 1);
      }
    };
    void Promise.all([worker(), worker()]);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tilesKey]);
  const osmLoading = osmTotal > 0 && osmDone < osmTotal;
  const osmStatus = osmLoading
    ? t("streetsLoading", { n: osmDone, total: osmTotal })
    : osmFailed === 0
      ? null
      : osm.length === 0
        ? t("streetsFailed")
        : t("streetsPartial");

  // Cadre à l'écran : sur ordinateur, tout le territoire (jamais plus plat que
  // 1,9:1) ; sur mobile, une carte haute qu'on déplace au doigt plutôt qu'un
  // bandeau de 140 px. La fenêtre de vue a toujours le ratio du cadre.
  const [aspect, setAspect] = useState(Math.min(W / H, 1.9));
  const [fitMode, setFitMode] = useState<"contain" | "crop">("contain");
  const fit: ViewWindow = useMemo(() => fitWindow(W, H, aspect, fitMode), [W, H, aspect, fitMode]);
  const [vb, setVb] = useState<ViewWindow>(() => fitWindow(W, H, Math.min(W / H, 1.9), "contain"));
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => {
      const narrow = mq.matches;
      const a = narrow ? 0.85 : Math.min(W / H, 1.9);
      const m = narrow ? "crop" : "contain";
      setAspect(a);
      setFitMode(m);
      setVb(fitWindow(W, H, a, m));
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [W, H]);
  const drag = useRef<{ startX: number; startY: number; vbX: number; vbY: number; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // La molette sur la carte ne doit pas faire défiler la page : React pose
  // ses écouteurs « wheel » en passif, on en ajoute un natif non passif.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const blockScroll = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", blockScroll, { passive: false });
    return () => el.removeEventListener("wheel", blockScroll);
  }, []);

  // Réseau : quelques calques par palier d'opacité (fréquence de passage)
  // plutôt qu'un <line> par segment — même rendu, DOM ~1000× plus léger.
  const edgeLayers = useMemo(() => {
    const maxPasses = Math.max(1, ...view.edges.map((e) => e.passes));
    const layers = new Map<string, string[]>();
    for (const e of view.edges) {
      const o = (0.1 + 0.5 * Math.round(Math.sqrt(e.passes / maxPasses) * 6) / 6).toFixed(2);
      let arr = layers.get(o);
      if (!arr) layers.set(o, (arr = []));
      arr.push(`M${e.x1},${e.y1}L${e.x2},${e.y2}`);
    }
    return [...layers.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([o, parts]) => ({ o, d: parts.join("") }));
  }, [view.edges]);

  const zoom = (factor: number, cx?: number, cy?: number) => {
    setVb((cur) => zoomWindow(cur, factor, cx ?? cur.x + cur.w / 2, cy ?? cur.y + cur.h / 2, fit));
  };

  const toLatLng = (px: number, py: number) => {
    // px/py : fractions (0..1) de la boîte affichée → coordonnées pleines.
    const fx = vb.x + px * vb.w;
    const fy = vb.y + py * vb.h;
    const lat = view.bbox.maxLat - (fy / H) * (view.bbox.maxLat - view.bbox.minLat);
    const lon = view.bbox.minLon + (fx / W) * (view.bbox.maxLon - view.bbox.minLon);
    return { lat, lng: lon };
  };

  const click = async (e: React.MouseEvent<SVGSVGElement>) => {
    if (mode !== "add") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const fx = vb.x + px * vb.w;
    const fy = vb.y + py * vb.h;
    setPending({ x: fx, y: fy });
    const { lat, lng } = toLatLng(px, py);
    await fetch("/api/routes/pois", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, lat, lng }) });
    setPending(null);
    router.refresh();
  };

  const remove = async (id: string) => {
    await fetch(`/api/routes/pois?id=${id}`, { method: "DELETE" });
    router.refresh();
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    drag.current = { startX: e.clientX, startY: e.clientY, vbX: vb.x, vbY: vb.y, moved: false };
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = ((e.clientX - d.startX) / rect.width) * vb.w;
    const dy = ((e.clientY - d.startY) / rect.height) * vb.h;
    if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 4) d.moved = true;
    setVb((cur) => ({ ...cur, x: d.vbX - dx, y: d.vbY - dy }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  // Échelle pixel/unité de la fenêtre affichée : garde les points d'intérêt
  // à taille constante à l'écran quel que soit le niveau de zoom.
  const pxScale = vb.w / fit.w;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`btn-quiet btn-sm ${onlyProposed ? "text-clay" : "text-ink3"}`}
          aria-pressed={onlyProposed}
          onClick={() => setOnlyProposed(!onlyProposed)}
        >
          {t("onlyProposed")}
        </button>
        {!onlyProposed && osm.length > 0 && (
          <button
            type="button"
            className={`btn-quiet btn-sm ${showStreets ? "text-clay" : "text-ink3"}`}
            aria-pressed={showStreets}
            onClick={() => setShowStreets(!showStreets)}
          >
            {t("streets")}
          </button>
        )}
        {mode === "view" ? (
          <button type="button" className="btn-outline btn-sm" onClick={() => setMode("add")}>
            + {t("addPoi")}
          </button>
        ) : (
          <>
            <select className="field py-1" value={kind} onChange={(e) => setKind(e.target.value)}>
              {kinds.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <span className="text-micro text-ink3">{t("clickMap")}</span>
            <button type="button" className="btn-quiet btn-sm" onClick={() => setMode("view")}>
              {t("done")}
            </button>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className="btn-quiet px-2" onClick={() => zoom(1 / 0.7)} aria-label={t("zoomOut")} title={t("zoomOut")}>
            −
          </button>
          <button type="button" className="btn-quiet px-2" onClick={() => setVb(fit)} aria-label={t("resetZoom")} title={t("resetZoom")}>
            ⤢
          </button>
          <button type="button" className="btn-quiet px-2" onClick={() => zoom(0.7)} aria-label={t("zoomIn")} title={t("zoomIn")}>
            +
          </button>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[14px] border border-hair bg-panel">
        <svg
          ref={svgRef}
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          className={`block w-full ${mode === "add" ? "cursor-crosshair" : drag.current ? "cursor-grabbing" : "cursor-grab"}`}
          style={{ touchAction: "none", aspectRatio: String(aspect) }}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={t("mapAria")}
          onClick={click}
          onWheel={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const cx = ((e.clientX - rect.left) / rect.width) * vb.w + vb.x;
            const cy = ((e.clientY - rect.top) / rect.height) * vb.h + vb.y;
            zoom(e.deltaY < 0 ? 0.82 : 1 / 0.82, cx, cy);
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => (drag.current = null)}
        >
          <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="transparent" />
          {!onlyProposed && showStreets &&
            osm.map((d, i) => (
              <path key={`o${i}`} d={d} fill="none" stroke="rgb(var(--ink) / 0.14)" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            ))}
          {!onlyProposed &&
            edgeLayers.map((l) => (
              <path key={l.o} d={l.d} fill="none" stroke={`rgb(var(--clay) / ${l.o})`} strokeWidth={1.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            ))}
          {routes.map((r) => (
            <path key={r.id} d={r.d} fill="none" stroke="rgb(var(--clay))" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke">
              <title>{`${r.name} · ${(r.meters / 1000).toFixed(1)} km`}</title>
            </path>
          ))}
          {loops.map((l, i) => (
            <path key={l.id} d={l.d} fill="none" stroke={LOOP_COLOR[i % LOOP_COLOR.length]} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 4" vectorEffect="non-scaling-stroke">
              <title>{`${t("loopName")} ${(l.meters / 1000).toFixed(1)} km`}</title>
            </path>
          ))}
          {view.pois.map((p) => (
            <g key={p.id} onClick={(e) => e.stopPropagation()}>
              <circle cx={p.x} cy={p.y} r={7 * pxScale} fill={POI_COLOR[p.kind]} stroke="rgb(var(--bg))" strokeWidth="2" vectorEffect="non-scaling-stroke">
                <title>{`${t(`poi_${p.kind}`)}${p.note ? ` — ${p.note}` : ""}`}</title>
              </circle>
              <text x={p.x + 11 * pxScale} y={p.y + 4 * pxScale} fontSize={16 * pxScale} fill={POI_COLOR[p.kind]} onClick={() => remove(p.id)} className="cursor-pointer">
                ✕
              </text>
            </g>
          ))}
          {pending && <circle cx={pending.x} cy={pending.y} r={8 * pxScale} fill="none" stroke="rgb(var(--rust))" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
        </svg>
        {!onlyProposed && osmStatus && (
          <span className="pointer-events-none absolute bottom-2 left-3 font-mono text-micro text-ink3" role="status">
            {osmStatus}
          </span>
        )}
        {onlyProposed && routes.length === 0 && loops.length === 0 && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-[0.8125rem] text-ink3">
            {t("onlyProposedEmpty")}
          </p>
        )}
      </div>

      {(routes.length > 0 || loops.length > 0) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-micro text-ink3">
          {routes.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-[3px] w-5 rounded-full bg-clay" />
              {t("legendSaved")}
            </span>
          )}
          {loops.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: "rgb(var(--sage))" }} />
              {t("legendLoops")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Coupe une bbox en quatre quarts. */
function splitInFour(b: { minLat: number; maxLat: number; minLon: number; maxLon: number }) {
  const midLat = (b.minLat + b.maxLat) / 2;
  const midLon = (b.minLon + b.maxLon) / 2;
  return [
    { minLat: b.minLat, maxLat: midLat, minLon: b.minLon, maxLon: midLon },
    { minLat: b.minLat, maxLat: midLat, minLon: midLon, maxLon: b.maxLon },
    { minLat: midLat, maxLat: b.maxLat, minLon: b.minLon, maxLon: midLon },
    { minLat: midLat, maxLat: b.maxLat, minLon: midLon, maxLon: b.maxLon },
  ];
}
