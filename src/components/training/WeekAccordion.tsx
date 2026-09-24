"use client";

import { useState } from "react";
import { Bar } from "@/components/ui/Metric";
import { fmtDateShort } from "@/lib/format";
import { useTranslations } from "next-intl";
import { PHASE_LABELS, type Phase } from "@/lib/training";
import { PHASE_COLOR } from "@/lib/training";
import { SessionCard, type SessionView } from "./SessionCard";

export type WeekView = {
  weekNumber: number;
  weekStart: Date | string;
  phase: string;
  km: number;
  actualKm: number | null;
  isCurrent: boolean;
  sessions: SessionView[];
};

/**
 * Liste des semaines, repliée par défaut.
 * La semaine en cours s'ouvre automatiquement : c'est celle qu'on vient voir.
 */
export function WeekAccordion({ weeks }: { weeks: WeekView[] }) {
  const t = useTranslations("common");
  const current = weeks.find((w) => w.isCurrent)?.weekNumber;
  const [open, setOpen] = useState<number | null>(current ?? weeks[0]?.weekNumber ?? null);

  return (
    <div>
      {weeks.map((w) => {
        const isOpen = open === w.weekNumber;
        const pct = w.km > 0 && w.actualKm !== null ? (w.actualKm / w.km) * 100 : null;
        const start = new Date(w.weekStart);

        return (
          <div key={w.weekNumber} className="border-t border-hair">
            <button
              onClick={() => setOpen(isOpen ? null : w.weekNumber)}
              className={`flex w-full items-center gap-4 py-3 text-left transition-colors hover:bg-sunken/60 ${
                w.isCurrent ? "bg-clay/[.04]" : ""
              }`}
            >
              <span className="w-8 shrink-0 font-mono text-micro tabular-nums text-ink3">
                {w.weekNumber}
              </span>

              <span
                className="h-2 w-2 shrink-0 rounded-[1px]"
                style={{ background: PHASE_COLOR[w.phase] ?? "rgb(var(--hair-strong))" }}
              />

              <span className="w-24 shrink-0 text-micro text-ink3">
                {fmtDateShort(start)}
              </span>

              <span className="hidden w-28 shrink-0 text-[0.8125rem] text-ink2 sm:block">
                {t(PHASE_LABELS[(w.phase as Phase) ?? "base"])}
              </span>

              <span className="flex-1">
                {pct !== null ? (
                  <Bar value={Math.min(120, pct)} max={120} height={3} />
                ) : (
                  <span className="block h-[3px] w-full bg-sunken" />
                )}
              </span>

              <span className="w-28 shrink-0 text-right font-mono text-[0.8125rem] tabular-nums">
                {w.actualKm !== null && (
                  <span className={w.actualKm >= w.km * 0.9 ? "text-sage" : "text-ink3"}>
                    {w.actualKm}/
                  </span>
                )}
                <span className="text-ink">{w.km}</span>
                <span className="ml-1 text-micro text-ink3">km</span>
              </span>

              <span className="w-4 shrink-0 text-center text-ink3">{isOpen ? "−" : "+"}</span>
            </button>

            {isOpen && (
              <div className="pb-4 pl-4 sm:pl-12">
                {w.sessions.map((s) => (
                  <SessionCard key={s.id} session={s} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
