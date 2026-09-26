"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

type View = {
  viewBox: readonly [number, number];
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  edges: Array<{ x1: number; y1: number; x2: number; y2: number; passes: number }>;
  osm: string[];
  pois: Array<{ id: string; kind: string; x: number; y: number; note: string | null }>;
};

const POI_COLOR: Record<string, string> = {
  fountain: "rgb(var(--slate))",
  toilet: "rgb(var(--sage))",
  car: "rgb(var(--plum))",
  bakery: "rgb(var(--ochre))",
  lit: "rgb(var(--clay))",
  danger: "rgb(var(--rust))",
  track: "rgb(var(--sage))",
};

/**
 * Le territoire : le réseau des rues déjà courues (épaisseur = fréquence),
 * les points d'intérêt, et un clic pour poser un point. SVG client léger.
 */
export function NetworkMap({ view, kinds }: { view: View; kinds: Array<[string, string]> }) {
  const t = useTranslations("routes");
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "add">("view");
  const [showStreets, setShowStreets] = useState(true);
  const [kind, setKind] = useState("fountain");
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const maxPasses = Math.max(1, ...view.edges.map((e) => e.passes));
  const [W, H] = view.viewBox;

  const toLatLng = (x: number, y: number) => {
    const lat = view.bbox.maxLat - (y / H) * (view.bbox.maxLat - view.bbox.minLat);
    const lon = view.bbox.minLon + (x / W) * (view.bbox.maxLon - view.bbox.minLon);
    return { lat, lng: lon };
  };
  const click = async (e: React.MouseEvent<SVGSVGElement>) => {
    if (mode !== "add") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    setPending({ x, y });
    const { lat, lng } = toLatLng(x, y);
    await fetch("/api/routes/pois", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, lat, lng }) });
    setPending(null);
    router.refresh();
  };

  const remove = async (id: string) => {
    await fetch(`/api/routes/pois?id=${id}`, { method: "DELETE" });
    router.refresh();
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
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className={`w-full rounded-[14px] border border-hair bg-panel ${mode === "add" ? "cursor-crosshair" : ""}`} role="img" aria-label={t("mapAria")} onClick={click}>
        <rect width={W} height={H} fill="transparent" />
        {showStreets &&
          view.osm.map((d, i) => (
            <path key={`o${i}`} d={d} fill="none" stroke="rgb(var(--ink) / 0.14)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        {view.edges.map((e, i) => {
          const o = 0.12 + 0.55 * Math.sqrt(e.passes / maxPasses);
          return <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={`rgb(var(--clay) / ${o.toFixed(2)})`} strokeWidth="2" strokeLinecap="round" />;
        })}
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
  );
}
