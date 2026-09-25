"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { fmtClockInput, parseClock, StrategyPicker } from "./RacePlanForm";

type Cp = { km: number; kind: "aid" | "cutoff" | "crew" | "mark"; label: string; cutoff?: number | null };

/** Réglages du jour J : chrono, stratégie, météo prévue, points clés. */
export function RaceSettings({
  goalId,
  initial,
}: {
  goalId: string;
  initial: { targetSeconds: number | null; strategy: string; tempC: number | null; dewC: number | null; checkpoints: Cp[] };
}) {
  const t = useTranslations("racePlan");
  const router = useRouter();
  const [clock, setClock] = useState(fmtClockInput(initial.targetSeconds));
  const [strategy, setStrategy] = useState(initial.strategy);
  const [temp, setTemp] = useState(initial.tempC?.toString() ?? "");
  const [dew, setDew] = useState(initial.dewC?.toString() ?? "");
  const [cps, setCps] = useState<Array<Cp & { cutoffText: string }>>(
    initial.checkpoints.map((c) => ({ ...c, cutoffText: fmtClockInput(c.cutoff ?? null) }))
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true);
    setSaved(false);
    const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
    await fetch("/api/race-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goalId,
        strategy,
        targetSeconds: parseClock(clock),
        weather: temp.trim() === "" ? null : { tempC: num(temp), dewC: num(dew) },
        checkpoints: cps
          .filter((c) => Number.isFinite(c.km) && c.km > 0)
          .map((c) => ({ km: c.km, kind: c.kind, label: c.label.slice(0, 40) || t(`cp_${c.kind}`), cutoff: c.kind === "cutoff" ? parseClock(c.cutoffText) : null })),
      }),
    });
    setBusy(false);
    setSaved(true);
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-6">
        <label>
          <div className="eyebrow mb-1.5">{t("targetTime")}</div>
          <input className="field w-32" value={clock} onChange={(e) => setClock(e.target.value)} placeholder="3:45:00" />
        </label>
        <div>
          <div className="eyebrow mb-1.5">{t("strategy")}</div>
          <StrategyPicker value={strategy} onChange={setStrategy} />
        </div>
        <label>
          <div className="eyebrow mb-1.5">{t("tempC")}</div>
          <input className="field w-20" inputMode="decimal" value={temp} onChange={(e) => setTemp(e.target.value)} placeholder="18" />
        </label>
        <label>
          <div className="eyebrow mb-1.5">{t("dewC")}</div>
          <input className="field w-20" inputMode="decimal" value={dew} onChange={(e) => setDew(e.target.value)} placeholder="10" />
        </label>
      </div>

      <div>
        <div className="eyebrow mb-2">{t("checkpoints")}</div>
        <div className="space-y-2">
          {cps.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                className="field w-20"
                inputMode="decimal"
                value={Number.isFinite(c.km) ? String(c.km) : ""}
                aria-label="km"
                onChange={(e) => setCps(cps.map((x, j) => (j === i ? { ...x, km: Number(e.target.value.replace(",", ".")) } : x)))}
              />
              <select className="field" value={c.kind} onChange={(e) => setCps(cps.map((x, j) => (j === i ? { ...x, kind: e.target.value as Cp["kind"] } : x)))}>
                {(["aid", "cutoff", "crew", "mark"] as const).map((k) => (
                  <option key={k} value={k}>
                    {t(`cp_${k}`)}
                  </option>
                ))}
              </select>
              <input className="field w-44" value={c.label} maxLength={40} placeholder={t("cpLabel")} onChange={(e) => setCps(cps.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              {c.kind === "cutoff" && (
                <input className="field w-28" value={c.cutoffText} placeholder="4:30:00" aria-label={t("cutoff")} onChange={(e) => setCps(cps.map((x, j) => (j === i ? { ...x, cutoffText: e.target.value } : x)))} />
              )}
              <button type="button" className="btn-quiet btn-sm text-ink3 hover:text-rust" onClick={() => setCps(cps.filter((_, j) => j !== i))} aria-label={t("remove")}>
                ×
              </button>
            </div>
          ))}
          <button type="button" className="btn-quiet btn-sm" onClick={() => setCps([...cps, { km: NaN, kind: "aid", label: "", cutoff: null, cutoffText: "" }])}>
            + {t("addCheckpoint")}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" className="btn-solid" disabled={busy} onClick={save}>
          {t("save")}
        </button>
        {saved && <span className="text-micro text-sage">{t("saved")}</span>}
      </div>
    </div>
  );
}
