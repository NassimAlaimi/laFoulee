import Link from "next/link";
import { pageMeta } from "@/lib/page-meta";
import { privatePolyline } from "@/lib/polyline";
import { getPrivacyZone } from "@/lib/queries";
import { getLocale, getTranslations } from "next-intl/server";
import { Empty } from "@/components/ui/Layout";
import { RouteGlyph } from "@/components/route/RouteGlyph";
import { PrintButton } from "@/components/PrintButton";
import { requireUserId } from "@/lib/auth";
import { fmtDate, fmtDateShort, fmtDuration, fmtPace, pacePerKm } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { RUN_TYPES } from "@/lib/strava";
import { tonnage } from "@/lib/strength";
import { yearHeatmap } from "@/lib/heatmap";
import { ConsistencyHeatmap } from "@/components/analysis/ConsistencyHeatmap";
import {
  bestWeek,
  distanceComparisonParts,
  elevationComparisonParts,
  type Comparison,
  longestDayStreak,
  monthlyKm,
  whenYouRun,
} from "@/lib/recap";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return pageMeta("recap");
}


/**
 * Rétrospective — une saison racontée, pas pilotée. Pensée comme une double
 * page de magazine : un chiffre énorme, une phrase, puis la saison dessinée
 * sortie par sortie. Imprimable.
 */
