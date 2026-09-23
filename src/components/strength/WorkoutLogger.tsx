"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  EXERCISES,
  MUSCLE_LABELS,
  MUSCLE_ORDER,
  TEMPLATES,
  estimate1RM,
  exerciseInfo,
  type Block,
  type ExerciseMemo,
  type LoggedSet,
  type Template,
} from "@/lib/strength";


type SetState = LoggedSet & { key: string; done: boolean };
type BlockState = { key: string; exercise: string; sets: SetState[] };

const DRAFT_KEY = "foulee:strength-draft";
let uid = 0;
const k = () => `k${Date.now().toString(36)}${(uid++).toString(36)}`;

const toState = (b: Block): BlockState => ({
  key: k(),
  exercise: b.exercise,
  sets: b.sets.map((s) => ({ ...s, key: k(), done: false })),
});

const localDate = (d: Date) => {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
};

const fmtKg = (v: number) => (v % 1 ? v.toFixed(v * 4 % 1 ? 2 : 1).replace(".", ",") : String(v));

/**
 * Carnet de séance de musculation.
 *
 * Pensé pour être rempli entre deux séries, téléphone à la main : les
 * valeurs de la dernière fois sont préremplies, « + série » recopie la
 * précédente, cocher une série lance le minuteur de repos, et le brouillon
 * survit à un rechargement de page.
 */
