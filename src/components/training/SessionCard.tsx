"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { fmtPace } from "@/lib/format";
import { useTranslations } from "next-intl";
import { KIND_LABELS, type SessionKind, type Step } from "@/lib/workouts";
import { Frieze } from "./Frieze";

export type SessionView = {
  id: string;
  date: string;
  kind: string;
  title: string;
  tagline: string | null;
  structure: string | null;
  distanceKm: number;
  durationMin: number;
  paceTarget: number | null;
  intensity: number;
  status: string;
  phase: string;
  adapted: boolean;
  adaptReason: string | null;
  rpe: number | null;
  painLevel: number;
  activity: { id: string; name: string; distance: number; movingTime: number } | null;
};

const INTENSITY_COLOR = [
  "rgb(var(--ink-3))",
  "rgb(var(--ink-3))",
  "rgb(var(--sage))",
  "rgb(var(--ochre))",
  "rgb(var(--clay))",
  "rgb(var(--rust))",
];

const DAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

/**
 * Carte de séance : intention, structure, allures, et les deux actions qui
 * comptent vraiment — « fait » et « ressenti ». Le ressenti n'est pas décoratif :
 * il alimente la réadaptation du plan.
 */
export function SessionCard({
  session,
  today = false,
  compact = false,
}: {
  session: SessionView;
  today?: boolean;
  compact?: boolean;
}) {
  const t = useTranslations("training");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(false);

  const date = new Date(session.date);
  const steps: Step[] = session.structure ? safeParse(session.structure) : [];
  const done = session.status === "done";
  const skipped = session.status === "skipped";
  const color = INTENSITY_COLOR[Math.min(5, session.intensity)];

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/training/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    setFeedback(false);
    router.refresh();
  }

  return (
    <div
      id={`seance-${session.id}`}
      className={`scroll-mt-20 border-t border-hair py-3.5 transition-colors ${
        today ? "bg-clay/[.04]" : ""
      } ${skipped ? "opacity-55" : ""}`}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
          style={{ background: color }}
          title={`Intensité ${session.intensity}/5`}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="text-micro uppercase tracking-wider text-ink3">
              {DAYS[date.getDay()]} {date.getDate()}
            </span>
            <span className={`text-sm font-medium ${done ? "text-sage" : ""}`}>
              {session.title}
            </span>
            <span className="tag">{t(KIND_LABELS[session.kind as SessionKind] ?? `kind.${session.kind}`)}</span>
            {session.adapted && (
              <span className="tag border-ochre/40 text-ochre" title={session.adaptReason ?? ""}>
                réadapté
              </span>
            )}
            {done && <span className="text-micro text-sage">✓ fait</span>}
            {skipped && <span className="text-micro text-ink3">manquée</span>}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-micro text-ink3">
            {session.distanceKm > 0 && (
              <span className="font-mono tabular-nums text-ink2">{session.distanceKm} km</span>
            )}
            <span>~{session.durationMin} min</span>
            {session.paceTarget && <span>{fmtPace(session.paceTarget)}</span>}
            {session.activity && (
              <Link href={`/activities/${session.activity.id}`} className="text-clay hover:underline">
                {(session.activity.distance / 1000).toFixed(1)} km réalisés →
              </Link>
            )}
          </div>

          {!compact && session.tagline && (
            <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink2">
              {session.tagline}
            </p>
          )}

          {steps.length > 1 && (
            <Frieze
              steps={steps}
              fallbackPace={session.paceTarget ?? 360}
              height={14}
              scale={false}
              className={`mt-2.5 max-w-md ${skipped ? "opacity-50" : ""}`}
            />
          )}

          {open && steps.length > 0 && (
            <ol className="mt-3 space-y-1.5 border-l border-hair pl-3">
              {steps.map((s, i) => (
                <li key={i} className="text-[0.8125rem] text-ink2">
                  <span className="mr-2 text-micro uppercase tracking-wider text-ink3">
                    {STEP_LABEL[s.kind] ?? s.kind}
                  </span>
                  {s.label}
                  {s.pace ? (
                    <span className="ml-2 font-mono text-micro text-ink3">{fmtPace(s.pace)}</span>
                  ) : null}
                </li>
              ))}
            </ol>
          )}

          {feedback && (
            <FeedbackForm
              busy={busy}
              onCancel={() => setFeedback(false)}
              onSubmit={(v) => patch({ status: "done", ...v })}
            />
          )}

          {!feedback && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {steps.length > 0 && (
                <button onClick={() => setOpen(!open)} className="btn-quiet">
                  {open ? t("hide") : t("detail2")}
                </button>
              )}
              {!done && (
                <button
                  onClick={() => setFeedback(true)}
                  disabled={busy}
                  className="btn-quiet text-sage"
                >
                  Marquer fait
                </button>
              )}
              {!skipped && !done && (
                <button onClick={() => patch({ status: "skipped" })} disabled={busy} className="btn-quiet">
                  Sauter
                </button>
              )}
              {(done || skipped) && (
                <button onClick={() => patch({ status: "planned" })} disabled={busy} className="btn-quiet">
                  Annuler
                </button>
              )}
              {session.rpe && (
                <span className="text-micro text-ink3">RPE {session.rpe}/10</span>
              )}
              {session.painLevel > 0 && (
                <span className="text-micro text-ochre">douleur {session.painLevel}/3</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const STEP_LABEL: Record<string, string> = {
  warmup: "stepWarmup",
  work: "stepWork",
  recovery: "stepRecovery",
  cooldown: "stepCooldown",
  block: "stepBlock",
};

function FeedbackForm({
  busy,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  onSubmit: (v: { rpe: number; painLevel: number; painArea: string | null }) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("training");
  const [rpe, setRpe] = useState(5);
  const [pain, setPain] = useState(0);
  const [area, setArea] = useState("");

  return (
    <div className="mt-3 rounded-[7px] border border-hair bg-sunken p-3">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-micro text-ink3">
          {t("effort")}
          <input
            type="range"
            min={1}
            max={10}
            value={rpe}
            onChange={(e) => setRpe(Number(e.target.value))}
            className="w-28 accent-clay"
          />
          <span className="w-8 font-mono tabular-nums text-ink">{rpe}/10</span>
        </label>

        <div className="flex items-center gap-1.5">
          <span className="text-micro text-ink3">{t("pain")}</span>
          {[0, 1, 2, 3].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPain(p)}
              className={`h-6 w-6 rounded text-micro transition-colors ${
                pain === p ? "bg-clay text-white" : "bg-panel text-ink3 hover:text-ink"
              }`}
              title={t(PAIN_HINT[p])}
            >
              {p}
            </button>
          ))}
        </div>

        {pain > 0 && (
          <input
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder={t("painWhere")}
            className="field max-w-[180px] py-1 text-xs"
          />
        )}
      </div>

      <div className="mt-3 flex gap-1.5">
        <button
          onClick={() => onSubmit({ rpe, painLevel: pain, painArea: area || null })}
          disabled={busy}
          className="btn-solid btn-sm"
        >
          {t("validate")}
        </button>
        <button onClick={onCancel} className="btn-quiet">
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}

const PAIN_HINT = [
  "pain0",
  "pain1",
  "pain2",
  "pain3",
];

function safeParse(raw: string): Step[] {
  try {
    return JSON.parse(raw) as Step[];
  } catch {
    return [];
  }
}
