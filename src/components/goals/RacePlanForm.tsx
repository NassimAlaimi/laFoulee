"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

/** Chrono « 3:45:00 » ou « 3:45 » ou secondes brutes → secondes. */
export function parseClock(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return n > 0 ? n : null;
  }
  const parts = s.split(":").map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return null;
  if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export function fmtClockInput(sec: number | null | undefined): string {
  if (!sec) return "";
  return `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

/**
 * Création du plan de course : le GPX du parcours (une fois), le chrono visé
 * et la stratégie. Le reste (météo, points clés, nutrition) se règle ensuite.
 */
export function RacePlanForm({ goalId, targetSeconds }: { goalId: string; targetSeconds?: number | null }) {
  const router = useRouter();
  const t = useTranslations("racePlan");
  const [file, setFile] = useState<File | null>(null);
  const [clock, setClock] = useState(fmtClockInput(targetSeconds));
  const [strategy, setStrategy] = useState("negative");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!file) {
      setError(t("gpxMissing"));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/race-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goalId, strategy, targetSeconds: parseClock(clock), gpx: await file.text() }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError(t("gpxError"));
  }

  return (
    <form
      className="max-w-xl space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div>
        <div className="eyebrow mb-1.5">{t("gpxLabel")}</div>
        <label className="flex cursor-pointer items-center gap-3 border border-dashed border-hairStrong px-4 py-5 text-sm text-ink2 hover:border-clay">
          <input type="file" accept=".gpx,.xml,application/gpx+xml" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file ? <span className="font-medium text-ink">{file.name}</span> : <span>{t("gpxHint")}</span>}
        </label>
      </div>
      <div className="flex flex-wrap gap-6">
        <label>
          <div className="eyebrow mb-1.5">{t("targetTime")}</div>
          <input type="text" value={clock} onChange={(e) => setClock(e.target.value)} placeholder="3:45:00" className="field w-36" />
        </label>
        <div>
          <div className="eyebrow mb-1.5">{t("strategy")}</div>
          <StrategyPicker value={strategy} onChange={setStrategy} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-solid" disabled={busy}>
          {busy ? t("computing") : t("build")}
        </button>
        {error && <span className="text-sm text-rust">{error}</span>}
      </div>
    </form>
  );
}

export function StrategyPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations("racePlan");
  return (
    <div className="flex flex-wrap gap-1.5">
      {(["negative", "even", "positive"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`btn-quiet ${value === v ? "bg-clay/10 text-clay" : ""}`}
        >
          {t(`strategy_${v}`)}
        </button>
      ))}
    </div>
  );
}
