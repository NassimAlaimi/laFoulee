"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { expand, summarize, type WorkoutStep } from "@/lib/workout-dsl";
import type { PaceSet } from "@/lib/workouts";
import { WorkoutComposer } from "./WorkoutComposer";
import { WorkoutProfile } from "./WorkoutProfile";

export type CustomRow = {
  id: string;
  name: string;
  dsl: string;
  kind: string;
  favorite: boolean;
  usedCount: number;
  structure: string;
};

function localIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Mes séances : profil, totaux, favori, planification dans le plan actif. */
export function CustomWorkoutList({ rows, paces, hasPlan }: { rows: CustomRow[]; paces: PaceSet; hasPlan: boolean }) {
  const t = useTranslations("custom");
  const tc = useTranslations("common");
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [date, setDate] = useState(localIso(new Date(Date.now() + 86400000)));
  const [msg, setMsg] = useState<{ id: string; text: string } | null>(null);

  const patch = async (id: string, body: object) => {
    await fetch(`/api/workouts/custom/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    router.refresh();
  };
  const remove = async (id: string) => {
    if (!confirm(t("confirmDelete"))) return;
    await fetch(`/api/workouts/custom/${id}`, { method: "DELETE" });
    router.refresh();
  };
  const schedule = async (id: string) => {
    const res = await fetch(`/api/workouts/custom/${id}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
    });
    const j = await res.json().catch(() => ({}));
    setMsg({ id, text: res.ok ? (j.replaced ? t("scheduledReplaced") : t("scheduled")) : t("scheduleError") });
    setScheduling(null);
    router.refresh();
  };

  if (rows.length === 0) return <p className="text-[0.8125rem] text-ink3">{t("emptyList")}</p>;

  return (
    <ul className="divide-y divide-hair border-y border-hair">
      {rows.map((w) => {
        const steps = JSON.parse(w.structure) as WorkoutStep[];
        const seg = expand(steps, paces);
        const sum = summarize(steps, paces);
        if (editing === w.id) {
          return (
            <li key={w.id} className="py-6">
              <WorkoutComposer paces={paces} initial={{ id: w.id, name: w.name, dsl: w.dsl }} onDone={() => setEditing(null)} />
            </li>
          );
        }
        return (
          <li key={w.id} className="grid gap-4 py-5 md:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_auto] md:items-center">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <button
                  type="button"
                  onClick={() => patch(w.id, { favorite: !w.favorite })}
                  className={w.favorite ? "text-clay" : "text-ink3 hover:text-clay"}
                  aria-pressed={w.favorite}
                  title={t("favorite")}
                >
                  {w.favorite ? "★" : "☆"}
                </button>
                <span className="truncate text-[1rem] font-semibold">{w.name}</span>
                <span className="tag">{tc(`kind.${w.kind}`)}</span>
              </div>
              <p className="mt-1 break-words font-mono text-micro text-ink2">{w.dsl}</p>
              <p className="mt-1 text-micro text-ink3">
                {Math.round(sum.seconds / 60)} min · {(sum.meters / 1000).toFixed(1)} km · {t("loadShort", { n: sum.load })}
                {w.usedCount > 0 && ` · ${t("used", { n: w.usedCount })}`}
              </p>
              {msg?.id === w.id && <p className="mt-1 text-micro text-sage">{msg.text}</p>}
            </div>
            <WorkoutProfile segments={seg} height={36} />
            <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
              {scheduling === w.id ? (
                <>
                  <input type="date" className="field py-1" value={date} onChange={(e) => setDate(e.target.value)} />
                  <button type="button" className="btn-solid btn-sm" onClick={() => schedule(w.id)}>
                    {t("confirm")}
                  </button>
                  <button type="button" className="btn-quiet btn-sm" onClick={() => setScheduling(null)}>
                    {t("cancel")}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn-outline btn-sm"
                    disabled={!hasPlan}
                    title={hasPlan ? undefined : t("noPlan")}
                    onClick={() => setScheduling(w.id)}
                  >
                    {t("schedule")}
                  </button>
                  <a className="btn-quiet btn-sm" href={`/api/workouts/custom/${w.id}/fit`} title={t("watchTitle")} download>
                    {t("watch")}
                  </a>
                  <button type="button" className="btn-quiet btn-sm" onClick={() => setEditing(w.id)}>
                    {t("edit")}
                  </button>
                  <button type="button" className="btn-quiet btn-sm text-ink3 hover:text-rust" onClick={() => remove(w.id)}>
                    {t("delete")}
                  </button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
