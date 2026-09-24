"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Mini-carnet de l'accueil : sommeil, fatigue, douleur — le strict nécessaire
 * pour alimenter le score du jour. Le reste vit sur /log.
 */
export function MiniLogForm({
  existing,
  today,
}: {
  existing: { sleepHours: number | null; fatigue: number | null; painLevel: number } | null;
  today: string;
}) {
  const router = useRouter();
  const [sleep, setSleep] = useState(
    existing?.sleepHours != null ? String(existing.sleepHours) : ""
  );
  const [fatigue, setFatigue] = useState<number | null>(existing?.fatigue ?? null);
  const [pain, setPain] = useState<number>(existing?.painLevel ?? 0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function save() {
    setBusy(true);
    const res = await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: today,
        sleepHours: sleep === "" ? null : Number(sleep),
        fatigue,
        painLevel: pain,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setDone(true);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
      <div className="flex items-baseline gap-2">
        <input
          type="number"
          inputMode="decimal"
          step={0.5}
          min={0}
          max={16}
          value={sleep}
          onChange={(e) => {
            setSleep(e.target.value);
            setDone(false);
          }}
          placeholder="7,5"
          className="field w-16"
          aria-label="Sommeil de cette nuit (heures)"
        />
        <span className="text-micro text-ink3">h de sommeil</span>
      </div>

      <div className="flex items-center gap-1.5" role="group" aria-label="Fatigue du jour (1 à 5)">
        <span className="mr-1 text-micro text-ink3">Fatigue</span>
        {Array.from({ length: 5 }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              setFatigue(fatigue === i + 1 ? null : i + 1);
              setDone(false);
            }}
            className={`h-6 w-6 rounded-full border text-micro transition-colors ${
              fatigue === i + 1
                ? "border-clay bg-clay/15 text-clay"
                : "border-hair text-ink3 hover:border-hairStrong"
            }`}
            aria-label={`Fatigue ${i + 1}/5`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5" role="group" aria-label="Douleurs">
        <span className="mr-1 text-micro text-ink3">Douleur</span>
        {["Rien", "Gêne", "Douleur", "Empêche"].map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              setPain(i);
              setDone(false);
            }}
            className={`btn-quiet px-2 ${pain === i ? "bg-clay/10 text-clay" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="btn-primary btn-sm ml-auto"
      >
        {busy ? "…" : done ? "Enregistré ✓" : "Enregistrer"}
      </button>
    </div>
  );
}
