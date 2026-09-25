import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { fmtDate } from "@/lib/format";
import { calendarGrid, type CalendarDay, type CalendarPlanned, type CalendarRun } from "@/lib/calendar";

/** Semaines visibles selon la largeur : mobile, tablette, desktop. */
const SPAN = { sm: 15, md: 26, lg: 52 } as const;

/**
 * Calendrier d'entraînement : une colonne par semaine, une case par jour.
 *
 * Grille fluide (les colonnes se partagent la largeur, cases carrées) : une
 * année entière sur desktop, 26 semaines sur tablette, 15 sur mobile — la
 * semaine courante est toujours visible à droite, suivie de la semaine à
 * venir et de ses séances planifiées en pointillés. Sous la grille, le volume
 * de chaque semaine en micro-barres. Rendu serveur, sans bibliothèque.
 */
export async function TrainingCalendar({
  activities,
  planned = [],
  now = new Date(),
}: {
  activities: CalendarRun[];
  planned?: CalendarPlanned[];
  now?: Date;
}) {
  const t = await getTranslations("training");
  const locale = await getLocale();
  const grid = calendarGrid({ runs: activities, planned, weeks: SPAN.lg, futureWeeks: 1, now });
  const total = grid.weeks.length;
  // Visibilité par colonne : les plus anciennes disparaissent sur petit écran.
  const vis = (i: number) => {
    const fromEnd = total - i;
    if (fromEnd <= SPAN.sm + 1) return "flex";
    if (fromEnd <= SPAN.md + 1) return "hidden md:flex";
    return "hidden lg:flex";
  };
  const dayNames = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: "narrow" })
  );
  const kmFor = (weeks: number) =>
    Math.round(grid.weeks.slice(-(weeks + 1), -1).reduce((a, w) => a + w.km, 0) + (grid.weeks[total - 1]?.km ?? 0));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex gap-8">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="display text-d4 md:hidden">{kmFor(SPAN.sm)}</span>
              <span className="display hidden text-d4 md:inline lg:hidden">{kmFor(SPAN.md)}</span>
              <span className="display hidden text-d4 lg:inline">{grid.totalKm}</span>
              <span className="text-micro text-ink3">km</span>
            </div>
            <div className="mt-1 text-micro text-ink3">
              <span className="md:hidden">{t("overWeeks", { n: SPAN.sm })}</span>
              <span className="hidden md:inline lg:hidden">{t("overWeeks", { n: SPAN.md })}</span>
              <span className="hidden lg:inline">{t("overWeeks", { n: SPAN.lg })}</span>
            </div>
          </div>
          <Figure value={grid.activeDays} label={t("activeDays")} />
          <Figure value={grid.streak} label={grid.streak > 1 ? t("streakWeeks") : t("activeWeek")} />
        </div>
        <Legend maxKm={grid.maxKm} t={t} />
      </div>

      {/*
        Grille CSS en colonnes : la première porte les initiales des jours,
        les suivantes une semaine chacune (mois, 7 jours, volume). Le nombre
        de colonnes suit la largeur via --n ; les semaines anciennes sont
        masquées sur petit écran, la semaine courante reste à droite.
      */}
      <div
        className="mt-5 grid grid-flow-col gap-[3px] [--n:17] md:[--n:28] lg:[--n:54]"
        style={{
          gridTemplateColumns: "auto repeat(calc(var(--n) - 1), minmax(0, 1fr))",
          gridTemplateRows: "0.75rem repeat(7, auto) 1.25rem",
        }}
      >
        <span />
        {dayNames.map((d, i) => (
          <span key={i} className="flex items-center pr-1 text-[9px] leading-none text-ink3">
            {i % 2 === 0 ? d : ""}
          </span>
        ))}
        <span />
        {grid.weeks.map((w, i) => {
          const v = vis(i);
          return [
            <span key={`m${i}`} className={`${v} overflow-visible whitespace-nowrap text-[9px] leading-3 text-ink3`}>
              {w.newMonth && i > 0 ? w.monday.toLocaleDateString(locale, { month: "short" }) : ""}
            </span>,
            ...w.days.map((d) => <Cell key={d.key} day={d} locale={locale} t={t} v={v} />),
            <span key={`b${i}`} className={`${v} mt-1 items-end`} title={`${w.km} km`}>
              <span
                className={`block w-full ${i === total - 1 ? "bg-hair" : "bg-ink3/40"}`}
                style={{ height: `${w.km > 0 ? Math.max(12, (w.km / grid.maxWeekKm) * 100) : 0}%` }}
              />
            </span>,
          ];
        })}
      </div>
    </div>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"training">>>;

