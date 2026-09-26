"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

/**
 * Formulaire du carnet quotidien — enregistrement « deux temps » :
 * le sommeil le matin, le ressenti le soir, l'upsert fusionne les champs.
 */

export type LogFormState = {
  sleepHours: string;
  sleepQuality: number | null;
  fatigue: number | null;
  mood: number | null;
  rpe: number | null;
  painLevel: number;
  painArea: string;
  note: string;
};

export function LogForm({
  existing,
  today,
}: {
  existing: {
    sleepHours: number | null;
    sleepQuality: number | null;
    fatigue: number | null;
    mood: number | null;
    rpe: number | null;
    painLevel: number;
    painArea: string | null;
    note: string | null;
  } | null;
  today: string;
}) {
  const router = useRouter();
  const t = useTranslations("logPage");
  const [state, setState] = useState<LogFormState>({
    sleepHours: existing?.sleepHours != null ? String(existing.sleepHours) : "",
    sleepQuality: existing?.sleepQuality ?? null,
    fatigue: existing?.fatigue ?? null,
    mood: existing?.mood ?? null,
    rpe: existing?.rpe ?? null,
    painLevel: existing?.painLevel ?? 0,
    painArea: existing?.painArea ?? "",
    note: existing?.note ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof LogFormState>(key: K, value: LogFormState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
    setSaved(false);
  };

  async function save() {
    setBusy(true);
    const body = {
      date: today,
      sleepHours: state.sleepHours === "" ? null : Number(state.sleepHours),
      sleepQuality: state.sleepQuality,
      fatigue: state.fatigue,
      mood: state.mood,
      rpe: state.rpe,
      painLevel: state.painLevel,
      painArea: state.painArea === "" ? null : state.painArea,
      note: state.note === "" ? null : state.note,
    };
    const res = await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (res.ok) {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Field label={t("sleep")}>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            step={0.5}
            min={0}
            max={16}
            value={state.sleepHours}
            onChange={(e) => set("sleepHours", e.target.value)}
            placeholder="7,5"
            className="field w-20"
            aria-label={t("sleepHours")}
          />
          <span className="text-sm text-ink3">{t("tonight")}</span>
        </div>
      </Field>

      <Scale label={t("sleepQuality")} value={state.sleepQuality} onChange={(v) => set("sleepQuality", v)} levels={[t("agitated"), "", t("medium"), "", t("deep")]} />

      <Scale label={t("fatigue")} value={state.fatigue} onChange={(v) => set("fatigue", v)} levels={[t("fresh"), "", t("medium"), "", t("drained")]} />

      <Scale label={t("mood")} value={state.mood} onChange={(v) => set("mood", v)} levels={[t("low"), "", t("neutral"), "", t("great")]} />

      <Scale label={t("rpeDay")} value={state.rpe} onChange={(v) => set("rpe", v)} levels={[t("light"), "", t("sustained"), "", t("exhausting")]} count={10} />

      <Field label={t("pain")}>
        <div className="flex items-center gap-1.5">
          {[t("painNone"), t("painMild"), t("painModerate"), t("painBlocks")].map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => set("painLevel", i)}
              className={`btn-quiet ${state.painLevel === i ? "bg-clay/10 text-clay" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
        {state.painLevel > 0 && (
          <input
            type="text"
            value={state.painArea}
            onChange={(e) => set("painArea", e.target.value)}
            placeholder={t("painWhere")}
            className="field mt-2 w-full max-w-xs"
          />
        )}
      </Field>

      <Field label={t("note")}>
        <textarea
          value={state.note}
          onChange={(e) => set("note", e.target.value)}
          placeholder={t("notePlaceholder")}
          className="field min-h-[72px] w-full"
          rows={3}
        />
      </Field>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? t("saving") : t("save")}
        </button>
        {saved && <span className="text-micro text-sage">{t("saved")}</span>}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-micro font-medium uppercase tracking-[0.12em] text-ink3">{label}</div>
      {children}
    </div>
  );
}

function Scale({
  label,
  value,
  onChange,
  levels,
  count = 5,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  /** Libellé des extrêmes et du milieu (5 positions) */
  levels: string[];
  count?: number;
}) {
  return (
    <Field label={label}>
      <div className="flex flex-wrap items-center gap-1.5">
        {Array.from({ length: count }, (_, i) => {
          const active = value === i + 1;
          const isExtreme = i === 0 || i === count - 1 || (count === 5 && i === 2);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChange(active ? null : i + 1)}
              className={`flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm transition-colors ${
                active ? "border-clay bg-clay/10 text-clay" : "border-hair text-ink2 hover:border-hairStrong"
              }`}
              aria-label={`${label} ${i + 1}/${count}`}
            >
              {isExtreme ? (levels[i] ?? i + 1) : i + 1}
            </button>
          );
        })}
      </div>
    </Field>
  );
}
