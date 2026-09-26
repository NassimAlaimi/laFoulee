"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Section } from "@/components/ui/Layout";
import { NetworkMap, type MapSelection } from "./NetworkMap";
import { projectPolyline, unionBox, type AtelierView, type ViewWindow } from "@/lib/route-view";
import { LOOP_COLORS } from "@/lib/route-colors";

type Loop = { polyline: string; meters: number; novelty: number; direction: string; d: string; box: ViewWindow };
type Straight = { d: string; box: ViewWindow; meters: number; passes: number; fromStart: number | null };

/**
 * L'atelier : la carte du territoire, et juste dessous le composeur de
 * boucles et les lignes droites. Tout ce qu'on choisit (une proposition, une
 * ligne) s'affiche et se cadre sur la carte.
 */
export function RouteAtelier({
  view,
  kinds,
  startLat,
  startLng,
  routes = [],
  straights = [],
}: {
  view: AtelierView;
  kinds: Array<[string, string]>;
  startLat: number | null;
  startLng: number | null;
  routes?: Array<{ id: string; d: string; name: string; meters: number }>;
  straights?: Straight[];
}) {
  const t = useTranslations("routes");
  const locale = useLocale();
  const router = useRouter();
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [km, setKm] = useState("10");
  const [explore, setExplore] = useState(0.5);
  const [loops, setLoops] = useState<Loop[] | null>(null);
  const [source, setSource] = useState<"streets" | "network">("streets");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);
  const [savedIdx, setSavedIdx] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<MapSelection>(null);
  const [onlyProposals, setOnlyProposals] = useState(false);
  const [frame, setFrame] = useState<{ box: ViewWindow; n: number } | null>(null);

  const fmtKm = (m: number, digits = 1) => (m / 1000).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });

  const showOnMap = (box: ViewWindow | null) => {
    if (!box) return;
    setFrame((f) => ({ box, n: (f?.n ?? 0) + 1 }));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const r = mapRef.current?.getBoundingClientRect();
    if (r && (r.top < 0 || r.bottom > window.innerHeight)) mapRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  };

  const select = (s: MapSelection) => {
    setSelected(s);
    if (!s) return;
    const box = s.kind === "loop" ? loops?.[s.i]?.box : straights[s.i]?.box;
    // Une ligne droite est courte : on garde du contexte autour.
    showOnMap(box ? unionBox([box], s.kind === "straight" ? 1.2 : 0.12) : null);
  };

  const generate = async () => {
    setBusy(true);
    setLoops(null);
    setSelected(null);
    setSavedIdx(new Set());
    const res = await fetch("/api/routes/loops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ distanceM: Math.round((Number(km.replace(",", ".")) || 10) * 1000), explore, startLat, startLng }),
    });
    const j = await res.json().catch(() => null);
    setBusy(false);
    if (!j?.ok) {
      setLoops([]);
      return;
    }
    const got: Loop[] = (j.loops as Array<Omit<Loop, "d" | "box">>).flatMap((l) => {
      const pr = projectPolyline(l.polyline, view.bbox);
      return pr ? [{ ...l, ...pr }] : [];
    });
    setSource(j.source);
    setLoops(got);
    if (got.length) {
      // Nouvelles propositions : on les montre seules, cadrées.
      setOnlyProposals(true);
      showOnMap(unionBox(got.map((l) => l.box)));
    }
  };

  const save = async (i: number) => {
    const l = loops![i];
    setSaving(i);
    const res = await fetch("/api/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${t("loopName")} ${fmtKm(l.meters)} km · ${t(`dir_${l.direction}`)}`, polyline: l.polyline, distance: l.meters }),
    });
    setSaving(null);
    if (res.ok) {
      setSavedIdx((s) => new Set(s).add(i));
      router.refresh();
    }
  };

  return (
    <>
      <Section title={t("territory")} note={t("territoryNote")}>
        <div ref={mapRef}>
          <NetworkMap
            view={view}
            kinds={kinds}
            routes={routes}
            loops={loops ?? []}
            straights={straights}
            selected={selected}
            onSelect={select}
            onlyProposals={onlyProposals}
            setOnlyProposals={(v) => {
              setOnlyProposals(v);
              if (v) setSelected((s) => (s?.kind === "straight" ? null : s));
            }}
            frame={frame}
          />
        </div>
      </Section>

      <Section title={t("build")} note={t("buildNote")}>
        <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              void generate();
            }}
          >
            <label className="block">
              <span className="field-label">{t("distance")}</span>
              <span className="flex items-baseline gap-2">
                <input className="field w-24 text-[1.4rem] font-semibold tabular-nums" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} />
                <span className="text-sm text-ink2">km</span>
              </span>
            </label>
            <label className="block">
              <span className="field-label">
                {t("flavor")} — <span className="normal-case text-ink2">{explore > 0.6 ? t("discovery") : explore < 0.4 ? t("habit") : t("mix")}</span>
              </span>
              <input type="range" min={0} max={1} step={0.05} value={explore} onChange={(e) => setExplore(Number(e.target.value))} className="w-full accent-clay" />
            </label>
            <button type="submit" className="btn-solid w-full" disabled={busy}>
              {busy ? t("generating") : t("generate")}
            </button>
          </form>

          <div aria-live="polite">
            {loops && loops.length === 0 && <p className="pt-6 text-[0.8125rem] text-ochre">{t("noLoop")}</p>}
            {loops && loops.length > 0 && (
              <>
                <div className="grid gap-px overflow-hidden rounded-[12px] border border-hair bg-hair sm:grid-cols-3">
                  {loops.map((l, i) => {
                    const sel = selected?.kind === "loop" && selected.i === i;
                    return (
                      <div key={i} className={`flex flex-col bg-panel p-4 transition-colors ${sel ? "bg-sunken" : ""}`}>
                        <button type="button" className="text-left" onClick={() => select(sel ? null : { kind: "loop", i })} aria-pressed={sel}>
                          <span className="flex items-center gap-2 text-micro font-medium uppercase tracking-[0.1em]" style={{ color: LOOP_COLORS[i % LOOP_COLORS.length] }}>
                            <span className="inline-block h-[3px] w-5 rounded-full" style={{ background: "currentColor" }} />
                            {t("loopN", { n: i + 1 })}
                          </span>
                          <span className="mt-3 block">
                            <span className="display text-[2.1rem] leading-none tracking-[-0.04em]">{fmtKm(l.meters)}</span>
                            <span className="ml-1 text-sm text-ink3">km</span>
                          </span>
                          <span className="mt-2 block text-[0.8125rem] text-ink2">{t(`dir_${l.direction}`)}</span>
                          <span className="mt-0.5 block text-micro text-ink3">{t("novelty", { p: Math.round(l.novelty * 100) })}</span>
                        </button>
                        <button type="button" className="btn-outline btn-sm mt-4" disabled={saving === i || savedIdx.has(i)} onClick={() => save(i)}>
                          {savedIdx.has(i) ? t("saved") : saving === i ? "…" : t("saveRoute")}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-micro text-ink3">{source === "network" ? t("sourceNetwork") : t("loopsOnMap")}</p>
              </>
            )}
          </div>
        </div>
      </Section>

      {straights.length > 0 && (
        <Section title={t("straights")} note={t("straightsNote")}>
          <ol className="grid border-t border-hair sm:grid-cols-2 lg:grid-cols-4">
            {straights.map((s, i) => {
              const sel = selected?.kind === "straight" && selected.i === i;
              return (
                <li key={i} className="border-b border-hair">
                  <button
                    type="button"
                    className={`group flex w-full items-baseline gap-3 px-1 py-3.5 text-left transition-colors hover:bg-sunken ${sel ? "bg-sunken" : ""}`}
                    onClick={() => {
                      setOnlyProposals(false);
                      select(sel ? null : { kind: "straight", i });
                    }}
                    aria-pressed={sel}
                  >
                    <span className="w-5 shrink-0 font-mono text-micro text-ink3">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0">
                      <span className={`display text-[1.45rem] leading-none tracking-[-0.03em] ${sel ? "text-plum" : ""}`}>{fmtKm(s.meters, 2)}</span>
                      <span className="ml-1 text-sm text-ink3">km</span>
                      <span className="mt-1 block text-micro text-ink3">
                        {s.fromStart != null && `${t("straightFrom", { km: fmtKm(s.fromStart) })} · `}
                        {t("straightRuns", { n: s.passes })}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </Section>
      )}
    </>
  );
}