export function WorkoutLogger({
  mode,
  initial,
  history,
  lastWorkout,
  prefill,
}: {
  mode: "new" | "edit";
  initial?: {
    id: string;
    date: string;
    name: string;
    durationMin: number | null;
    rpe: number | null;
    notes: string | null;
    activityId: string | null;
    blocks: Block[];
  };
  history: Record<string, ExerciseMemo>;
  lastWorkout?: { name: string; blocks: Block[] } | null;
  prefill?: { date?: string; durationMin?: number | null; activityId?: string | null; name?: string } | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? prefill?.name ?? "");
  const [date, setDate] = useState(localDate(new Date(initial?.date ?? prefill?.date ?? Date.now())));
  const [duration, setDuration] = useState<string>(
    String(initial?.durationMin ?? prefill?.durationMin ?? "")
  );
  const [rpe, setRpe] = useState<number | null>(initial?.rpe ?? null);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [blocks, setBlocks] = useState<BlockState[]>(() => (initial?.blocks ?? []).map(toState));
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draftFound, setDraftFound] = useState<null | { name: string; blocks: BlockState[]; date: string }>(null);
  const [rest, setRest] = useState<{ until: number; total: number } | null>(null);
  const activityId = initial?.activityId ?? prefill?.activityId ?? null;

  // ------------------------------------------------------------ Brouillon
  const hydrated = useRef(false);
  useEffect(() => {
    if (mode !== "new") return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d?.blocks?.length) setDraftFound(d);
      }
    } catch {
      /* brouillon illisible : ignoré */
    }
    hydrated.current = true;
  }, [mode]);

  useEffect(() => {
    if (mode !== "new" || !hydrated.current || draftFound) return;
    try {
      if (blocks.length) localStorage.setItem(DRAFT_KEY, JSON.stringify({ name, date, blocks }));
    } catch {
      /* quota plein : tant pis pour le brouillon */
    }
  }, [mode, name, date, blocks, draftFound]);

  // ------------------------------------------------------------ Construction
  function blockFromMemo(exercise: string, fallbackSets = 3, fallbackReps = 8): BlockState {
    const memo = history[exercise];
    const info = exerciseInfo(exercise);
    if (memo?.suggestion) {
      const s = memo.suggestion;
      return toState({
        exercise,
        sets: Array.from({ length: s.sets }, () => ({ reps: s.reps, weightKg: s.weightKg, rir: null, isWarmup: false })),
      });
    }
    if (memo?.lastSets.length) {
      return toState({ exercise, sets: memo.lastSets.map((s) => ({ ...s, rir: null })) });
    }
    return toState({
      exercise,
      sets: Array.from({ length: fallbackSets }, () => ({
        reps: info.unit === "seconds" ? 30 : fallbackReps,
        weightKg: 0,
        rir: null,
        isWarmup: false,
      })),
    });
  }

  function applyTemplate(t: Template) {
    if (!name) setName(t.name);
    setBlocks(t.items.map((i) => blockFromMemo(i.exercise, i.sets, i.reps)));
  }

  function repeatLast() {
    if (!lastWorkout) return;
    if (!name) setName(lastWorkout.name);
    setBlocks(lastWorkout.blocks.map((b) => blockFromMemo(b.exercise, b.sets.length, b.sets[0]?.reps ?? 8)));
  }

  const update = (bk: string, fn: (b: BlockState) => BlockState) =>
    setBlocks((all) => all.map((b) => (b.key === bk ? fn(b) : b)));

  const patchSet = (bk: string, sk: string, patch: Partial<SetState>) =>
    update(bk, (b) => ({ ...b, sets: b.sets.map((s) => (s.key === sk ? { ...s, ...patch } : s)) }));

  function toggleDone(bk: string, s: SetState) {
    patchSet(bk, s.key, { done: !s.done });
    if (!s.done) {
      const secs = exerciseInfo(blocks.find((b) => b.key === bk)!.exercise).primary.some((m) =>
        ["quads", "hamstrings", "glutes", "back", "chest"].includes(m)
      )
        ? 120
        : 75;
      setRest({ until: Date.now() + secs * 1000, total: secs });
    }
  }

  // ------------------------------------------------------------ Totaux
  const totals = useMemo(() => {
    let sets = 0;
    let tonnage = 0;
    for (const b of blocks) {
      const secs = exerciseInfo(b.exercise).unit === "seconds";
      for (const s of b.sets) {
        if (s.isWarmup || s.reps <= 0) continue;
        sets++;
        if (!secs) tonnage += s.reps * s.weightKg;
      }
    }
    return { sets, tonnage: Math.round(tonnage) };
  }, [blocks]);

  async function save() {
    setErr(null);
    if (!blocks.length) return setErr("Ajoute au moins un exercice.");
    setSaving(true);
    const payload = {
      date: new Date(date).toISOString(),
      name: name.trim() || "Séance de renforcement",
      durationMin: duration ? Math.round(Number(duration)) : null,
      rpe,
      notes: notes || null,
      activityId,
      sets: blocks.flatMap((b, position) =>
        b.sets
          .filter((s) => s.reps > 0)
          .map((s, setIndex) => ({
            exercise: b.exercise,
            position,
            setIndex,
            reps: Math.round(s.reps),
            weightKg: Number(s.weightKg) || 0,
            rir: s.rir,
            isWarmup: s.isWarmup,
          }))
      ),
    };
    const res = await fetch(
      mode === "edit" ? `/api/strength/workouts/${initial!.id}` : "/api/strength/workouts",
      {
        method: mode === "edit" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    ).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    setSaving(false);
    if (!data?.ok) return setErr(data?.error ?? "Enregistrement impossible");
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* rien à nettoyer */
    }
    router.push(`/strength/${data.id}`);
    router.refresh();
  }

  async function remove() {
    if (!initial || !confirm("Supprimer cette séance ?")) return;
    await fetch(`/api/strength/workouts/${initial.id}`, { method: "DELETE" });
    router.push("/strength");
    router.refresh();
  }

  // ------------------------------------------------------------ Rendu
  return (
    <div className="pb-28">
      {draftFound && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-ochre/40 bg-ochre/[.07] px-4 py-3 text-[0.8125rem]">
          <span>
            Un brouillon non enregistré a été retrouvé
            {draftFound.name ? ` : « ${draftFound.name} »` : ""} ({draftFound.blocks.length} exercices).
          </span>
          <span className="flex gap-2">
            <button
              className="btn-outline btn-sm"
              onClick={() => {
                setName(draftFound.name);
                setDate(draftFound.date);
                setBlocks(draftFound.blocks);
                setDraftFound(null);
              }}
            >
              Reprendre
            </button>
            <button
              className="btn-quiet"
              onClick={() => {
                localStorage.removeItem(DRAFT_KEY);
                setDraftFound(null);
              }}
            >
              Ignorer
            </button>
          </span>
        </div>
      )}

      {/* ---------------------------------------------- En-tête */}
      <div className="grid gap-5 border-b border-hair pb-6 md:grid-cols-[minmax(0,1fr)_auto]">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom de la séance"
          className="w-full bg-transparent text-[1.75rem] font-semibold tracking-[-0.02em] outline-none placeholder:text-ink3"
          aria-label="Nom de la séance"
        />
        <div className="flex flex-wrap items-end gap-3">
          <label>
            <span className="field-label">Date</span>
            <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className="field w-auto" />
          </label>
          <label>
            <span className="field-label">Durée</span>
            <span className="flex items-center gap-1.5">
              <input
                inputMode="numeric"
                value={duration}
                onChange={(e) => setDuration(e.target.value.replace(/[^\d]/g, ""))}
                className="field w-16 text-right"
                placeholder="45"
              />
              <span className="text-micro text-ink3">min</span>
            </span>
          </label>
        </div>
      </div>

      {activityId && (
        <p className="mt-3 text-micro text-ink3">
          Rattachée à la séance Strava du même jour — la durée et la FC viennent de ta montre.
        </p>
      )}

      {/* ---------------------------------------------- Démarrage */}
      {blocks.length === 0 && (
        <div className="mt-8">
          <div className="eyebrow mb-4">Partir d&apos;un modèle</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lastWorkout && (
              <button
                type="button"
                onClick={repeatLast}
                className="group rounded-card border border-clay/40 bg-clay/[.05] p-4 text-left transition-colors hover:bg-clay/10"
              >
                <div className="text-micro font-medium uppercase tracking-[0.1em] text-clay">Répéter</div>
                <div className="mt-1.5 font-medium">{lastWorkout.name}</div>
                <div className="mt-1 text-micro leading-relaxed text-ink3">
                  {lastWorkout.blocks.map((b) => exerciseInfo(b.exercise).name).join(" · ")}
                </div>
                <div className="mt-3 text-micro text-ink2">avec la progression suggérée →</div>
              </button>
            )}
            {TEMPLATES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => applyTemplate(t)}
                className="group rounded-card border border-hair p-4 text-left transition-colors hover:border-hairStrong hover:bg-panel"
              >
                <div className="font-medium transition-colors group-hover:text-clay">{t.name}</div>
                <div className="mt-1 text-[0.8125rem] text-ink2">{t.note}</div>
                <div className="mt-2 text-micro leading-relaxed text-ink3">
                  {t.items.map((i) => `${exerciseInfo(i.exercise).name} ${i.sets}×${i.reps}`).join(" · ")}
                </div>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPicker(true)}
              className="flex items-center justify-center rounded-card border border-dashed border-hairStrong p-4 text-[0.8125rem] text-ink2 transition-colors hover:text-ink"
            >
              + Séance libre, exercice par exercice
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------- Exercices */}
      <div className="mt-6 space-y-8">
        {blocks.map((b, bi) => {
          const info = exerciseInfo(b.exercise);
          const memo = history[b.exercise];
          const secs = info.unit === "seconds";
          const bestNow = Math.max(
            0,
            ...b.sets.filter((s) => !s.isWarmup).map((s) => estimate1RM(s.weightKg, s.reps, s.rir) ?? 0)
          );
          const isPR = memo?.bestE1rm != null && bestNow > memo.bestE1rm + 0.05;
          return (
            <section key={b.key} className="rise border-t border-hair pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-micro text-ink3">{String(bi + 1).padStart(2, "0")}</span>
                    <h3 className="text-[1.0625rem] font-medium">{info.name}</h3>
                    {isPR && <span className="tag border-clay/40 text-clay">record en vue</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 pl-8 text-micro text-ink3">
                    {info.primary.map((m) => MUSCLE_LABELS[m]).join(" · ")}
                    {info.runner && <span className="text-sage">coureur : {info.runner}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <IconBtn label="Monter" disabled={bi === 0} onClick={() => setBlocks((all) => swap(all, bi, bi - 1))}>
                    ↑
                  </IconBtn>
                  <IconBtn label="Descendre" disabled={bi === blocks.length - 1} onClick={() => setBlocks((all) => swap(all, bi, bi + 1))}>
                    ↓
                  </IconBtn>
                  <IconBtn label="Retirer" onClick={() => setBlocks((all) => all.filter((x) => x.key !== b.key))}>
                    ×
                  </IconBtn>
                </div>
              </div>

              {memo && (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 pl-8 text-micro text-ink2">
                  <span>
                    Dernière fois ({new Date(memo.lastDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}) :{" "}
                    <span className="font-mono">
                      {memo.lastSets
                        .filter((s) => !s.isWarmup)
                        .map((s) => (s.weightKg ? `${s.reps}×${fmtKg(s.weightKg)}` : `${s.reps}${secs ? "s" : ""}`))
                        .join("  ")}
                    </span>
                  </span>
                  {memo.bestE1rm && <span className="text-ink3">1RM est. record {fmtKg(memo.bestE1rm)} kg</span>}
                  {memo.suggestion && (
                    <button
                      type="button"
                      onClick={() =>
                        update(b.key, (x) => ({
                          ...x,
                          sets: x.sets.map((s) =>
                            s.isWarmup ? s : { ...s, weightKg: memo.suggestion!.weightKg, reps: memo.suggestion!.reps }
                          ),
                        }))
                      }
                      className="rounded-full border border-sage/40 bg-sage/10 px-2 py-0.5 text-sage transition-colors hover:bg-sage/20"
                      title={memo.suggestion.reason}
                    >
                      Suggestion : {memo.suggestion.sets} × {memo.suggestion.reps}
                      {secs ? " s" : ""}
                      {memo.suggestion.weightKg > 0 && ` @ ${fmtKg(memo.suggestion.weightKg)} kg`}
                    </button>
                  )}
                </div>
              )}

              {/* Séries */}
              <div className="mt-4 max-w-[720px] pl-8">
                <div className="grid grid-cols-[32px_minmax(0,1fr)_minmax(0,1fr)_64px_60px_40px] items-center gap-2 pb-1.5 text-micro uppercase tracking-[0.08em] text-ink3">
                  <span>Série</span>
                  <span>Charge</span>
                  <span>{secs ? "Durée" : "Reps"}</span>
                  <span title="Répétitions en réserve : combien tu aurais encore pu en faire">RIR</span>
                  <span className="text-right">{secs ? "" : "1RM"}</span>
                  <span />
                </div>
                {b.sets.map((s, si) => {
                  const e1 = secs ? null : estimate1RM(s.weightKg, s.reps, s.rir);
                  return (
                    <div
                      key={s.key}
                      className={`grid grid-cols-[32px_minmax(0,1fr)_minmax(0,1fr)_64px_60px_40px] items-center gap-2 border-t border-hair py-1.5 transition-colors ${
                        s.done ? "bg-sage/[.06]" : ""
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => patchSet(b.key, s.key, { isWarmup: !s.isWarmup })}
                        className={`h-7 w-7 rounded-full text-micro font-medium transition-colors ${
                          s.isWarmup ? "bg-ochre/15 text-ochre" : "text-ink2 hover:bg-sunken"
                        }`}
                        title={s.isWarmup ? "Échauffement (non compté) — cliquer pour en faire une série de travail" : "Cliquer pour marquer comme échauffement"}
                      >
                        {s.isWarmup ? "É" : si + 1 - b.sets.slice(0, si).filter((x) => x.isWarmup).length}
                      </button>
                      <NumField
                        value={s.weightKg}
                        step={info.step || 2.5}
                        unit="kg"
                        placeholder={info.bodyweight ? "PdC" : "0"}
                        onChange={(v) => patchSet(b.key, s.key, { weightKg: v })}
                      />
                      <NumField
                        value={s.reps}
                        step={secs ? 5 : 1}
                        unit={secs ? "s" : "×"}
                        onChange={(v) => patchSet(b.key, s.key, { reps: Math.round(v) })}
                      />
                      <select
                        value={s.rir ?? ""}
                        onChange={(e) => patchSet(b.key, s.key, { rir: e.target.value === "" ? null : Number(e.target.value) })}
                        className="field px-1.5 py-1 text-[0.8125rem]"
                        aria-label="Répétitions en réserve"
                      >
                        <option value="">—</option>
                        {[0, 1, 2, 3, 4, 5].map((v) => (
                          <option key={v} value={v}>
                            {v === 5 ? "5+" : v}
                          </option>
                        ))}
                      </select>
                      <span className="text-right font-mono text-micro text-ink3">{e1 ? fmtKg(Math.round(e1)) : ""}</span>
                      <span className="flex justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => toggleDone(b.key, s)}
                          className={`flex h-7 w-7 items-center justify-center rounded-full border transition-all ${
                            s.done ? "border-sage bg-sage text-white" : "border-hairStrong text-ink3 hover:border-sage hover:text-sage"
                          }`}
                          aria-label={s.done ? "Série faite" : "Marquer la série comme faite"}
                          aria-pressed={s.done}
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                            <path d="M2 6.5 5 9l5-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </span>
                    </div>
                  );
                })}
                <div className="flex gap-2 border-t border-hair pt-2">
                  <button
                    type="button"
                    className="btn-quiet"
                    onClick={() =>
                      update(b.key, (x) => {
                        const last = x.sets[x.sets.length - 1];
                        return {
                          ...x,
                          sets: [
                            ...x.sets,
                            { ...(last ?? { reps: 8, weightKg: 0, rir: null, isWarmup: false }), isWarmup: false, done: false, key: k() },
                          ],
                        };
                      })
                    }
                  >
                    + Série
                  </button>
                  {b.sets.length > 1 && (
                    <button
                      type="button"
                      className="btn-quiet"
                      onClick={() => update(b.key, (x) => ({ ...x, sets: x.sets.slice(0, -1) }))}
                    >
                      − Retirer la dernière
                    </button>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {blocks.length > 0 && (
        <button
          type="button"
          onClick={() => setPicker(true)}
          className="mt-8 w-full rounded-card border border-dashed border-hairStrong py-4 text-[0.8125rem] text-ink2 transition-colors hover:border-clay hover:text-clay"
        >
          + Ajouter un exercice
        </button>
      )}

      {/* ---------------------------------------------- Ressenti */}
      {blocks.length > 0 && (
        <div className="mt-10 grid gap-6 border-t border-hair pt-6 md:grid-cols-2">
          <div>
            <span className="field-label">Effort global de la séance</span>
            <div className="flex gap-1">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setRpe(rpe === v ? null : v)}
                  className={`h-8 flex-1 rounded-[4px] border text-micro font-medium transition-colors ${
                    rpe != null && v <= rpe ? "border-clay bg-clay text-white" : "border-hair text-ink3"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <label>
            <span className="field-label">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="field resize-y"
              placeholder="Sensations, douleur, matériel…"
            />
          </label>
        </div>
      )}

      {/* ---------------------------------------------- Barre d'enregistrement */}
      <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 border-t border-hair bg-bg/90 backdrop-blur-md md:bottom-0">
        <div className="mx-auto flex max-w-[1240px] items-center gap-4 px-gutter py-3">
          <div className="flex items-baseline gap-4 text-[0.8125rem] text-ink2">
            <span>
              <span className="font-mono font-medium text-ink">{blocks.length}</span> exercices
            </span>
            <span>
              <span className="font-mono font-medium text-ink">{totals.sets}</span> séries
            </span>
            <span className="hidden sm:inline">
              <span className="font-mono font-medium text-ink">{totals.tonnage.toLocaleString("fr-FR")}</span> kg soulevés
            </span>
          </div>
          {err && <span className="text-[0.8125rem] text-rust">{err}</span>}
          <div className="ml-auto flex items-center gap-2">
            {mode === "edit" && (
              <button type="button" className="btn-quiet text-rust" onClick={remove}>
                Supprimer
              </button>
            )}
            <button type="button" className="btn-solid" onClick={save} disabled={saving || !blocks.length}>
              {saving ? "Enregistrement…" : mode === "edit" ? "Enregistrer les modifications" : "Enregistrer la séance"}
            </button>
          </div>
        </div>
      </div>

      {rest && <RestTimer rest={rest} onChange={setRest} />}

      {picker && (
        <ExercisePicker
          history={history}
          exclude={blocks.map((b) => b.exercise)}
          onClose={() => setPicker(false)}
          onPick={(slug) => {
            setBlocks((all) => [...all, blockFromMemo(slug)]);
            setPicker(false);
          }}
        />
      )}
    </div>
  );
}

function swap<T>(arr: T[], i: number, j: number): T[] {
  const out = [...arr];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 items-center justify-center rounded-[6px] text-ink3 transition-colors hover:bg-sunken hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** Champ numérique avec pas ± : la saisie au pouce sans clavier. */
function NumField({
  value,
  onChange,
  step,
  unit,
  placeholder,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  unit: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(value ? String(value).replace(".", ",") : "");
  useEffect(() => {
    const parsed = Number(text.replace(",", "."));
    if ((parsed || 0) !== value) setText(value ? String(value).replace(".", ",") : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const bump = (d: number) => onChange(Math.max(0, Math.round((value + d) * 100) / 100));
  return (
    <div className="flex items-center rounded-[7px] border border-hair bg-panel transition-colors focus-within:border-clay hover:border-hairStrong">
      <button type="button" tabIndex={-1} onClick={() => bump(-step)} className="px-1.5 py-1 text-ink3 hover:text-ink" aria-label="Moins">
        −
      </button>
      <input
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.,]/g, "");
          setText(t);
          const n = Number(t.replace(",", "."));
          if (!Number.isNaN(n)) onChange(n);
        }}
        onFocus={(e) => e.target.select()}
        className="w-full min-w-0 bg-transparent py-1 text-center font-mono text-[0.8125rem] outline-none placeholder:text-ink3"
      />
      <span className="pr-1 text-[10px] text-ink3">{unit}</span>
      <button type="button" tabIndex={-1} onClick={() => bump(step)} className="px-1.5 py-1 text-ink3 hover:text-ink" aria-label="Plus">
        +
      </button>
    </div>
  );
}

function RestTimer({
  rest,
  onChange,
}: {
  rest: { until: number; total: number };
  onChange: (r: { until: number; total: number } | null) => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((rest.until - now) / 1000));
  const pct = Math.min(1, left / rest.total);
  const done = left === 0;
  useEffect(() => {
    if (done && "vibrate" in navigator) navigator.vibrate?.(200);
  }, [done]);

  return (
    <div
      className={`fixed bottom-[calc(124px+env(safe-area-inset-bottom))] right-4 z-40 flex items-center gap-3 rounded-full border py-1.5 pl-1.5 pr-3 shadow-lg backdrop-blur-md md:bottom-20 ${
        done ? "border-sage bg-sage text-white" : "border-hairStrong bg-panel/95"
      }`}
      role="timer"
    >
      <svg width="34" height="34" viewBox="0 0 36 36" aria-hidden>
        <circle cx="18" cy="18" r="15" fill="none" stroke={done ? "rgb(255 255 255 / .35)" : "rgb(var(--hair))"} strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          stroke={done ? "#fff" : "rgb(var(--clay))"}
          strokeWidth="3"
          strokeDasharray={`${pct * 94.25} 94.25`}
          strokeLinecap="round"
          transform="rotate(-90 18 18)"
        />
      </svg>
      <div>
        <div className={`text-[10px] uppercase tracking-[0.1em] ${done ? "text-white/80" : "text-ink3"}`}>
          {done ? "C'est reparti" : "Repos"}
        </div>
        <div className="font-mono text-[0.9375rem] font-medium tabular-nums">
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
        </div>
      </div>
      {!done && (
        <button
          type="button"
          className="ml-1 rounded-full px-2 py-1 text-micro text-ink2 hover:bg-sunken"
          onClick={() => onChange({ until: rest.until + 15000, total: rest.total + 15 })}
        >
          +15 s
        </button>
      )}
      <button
        type="button"
        className={`rounded-full px-2 py-1 text-micro ${done ? "text-white hover:bg-white/15" : "text-ink2 hover:bg-sunken"}`}
        onClick={() => onChange(null)}
        aria-label="Fermer le minuteur"
      >
        ×
      </button>
    </div>
  );
}

function ExercisePicker({
  history,
  exclude,
  onPick,
  onClose,
}: {
  history: Record<string, ExerciseMemo>;
  exclude: string[];
  onPick: (slug: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [runnerOnly, setRunnerOnly] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const list = EXERCISES.filter(
    (e) =>
      !exclude.includes(e.slug) &&
      (!runnerOnly || e.runner) &&
      (!q || norm(`${e.name} ${e.primary.map((m) => MUSCLE_LABELS[m]).join(" ")}`).includes(norm(q)))
  );
  const custom = q.trim() && !EXERCISES.some((e) => norm(e.name) === norm(q.trim()));
  const recent = Object.keys(history).filter((s) => !exclude.includes(s)).slice(0, 8);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/25 backdrop-blur-[3px] sm:items-start sm:pt-[10vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      data-overlay-open
    >
      <div className="palette flex max-h-[80vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[14px] border border-hairStrong bg-panel shadow-2xl sm:rounded-[14px]">
        <div className="flex items-center gap-3 border-b border-hair px-4">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (list[0]) onPick(list[0].slug);
                else if (custom) onPick(q.trim());
              }
            }}
            placeholder="Chercher un exercice ou un muscle…"
            className="h-12 flex-1 bg-transparent outline-none placeholder:text-ink3"
          />
          <label className="flex cursor-pointer items-center gap-1.5 text-micro text-ink2">
            <input type="checkbox" checked={runnerOnly} onChange={(e) => setRunnerOnly(e.target.checked)} className="accent-[rgb(var(--clay))]" />
            coureur
          </label>
        </div>
        <div className="overflow-y-auto p-2">
          {!q && recent.length > 0 && (
            <Group title="Tes exercices">
              {recent.map((slug) => (
                <PickRow key={slug} slug={slug} onPick={onPick} />
              ))}
            </Group>
          )}
          {custom && (
            <button
              type="button"
              onClick={() => onPick(q.trim())}
              className="flex w-full items-center justify-between rounded-[8px] px-3 py-2 text-left text-[0.875rem] hover:bg-sunken"
            >
              <span>
                Créer « <span className="font-medium">{q.trim()}</span> »
              </span>
              <span className="text-micro text-ink3">exercice libre</span>
            </button>
          )}
          {MUSCLE_ORDER.map((m) => {
            const items = list.filter((e) => e.primary[0] === m);
            if (!items.length) return null;
            return (
              <Group key={m} title={MUSCLE_LABELS[m]}>
                {items.map((e) => (
                  <PickRow key={e.slug} slug={e.slug} onPick={onPick} />
                ))}
              </Group>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="px-3 pb-1 pt-2 text-micro font-medium uppercase tracking-[0.11em] text-ink3">{title}</div>
      {children}
    </div>
  );
}

function PickRow({ slug, onPick }: { slug: string; onPick: (s: string) => void }) {
  const e = exerciseInfo(slug);
  return (
    <button
      type="button"
      onClick={() => onPick(slug)}
      className="flex w-full items-baseline justify-between gap-3 rounded-[8px] px-3 py-2 text-left text-[0.875rem] transition-colors hover:bg-sunken"
    >
      <span>{e.name}</span>
      {e.runner && <span className="truncate text-micro text-sage">{e.runner}</span>}
    </button>
  );
}
