"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { expand, inferKind, parseWorkout, summarize, toDsl } from "@/lib/workout-dsl";
import type { PaceSet } from "@/lib/workouts";
import { WorkoutProfile } from "./WorkoutProfile";

const EXAMPLES = [
  "20' EF + 3×(6×400 @VMA r=1'30) R=3' + 10' RC",
  "15' EF + 3×10' @seuil r=2' + 10' RC",
  "2km EF + 5×1km @AM r=1' + 2km EF",
  "20' EF + 8×45\" @Z5 côte r=1'30 + 15' EF",
  "1h30 @Z2",
];

function fmtMin(s: number) {
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`;
}

/**
 * Saisie rapide d'une séance : on tape comme sur un carnet, l'analyse est
 * instantanée (lib/workout-dsl, pure) avec le profil, la durée, la distance
 * et la charge. Le serveur ré-analyse le texte à l'enregistrement.
 */
export function WorkoutComposer({
  paces,
  initial,
  onDone,
}: {
  paces: PaceSet;
  initial?: { id: string; name: string; dsl: string };
  onDone?: () => void;
}) {
  const t = useTranslations("custom");
  const tc = useTranslations("common");
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [dsl, setDsl] = useState(initial?.dsl ?? "");
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const parsed = useMemo(() => (dsl.trim() ? parseWorkout(dsl) : null), [dsl]);
  const view = useMemo(() => {
    if (!parsed?.ok) return null;
    return {
      segments: expand(parsed.steps, paces),
      sum: summarize(parsed.steps, paces),
      kind: inferKind(parsed.steps, paces),
      canonical: toDsl(parsed.steps),
    };
  }, [parsed, paces]);

  const save = async () => {
    if (!view || !name.trim()) return;
    setBusy(true);
    setServerError(null);
    const res = await fetch(initial ? `/api/workouts/custom/${initial.id}` : "/api/workouts/custom", {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), dsl }),
    });
    setBusy(false);
    if (!res.ok) {
      setServerError(t("saveError"));
      return;
    }
    if (!initial) {
      setName("");
      setDsl("");
    }
    onDone?.();
    router.refresh();
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
      <div className="space-y-4">
        <label className="block">
          <span className="eyebrow">{t("name")}</span>
          <input
            className="field mt-1.5 w-full"
            value={name}
            maxLength={80}
            placeholder={t("namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="eyebrow">{t("structure")}</span>
          <textarea
            className="field mt-1.5 min-h-[88px] w-full font-mono text-[0.875rem] leading-relaxed"
            value={dsl}
            maxLength={600}
            spellCheck={false}
            placeholder="20' EF + 3×(6×400 @VMA r=1'30) R=3' + 10' RC"
            onChange={(e) => setDsl(e.target.value)}
            aria-invalid={parsed ? !parsed.ok : undefined}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <span className="text-micro text-ink3">{t("examples")}</span>
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="tag hover:text-clay" onClick={() => setDsl(ex)}>
              {ex}
            </button>
          ))}
        </div>
        <details className="text-[0.8125rem] text-ink2">
          <summary className="cursor-pointer text-ink3 hover:text-ink">{t("syntaxTitle")}</summary>
          <ul className="mt-2 space-y-1 leading-relaxed">
            <li>{t("syntaxDurations")}</li>
            <li>{t("syntaxTargets")}</li>
            <li>{t("syntaxRepeats")}</li>
            <li>{t("syntaxSeparators")}</li>
          </ul>
        </details>
      </div>

      <div className="min-w-0 border-l-0 border-hair lg:border-l lg:pl-8">
        <div className="eyebrow mb-3">{t("preview")}</div>
        {!parsed && <p className="text-[0.8125rem] text-ink3">{t("previewEmpty")}</p>}
        {parsed && !parsed.ok && (
          <p className="text-[0.8125rem] text-rust" role="alert">
            {t(`error.${parsed.error}`)} — {t("errorAt", { n: parsed.at + 1 })}
            <span className="mt-1 block font-mono text-ink2">
              {dsl.slice(0, parsed.at)}
              <span className="bg-rust/20 text-rust">{dsl.slice(parsed.at, parsed.at + 6) || "␣"}</span>
            </span>
          </p>
        )}
        {view && (
          <div className="space-y-4">
            <WorkoutProfile segments={view.segments} height={56} />
            <div className="grid grid-cols-3 gap-4">
              <Fig label={t("duration")} value={fmtMin(view.sum.seconds)} />
              <Fig label={t("distance")} value={`${(view.sum.meters / 1000).toFixed(1)} km`} />
              <Fig label={t("load")} value={String(view.sum.load)} />
            </div>
            <p className="text-[0.8125rem] text-ink2">
              {tc(`kind.${view.kind}`)} · {t("hardMinutes", { n: view.sum.hardMinutes })}
            </p>
            <p className="font-mono text-micro text-ink3">{view.canonical}</p>
            {!paces.derived && <p className="text-micro text-ochre">{t("pacesEstimated")}</p>}
          </div>
        )}
        <div className="mt-6 flex items-center gap-3">
          <button type="button" className="btn-solid" disabled={!view || !name.trim() || busy} onClick={save}>
            {initial ? t("update") : t("save")}
          </button>
          {initial && onDone && (
            <button type="button" className="btn-quiet" onClick={onDone}>
              {t("cancel")}
            </button>
          )}
          {serverError && <span className="text-micro text-rust">{serverError}</span>}
        </div>
      </div>
    </div>
  );
}

function Fig({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="num text-[1.35rem] font-semibold leading-none">{value}</div>
      <div className="mt-1 text-micro text-ink3">{label}</div>
    </div>
  );
}
