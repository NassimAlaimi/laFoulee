"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { RouteGlyph } from "./RouteGlyph";

type Loop = { polyline: string; meters: number; score: number; novelty: number };

/**
 * L'atelier : une distance, un curseur habitude ↔ découverte, et le réseau
 * personnel propose trois boucles. Le calcul est côté serveur (graphe).
 */
export function RouteWorkshop({ hasGraph, startLat, startLng }: { hasGraph: boolean; startLat: number | null; startLng: number | null }) {
  const t = useTranslations("routes");
  const router = useRouter();
  const [km, setKm] = useState("10");
  const [explore, setExplore] = useState(0.5);
  const [loops, setLoops] = useState<Loop[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);
  const [savedIdx, setSavedIdx] = useState<number | null>(null);

  const generate = async () => {
    setBusy(true);
    setLoops(null);
    setSavedIdx(null);
    const res = await fetch("/api/routes/loops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ distanceM: Math.round((Number(km) || 10) * 1000), explore, startLat, startLng }),
    });
    const j = await res.json();
    setBusy(false);
    if (j?.ok) setLoops(j.loops);
  };

  const save = async (i: number) => {
    const l = loops![i];
    setSaving(i);
    const res = await fetch("/api/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${t("loopName")} ${(l.meters / 1000).toFixed(1)} km`, polyline: l.polyline, distance: l.meters }),
    });
    setSaving(null);
    if (res.ok) {
      setSavedIdx(i);
      router.refresh();
    }
  };

  if (!hasGraph) {
    return <p className="max-w-2xl text-[0.8125rem] leading-relaxed text-ink2">{t("emptyGraph")}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-6">
        <label>
          <div className="eyebrow mb-1.5">{t("distance")}</div>
          <div className="flex items-center gap-2">
            <input className="field w-20" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} />
            <span className="text-sm text-ink2">km</span>
          </div>
        </label>
        <label className="min-w-52 flex-1">
          <div className="eyebrow mb-1.5">
            {t("flavor")} — <span className="normal-case">{explore > 0.6 ? t("discovery") : explore < 0.4 ? t("habit") : t("mix")}</span>
          </div>
          <input type="range" min={0} max={1} step={0.05} value={explore} onChange={(e) => setExplore(Number(e.target.value))} className="w-full accent-clay" />
        </label>
        <button type="button" className="btn-solid" onClick={generate} disabled={busy}>
          {busy ? t("generating") : t("generate")}
        </button>
      </div>

      {loops && loops.length === 0 && <p className="text-[0.8125rem] text-ochre">{t("noLoop")}</p>}

      {loops && loops.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {loops.map((l, i) => (
            <div key={i} className="border-t border-hair pt-4">
              <RouteGlyph polyline={l.polyline} size={120} className="w-full text-clay" />
              <div className="mt-3 flex items-baseline justify-between">
                <span className="num text-[1.4rem] font-semibold">{(l.meters / 1000).toFixed(1)} km</span>
                <span className="text-micro text-ink3">{t("novelty", { p: Math.round(l.novelty * 100) })}</span>
              </div>
              <button type="button" className="btn-outline btn-sm mt-3 w-full" disabled={saving === i} onClick={() => save(i)}>
                {savedIdx === i ? t("saved") : saving === i ? "…" : t("saveRoute")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
