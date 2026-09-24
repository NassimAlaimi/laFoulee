"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FOCUS_PRESETS, type OpenFocus } from "@/lib/training";

/**
 * Création d'un plan directement depuis un objectif.
 *
 * Volontairement minimal : la course fixe déjà la distance, la date et donc le
 * volume à atteindre. Deux réglages suffisent, le reste est déduit — notamment
 * le nombre de sorties, qui suit le volume semaine après semaine.
 */
export function CreatePlanForGoal({
  goalId,
  goalName,
  raceKm,
  weeksAvailable,
  startKm,
  neededKm,
}: {
  goalId: string;
  goalName: string;
  raceKm: number;
  weeksAvailable: number;
  startKm: number;
  neededKm: number;
}) {
  const t = useTranslations("training");
  const router = useRouter();
  const [focus, setFocus] = useState<OpenFocus>(raceKm >= 21 ? "endurance" : "speed");
  const [longRunDay, setLongRunDay] = useState(6);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    const res = await fetch("/api/training/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Prépa ${goalName}`,
        mode: "race",
        focus,
        raceGoalId: goalId,
        daysPerWeek: 0, // auto
        longRunDay,
        strengthPerWeek: 1,
        ceilingKm: 0,
        autoAdapt: true,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.planId) router.push(`/training/${json.planId}`);
    else router.refresh();
  }

  return (
    <div className="space-y-5">
      <ul className="space-y-1">
        <li className="font-mono text-micro tabular-nums text-ink2">
          {weeksAvailable} semaines disponibles · {raceKm} km
        </li>
        <li className="font-mono text-micro tabular-nums text-ink2">
          {Math.round(startKm)} km/sem actuels → {Math.round(neededKm)} km/sem de référence
        </li>
      </ul>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="focus">
            Orientation des séances
          </label>
          <select
            id="focus"
            value={focus}
            onChange={(e) => setFocus(e.target.value as OpenFocus)}
            className="field"
          >
            {Object.values(FOCUS_PRESETS)
              .filter((p) => p.key !== "maintain")
              .map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name} — {p.intent}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="lrd2">
            Jour de sortie longue
          </label>
          <select
            id="lrd2"
            value={longRunDay}
            onChange={(e) => setLongRunDay(Number(e.target.value))}
            className="field"
          >
            {["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"].map(
              (d, i) => (
                <option key={i} value={i}>
                  {d}
                </option>
              )
            )}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={create} disabled={busy} className="btn-solid btn-sm">
          {busy ? t("generating") : t("generateForRace")}
        </button>
        <span className="text-micro text-ink3">
          Sorties par semaine, volumes et allures déduits de ton historique.
        </span>
      </div>
    </div>
  );
}
