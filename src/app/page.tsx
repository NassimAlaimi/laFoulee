import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Empty, Hint, NightBand, PageHead, Section } from "@/components/ui/Layout";
import { RouteGlyph } from "@/components/route/RouteGlyph";
import { seasonSentence } from "@/lib/narrative";
import { Metric, MetricBand, Row } from "@/components/ui/Metric";
import { MiniBars, Sparkline } from "@/components/ui/Spark";
import { InsightList } from "@/components/InsightList";
import { TrainingCalendar } from "@/components/TrainingCalendar";
import { SyncButton } from "@/components/SyncButton";
import { UpNext } from "@/components/training/UpNext";
import { TodayHero } from "@/components/TodayHero";
import { TodayLog } from "@/components/log/TodayLog";
import { GettingStarted } from "@/components/help/GettingStarted";
import {
  AcwrChart,
  ElevationChart,
  FormChart,
  HrZoneBars,
  LoadChart,
  PaceHrScatter,
  PaceProgressionChart,
  VolumeChart,
} from "@/components/charts/Lazy";
import { fmtDateShort, fmtDuration, fmtPace, pacePerKm } from "@/lib/format";
import { buildInsights } from "@/lib/insights";
import { getBestEfforts, getRuns, getSettings, getStravaAccount } from "@/lib/queries";
import { fitnessProfile, isMaximalEffort, personalRecords } from "@/lib/records";
import {
  formSeries,
  formHeadline,
  formSummary,
  plannedLoad,
  ZONE_LABEL as FORM_LABEL,
  ZONE_TONE as FORM_TONE,
} from "@/lib/fitness-model";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { vdotLevel } from "@/lib/vdot";
import { activityMarks } from "@/lib/race-marks";
import {
  ACWR_LABELS,
  acwrSeries,
  compareTrend,
  daysBetween,
  estimateMaxHr,
  hrZones,
  monthlyProgression,
  paceHrScatter,
  trimLeadingEmpty,
  periodStats,
  weeklyVolume,
} from "@/lib/stats";

export const dynamic = "force-dynamic";

const ZONE_TONE: Record<string, string> = {
  insufficient: "text-ink3",
  detraining: "text-slate",
  optimal: "text-sage",
  caution: "text-ochre",
  danger: "text-rust",
};

