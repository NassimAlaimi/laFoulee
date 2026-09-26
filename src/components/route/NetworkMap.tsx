"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

type View = {
  viewBox: readonly [number, number];
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  edges: Array<{ x1: number; y1: number; x2: number; y2: number; passes: number }>;
  osm: string[];
  pois: Array<{ id: string; kind: string; x: number; y: number; note: string | null }>;
};

type Loop = { id: string; d: string; meters: number };

const POI_COLOR: Record<string, string> = {
  fountain: "rgb(var(--slate))",
  toilet: "rgb(var(--sage))",
  car: "rgb(var(--plum))",
  bakery: "rgb(var(--ochre))",
  lit: "rgb(var(--clay))",
  danger: "rgb(var(--rust))",
  track: "rgb(var(--sage))",
};

const LOOP_COLOR = ["rgb(var(--clay))", "rgb(var(--sage))", "rgb(var(--slate))"];

/**
 * Le territoire : le réseau des rues déjà courues (épaisseur = fréquence),
 * les points d'intérêt, et un clic pour poser un point. Zoomable (molette,
 * boutons, pincement natif) et déplaçable (glisser).
 */
export function NetworkMap({
  view,
  kinds,
  loops = [],
}: {
  view: View;
  kinds: Array<[string, string]>;
  loops?: Loop[];
}) {
  const t = useTranslations("routes");
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "add">("view");
  const [showStreets, setShowStreets] = useState(true);
  const [kind, setKind] = useState("fountain");
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [W, H] = view.viewBox;

  // Fenêtre de vue (dans l'espace de coordonnées 0..W / 0..H).
  const [vb, setVb] = useState({ x: 0, y: 0, w: W, h: H });
  const drag = useRef<{ startX: number; startY: number; vbX: number; vbY: number; moved: boolean } | null>(null);

  const maxPasses = Math.max(1, ...view.edges.map((e) => e.passes));

  const zoom = (factor: number, cx = W / 2, cy = H / 2) => {
    setVb((cur) => {
      const w = Math.max(W / 40, Math.min(W, cur.w * factor));
      const h = Math.max(H / 40, Math.min(H, cur.h * factor));
      const kx = w / cur.w;
      const ky = h / cur.h;
      return { x: cx - (cx - cur.x) * kx, y: cy - (cy - cur.y) * ky, w, h };
    });
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

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {view.osm.length > 0 && (
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
          <button type="button" className="btn-quiet px-2" onClick={() => zoom(0.7)} aria-label="Zoomer en arrière" title={t("zoomOut")}>
            −
          </button>
          <button type="button" className="btn-quiet px-2" onClick={() => setVb({ x: 0, y: 0, w: W, h: H })} aria-label={t("resetZoom")} title={t("resetZoom")}>
            ⤢
          </button>
          <button type="button" className="btn-quiet px-2" onClick={() => zoom(1 / 0.7)} aria-label="Zoomer" title={t("zoomIn")}>
            +
          </button>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[14px] border border-hair bg-panel">
        <svg
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          className={`block w-full ${mode === "add" ? "cursor-crosshair" : drag.current ? "cursor-grabbing" : "cursor-grab"}`}
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
          {showStreets &&
            view.osm.map((d, i) => (
              <path key={`o${i}`} d={d} fill="none" stroke="rgb(var(--ink) / 0.14)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            ))}
          {view.edges.map((e, i) => {
            const o = 0.12 + 0.55 * Math.sqrt(e.passes / maxPasses);
            return <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={`rgb(var(--clay) / ${o.toFixed(2)})`} strokeWidth="2" strokeLinecap="round" />;
          })}
          {loops.map((l, i) => (
            <path key={l.id} d={l.d} fill="none" stroke={LOOP_COLOR[i % LOOP_COLOR.length]} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 4">
              <title>{`${t("loopName")} ${(l.meters / 1000).toFixed(1)} km`}</title>
            </path>
          ))}
          {view.pois.map((p) => (
            <g key={p.id} onClick={(e) => e.stopPropagation()}>
              <circle cx={p.x} cy={p.y} r="7" fill={POI_COLOR[p.kind]} stroke="rgb(var(--bg))" strokeWidth="2">
                <title>{`${t(`poi_${p.kind}`)}${p.note ? ` — ${p.note}` : ""}`}</title>
              </circle>
              <text x={p.x + 11} y={p.y + 4} fontSize="16" fill={POI_COLOR[p.kind]} onClick={() => remove(p.id)} className="cursor-pointer">
                ✕
              </text>
            </g>
          ))}
          {pending && <circle cx={pending.x} cy={pending.y} r="8" fill="none" stroke="rgb(var(--rust))" strokeWidth="2" />}
        </svg>
      </div>
    </div>
  );
}