export default async function RecapPage({ searchParams }: { searchParams: Promise<{ y?: string; m?: string }> }) {
  const t = await getTranslations("recap");
  const locale = await getLocale();
  const nf = (n: number, d = 0) => n.toLocaleString(locale, { maximumFractionDigits: d, minimumFractionDigits: d });
  const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2024, i, 1).toLocaleDateString(locale, { month: "short" }));
  const MONTHS_LONG = Array.from({ length: 12 }, (_, i) => new Date(2024, i, 1).toLocaleDateString(locale, { month: "long" }));
  // Lundi = 0 (1er janvier 2024 était un lundi).
  const DAY_NAMES = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: "long" }));
  const cmp = (c: Comparison | null) =>
    c
      ? c.equivalent
        ? t("cmpEquivalent", { ref: t(`refs.${c.ref}.of`) })
        : t("cmpTimes", { ratio: nf(c.ratio, 1), ref: t(`refs.${c.ref}.the`) })
      : null;
  const userId = await requireUserId();
  const params = await searchParams;
  const now = new Date();

  const zone = await getPrivacyZone(userId);
  // Tracés servis masqués (zone de confidentialité) : ils ne servent ici qu'à l'affichage.
  const all = (
    await prisma.activity.findMany({
      where: { userId, type: { in: [...RUN_TYPES] } },
      orderBy: { startDate: "asc" },
      select: { id: true, name: true, startDate: true, distance: true, movingTime: true, totalElevation: true, polyline: true, isRace: true },
    })
  ).map((a) => ({ ...a, polyline: privatePolyline(a.polyline, zone) }));
  if (!all.length) {
    return <Empty title={t("nothingYet")} body={t("nothingBody")} />;
  }

  const years = [...new Set(all.map((r) => r.startDate.getFullYear()))].sort((a, b) => b - a);
  const monthParam = params.m?.match(/^(\d{4})-(\d{2})$/);
  const year = monthParam ? Number(monthParam[1]) : Number(params.y) || years[0] || now.getFullYear();
  const month = monthParam ? Number(monthParam[2]) - 1 : null;

  const start = month != null ? new Date(year, month, 1) : new Date(year, 0, 1);
  const end = month != null ? new Date(year, month + 1, 1) : new Date(year + 1, 0, 1);
  const runs = all.filter((r) => r.startDate >= start && r.startDate < end);
  const periodLabel = month != null ? `${MONTHS_LONG[month]} ${year}` : String(year);
  const ongoing = now >= start && now < end;

  const km = runs.reduce((a, r) => a + r.distance, 0) / 1000;
  const hours = runs.reduce((a, r) => a + r.movingTime, 0) / 3600;
  const elevation = runs.reduce((a, r) => a + r.totalElevation, 0);
  const activeDays = new Set(runs.map((r) => r.startDate.toDateString())).size;

  const longest = runs.reduce<(typeof runs)[number] | null>((a, r) => (!a || r.distance > a.distance ? r : a), null);
  const fastest = runs
    .filter((r) => r.distance >= 3000)
    .reduce<(typeof runs)[number] | null>(
      (a, r) => (!a || pacePerKm(r.distance, r.movingTime) < pacePerKm(a.distance, a.movingTime) ? r : a),
      null
    );
  const highest = runs.reduce<(typeof runs)[number] | null>((a, r) => (!a || r.totalElevation > a.totalElevation ? r : a), null);
  const week = bestWeek(runs);
  const streak = longestDayStreak(runs.map((r) => r.startDate));
  const when = whenYouRun(runs);
  const months = month == null ? monthlyKm(runs, year) : null;
  const bestMonth = months ? months.indexOf(Math.max(...months)) : -1;
  const heatmap = month == null ? yearHeatmap(runs, year, locale) : null;

  const [records, strength] = await Promise.all([
    prisma.bestEffort.findMany({
      where: { prRank: 1, startDate: { gte: start, lt: end }, activity: { userId } },
      orderBy: { distance: "asc" },
      select: { name: true, movingTime: true, distance: true, startDate: true, activityId: true },
    }),
    prisma.strengthWorkout.findMany({
      where: { userId, date: { gte: start, lt: end } },
      include: { sets: true },
    }),
  ]);
  const strengthTonnage = strength.reduce((a, w) => a + tonnage(w.sets), 0);

  // Strava marque « record » l'effort qui l'était à sa date : un 5 km battu
  // trois fois dans l'année apparaît trois fois. On garde le dernier (le
  // meilleur) et le nombre de fois où la barre a bougé.
  const recordRows = [
    ...records
      .reduce((map, r) => {
        const cur = map.get(r.name);
        if (!cur || r.movingTime < cur.best.movingTime) map.set(r.name, { best: r, count: (cur?.count ?? 0) + 1 });
        else cur.count++;
        return map;
      }, new Map<string, { best: (typeof records)[number]; count: number }>())
      .values(),
  ].sort((a, b) => a.best.distance - b.best.distance);

  // Mois disponibles pour l'année affichée
  const monthsWithRuns = [...new Set(all.filter((r) => r.startDate.getFullYear() === year).map((r) => r.startDate.getMonth()))].sort(
    (a, b) => a - b
  );

  const cmpKm = cmp(distanceComparisonParts(km));
  const cmpElev = cmp(elevationComparisonParts(elevation));
  const maxCell = Math.max(1, ...when.grid.flat());

  return (
    <article className="recap">
      {/* ------------------------------------------------ Sélecteur */}
      <nav className="print:hidden mb-10 flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-hair pb-4" aria-label={t("period")}>
        <span className="eyebrow">{t("title")}</span>
        <div className="flex flex-wrap gap-1">
          {years.map((y) => (
            <Link
              key={y}
              href={`/recap?y=${y}`}
              className={`rounded-[6px] border px-2.5 py-1 text-[0.8125rem] ${
                y === year && month == null ? "border-clay/40 bg-clay/10 font-medium text-clay" : "border-transparent text-ink2 hover:text-ink"
              }`}
            >
              {y}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {monthsWithRuns.map((m) => (
            <Link
              key={m}
              href={`/recap?m=${year}-${String(m + 1).padStart(2, "0")}`}
              className={`rounded-[6px] border px-2 py-1 text-micro ${
                m === month ? "border-clay/40 bg-clay/10 font-medium text-clay" : "border-transparent text-ink3 hover:text-ink"
              }`}
            >
              {MONTHS[m]}
            </Link>
          ))}
        </div>
        <div className="ml-auto">
          <PrintButton />
        </div>
      </nav>

      {runs.length === 0 ? (
        <Empty title={t("noRunsIn", { period: periodLabel })} body={t("otherPeriod")} />
      ) : (
        <>
          {/* ------------------------------------------------ Le chiffre */}
          <header className="rise">
            <div className="text-micro font-medium uppercase tracking-[0.18em] text-clay">
              {periodLabel}
              {ongoing && ` · ${t("ongoing")}`}
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="font-semibold leading-[0.82] tracking-[-0.06em] tabular-nums text-[clamp(5.5rem,19vw,15rem)]">
                {nf(Math.round(km))}
              </span>
              <span className="text-[clamp(1.5rem,4vw,3rem)] font-medium tracking-tight text-ink3">km</span>
            </div>
            <p className="mt-6 max-w-3xl text-[clamp(1.2rem,2.4vw,1.75rem)] font-medium leading-snug tracking-[-0.01em]">
              {t("ranIn", { n: runs.length })}
              {cmpKm && (
                <>
                  {" "}
                  — <span className="text-clay">{cmpKm}</span>
                </>
              )}
              .
            </p>
          </header>

          <div className="mt-12 grid grid-cols-2 gap-y-8 border-y border-hair py-8 md:grid-cols-4">
            <Fig value={fmtHours(hours)} label={t("moving")} />
            <Fig value={`${nf(Math.round(elevation))} m`} label={cmpElev ? t("elevGainCmp", { cmp: cmpElev }) : t("elevGain")} />
            <Fig value={String(activeDays)} label={t("runDays", { s: activeDays > 1 ? "s" : "" })} />
            <Fig value={fmtPace(pacePerKm(km * 1000, hours * 3600))} label={t("avgPace")} />
          </div>

          {/* ------------------------------------------------ Le trait */}
          <section className="mt-16">
            <h2 className="text-[clamp(1.5rem,3vw,2.25rem)] font-semibold tracking-[-0.02em]">
              {month != null ? t("yourMonth") : t("yourYear")} · {t("inTraits", { n: runs.length })}
            </h2>
            <p className="mt-2 text-[0.9375rem] text-ink2">{t("traitsNote")}</p>
            <div className="mt-8 grid grid-cols-6 gap-x-2 gap-y-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
              {runs.map((r, i) => (
                <Link
                  key={r.id}
                  href={`/activities/${r.id}`}
                  prefetch={false}
                  title={`${fmtDateShort(r.startDate, locale)} · ${(r.distance / 1000).toFixed(1)} km`}
                  className={`rise flex aspect-square items-center justify-center transition-colors hover:text-clay ${r.isRace ? "text-clay" : "text-ink"}`}
                  style={{ animationDelay: `${Math.min(i, 60) * 15}ms` }}
                >
                  <RouteGlyph polyline={r.polyline} size={56} strokeWidth={1.4} dot={false} />
                </Link>
              ))}
            </div>
          </section>

          {heatmap && (
            <section className="mt-16">
              <h2 className="text-[clamp(1.5rem,3vw,2.25rem)] font-semibold tracking-[-0.02em]">
                {t("yearGlance")}
              </h2>
              <p className="mt-2 text-[0.9375rem] text-ink2">
                {t("yearGlanceNote", { year, pct: Math.round(heatmap.activeRate * 100) })}
                {heatmap.bestStreak > 1 && ` · ${t("bestWeekStreak", { n: heatmap.bestStreak })}`}.
              </p>
              <div className="mt-8">
                <ConsistencyHeatmap grid={heatmap} />
              </div>
            </section>
          )}

          <div className="mt-16 grid gap-14 lg:grid-cols-2">
            {/* -------------------------------------------- Mois par mois */}
            {months ? (
              <section>
                <h3 className="eyebrow">{t("monthByMonth")}</h3>
                <p className="mt-2 text-[0.9375rem]">
                  {t.rich("bestMonth", {
                    month: MONTHS_LONG[bestMonth],
                    km: Math.round(months[bestMonth]),
                    b: (c) => <span className="font-medium">{c}</span>,
                  })}
                </p>
                <div className="mt-6 flex h-[180px] items-end gap-1.5">
                  {months.map((v, i) => {
                    const max = Math.max(1, ...months);
                    return (
                      <Link
                        key={i}
                        href={`/recap?m=${year}-${String(i + 1).padStart(2, "0")}`}
                        className="group flex h-full flex-1 flex-col items-center justify-end gap-2"
                        title={`${MONTHS_LONG[i]} : ${v} km`}
                      >
                        {v > 0 && <span className="font-mono text-[10px] text-ink3 group-hover:text-ink">{Math.round(v)}</span>}
                        <span
                          className="w-full rounded-t-[3px] transition-colors"
                          style={{
                            height: `${Math.max(v > 0 ? 3 : 1, (v / max) * 130)}px`,
                            background: i === bestMonth ? "rgb(var(--clay))" : v > 0 ? "rgb(var(--ink) / 0.8)" : "rgb(var(--hair))",
                          }}
                        />
                        <span className="text-[10px] text-ink3">{MONTHS[i].slice(0, 1).toUpperCase()}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ) : (
              <section>
                <h3 className="eyebrow">{t("weekByWeek")}</h3>
                {week && (
                  <p className="mt-2 text-[0.9375rem]">
                    {t("bestWeek", { date: fmtDateShort(week.start, locale), km: Math.round(week.km) })}
                  </p>
                )}
              </section>
            )}

            {/* -------------------------------------------- Quand */}
            <section>
              <h3 className="eyebrow">{t("whenYouRun")}</h3>
              <p className="mt-2 text-[0.9375rem]">
                {when.favoriteSlot != null &&
                  t.rich("whenSentence", {
                    persona: t(`persona.${when.favoriteSlot}`),
                    pct: Math.round(when.share * 100),
                    from: when.slots[when.favoriteSlot].split("–")[0],
                    to: when.slots[when.favoriteSlot].split("–")[1],
                    day: DAY_NAMES[when.favoriteDay!],
                    b: (c) => <span className="font-medium">{c}</span>,
                  })}
              </p>
              <div className="mt-6 grid grid-cols-[70px_repeat(6,minmax(0,1fr))] items-center gap-y-1.5">
                <span />
                {when.slots.map((s) => (
                  <span key={s} className="text-center text-[10px] text-ink3">
                    {s}
                  </span>
                ))}
                {when.grid.map((row, d) => (
                  <Row key={d} day={DAY_NAMES[d]} row={row} max={maxCell} />
                ))}
              </div>
            </section>
          </div>

          {/* ------------------------------------------------ Moments */}
          <section className="mt-16">
            <h2 className="text-[clamp(1.5rem,3vw,2.25rem)] font-semibold tracking-[-0.02em]">{t("moments")}</h2>
            <div className="mt-8 grid gap-px overflow-hidden rounded-card border border-hair bg-hair sm:grid-cols-2 lg:grid-cols-3">
              {longest && (
                <Moment
                  href={`/activities/${longest.id}`}
                  label={t("longest")}
                  value={`${(longest.distance / 1000).toFixed(1)} km`}
                  note={`${fmtDate(longest.startDate, locale)} · ${fmtDuration(longest.movingTime)}`}
                  polyline={longest.polyline}
                />
              )}
              {fastest && (
                <Moment
                  href={`/activities/${fastest.id}`}
                  label={t("fastest")}
                  value={fmtPace(pacePerKm(fastest.distance, fastest.movingTime))}
                  note={`${fmtDate(fastest.startDate, locale)} · ${(fastest.distance / 1000).toFixed(1)} km`}
                  polyline={fastest.polyline}
                />
              )}
              {highest && highest.totalElevation > 0 && (
                <Moment
                  href={`/activities/${highest.id}`}
                  label={t("highest")}
                  value={`${Math.round(highest.totalElevation)} m D+`}
                  note={`${fmtDate(highest.startDate, locale)} · ${(highest.distance / 1000).toFixed(1)} km`}
                  polyline={highest.polyline}
                />
              )}
              {week && (
                <Moment label={t("biggestWeek")} value={`${Math.round(week.km)} km`} note={t("weekOf", { date: fmtDate(week.start, locale) })} />
              )}
              <Moment
                label={t("longestStreak")}
                value={t("days", { n: streak.days })}
                note={streak.end && streak.days > 1 ? t("streakUntil", { date: fmtDate(streak.end, locale) }) : t("streakRunning")}
              />
              {strength.length > 0 ? (
                <Moment
                  href="/strength"
                  label={t("strengthSide")}
                  value={t("sessions", { n: strength.length })}
                  note={t("lifted", { kg: nf(Math.round(strengthTonnage)) })}
                />
              ) : (
                <Moment label={t("avgTime")} value={fmtDuration((hours * 3600) / runs.length)} note={t("avgKm", { km: (km / runs.length).toFixed(1) })} />
              )}
            </div>
          </section>

          {/* ------------------------------------------------ Records */}
          {recordRows.length > 0 && (
            <section className="mt-16">
              <h2 className="text-[clamp(1.5rem,3vw,2.25rem)] font-semibold tracking-[-0.02em]">{t("recordsFell")}</h2>
              <div className="mt-6 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
                {recordRows.map(({ best: r, count }) => (
                  <Link
                    key={r.name}
                    href={`/activities/${r.activityId}`}
                    className="group flex items-baseline justify-between border-b border-hair py-3"
                  >
                    <span className="text-[0.9375rem]">
                      {r.name}
                      {count > 1 && <span className="ml-2 text-micro text-clay">{t("beaten", { n: count })}</span>}
                    </span>
                    <span className="flex items-baseline gap-3">
                      <span className="text-micro text-ink3">{fmtDateShort(r.startDate, locale)}</span>
                      <span className="font-mono text-[0.9375rem] font-medium group-hover:text-clay">{fmtDuration(r.movingTime)}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <footer className="mt-20 flex items-center justify-between border-t border-hair pt-5 text-micro text-ink3">
            <span className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M3 17c3.5 0 4.5-10 8-10s4.5 10 8 10" stroke="rgb(var(--clay))" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
              Foulée · {periodLabel}
            </span>
            <span>
              {t("stoppedAt", { date: fmtDate(ongoing ? now : new Date(end.getTime() - 1), locale) })}
            </span>
          </footer>
        </>
      )}
    </article>
  );
}

function fmtHours(h: number): string {
  const whole = Math.floor(h);
  const min = Math.round((h - whole) * 60);
  return `${whole} h ${String(min).padStart(2, "0")}`;
}

function Fig({ value, label }: { value: string; label: string }) {
  return (
    <div className="pr-4">
      <div className="display text-d3">{value}</div>
      <div className="mt-1.5 text-[0.8125rem] leading-snug text-ink2">{label}</div>
    </div>
  );
}

function Row({ day, row, max }: { day: string; row: number[]; max: number }) {
  return (
    <>
      <span className="text-[0.8125rem] capitalize text-ink2">{day.slice(0, 3)}.</span>
      {row.map((v, i) => (
        <span key={i} className="flex h-7 items-center justify-center">
          <span
            className="rounded-full"
            style={{
              width: v ? 6 + (v / max) * 18 : 4,
              height: v ? 6 + (v / max) * 18 : 4,
              background: v ? `rgb(var(--clay) / ${0.35 + (v / max) * 0.65})` : "rgb(var(--hair))",
            }}
            title={`${v} sortie${v > 1 ? "s" : ""}`}
          />
        </span>
      ))}
    </>
  );
}

function Moment({
  label,
  value,
  note,
  href,
  polyline,
}: {
  label: string;
  value: string;
  note: string;
  href?: string;
  polyline?: string | null;
}) {
  const body = (
    <>
      <div className="min-w-0">
        <div className="eyebrow">{label}</div>
        <div className="display mt-3 text-d3">{value}</div>
        <div className="mt-2 text-micro text-ink3">{note}</div>
      </div>
      {polyline && <RouteGlyph polyline={polyline} size={64} className="shrink-0 text-ink2" />}
    </>
  );
  const cls = "flex items-start justify-between gap-4 bg-bg p-6 transition-colors";
  return href ? (
    <Link href={href} className={`${cls} hover:bg-panel`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
