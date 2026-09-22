"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DAY_NAMES } from "@/lib/training";

type Plan = {
  id: string;
  daysPerWeek: number;
  longRunDay: number;
  strengthPerWeek: number;
  ceilingKm: number;
  horizonWeeks: number;
  autoAdapt: boolean;
  status: string;
  mode: string;
};

/**
 * Réglages du plan. Toute modification structurelle relance la génération des
 * semaines à venir — les séances passées et celles modifiées à la main ne
 * bougent pas.
 */
export function PlanSettings({ plan }: { plan: Plan }) {
  const router = useRouter();
  const [state, setState] = useState(plan);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function patch(body: Record<string, unknown>, tag: string) {
    setBusy(tag);
    await fetch(`/api/training/plans/${plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(null);
    setSaved(true);
    router.refresh();
  }

  async function remove() {
    if (!confirm("Supprimer ce plan et toutes ses séances ?")) return;
    setBusy("delete");
    await fetch(`/api/training/plans/${plan.id}`, { method: "DELETE" });
    router.push("/training");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Sorties / semaine">
          <select
            value={state.daysPerWeek}
            onChange={(e) => setState({ ...state, daysPerWeek: Number(e.target.value) })}
            className="field"
          >
            <option value={0}>Auto (suit le volume)</option>
            {[3, 4, 5, 6, 7].map((d) => (
              <option key={d} value={d}>
                {d} sorties
              </option>
            ))}
          </select>
        </Field>

        <Field label="Jour de sortie longue">
          <select
            value={state.longRunDay}
            onChange={(e) => setState({ ...state, longRunDay: Number(e.target.value) })}
            className="field"
          >
            {DAY_NAMES.map((d, i) => (
              <option key={i} value={i}>
                {d}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Renfo / semaine">
          <input
            type="number"
            min={0}
            max={3}
            value={state.strengthPerWeek}
            onChange={(e) => setState({ ...state, strengthPerWeek: Number(e.target.value) })}
            className="field"
          />
        </Field>

        <Field label="Plafond km/sem (0 = auto)">
          <input
            type="number"
            min={0}
            max={250}
            value={state.ceilingKm}
            onChange={(e) => setState({ ...state, ceilingKm: Number(e.target.value) })}
            className="field"
          />
        </Field>

        {plan.mode === "open" && (
          <Field label="Horizon (semaines)">
            <input
              type="number"
              min={4}
              max={52}
              value={state.horizonWeeks}
              onChange={(e) => setState({ ...state, horizonWeeks: Number(e.target.value) })}
              className="field"
            />
          </Field>
        )}
      </div>

      <label className="flex items-center gap-2.5 text-[0.8125rem] text-ink2">
        <input
          type="checkbox"
          checked={state.autoAdapt}
          onChange={(e) => {
            setState({ ...state, autoAdapt: e.target.checked });
            patch({ autoAdapt: e.target.checked }, "auto");
          }}
          className="accent-clay"
        />
        Réadaptation automatique après chaque point hebdomadaire
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() =>
            patch(
              {
                daysPerWeek: state.daysPerWeek,
                longRunDay: state.longRunDay,
                strengthPerWeek: state.strengthPerWeek,
                ceilingKm: state.ceilingKm,
                horizonWeeks: state.horizonWeeks,
              },
              "save"
            )
          }
          disabled={busy !== null}
          className="btn-solid btn-sm"
        >
          {busy === "save" ? "Régénération…" : "Enregistrer et régénérer"}
        </button>

        <button
          onClick={() => patch({ regenerate: true }, "regen")}
          disabled={busy !== null}
          className="btn-outline btn-sm"
        >
          {busy === "regen" ? "…" : "Recaler sur mon volume réel"}
        </button>

        {plan.status === "active" ? (
          <button onClick={() => patch({ status: "paused" }, "pause")} className="btn-quiet">
            Mettre en pause
          </button>
        ) : (
          <button onClick={() => patch({ status: "active" }, "resume")} className="btn-quiet">
            Réactiver
          </button>
        )}

        <button onClick={remove} disabled={busy !== null} className="btn-quiet ml-auto text-rust">
          Supprimer le plan
        </button>
      </div>

      {saved && (
        <p className="text-micro text-sage">
          Plan mis à jour — les séances passées et modifiées à la main sont conservées.
        </p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="field-label">{label}</span>
      {children}
    </div>
  );
}
