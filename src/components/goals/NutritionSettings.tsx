"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { sweatRate } from "@/lib/nutrition";

type P = { id: string; name: string; carbsG: number; caffeineMg: number; custom: boolean };
type N = { mainId: string; caffeineId: string | null; gutTrained: boolean; sweatRateLh: number | null; salty: boolean };

/**
 * Réglages nutrition : produit principal, caféine, intestin entraîné,
 * sudation (calculateur intégré), produits perso.
 */
export function NutritionSettings({ goalId, products, initial }: { goalId: string; products: P[]; initial: N }) {
  const t = useTranslations("nutrition");
  const router = useRouter();
  const [n, setN] = useState<N>(initial);
  const [calc, setCalc] = useState({ before: "", after: "", drank: "", minutes: "" });
  const [np, setNp] = useState({ name: "", carbsG: "", sodiumMg: "", caffeineMg: "" });
  const [busy, setBusy] = useState(false);

  const num = (s: string) => Number(s.replace(",", "."));
  const measured = calc.before && calc.after && calc.minutes
    ? sweatRate({ before: num(calc.before), after: num(calc.after), drankMl: num(calc.drank || "0"), minutes: num(calc.minutes) })
    : null;

  const save = async (next: N) => {
    setBusy(true);
    await fetch("/api/race-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goalId, nutrition: next }),
    });
    setBusy(false);
    router.refresh();
  };
  const addProduct = async () => {
    if (!np.name.trim() || !np.carbsG) return;
    await fetch("/api/nutrition/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: np.name.trim(), carbsG: num(np.carbsG), sodiumMg: num(np.sodiumMg || "0"), caffeineMg: num(np.caffeineMg || "0") }),
    });
    setNp({ name: "", carbsG: "", sodiumMg: "", caffeineMg: "" });
    router.refresh();
  };
  const del = async (id: string) => {
    await fetch(`/api/nutrition/products?id=${id}`, { method: "DELETE" });
    router.refresh();
  };
  const label = (p: P) => (p.custom ? p.name : t(`product.${p.name}`));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-6">
        <label>
          <div className="eyebrow mb-1.5">{t("main")}</div>
          <select className="field" value={n.mainId} onChange={(e) => setN({ ...n, mainId: e.target.value })}>
            {products.filter((p) => p.caffeineMg === 0).map((p) => (
              <option key={p.id} value={p.id}>
                {label(p)} · {p.carbsG} g
              </option>
            ))}
          </select>
        </label>
        <label>
          <div className="eyebrow mb-1.5">{t("caffeine")}</div>
          <select className="field" value={n.caffeineId ?? ""} onChange={(e) => setN({ ...n, caffeineId: e.target.value || null })}>
            <option value="">{t("noCaffeine")}</option>
            {products.filter((p) => p.caffeineMg > 0).map((p) => (
              <option key={p.id} value={p.id}>
                {label(p)} · {p.caffeineMg} mg
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-[0.8125rem]">
          <input type="checkbox" checked={n.gutTrained} onChange={(e) => setN({ ...n, gutTrained: e.target.checked })} />
          {t("gutTrained")}
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-[0.8125rem]">
          <input type="checkbox" checked={n.salty} onChange={(e) => setN({ ...n, salty: e.target.checked })} />
          {t("salty")}
        </label>
      </div>

      <div>
        <div className="eyebrow mb-1.5">{t("sweat")}</div>
        <p className="mb-2 max-w-2xl text-micro text-ink3">{t("sweatHow")}</p>
        <div className="flex flex-wrap items-center gap-2">
          {(["before", "after", "drank", "minutes"] as const).map((k) => (
            <input key={k} className="field w-28" inputMode="decimal" placeholder={t(`sweat_${k}`)} value={calc[k]} onChange={(e) => setCalc({ ...calc, [k]: e.target.value })} />
          ))}
          {measured !== null && (
            <button type="button" className="btn-outline btn-sm" onClick={() => setN({ ...n, sweatRateLh: measured })}>
              {t("useRate", { r: measured })}
            </button>
          )}
          <span className="text-micro text-ink2">
            {n.sweatRateLh ? t("rateSet", { r: n.sweatRateLh }) : t("rateUnknown")}
            {n.sweatRateLh && (
              <button type="button" className="ml-2 text-ink3 hover:text-rust" onClick={() => setN({ ...n, sweatRateLh: null })}>
                ×
              </button>
            )}
          </span>
        </div>
      </div>

      <button type="button" className="btn-solid" disabled={busy} onClick={() => save(n)}>
        {t("apply")}
      </button>

      <details className="border-t border-hair pt-4">
        <summary className="cursor-pointer text-[0.8125rem] text-ink2 hover:text-ink">{t("myProducts")}</summary>
        <ul className="mt-3 space-y-1 text-[0.8125rem]">
          {products.filter((p) => p.custom).map((p) => (
            <li key={p.id} className="flex items-center gap-3">
              <span>{p.name}</span>
              <span className="text-micro text-ink3">{p.carbsG} g{p.caffeineMg ? ` · ${p.caffeineMg} mg` : ""}</span>
              <button type="button" className="text-micro text-ink3 hover:text-rust" onClick={() => del(p.id)}>
                {t("remove")}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <input className="field w-40" placeholder={t("pName")} value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} />
          <input className="field w-24" inputMode="decimal" placeholder={t("pCarbs")} value={np.carbsG} onChange={(e) => setNp({ ...np, carbsG: e.target.value })} />
          <input className="field w-24" inputMode="decimal" placeholder={t("pSodium")} value={np.sodiumMg} onChange={(e) => setNp({ ...np, sodiumMg: e.target.value })} />
          <input className="field w-24" inputMode="decimal" placeholder={t("pCaffeine")} value={np.caffeineMg} onChange={(e) => setNp({ ...np, caffeineMg: e.target.value })} />
          <button type="button" className="btn-outline btn-sm" onClick={addProduct}>
            + {t("add")}
          </button>
        </div>
      </details>
    </div>
  );
}
