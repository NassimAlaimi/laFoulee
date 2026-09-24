import Link from "next/link";
import type { DailyLog } from "@prisma/client";
import { READINESS_COLOR, READINESS_LABEL, readinessScore } from "@/lib/readiness";
import { localDayKey } from "@/lib/stats";
import { MiniLogForm } from "./MiniLogForm";

/**
 * Bandeau « préparation du jour » de l'accueil : le score en grand, ses
 * facteurs, et le mini-carnet pour l'alimenter en dix secondes.
 */
export function TodayLog({ log }: { log: DailyLog | null }) {
  const readiness = readinessScore(log ?? {});

  return (
    <section className="mt-10 border-y border-hair py-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] lg:items-center">
        <div>
          <div className="text-micro font-medium uppercase tracking-[0.16em] text-ink3">
            Préparation du jour
          </div>
          <div className="mt-1.5 flex items-baseline gap-3">
            <span className="display text-d3" style={{ color: READINESS_COLOR[readiness.zone] }}>
              {log ? readiness.score : "—"}
            </span>
            <span className="text-sm text-ink3">
              {log ? (
                <>
                  {READINESS_LABEL[readiness.zone]}
                  {readiness.breakdown.length > 0 && (
                    <span className="text-ink2"> · {readiness.breakdown.join(", ")}</span>
                  )}
                </>
              ) : (
                "ton score apparaît dès que tu renseignes le mini-carnet"
              )}
            </span>
          </div>
          <Link href="/log" className="mt-2 inline-block text-micro text-clay hover:underline">
            Carnet complet : tendance 14 j et historique →
          </Link>
        </div>

        <MiniLogForm
          existing={
            log
              ? { sleepHours: log.sleepHours, fatigue: log.fatigue, painLevel: log.painLevel }
              : null
          }
          today={localDayKey(new Date())}
        />
      </div>
    </section>
  );
}
