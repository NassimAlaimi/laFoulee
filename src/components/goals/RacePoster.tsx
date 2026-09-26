import Link from "next/link";
import { FACTOR_KEY, PHASE_KEY } from "@/components/goals/readiness-text";
import { getLocale } from "next-intl/server";
import { fmtDuration, fmtPace } from "@/lib/format";
import type { RaceReadiness } from "@/lib/goal";
import { getTranslations } from "next-intl/server";
import { PHASE_COLOR, PHASE_LABELS, type Phase } from "@/lib/training";
import { addDays, calendarDaysBetween, startOfWeek } from "@/lib/stats";

export type PosterWeek = { weekStart: Date; phase: string; km: number };

/**
 * L'affiche de la course : le nom en très grand, le compte à rebours, et le
 * chemin qui y mène semaine par semaine (phases du plan), avec un repère
 * « aujourd'hui ». Posée dans une bande nuit, comme une affiche de départ.
 */
export async function RacePoster({
  goal,
  p,
  weeks,
  planId,
  now = new Date(),
  extra,
  startsOn,
}: {
  goal: { id: string; name: string; raceDate: Date; distance: number; targetTime: number | null; priority: string };
  p: RaceReadiness;
  weeks: PosterWeek[];
  planId?: string;
  now?: Date;
  extra?: React.ReactNode;
  /** Première séance du plan, pour « le plan démarre dans N jours » */
  startsOn?: Date | null;
}) {
  const t = await getTranslations("common");
  const tgoals = await getTranslations("goals");
  const locale = await getLocale();
  const dateLabel = goal.raceDate.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const km = goal.distance / 1000;

  // Frise : semaines du plan, sinon semaines d'ici la course
  const thisMonday = startOfWeek(now);
  const raceMonday = startOfWeek(goal.raceDate);
  const strip: PosterWeek[] = weeks.length
    ? weeks
    : Array.from({ length: Math.max(1, Math.round((raceMonday.getTime() - thisMonday.getTime()) / (7 * 86_400_000)) + 1) }, (_, i) => ({
        weekStart: addDays(thisMonday, i * 7),
        phase: "",
        km: 0,
      }));
  const maxKm = Math.max(1, ...strip.map((w) => w.km));
  const current = strip.findIndex((w) => now >= w.weekStart && now < addDays(w.weekStart, 7));
  const phasesInPlan = Object.keys(PHASE_LABELS).filter((ph) => strip.some((w) => w.phase === ph));
  const startsIn = startsOn && startsOn > now ? calendarDaysBetween(now, startsOn) : 0;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-micro font-medium uppercase tracking-[0.16em]">
        <span className="text-clay">{goal.priority === "A" ? tgoals("priorityA") : tgoals("priorityBadge", { p: goal.priority })}</span>
        <span className="text-ink3">{tgoals(`racePhase.${PHASE_KEY[p.phase] ?? "prep"}`)}</span>
      </div>

      <div className="mt-5 grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <h2 className="text-[clamp(2.6rem,7.5vw,6rem)] font-semibold leading-[0.9] tracking-[-0.045em]">{goal.name}</h2>
          <p className="mt-5 text-[clamp(1rem,1.6vw,1.25rem)] text-ink2">
            <span className="first-letter:uppercase">{dateLabel}</span> ·{" "}
            <span className="text-ink">{km % 1 ? km.toFixed(1).replace(".", ",") : km} km</span>
            {goal.targetTime && (
              <>
                {" "}
                · {tgoals("goalTag")} <span className="text-ink">{fmtDuration(goal.targetTime)}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-baseline gap-3 lg:flex-col lg:items-end lg:gap-0">
          <span className="pr-[0.06em] font-semibold leading-[0.8] tracking-[-0.06em] tabular-nums text-[clamp(4.5rem,11vw,9rem)]">
            {p.daysRemaining}
          </span>
          <span className="text-[0.9375rem] text-ink2 lg:mt-3">
            {tgoals("daysAndWeeks", { d: p.daysRemaining, w: p.weeksRemaining })}
          </span>
        </div>
      </div>

      {/* ------------------------------------------------ Le chemin */}
      <div className="mt-10">
        <div className="flex h-16 items-end gap-[3px]" role="img" aria-label={tgoals("weeksToRace")}>
          {strip.map((w, i) => {
            const past = i < current || (current < 0 && w.weekStart < now);
            const h = w.km ? 18 + (w.km / maxKm) * 46 : 20;
            const isRace = i === strip.length - 1;
            return (
              <div key={i} className="relative flex h-full flex-1 flex-col justify-end" title={`${w.weekStart.toLocaleDateString(locale, { day: "numeric", month: "short" })}${w.km ? ` · ${Math.round(w.km)} km` : ""}${w.phase ? ` · ${t(PHASE_LABELS[w.phase as Phase] ?? `phase.${w.phase}`)}` : ""}`}>
                {i === current && (
                  <span className="absolute -top-5 left-0 whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.12em] text-clay">
                    ▾ ici
                  </span>
                )}
                <span
                  className="block w-full rounded-[2px]"
                  style={{
                    height: h,
                    background: w.phase ? PHASE_COLOR[w.phase] ?? "rgb(var(--hair-strong))" : "rgb(var(--hair-strong))",
                    opacity: past ? 0.35 : i === current ? 1 : 0.85,
                    outline: i === current ? "2px solid rgb(var(--ink))" : undefined,
                    outlineOffset: 2,
                  }}
                />
                {isRace && (
                  <span className="absolute -top-5 right-0 whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.12em] text-ink2">
                    {tgoals("raceDay")}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-micro text-ink3">
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            {phasesInPlan.map((ph) => (
              <span key={ph} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: PHASE_COLOR[ph] }} />
                {t(PHASE_LABELS[ph as Phase] ?? `phase.${ph}`)}
              </span>
            ))}
            {!phasesInPlan.length && <span>{tgoals("posterNoPlan")}</span>}
          </span>
          <span>
            {startsIn > 0 && <span className="mr-3 text-clay">{tgoals("planStartsIn", { n: startsIn })}</span>}
            {strip[0].weekStart.toLocaleDateString(locale, { day: "numeric", month: "short" })} →{" "}
            {goal.raceDate.toLocaleDateString(locale, { day: "numeric", month: "short" })}
          </span>
        </div>
      </div>

      {/* ------------------------------------------------ Où j'en suis */}
      <div className="mt-10 grid grid-cols-2 border-t border-hair lg:grid-cols-4">
        <PosterFig label={tgoals("preparation")} value={`${p.readiness}`} unit="/100">
          <span className="mt-3 block h-[3px] w-full max-w-[160px] rounded-full bg-hair">
            <span className="block h-full rounded-full bg-clay" style={{ width: `${p.readiness}%` }} />
          </span>
        </PosterFig>
        <PosterFig
          label={tgoals("realisticTime")}
          value={p.prediction ? fmtDuration(p.prediction.realistic) : "—"}
          note={p.prediction ? tgoals("potentialShort", { time: fmtDuration(p.prediction.potential) }) : undefined}
        />
        <PosterFig label={tgoals("paceShort2")} value={p.prediction ? fmtPace(p.prediction.pace, "") : "—"} unit="/km" note={p.targetPace ? tgoals("targetPaceShort", { pace: fmtPace(p.targetPace) }) : tgoals("realisticToday")} />
        <PosterFig
          label={tgoals("weakest")}
          value={weakest(p, tgoals).label}
          note={weakest(p, tgoals).note}
          small
        />
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        <Link href={`/goals/${goal.id}`} className="btn-solid">
          {tgoals("prepDetail")} →
        </Link>
        {planId ? (
          <Link href={`/training/${planId}`} className="btn-outline">
            {tgoals("planBySession")}
          </Link>
        ) : (
          <Link href={`/goals/${goal.id}`} className="btn-outline">
            {tgoals("generatePlan")}
          </Link>
        )}
        {extra && <div className="ml-auto self-center">{extra}</div>}
      </div>
    </div>
  );
}

/** Le facteur de préparation le plus en retard, dit simplement. */
function weakest(
  p: RaceReadiness,
  tgoals: (key: string, params?: Record<string, string | number>) => string
): { label: string; note: string } {
  const f = [...p.factors].sort((a, b) => a.score / a.max - b.score / b.max)[0];
  if (!f) return { label: "—", note: "" };
  const note =
    f.unit === "s/km"
      ? f.target > 0
        ? tgoals("paceVsTarget", { value: fmtPace(f.value), target: fmtPace(f.target) })
        : tgoals("paceToday", { value: fmtPace(f.value) })
      : `${f.value} / ${f.target} ${f.unit}`;
  return { label: tgoals(`factor.${FACTOR_KEY[f.label] ?? "pace"}`), note: `${note} · ${Math.round((f.score / f.max) * 100)} %` };
}

function PosterFig({
  label,
  value,
  unit,
  note,
  small,
  children,
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  small?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-hair py-5 pr-4 [&:nth-child(n+3)]:border-t lg:[&:nth-child(n+2)]:border-l lg:[&:nth-child(n+2)]:pl-6 lg:[&:nth-child(n+3)]:border-t-0">
      <div className="eyebrow">{label}</div>
      <div className="mt-2.5 flex items-baseline gap-1">
        <span className={`display ${small ? "text-d4 leading-tight" : "text-d3"}`}>{value}</span>
        {unit && <span className="text-sm text-ink3">{unit}</span>}
      </div>
      {note && <div className="mt-1.5 text-micro text-ink3">{note}</div>}
      {children}
    </div>
  );
}
