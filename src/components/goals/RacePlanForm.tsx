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

/**
 * Formulaire du plan de course : import du GPX (une fois) puis réglages de
 * stratégie. En édition, le GPX n'est pas proposé — il se remplace en
 * supprimant le plan.
 */
export function RacePlanForm({
  goalId,
  existing,
}: {
  goalId: string;
  existing?: {
    targetSeconds: number | null;
    strategy: string;
    fuelingKm: number;
    fuelingNote: string | null;
  };
}) {
  const router = useRouter();
  const t = useTranslations("goals");
  const [file, setFile] = useState<File | null>(null);
  const [clock, setClock] = useState(
    existing?.targetSeconds
      ? `${Math.floor(existing.targetSeconds / 3600)}:${String(
          Math.floor((existing.targetSeconds % 3600) / 60)
        ).padStart(2, "0")}:${String(existing.targetSeconds % 60).padStart(2, "0")}`
      : ""
  );
  const [strategy, setStrategy] = useState(existing?.strategy ?? "negative");
  const [fuelingKm, setFuelingKm] = useState(String(existing?.fuelingKm ?? 5));
  const [fuelingNote, setFuelingNote] = useState(existing?.fuelingNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {
      goalId,
      strategy,
      fuelingKm: Number(fuelingKm) || 0,
      fuelingNote: fuelingNote === "" ? null : fuelingNote,
    };
    const seconds = parseClock(clock);
    body.targetSeconds = seconds;
    if (file) {
      body.gpx = await file.text();
    }
    const res = await fetch("/api/race-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? t("racePlan.saveError"));
    }
  }

  return (
    <form
      className="max-w-xl space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {!existing && (
        <div>
          <div className="mb-1.5 text-micro font-medium uppercase tracking-[0.12em] text-ink3">
            Parcours (fichier GPX)
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-hairStrong px-4 py-5 text-sm text-ink2 hover:border-clay">
            <input
              type="file"
              accept=".gpx,.xml,application/gpx+xml"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <span className="font-medium text-ink">{file.name}</span>
            ) : (
              <span>
                Glisse ton fichier <span className="font-medium text-clay">.gpx</span> du
                parcours — exporté de Strava, Garmin, Komoot…
              </span>
            )}
          </label>
        </div>
      )}

      <div>
        <div className="mb-1.5 text-micro font-medium uppercase tracking-[0.12em] text-ink3">
          Chrono visé
        </div>
        <input
          type="text"
          inputMode="text"
          value={clock}
          onChange={(e) => setClock(e.target.value)}
          placeholder="3:45:00"
          className="field w-36"
          aria-label={t("racePlan.targetTime")}
        />
      </div>

      <div>
        <div className="mb-1.5 text-micro font-medium uppercase tracking-[0.12em] text-ink3">
          Stratégie d'allure
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["negative", t("racePlan.strategyNegative")],
              ["even", t("racePlan.strategyEven")],
              ["positive", t("racePlan.strategyPositive")],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStrategy(value)}
              className={`btn-quiet ${strategy === value ? "bg-clay/10 text-clay" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <div className="mb-1.5 text-micro font-medium uppercase tracking-[0.12em] text-ink3">
            Ravitaillement tous les…
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step={0.5}
              min={0}
              max={20}
              value={fuelingKm}
              onChange={(e) => setFuelingKm(e.target.value)}
              className="field w-20"
              aria-label={t("racePlan.fuelingEvery")}
            />
            <span className="text-sm text-ink3">km · 0 = désactivé</span>
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-micro font-medium uppercase tracking-[0.12em] text-ink3">
            Ce que tu prends
          </div>
          <input
            type="text"
            value={fuelingNote}
            onChange={(e) => setFuelingNote(e.target.value)}
            placeholder="gel toutes les 40 min, 500 ml/h…"
            className="field w-full"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Calcul…" : existing ? "Mettre à jour" : "Construire le plan"}
        </button>
        {error && <span className="text-sm text-rust">{error}</span>}
      </div>
    </form>
  );
}
