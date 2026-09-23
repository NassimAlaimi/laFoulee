import Link from "next/link";
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
  const user = await requireUser();
  const userId = user.id;
  const [runs, efforts, settings, account] = await Promise.all([
    getRuns(undefined, userId),
    getBestEfforts(userId),
    getSettings(userId),
    getStravaAccount(userId),
  ]);

  if (!account && runs.length === 0) {
    return (
      <>
        <PageHead title="Résumé" />
        <Empty
          title="Connecte ton compte Strava"
          body="Relie ton compte pour importer tes courses. Toutes les analyses sont calculées à partir de ces données."
          action={
            <Link href="/settings" className="btn-solid">
              Configurer
            </Link>
          }
        />
      </>
    );
  }

  if (runs.length === 0) {
    return (
      <>
        <PageHead title="Résumé" />
        <Empty
          title="Aucune course importée"
          body="Ton compte est connecté mais aucune activité n'a encore été synchronisée."
          action={
            <Link href="/settings" className="btn-solid">
              Synchroniser
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
        <div className={`mt-2 text-sm font-medium ${ZONE_TONE[current.zone]}`}>{ACWR_LABELS[current.zone]}</div>
        <div className="mt-6">
          <Row label="Charge aiguë · 7 j" value={current.acute.toFixed(0)} />
          <Row label="Charge chronique · 28 j" value={current.chronic.toFixed(0)} />
          <Row label="Volume · 28 j" value={`${month.km} km`} />
          <Row label="VMA estimée" value={profile.vma > 0 ? `${profile.vma} km/h` : "—"} />
          <Row label="FC max" value={`${maxHr} bpm`} note={settings.maxHr ? "saisie" : "estimée"} />
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
      <h1 className="sr-only">Résumé</h1>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-micro text-ink3">
          {runs.length} courses · dernière sortie {fmtDateShort(runs[0].startDate)}
        </p>
        <SyncButton />
      </div>

      {sentence && (
        <p className="rise mb-8 max-w-3xl text-[clamp(1.05rem,2vw,1.375rem)] font-medium leading-snug tracking-[-0.01em]">
          {sentence}
        </p>
      )}

      <TodayHero userId={userId} firstname={user.firstname} runs={runs} now={now} form={form ? { tsb: form.tsb, zone: form.zone } : null} />

      {/* ---------------------------------------------------------- Chiffres */}
      <MetricBand>
        <Metric
          label="Volume · 7 jours"
          value={week.km}
          unit="km"
          trend={compareTrend(week.km, weekPrev.km)}
          note={`objectif ${settings.weeklyKmGoal}`}
          visual={<MiniBars data={weekly.slice(-8).map((w) => w.km)} />}
        />
        <Metric
          label="Séances"
          value={week.sessions}
          trend={compareTrend(week.sessions, weekPrev.sessions)}
          note={`${week.timeHours} h`}
          visual={<MiniBars data={weekly.slice(-8).map((w) => w.sessions)} />}
        />
        <Metric
          label="Allure moyenne"
          value={fmtPace(week.avgPace, "")}
          unit="/km"
          trend={compareTrend(week.avgPace, weekPrev.avgPace)}
          lowerIsBetter
          note={week.avgHr ? `${week.avgHr} bpm` : undefined}
          visual={<Sparkline data={weekly.slice(-8).map((w) => -w.avgPace)} />}
        />
        <Metric
          label="Niveau de forme"
          value={profile.vdot > 0 ? profile.vdotDisplay : "—"}
          unit="VDOT"
          note={profile.source ? `${level.label} · ${profile.source.name}` : undefined}
        />
      </MetricBand>

      <div className="mt-14 space-y-14">
        <UpNext now={now} userId={userId} />

        <Section
          title="Ce que disent tes données"
          note="Observations générées à partir de tes 8 dernières semaines. Chaque ligne indique la mesure qui la justifie."
        >
          <InsightList insights={insights} />
        </Section>

        {!form && (
          <Section
            title="Charge d'entraînement"
            note="La charge aiguë (7 jours) comparée à la charge chronique (28 jours) indique si ta progression est soutenable."
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
              <div className="text-micro font-medium uppercase tracking-[0.16em] text-clay">État de forme · aujourd&apos;hui</div>
              <h2 className="mt-4 text-[clamp(2.1rem,4.4vw,3.4rem)] font-semibold leading-[0.96] tracking-[-0.035em]">
                {headline.title}
              </h2>
              <p className="mt-4 max-w-md text-[0.9375rem] leading-relaxed text-ink2">{headline.body}</p>

              <div className="mt-8 grid grid-cols-3 border-t border-hair">
                <NightFig
                  label="Fraîcheur"
                  value={`${form.tsb > 0 ? "+" : ""}${Math.round(form.tsb)}`}
                  note={FORM_LABEL[form.zone]}
                  tone={FORM_TONE[form.zone]}
                  big
                />
                <NightFig label="Condition" value={String(Math.round(form.ctl))} note={`${form.rampPerWeek > 0 ? "+" : ""}${form.rampPerWeek}/sem`} />
                <NightFig label="Fatigue" value={String(Math.round(form.atl))} note="7 derniers jours" />
              </div>
              <div className="grid grid-cols-3 border-t border-hair">
                <NightFig
                  label="Charge 7 j / 28 j"
                  value={current.ready ? current.ratio.toFixed(2) : "—"}
                  note={ACWR_LABELS[current.zone]}
                  tone={ZONE_TONE[current.zone]}
                />
                <NightFig label="Volume 28 j" value={`${month.km}`} note="km" />
                <NightFig label="VMA" value={profile.vma > 0 ? String(profile.vma) : "—"} note="km/h estimée" />
              </div>
              <div className="mt-8">
                <Link href="/analysis" className="btn-outline">
                  Analyse détaillée →
                </Link>
              </div>
            </div>

            <div className="min-w-0">
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <span className="eyebrow">Condition · fatigue · fraîcheur</span>
                <span className="text-micro text-ink3">120 jours, puis projection du plan en pointillés</span>
              </div>
              <FormChart data={formRows} height={300} />
              <div className="mt-10 grid gap-8 sm:grid-cols-2">
                <div>
                  <div className="eyebrow mb-3">Charge aiguë et chronique</div>
                  <LoadChart data={load} />
                </div>
                <div>
                  <div className="eyebrow mb-3">Ratio aiguë / chronique</div>
                  <AcwrChart data={load} />
                </div>
              </div>
            </div>
          </div>
        </NightBand>
      )}

      <div className="mt-16 space-y-14">
        <Section title="Calendrier d'entraînement" note="26 dernières semaines">
          <TrainingCalendar activities={runs} weeks={26} now={now} />
        </Section>

        <Section title="Volume hebdomadaire" note="12 dernières semaines">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <VolumeChart data={weekly} goalKm={settings.weeklyKmGoal} />
            <div>
              <div className="eyebrow mb-3">Dénivelé</div>
              <ElevationChart data={weekly} />
            </div>
          </div>
        </Section>

        <Section title="Allure et cardio">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <div className="eyebrow mb-3">Progression sur 12 mois</div>
              {progression.filter((p) => p.avgPace).length >= 2 ? (
                <PaceProgressionChart data={progression} />
              ) : (
                <Hint height={220}>Au moins 2 mois de données nécessaires.</Hint>
              )}
            </div>
            <div>
              <div className="eyebrow mb-3">
                Efficience · 28 jours
                <span className="ml-2 font-normal normal-case tracking-normal text-ink3">
                  bas à gauche = plus rapide à FC plus basse
                </span>
              </div>
              {scatter.length >= 3 ? (
                <PaceHrScatter data={scatter} />
              ) : (
                <Hint height={220}>Au moins 3 séances avec cardio nécessaires.</Hint>
              )}
            </div>
          </div>
        </Section>

        <Section title="Répartition et comparatif">
          <div className="grid gap-10 lg:grid-cols-3">
            <div>
              <div className="eyebrow mb-4">Zones cardiaques · 28 jours</div>
              {zones.some((z) => z.seconds > 0) ? (
                <HrZoneBars zones={zones} />
              ) : (
                <Hint height={180}>Aucune donnée cardio sur la période.</Hint>
              )}
            </div>

            <div>
              <div className="eyebrow mb-4">28 jours vs période précédente</div>
              <Compare label="Volume" now={`${month.km} km`} was={`${monthPrev.km} km`} />
              <Compare label="Séances" now={String(month.sessions)} was={String(monthPrev.sessions)} />
              <Compare label="Temps" now={`${month.timeHours} h`} was={`${monthPrev.timeHours} h`} />
              <Compare label="Allure" now={fmtPace(month.avgPace)} was={fmtPace(monthPrev.avgPace)} />
              <Compare
                label="FC moyenne"
                now={month.avgHr ? `${month.avgHr} bpm` : "—"}
                was={monthPrev.avgHr ? `${monthPrev.avgHr} bpm` : "—"}
              />
              <Compare label="Dénivelé" now={`${month.elevation} m`} was={`${monthPrev.elevation} m`} />
              <Compare label="Plus longue" now={`${month.longestRunKm} km`} was={`${monthPrev.longestRunKm} km`} />
            </div>

            <div>
              <div className="mb-4 flex items-baseline justify-between">
                <span className="eyebrow">Records</span>
                <Link href="/records" className="text-micro text-ink2 hover:text-clay">
                  Tout voir
                </Link>
              </div>
              {majors.map((r) => (
                <div key={r.key} className="flex items-baseline justify-between border-b border-hair py-2.5 last:border-b-0">
                  <span className="flex items-center gap-2 text-[0.8125rem]">
                    {r.name}
                    {!isMaximalEffort(r.vdot, profile.vdot) && (
                      <span className="tag" title="Couru sous ton potentiel">
                        sortie
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
          title="Dernières sorties"
          action={
            <Link href="/activities" className="btn-quiet">
              Toutes les activités
            </Link>
          }
        >
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-10" aria-label="Tracé" />
                  <th>Date</th>
                  <th>Séance</th>
                  <th className="text-right">km</th>
                  <th className="text-right">Temps</th>
                  <th className="text-right">Allure</th>
                  <th className="hidden text-right sm:table-cell">FC</th>
                  <th className="hidden text-right sm:table-cell">D+</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="text-ink2">
                      <RouteGlyph polyline={glyphs.get(r.id)} size={30} strokeWidth={1.3} dot={false} />
                    </td>
                    <td className="whitespace-nowrap text-ink2">{fmtDateShort(r.startDate)}</td>
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
