import Link from "next/link";
import { Frieze } from "@/components/training/Frieze";
import { fmtPace } from "@/lib/format";
import { addDays, round } from "@/lib/stats";
import type { Step } from "@/lib/workouts";
import type { SessionView } from "./SessionCard";

const DAY = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/**
 * La semaine comme un tableau d'affichage : sept colonnes, une par jour, la
 * date en grand, la séance et sa frise. Aujourd'hui est marqué d'un trait
 * terre cuite, le fait est coché, le passé non fait s'efface.
 * Se lit d'un coup d'œil — le détail et les actions vivent dans les cartes
 * en dessous.
 */
export function WeekBoard({ monday, sessions, now = new Date() }: { monday: Date; sessions: SessionView[]; now?: Date }) {
  const todayKey = now.toDateString();
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return {
      date,
      sessions: sessions.filter((s) => new Date(s.date).toDateString() === date.toDateString() && s.kind !== "rest"),
      today: date.toDateString() === todayKey,
      past: date < now && date.toDateString() !== todayKey,
    };
  });

  return (
    <div>
      <ol className="border-t border-hair lg:grid lg:grid-cols-7">
        {days.map((d, i) => (
          <li
            key={i}
            className={`relative grid grid-cols-[76px_minmax(0,1fr)] gap-x-4 border-t border-hair py-4 first:border-t-0 lg:flex lg:min-h-[210px] lg:flex-col lg:border-l lg:border-t-0 lg:px-3 lg:first:border-l-0 lg:first:pl-0 ${
              d.today ? "bg-clay/[0.045]" : ""
            }`}
          >
            {d.today && <span aria-hidden className="absolute -top-px left-0 right-0 h-[3px] bg-clay" />}
            <div className="flex items-baseline gap-2 self-start">
              <span className={`text-micro font-medium uppercase tracking-[0.12em] ${d.today ? "text-clay" : "text-ink3"}`}>
                {d.today ? "Auj." : DAY[i]}
              </span>
              <span
                className={`display text-d3 ${d.past && !d.sessions.some((s) => s.status === "done") ? "text-ink3" : ""}`}
              >
                {d.date.getDate()}
              </span>
            </div>

            <div className="flex flex-1 flex-col gap-4 lg:mt-4">
              {d.sessions.length === 0 && <span className="text-[0.8125rem] text-ink3">Repos</span>}
              {d.sessions.map((s) => {
                const done = s.status === "done" || Boolean(s.activity);
                const skipped = s.status === "skipped";
                const missed = d.past && !done && !skipped;
                const steps = parse(s.structure);
                return (
                  <Link
                    key={s.id}
                    href={s.activity ? `/activities/${s.activity.id}` : `#seance-${s.id}`}
                    className={`group block ${skipped || missed ? "opacity-45" : ""}`}
                  >
                    <div className="flex items-start gap-1.5">
                      <span
                        className={`text-[0.875rem] font-medium leading-snug group-hover:text-clay ${skipped ? "line-through" : ""}`}
                      >
                        {s.title}
                      </span>
                      {done && (
                        <svg width="14" height="14" viewBox="0 0 12 12" className="mt-[3px] shrink-0 text-sage" aria-label="fait">
                          <path d="M2 6.5 5 9l5-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <div className="mt-1 font-mono text-micro text-ink3">
                      {done && s.activity
                        ? `${round(s.activity.distance / 1000, 1)} km faits`
                        : s.distanceKm > 0
                          ? `${round(s.distanceKm, 1)} km${s.paceTarget ? ` · ${fmtPace(s.paceTarget, "")}` : ""}`
                          : `${s.durationMin} min`}
                    </div>
                    {steps.length > 0 && (
                      <div className="mt-2.5">
                        <Frieze steps={steps} fallbackPace={s.paceTarget ?? 360} height={22} scale={false} />
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function parse(structure: string | null): Step[] {
  if (!structure) return [];
  try {
    const v = JSON.parse(structure);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
