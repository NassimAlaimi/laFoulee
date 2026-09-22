"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  assessFeasibility,
  buildBlueprint,
  DAY_NAMES,
  FOCUS_PRESETS,
  startFromPriorWeeks,
  suggestDaysPerWeek,
  targetPeakFor,
  type CurrentFitness,
  type OpenFocus,
} from "@/lib/training";

export type GoalOption = {
  id: string;
  name: string;
  raceDate: string;
  distanceKm: number;
};

/**
 * Création de plan avec prévisualisation en direct.
 *
 * Le point clé : la faisabilité et la courbe de volume se recalculent à chaque
 * réglage, **avant** de créer quoi que ce soit. On voit donc immédiatement que
 * viser 100 km dans six mois depuis 35 km/sem donne une trajectoire différente
 * de la même course dans dix-huit mois — sans qu'aucun texte ne vienne
 * l'expliquer, la courbe suffit.
 */
export function PlanBuilder({
  fitness,
  goals,
  vdot,
  defaults,
}: {
  fitness: CurrentFitness;
  goals: GoalOption[];
  vdot: number;
  defaults?: { daysPerWeek?: number; longRunDay?: number; ceilingKm?: number };
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"open" | "race">(goals.length > 0 ? "race" : "open");
  const [goalId, setGoalId] = useState(goals[0]?.id ?? "");
  const [focus, setFocus] = useState<OpenFocus>("base");
  // 0 = automatique : le nombre de sorties suit le volume de chaque semaine.
  const [days, setDays] = useState(defaults?.daysPerWeek ?? 0);
  const [longRunDay, setLongRunDay] = useState(defaults?.longRunDay ?? 6);
  const [strength, setStrength] = useState(1);
  const [horizon, setHorizon] = useState(12);
  const [ceiling, setCeiling] = useState(defaults?.ceilingKm ?? 0);
  const [autoAdapt, setAutoAdapt] = useState(true);
  const [busy, setBusy] = useState(false);

  // --- Charge récente déclarée : Strava sert d'amorce, l'athlète corrige.
  const measured = lastFour(fitness.weeklyHistory);
  const [prior, setPrior] = useState<number[]>(measured);
  const [longRun, setLongRun] = useState(Math.round(fitness.longestRunKm || 10));
  const [editLoad, setEditLoad] = useState(false);

  const derivedStart = startFromPriorWeeks(prior) ?? fitness.weeklyKm ?? 20;
  const [startOverride, setStartOverride] = useState<number | null>(null);
  const startKm = Math.max(5, Math.round(startOverride ?? derivedStart));

  const goal = goals.find((g) => g.id === goalId) ?? null;

  const preview = useMemo(() => {
    const now = new Date();
    const monday = startOfNextMonday(now);

    if (mode === "race" && goal) {
      const raceDate = new Date(goal.raceDate);
      const feas = assessFeasibility({
        raceKm: goal.distanceKm,
        raceDate,
        fitness: { ...fitness, weeklyKm: startKm, longestRunKm: longRun },
        now,
        ceilingKm: ceiling,
      });
      const weeks = Math.max(2, Math.ceil((raceDate.getTime() - monday.getTime()) / 6048e5));
      const target = targetPeakFor(feas, startKm);
      const bp = buildBlueprint({
        mode: "race",
        focus,
        startMonday: monday,
        weeks,
        startWeeklyKm: startKm,
        targetPeakKm: target,
        daysPerWeek: days,
        longRunDay,
        strengthPerWeek: strength,
        ceilingKm: ceiling,
        vdot,
        fallbackPace: fitness.avgPace,
        raceKm: goal.distanceKm,
        raceDate,
        observedSessionsPerWeek: fitness.sessionsPerWeek,
        currentLongRunKm: longRun,
      });
      return { feas, bp, weeks };
    }

    const bp = buildBlueprint({
      mode: "open",
      focus,
      startMonday: monday,
      weeks: horizon,
      startWeeklyKm: startKm,
      targetPeakKm:
        ceiling > 0 ? ceiling : Math.round(startKm * FOCUS_PRESETS[focus].ceilingFactor),
      daysPerWeek: days,
      longRunDay,
      strengthPerWeek: strength,
      ceilingKm: ceiling,
      vdot,
      fallbackPace: fitness.avgPace,
      observedSessionsPerWeek: fitness.sessionsPerWeek,
      currentLongRunKm: longRun,
    });
    return { feas: null, bp, weeks: horizon };
  }, [mode, goal, focus, days, longRunDay, strength, horizon, ceiling, startKm, longRun, fitness, vdot]);

  async function create() {
    setBusy(true);
    const name =
      mode === "race" && goal
        ? `Prépa ${goal.name}`
        : FOCUS_PRESETS[focus].name;

    const res = await fetch("/api/training/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mode,
        focus,
        raceGoalId: goalId,
        daysPerWeek: days,
        longRunDay,
        strengthPerWeek: strength,
        ceilingKm: ceiling,
        horizonWeeks: horizon,
        startWeeklyKm: startKm,
        priorWeeks: prior,
        startLongRunKm: longRun,
        autoAdapt,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.planId) router.push(`/training/${json.planId}`);
    else router.refresh();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* ---------------------------------------------------- Réglages */}
      <div className="space-y-5">
        <div>
          <span className="field-label">Type de plan</span>
          <div className="grid grid-cols-2 gap-1.5">
            <Choice
              active={mode === "open"}
              onClick={() => setMode("open")}
              title="Sans objectif"
              note="Progresser, simplement"
            />
            <Choice
              active={mode === "race"}
              onClick={() => setMode("race")}
              title="Pour une course"
              note={goals.length ? `${goals.length} objectif(s)` : "aucun objectif"}
              disabled={goals.length === 0}
            />
          </div>
        </div>

        {mode === "race" ? (
          <div>
            <label className="field-label" htmlFor="goal">
              Course visée
            </label>
            <select id="goal" value={goalId} onChange={(e) => setGoalId(e.target.value)} className="field">
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} — {g.distanceKm} km — {new Date(g.raceDate).toLocaleDateString("fr-FR")}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <span className="field-label">Orientation</span>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {Object.values(FOCUS_PRESETS).map((p) => (
                <Choice
                  key={p.key}
                  active={focus === p.key}
                  onClick={() => setFocus(p.key)}
                  title={p.name}
                  note={p.intent}
                />
              ))}
            </div>
          </div>
        )}

        {mode === "race" && (
          <div>
            <span className="field-label">Orientation des séances</span>
            <select
              value={focus}
              onChange={(e) => setFocus(e.target.value as OpenFocus)}
              className="field"
            >
              {Object.values(FOCUS_PRESETS)
                .filter((p) => p.key !== "maintain")
                .map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>
        )}

        {/* ------------------------------------------ Charge récente */}
        <div className="rounded-[9px] border border-hair p-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="eyebrow">Charge des 4 dernières semaines</span>
            <button
              type="button"
              onClick={() => setEditLoad((v) => !v)}
              className="btn-quiet text-micro"
            >
              {editLoad ? "Terminer" : "Corriger"}
            </button>
          </div>

          <div className="mt-2.5 grid grid-cols-4 gap-1.5">
            {prior.map((km, i) => (
              <div key={i}>
                <div className="mb-1 text-center text-[10px] uppercase tracking-[0.08em] text-ink3">
                  S−{prior.length - i}
                </div>
                {editLoad ? (
                  <input
                    type="number"
                    value={km}
                    min={0}
                    max={300}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(300, Number(e.target.value) || 0));
                      setPrior((p) => p.map((x, j) => (j === i ? v : x)));
                    }}
                    className="field px-1.5 py-1 text-center font-mono text-[0.8125rem] tabular-nums"
                  />
                ) : (
                  <div className="rounded-[6px] bg-sunken py-1.5 text-center font-mono text-[0.8125rem] tabular-nums text-ink2">
                    {km}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-micro text-ink3">
            <span>
              Point de départ retenu&nbsp;:{" "}
              <span className="font-mono tabular-nums text-ink2">{startKm} km/sem</span>
            </span>
            {startOverride !== null && (
              <button
                type="button"
                onClick={() => setStartOverride(null)}
                className="btn-quiet text-micro"
              >
                revenir au calcul
              </button>
            )}
          </div>

          {editLoad && (
            <div className="mt-3 grid gap-3 border-t border-hair pt-3 sm:grid-cols-2">
              <NumField
                label="Forcer le volume de départ"
                value={startKm}
                onChange={(v) => setStartOverride(v)}
                min={5}
                max={250}
                hint={`calculé : ${Math.round(derivedStart)} km`}
              />
              <NumField
                label="Sortie la plus longue (km)"
                value={longRun}
                onChange={setLongRun}
                min={3}
                max={120}
                hint={`mesurée : ${fitness.longestRunKm} km`}
              />
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="days">
              Sorties / semaine
            </label>
            <select
              id="days"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="field"
            >
              <option value={0}>
                Auto — {suggestDaysPerWeek({ weeklyKm: startKm, sessionsPerWeek: fitness.sessionsPerWeek })} puis plus si le volume monte
              </option>
              {[3, 4, 5, 6, 7].map((d) => (
                <option key={d} value={d}>
                  {d} sorties, fixe
                </option>
              ))}
            </select>
            <div className="mt-1 text-micro text-ink3">
              {days === 0
                ? preview.bp.daysSteps.length > 1
                  ? preview.bp.daysSteps
                      .map((p, i) =>
                        i === 0 ? `${p.days} sorties` : `${p.days} dès la semaine ${p.fromWeek}`
                      )
                      .join(" · ")
                  : `${preview.bp.daysStart} sorties sur tout le plan`
                : "réglage manuel"}
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="lrd">
              Jour de sortie longue
            </label>
            <select
              id="lrd"
              value={longRunDay}
              onChange={(e) => setLongRunDay(Number(e.target.value))}
              className="field"
            >
              {DAY_NAMES.map((d, i) => (
                <option key={i} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <NumField label="Renfo / semaine" value={strength} onChange={setStrength} min={0} max={3} />
          {mode === "open" ? (
            <NumField label="Horizon (semaines)" value={horizon} onChange={setHorizon} min={4} max={52} />
          ) : null}
          <NumField
            label="Plafond volume (0 = auto)"
            value={ceiling}
            onChange={setCeiling}
            min={0}
            max={250}
            hint="km/sem à ne jamais dépasser"
          />
        </div>

        <label className="flex items-center gap-2.5 text-[0.8125rem] text-ink2">
          <input
            type="checkbox"
            checked={autoAdapt}
            onChange={(e) => setAutoAdapt(e.target.checked)}
            className="accent-clay"
          />
          Réadapter automatiquement selon douleurs, fatigue et assiduité
        </label>

        <button onClick={create} disabled={busy || (mode === "race" && !goal)} className="btn-solid">
          {busy ? "Génération…" : "Créer le plan"}
        </button>
      </div>

      {/* ---------------------------------------------------- Aperçu */}
      <div className="space-y-5 border-t border-hair pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
        {preview.feas && <FeasibilityPanel f={preview.feas} />}

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="eyebrow">Trajectoire de volume</span>
            <span className="font-mono text-micro tabular-nums text-ink3">
              {startKm} → {preview.bp.peakKm} km/sem
            </span>
          </div>
          <VolumeCurve weeks={preview.bp.weeks} />
        </div>

        <div className="grid grid-cols-3 gap-4 border-t border-hair pt-4">
          <Stat label="Semaines" value={String(preview.weeks)} />
          <Stat label="Volume total" value={`${preview.bp.totalKm} km`} />
          <Stat label="Sortie longue max" value={`${preview.bp.longRunPeakKm} km`} />
        </div>

        <div>
          <span className="eyebrow">Première semaine</span>
          <ul className="mt-2 space-y-1">
            {preview.bp.sessions
              .filter((s) => s.weekNumber === 1)
              .map((s, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
                  <span className="text-ink2">
                    <span className="mr-2 text-micro uppercase text-ink3">
                      {DAY_NAMES[(s.date.getDay() + 6) % 7].slice(0, 3)}
                    </span>
                    {s.title}
                  </span>
                  <span className="shrink-0 font-mono text-micro tabular-nums text-ink3">
                    {s.km > 0 ? `${s.km} km` : `${s.minutes} min`}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Faisabilité

const LEVEL_TONE: Record<string, { bar: string; text: string }> = {
  comfortable: { bar: "rgb(var(--sage))", text: "text-sage" },
  realistic: { bar: "rgb(var(--sage))", text: "text-sage" },
  demanding: { bar: "rgb(var(--ochre))", text: "text-ochre" },
  hard: { bar: "rgb(var(--clay))", text: "text-clay" },
  unreachable: { bar: "rgb(var(--rust))", text: "text-rust" },
};

/**
 * Jauge de difficulté : un curseur, un mot, trois chiffres. Pas de paragraphe
 * moralisateur — l'athlète sait qu'un ultra est dur, ce qu'il veut savoir c'est
 * de combien il est loin et à quelle date ça deviendrait confortable.
 */
export function FeasibilityPanel({
  f,
}: {
  f: {
    level: string;
    label: string;
    ratio: number;
    facts: string[];
    capped: boolean;
    reachablePeakKm: number;
    requiredPeakKm: number;
  };
}) {
  const tone = LEVEL_TONE[f.level] ?? LEVEL_TONE.demanding;
  // 4 crans : la position du curseur est le ratio temps disponible / nécessaire
  const pos = Math.max(4, Math.min(100, (f.ratio / 2) * 100));

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="eyebrow">Dosage de la difficulté</span>
        <span className={`text-sm font-medium ${tone.text}`}>{f.label}</span>
      </div>

      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-sunken">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{ width: `${pos}%`, background: tone.bar }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-ink3">
        <span>serré</span>
        <span>confortable</span>
      </div>

      <ul className="mt-3 space-y-1">
        {f.facts.map((fact, i) => (
          <li key={i} className="font-mono text-micro leading-relaxed tabular-nums text-ink2">
            {fact}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- Courbe

export function VolumeCurve({
  weeks,
  actual,
}: {
  weeks: Array<{ weekNumber: number; km: number; phase: string }>;
  actual?: Map<number, number>;
}) {
  const max = Math.max(1, ...weeks.map((w) => w.km));

  return (
    <div className="flex h-[92px] items-end gap-px">
      {weeks.map((week) => {
        const h = (week.km / max) * 100;
        const done = actual?.get(week.weekNumber);
        return (
          <div
            key={week.weekNumber}
            className="group relative flex-1"
            style={{ minWidth: 2, height: "100%" }}
            title={`S${week.weekNumber} · ${week.km} km · ${week.phase}${
              done !== undefined ? ` · réalisé ${done} km` : ""
            }`}
          >
            <div
              className="absolute bottom-0 w-full transition-all"
              style={{
                height: `${h}%`,
                background: PHASE_COLOR[week.phase] ?? "rgb(var(--hair-strong))",
                opacity: 0.85,
              }}
            />
            {done !== undefined && (
              <div
                className="absolute bottom-0 w-full border-t"
                style={{
                  height: `${Math.min(100, (done / max) * 100)}%`,
                  borderColor: "rgb(var(--ink))",
                  background: "rgb(var(--ink) / 0.12)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export const PHASE_COLOR: Record<string, string> = {
  base: "rgb(var(--slate))",
  build: "rgb(var(--sage))",
  peak: "rgb(var(--clay))",
  deload: "rgb(var(--hair-strong))",
  taper: "rgb(var(--ochre))",
  race: "rgb(var(--rust))",
};

// ---------------------------------------------------------------- Petits blocs

function Choice({
  active,
  onClick,
  title,
  note,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  note?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-[7px] border px-3 py-2.5 text-left transition-colors disabled:opacity-40 ${
        active ? "border-clay bg-clay/[.07]" : "border-hair hover:border-hairStrong"
      }`}
    >
      <div className={`text-[0.8125rem] font-medium ${active ? "text-clay" : "text-ink"}`}>
        {title}
      </div>
      {note && <div className="mt-0.5 text-micro leading-snug text-ink3">{note}</div>}
    </button>
  );
}

function NumField({
  label,
  value,
  onChange,
  min,
  max,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  hint?: string;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
        className="field"
      />
      {hint && <div className="mt-1 text-micro text-ink3">{hint}</div>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mt-1.5 font-mono text-[0.9375rem] font-medium tabular-nums">{value}</div>
    </div>
  );
}

/** Les 4 dernières semaines mesurées, complétées si l'historique est court. */
function lastFour(history: number[]): number[] {
  const h = history.slice(-4).map((k) => Math.round(k));
  while (h.length < 4) h.unshift(h[0] ?? 0);
  return h;
}

function startOfNextMonday(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + diff);
  return d;
}
