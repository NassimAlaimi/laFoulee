"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const FEELINGS = [
  { v: 1, label: "Très dur" },
  { v: 2, label: "Dur" },
  { v: 3, label: "Correct" },
  { v: 4, label: "Bien" },
  { v: 5, label: "Excellent" },
];

const RPE_HINT: Record<number, string> = {
  1: "très facile",
  2: "facile",
  3: "facile",
  4: "modéré",
  5: "modéré",
  6: "soutenu",
  7: "difficile",
  8: "très difficile",
  9: "quasi maximal",
  10: "maximal",
};

/**
 * Carnet de la séance : ce que Strava ne sait pas. Chaque changement est
 * enregistré immédiatement — pas de bouton « Enregistrer » à oublier.
 */
export function ActivityJournal({
  id,
  initial,
}: {
  id: string;
  initial: {
    privateNote: string | null;
    perceivedExertion: number | null;
    feeling: number | null;
    isRace: boolean;
  };
}) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [hoverRpe, setHoverRpe] = useState<number | null>(null);
  const noteRef = useRef(initial.privateNote ?? "");

  async function save(patch: Partial<typeof initial>) {
    setState((s) => ({ ...s, ...patch }));
    setSaved("saving");
    const res = await fetch(`/api/activities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaved(res.ok ? "saved" : "error");
    if (res.ok) router.refresh();
    setTimeout(() => setSaved("idle"), 1800);
  }

  const rpeShown = hoverRpe ?? state.perceivedExertion;

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-6">
        <div>
          <div className="mb-2.5 flex items-baseline justify-between">
            <span className="field-label mb-0">Effort perçu</span>
            <span className="text-micro text-ink3">
              {rpeShown ? `${rpeShown}/10 · ${RPE_HINT[rpeShown]}` : "non renseigné"}
            </span>
          </div>
          <div className="flex gap-1" onMouseLeave={() => setHoverRpe(null)}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => {
              const on = rpeShown != null && v <= rpeShown;
              const tone = v <= 3 ? "--sage" : v <= 6 ? "--ochre" : v <= 8 ? "--clay" : "--rust";
              return (
                <button
                  key={v}
                  type="button"
                  onMouseEnter={() => setHoverRpe(v)}
                  onClick={() => save({ perceivedExertion: state.perceivedExertion === v ? null : v })}
                  className="h-8 flex-1 rounded-[4px] border text-micro font-medium transition-all"
                  style={{
                    background: on ? `rgb(var(${tone}))` : "transparent",
                    borderColor: on ? `rgb(var(${tone}))` : "rgb(var(--hair))",
                    color: on ? "#fff" : "rgb(var(--ink-3))",
                  }}
                  aria-label={`Effort ${v} sur 10`}
                  aria-pressed={state.perceivedExertion === v}
                >
                  {v}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="field-label">Sensations</span>
          <div className="flex flex-wrap gap-1">
            {FEELINGS.map((f) => (
              <button
                key={f.v}
                type="button"
                onClick={() => save({ feeling: state.feeling === f.v ? null : f.v })}
                className={`rounded-[6px] border px-2.5 py-1 text-[0.8125rem] transition-colors ${
                  state.feeling === f.v
                    ? "border-clay/40 bg-clay/10 font-medium text-clay"
                    : "border-hair text-ink2 hover:text-ink"
                }`}
                aria-pressed={state.feeling === f.v}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-4 border-t border-hair pt-4">
          <span>
            <span className="block text-[0.8125rem] font-medium">C&apos;était une course</span>
            <span className="block text-micro text-ink3">
              Compte comme performance de référence dans les records et le VDOT
            </span>
          </span>
          <Toggle checked={state.isRace} onChange={(v) => save({ isRace: v })} />
        </label>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label htmlFor="private-note" className="field-label mb-0">
            Note personnelle
          </label>
          <span
            className={`text-micro transition-opacity ${saved === "idle" ? "opacity-0" : "opacity-100"} ${
              saved === "error" ? "text-rust" : "text-ink3"
            }`}
            aria-live="polite"
          >
            {saved === "saving" ? "Enregistrement…" : saved === "saved" ? "Enregistré" : saved === "error" ? "Échec" : "·"}
          </span>
        </div>
        <textarea
          id="private-note"
          defaultValue={initial.privateNote ?? ""}
          onChange={(e) => (noteRef.current = e.target.value)}
          onBlur={() => {
            if ((noteRef.current || null) !== (state.privateNote || null)) {
              save({ privateNote: noteRef.current || null });
            }
          }}
          rows={7}
          placeholder="Météo, parcours, douleurs, ce que tu retiens… Visible de toi seul, jamais envoyé à Strava."
          className="field resize-y leading-relaxed"
        />
      </div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(e) => {
        e.preventDefault();
        onChange(!checked);
      }}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        checked ? "bg-clay" : "bg-hairStrong"
      }`}
    >
      <span
        className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