function Cell({ day, locale, t, v }: { day: CalendarDay; locale: string; t: T; v: string }) {
  const base = `${v} relative aspect-square w-full rounded-[2px]`;
  const ring = day.today ? " ring-1 ring-ink ring-offset-1 ring-offset-bg" : "";

  if (day.planned) {
    return (
      <span
        className={`${base} border border-dashed border-clay/70${ring}`}
        title={`${fmtDate(day.date, locale)} — ${day.planned.title}${day.planned.distanceKm ? ` · ${day.planned.distanceKm} km` : ""}`}
      />
    );
  }
  if (day.future) return <span className={`${base} opacity-0`} aria-hidden />;
  if (!day.id) {
    return (
      <span className={`${base}${ring}`} style={{ background: "rgb(var(--hair))" }} title={`${fmtDate(day.date, locale)} — ${t("calRest")}`} />
    );
  }
  const alpha = [0, 0.26, 0.46, 0.72, 1][day.level];
  return (
    <Link
      href={`/activities/${day.id}`}
      className={`${base} transition-transform hover:scale-125 motion-reduce:transition-none motion-reduce:hover:scale-100${ring}`}
      style={{ background: `rgb(var(--clay) / ${alpha})` }}
      title={`${fmtDate(day.date, locale)} — ${day.km.toFixed(1)} km${
        day.count > 1 ? ` (${t("calSessions", { n: day.count })})` : ""
      }${day.isRace ? ` · ${t("calRace")}` : ""}\n${day.names.join(" · ")}`}
    >
      {day.isRace ? (
        <span className="absolute inset-[22%] rounded-full bg-bg" aria-hidden />
      ) : day.isLong ? (
        <span className="absolute inset-[30%] rounded-full border border-bg/80" aria-hidden />
      ) : null}
    </Link>
  );
}

function Legend({ maxKm, t }: { maxKm: number; t: T }) {
  const sw = "h-[11px] w-[11px] rounded-[2px]";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-micro text-ink3">
      <span className="flex items-center gap-1.5">
        <span>0</span>
        <span className={sw} style={{ background: "rgb(var(--hair))" }} />
        {[0.26, 0.46, 0.72, 1].map((o) => (
          <span key={o} className={sw} style={{ background: `rgb(var(--clay) / ${o})` }} />
        ))}
        <span>{Math.round(maxKm)} km</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className={`${sw} relative`} style={{ background: "rgb(var(--clay))" }}>
          <span className="absolute inset-[22%] rounded-full bg-bg" />
        </span>
        {t("calRace")}
      </span>
      <span className="flex items-center gap-1.5">
        <span className={`${sw} border border-dashed border-clay/70`} />
        {t("calPlanned")}
      </span>
    </div>
  );
}

function Figure({ value, unit, label }: { value: number | string; unit?: string; label: string }) {
  return (
    <div>
      <div className="flex items-baseline gap-1">
        <span className="display text-d4">{value}</span>
        {unit && <span className="text-micro text-ink3">{unit}</span>}
      </div>
      <div className="mt-1 text-micro text-ink3">{label}</div>
    </div>
  );
}