export default async function SummaryPage() {
  const t = await getTranslations("home");
  const tc = await getTranslations("common");
  const locale = await getLocale();

  const user = await requireUser();
  const userId = user.id;
  const [runs, efforts, settings, account, todayLog, goalCount, logDays] = await Promise.all([
    getRuns(undefined, userId),
    getBestEfforts(userId),
    getSettings(userId),
    getStravaAccount(userId),
    prisma.dailyLog.findFirst({
      where: { userId, date: new Date(new Date().setHours(0, 0, 0, 0)) },
    }),
    prisma.raceGoal.count({ where: { userId } }),
    prisma.dailyLog.count({ where: { userId } }),
  ]);
  const gettingStarted = (
    <GettingStarted
      stravaConnected={Boolean(account)}
      hasRuns={runs.length > 0}
      hasGoal={goalCount > 0}
      logDays={logDays}
    />
  );

  if (!account && runs.length === 0) {
    return (
      <>
        <PageHead title={t("ui.summary")} />
        {gettingStarted}
        <Empty
          title={t("ui.emptyStravaTitle")}
          body={t("ui.emptyStravaBody")}
          action={
            <Link href="/settings" className="btn-solid">
              {t("ui.configure")}
            </Link>
          }
        />
      </>
    );
  }

  if (runs.length === 0) {
    return (
      <>
        <PageHead title={t("ui.summary")} />
        {gettingStarted}
        <Empty
          title={t("ui.emptyRunsTitle")}
          body={t("ui.emptyRunsBody")}
          action={
            <Link href="/settings" className="btn-solid">
              {t("ui.syncNow")}
            </Link>
          }
        />
      </>
    );
  }

  const now = new Date();
  const within = (d: number) => runs.filter((r) => daysBetween(r.startDate, now) <= d);
  const between = (a: number, b: number) =>
    runs.filter((r) => {
      const d = daysBetween(r.startDate, now);
      return d > a && d <= b;
    });

  const week = periodStats(within(7));
  const weekPrev = periodStats(between(7, 14));
  const month = periodStats(within(28));
  const monthPrev = periodStats(between(28, 56));

  const weekly = weeklyVolume(runs, 12, now);
  const load = acwrSeries(runs, 90, now);
  const current = load[load.length - 1];

  // Condition / fatigue / fraîcheur, prolongées par les séances planifiées.
  const planned = await prisma.plannedSession.findMany({
    where: {
      date: { gt: now },
      status: "planned",
      plan: { userId, status: "active" },
    },
    select: { date: true, distanceKm: true, durationMin: true, intensity: true, kind: true },
  });
  const series = formSeries({
    activities: runs,
    days: 120,
    now,
    future: planned.map((p) => ({ date: p.date, load: plannedLoad(p) })),
    maxHr: settings.maxHr ?? undefined,
    restHr: settings.restHr ?? undefined,
  });
  const form = formSummary(series, now);
  const formRows = series.map((p) => ({
    label: p.label,
    ctl: p.ctl,
    atl: p.atl,
    tsb: p.tsb,
    projected: p.projected,
    ctlPast: p.projected ? null : p.ctl,
    ctlFuture: p.projected ? p.ctl : null,
    tsbPast: p.projected ? null : p.tsb,
    tsbFuture: p.projected ? p.tsb : null,
  }));
  const progression = trimLeadingEmpty(monthlyProgression(runs, 12), (m) => m.sessions === 0);
  const scatter = paceHrScatter(within(28));

  const maxHr = settings.maxHr ?? estimateMaxHr(runs, settings.birthYear);
  const zones = hrZones(within(28), maxHr);

  const records = personalRecords(efforts, runs);
  const profile = fitnessProfile(records, 365, now);
  const level = vdotLevel(profile.vdot);
  const marks = activityMarks({ races: runs, records, now });

  const insights = buildInsights({
    runs,
    load,
    profile,
    records,
    weeklyGoalKm: settings.weeklyKmGoal,
    maxHr,
    now,
  });

  const majors = records.filter((r) => r.major && r.seconds);
  const headline = form ? formHeadline(form, current.ready ? current.zone : undefined) : null;
  const sentence = seasonSentence(runs, now);
  const recent = runs.slice(0, 8);
  const glyphs = new Map(
    (
      await prisma.activity.findMany({
        where: { id: { in: recent.map((r) => r.id) }, userId },
        select: { id: true, polyline: true },
      })
    ).map((a) => [a.id, a.polyline])
  );

  const loadBlock = (
    <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div>
        <div className="flex items-baseline gap-2.5">
          <span className="display text-d1">{current.ready ? current.ratio.toFixed(2) : "—"}</span>
        </div>
        <div className={`mt-2 text-sm font-medium ${ZONE_TONE[current.zone]}`}>
          {tc(ACWR_LABELS[current.zone])}
        </div>
        <div className="mt-6">
          <Row label={t("ui.acute")} value={current.acute.toFixed(0)} />
          <Row label={t("ui.chronic")} value={current.chronic.toFixed(0)} />
          <Row label={t("ui.volume28")} value={`${month.km} km`} />
          <Row label={t("ui.vma")} value={profile.vma > 0 ? `${profile.vma} km/h` : "—"} />
          <Row label={t("ui.maxHr")} value={`${maxHr} bpm`} note={settings.maxHr ? t("ui.typed") : t("ui.estimated")} />
        </div>
      </div>
      <div className="space-y-8">
        <LoadChart data={load} />
        <AcwrChart data={load} />
      </div>
    </div>
  );

  return (
    <>
      <h1 className="sr-only">{t("ui.summary")}</h1>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-micro text-ink3">
          {t("ui.meta", { n: runs.length, date: fmtDateShort(runs[0].startDate, locale) })}
        </p>
        <SyncButton />
      </div>

      {sentence && (
        <p className="rise mb-8 max-w-3xl text-[clamp(1.05rem,2vw,1.375rem)] font-medium leading-snug tracking-[-0.01em]">
          {sentence.map((p) => t(p.key, p.params)).join(", ")}.
        </p>
      )}

      {gettingStarted}

      <TodayHero userId={userId} firstname={user.firstname} runs={runs} now={now} form={form ? { tsb: form.tsb, zone: form.zone } : null} />

      <TodayLog log={todayLog} />

      {/* ---------------------------------------------------------- Chiffres */}
      <MetricBand>
        <Metric
          label={t("ui.volume7")}
          value={week.km}
          unit="km"
          trend={compareTrend(week.km, weekPrev.km)}
          note={t("ui.goalNote", { km: settings.weeklyKmGoal })}
          visual={<MiniBars data={weekly.slice(-8).map((w) => w.km)} />}
        />
        <Metric
          label={t("ui.sessions")}
          value={week.sessions}
          trend={compareTrend(week.sessions, weekPrev.sessions)}
          note={t("ui.hours", { h: week.timeHours })}
          visual={<MiniBars data={weekly.slice(-8).map((w) => w.sessions)} />}
        />
        <Metric
          label={t("ui.avgPace")}
          value={fmtPace(week.avgPace, "")}
          unit="/km"
          trend={compareTrend(week.avgPace, weekPrev.avgPace)}
          lowerIsBetter
          note={week.avgHr ? `${week.avgHr} bpm` : undefined}
          visual={<Sparkline data={weekly.slice(-8).map((w) => -w.avgPace)} />}
        />
        <Metric
          label={t("ui.fitnessLevel")}
          value={profile.vdot > 0 ? profile.vdotDisplay : "—"}
          unit="VDOT"
          note={profile.source ? `${level.label} · ${profile.source.name}` : undefined}
        />
      </MetricBand>

      <div className="mt-14 space-y-14">
        <UpNext now={now} userId={userId} />

        <Section
          title={t("ui.dataSay")}
          note={t("ui.dataSayNote")}
        >
          <InsightList insights={insights} />
        </Section>

        {!form && (
          <Section
            title={t("ui.loadTitle")}
            note={t("ui.loadNote")}
          >
            {loadBlock}
          </Section>
        )}
      </div>

      {/* ------------------------------------------------ Bande « forme » */}
      {form && headline && (
        <NightBand className="mt-16" id="forme">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] lg:gap-14">
            <div className="flex flex-col">
              <div className="text-micro font-medium uppercase tracking-[0.16em] text-clay">
                {t("ui.stateToday")}
              </div>
              <h2 className="mt-4 text-[clamp(2.1rem,4.4vw,3.4rem)] font-semibold leading-[0.96] tracking-[-0.035em]">
                {t(headline.titleKey)}
              </h2>
              <p className="mt-4 max-w-md text-[0.9375rem] leading-relaxed text-ink2">
                {headline.bodyParts.map((p) => t(p.key, p.params)).join(" ")}
              </p>

              <div className="mt-8 grid grid-cols-3 border-t border-hair">
                <NightFig
                  label={t("ui.freshness")}
                  value={`${form.tsb > 0 ? "+" : ""}${Math.round(form.tsb)}`}
                  note={tc(FORM_LABEL[form.zone])}
                  tone={FORM_TONE[form.zone]}
                  big
                />
                <NightFig label={t("ui.condition")} value={String(Math.round(form.ctl))} note={`${form.rampPerWeek > 0 ? "+" : ""}${form.rampPerWeek}/sem`} />
                <NightFig label={t("ui.fatigue")} value={String(Math.round(form.atl))} note={t("ui.last7")} />
              </div>
              <div className="grid grid-cols-3 border-t border-hair">
                <NightFig
                  label={t("ui.loadRatio")}
                  value={current.ready ? current.ratio.toFixed(2) : "—"}
                  note={tc(ACWR_LABELS[current.zone])}
                  tone={ZONE_TONE[current.zone]}
                />
                <NightFig label={t("ui.volume28d")} value={`${month.km}`} note="km" />
                <NightFig label="VMA" value={profile.vma > 0 ? String(profile.vma) : "—"} note={t("ui.vmaEst")} />
              </div>
              <div className="mt-8">
                <Link href="/analysis" className="btn-outline">
                  {t("ui.detailed")}
                </Link>
              </div>
            </div>

            <div className="min-w-0">
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <span className="eyebrow">{t("ui.ctfTitle")}</span>
                <span className="text-micro text-ink3">{t("ui.ctfNote")}</span>
              </div>
              <FormChart data={formRows} height={300} marks={marks} />
              <div className="mt-10 grid gap-8 sm:grid-cols-2">
                <div>
                  <div className="eyebrow mb-3">{t("ui.acuteChronic")}</div>
                  <LoadChart data={load} />
                </div>
                <div>
                  <div className="eyebrow mb-3">{t("ui.ratioTitle")}</div>
                  <AcwrChart data={load} />
                </div>
              </div>
            </div>
          </div>
        </NightBand>
      )}

      <div className="mt-16 space-y-14">
        <Section title={t("ui.calendar")} note={t("ui.last26")}>
          <TrainingCalendar activities={runs} weeks={26} now={now} />
        </Section>

        <Section title={t("ui.weeklyVolume")} note={t("ui.last12")}>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <VolumeChart data={weekly} goalKm={settings.weeklyKmGoal} />
            <div>
              <div className="eyebrow mb-3">{t("ui.elevation")}</div>
              <ElevationChart data={weekly} />
            </div>
          </div>
        </Section>

        <Section title={t("ui.paceAndHr")}>
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <div className="eyebrow mb-3">{t("ui.prog12")}</div>
              {progression.filter((p) => p.avgPace).length >= 2 ? (
                <PaceProgressionChart data={progression} />
              ) : (
                <Hint height={220}>{t("ui.need2Months")}</Hint>
              )}
            </div>
            <div>
              <div className="eyebrow mb-3">
                {t("ui.efficiency28")}
                <span className="ml-2 font-normal normal-case tracking-normal text-ink3">
                  {t("ui.scatterHint")}
                </span>
              </div>
              {scatter.length >= 3 ? (
                <PaceHrScatter data={scatter} />
              ) : (
                <Hint height={220}>{t("ui.need3Hr")}</Hint>
              )}
            </div>
          </div>
        </Section>

        <Section title={t("ui.split")}>
          <div className="grid gap-10 lg:grid-cols-3">
            <div>
              <div className="eyebrow mb-4">{t("ui.zones28")}</div>
              {zones.some((z) => z.seconds > 0) ? (
                <HrZoneBars zones={zones} />
              ) : (
                <Hint height={180}>{t("ui.noHr")}</Hint>
              )}
            </div>

            <div>
              <div className="eyebrow mb-4">{t("ui.vsPrev")}</div>
              <Compare label={t("ui.cVolume")} now={`${month.km} km`} was={`${monthPrev.km} km`} />
              <Compare label={t("ui.sessions")} now={String(month.sessions)} was={String(monthPrev.sessions)} />
              <Compare label={t("ui.cTime")} now={`${month.timeHours} h`} was={`${monthPrev.timeHours} h`} />
              <Compare label={t("ui.cPace")} now={fmtPace(month.avgPace)} was={fmtPace(monthPrev.avgPace)} />
              <Compare
                label={t("ui.cAvgHr")}
                now={month.avgHr ? `${month.avgHr} bpm` : "—"}
                was={monthPrev.avgHr ? `${monthPrev.avgHr} bpm` : "—"}
              />
              <Compare label={t("ui.elevation")} now={`${month.elevation} m`} was={`${monthPrev.elevation} m`} />
              <Compare label={t("ui.cLongest")} now={`${month.longestRunKm} km`} was={`${monthPrev.longestRunKm} km`} />
            </div>

            <div>
              <div className="mb-4 flex items-baseline justify-between">
                <span className="eyebrow">{t("ui.records")}</span>
                <Link href="/records" className="text-micro text-ink2 hover:text-clay">
                  {t("ui.seeAll")}
                </Link>
              </div>
              {majors.map((r) => (
                <div key={r.key} className="flex items-baseline justify-between border-b border-hair py-2.5 last:border-b-0">
                  <span className="flex items-center gap-2 text-[0.8125rem]">
                    {r.name}
                    {!isMaximalEffort(r.vdot, profile.vdot) && (
                      <span className="tag" title={t("ui.casualTitle")}>
                        {t("ui.casual")}
                      </span>
                    )}
                  </span>
                  <span className="flex items-baseline gap-2.5">
                    <span className="text-micro text-ink3">{fmtPace(r.pace!)}</span>
                    <span className="num font-medium">{fmtDuration(r.seconds!)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section
          title={t("ui.recent")}
          action={
            <Link href="/activities" className="btn-quiet">
              {t("ui.allActivities")}
            </Link>
          }
        >
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-10" aria-label={t("ui.trace")} />
                  <th>{t("ui.date")}</th>
                  <th>{t("ui.session")}</th>
                  <th className="text-right">{t("ui.km")}</th>
                  <th className="text-right">{t("ui.time")}</th>
                  <th className="text-right">{t("ui.pace")}</th>
                  <th className="hidden text-right sm:table-cell">{t("ui.hr")}</th>
                  <th className="hidden text-right sm:table-cell">{t("ui.elev")}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="text-ink2">
                      <RouteGlyph polyline={glyphs.get(r.id)} size={30} strokeWidth={1.3} dot={false} />
                    </td>
                    <td className="whitespace-nowrap text-ink2">{fmtDateShort(r.startDate, locale)}</td>
                    <td>
                      <Link href={`/activities/${r.id}`} className="inline-block max-w-[280px] truncate align-middle hover:text-clay">
                        {r.name}
                      </Link>
                    </td>
                    <td className="num text-right">{(r.distance / 1000).toFixed(2)}</td>
                    <td className="num text-right">{fmtDuration(r.movingTime)}</td>
                    <td className="num text-right">{fmtPace(pacePerKm(r.distance, r.movingTime), "")}</td>
                    <td className="num hidden text-right text-ink2 sm:table-cell">{r.averageHr ? Math.round(r.averageHr) : "—"}</td>
                    <td className="num hidden text-right text-ink2 sm:table-cell">{Math.round(r.totalElevation)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </>
  );
}

/** Chiffre de la bande « forme » : grand, avec son étiquette et sa note. */
function NightFig({
  label,
  value,
  note,
  tone = "",
  big = false,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: string;
  big?: boolean;
}) {
  return (
    <div className="border-l border-hair py-5 pl-4 first:border-l-0 first:pl-0">
      <div className="eyebrow">{label}</div>
      <div className={`display mt-2.5 ${big ? "text-d2" : "text-d3"} ${tone}`}>{value}</div>
      {note && <div className={`mt-1.5 text-micro ${tone || "text-ink3"}`}>{note}</div>}
    </div>
  );
}

function Compare({ label, now, was }: { label: string; now: string; was: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-hair py-2 last:border-b-0">
      <span className="text-[0.8125rem] text-ink2">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="text-micro text-ink3">{was}</span>
        <span className="text-micro text-ink3" aria-hidden>
          →
        </span>
        <span className="text-[0.8125rem] font-medium">{now}</span>
      </span>
    </div>
  );
}
