import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Section } from "@/components/ui/Layout";
import { Metric, MetricBand, Row } from "@/components/ui/Metric";
import { ActivityRoute, type RouteGeometry } from "@/components/route/ActivityRoute";
import { ActivityJournal } from "@/components/route/ActivityJournal";
import { RouteGlyph } from "@/components/route/RouteGlyph";
import { KeyNav } from "@/components/KeyNav";
import { fmtDateShort, fmtDistance, fmtDuration, fmtPace, fmtSigned, pacePerKm, speedToPace } from "@/lib/format";
import { detectIntervals } from "@/lib/intervals";
import { aerobicDecoupling, decodeStream } from "@/lib/cardio";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { getSettings } from "@/lib/queries";
import { RUN_TYPES } from "@/lib/strava";
import { kmSegments, niceScale, routeSignature, sameRoute } from "@/lib/polyline";
import { estimateMaxHr, round, trainingLoad } from "@/lib/stats";
import { vdotFromPerformance } from "@/lib/vdot";
import { KIND_LABELS, type SessionKind } from "@/lib/workouts";

export const dynamic = "force-dynamic";

const MAP_W = 720;
const MAP_H = 440;

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("activity");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const { id } = await params;
  const userId = await requireUserId();

  const [activity, settings] = await Promise.all([
    prisma.activity.findFirst({
      where: { id, userId },
      include: {
        splits: { orderBy: { index: "asc" } },
        bestEfforts: { orderBy: { distance: "asc" } },
        hrStream: true,
        plannedSession: { include: { plan: { select: { id: true, name: true } } } },
      },
    }),
    getSettings(userId),
  ]);
  if (!activity) notFound();

  const isRun = RUN_TYPES.has(activity.type);

  // Voisines chronologiques + candidates « même parcours » en une requête
  const siblings = await prisma.activity.findMany({
    where: { userId, type: isRun ? { in: [...RUN_TYPES] } : activity.type },
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      name: true,
      startDate: true,
      distance: true,
      movingTime: true,
      averageHr: true,
      polyline: true,
    },
  });
  const pos = siblings.findIndex((s) => s.id === activity.id);
  const newer = pos > 0 ? siblings[pos - 1] : null;
  const older = pos >= 0 && pos < siblings.length - 1 ? siblings[pos + 1] : null;

  const gear = activity.gearId
    ? await prisma.gear.findFirst({
        where: { userId, stravaGearId: activity.gearId },
        select: { name: true, brand: true, model: true },
      })
    : null;

  const pace = pacePerKm(activity.distance, activity.movingTime);
  const maxHr = settings.maxHr ?? estimateMaxHr([], settings.birthYear);

  // ------------------------------------------------------------ Tracé
  const seg = kmSegments(activity.polyline, activity.distance, MAP_W, MAP_H, 34);
  const geometry: RouteGeometry | null = seg.segments.length
    ? {
        w: MAP_W,
        h: MAP_H,
        segments: seg.segments,
        markers: seg.markers,
        start: seg.start,
        end: seg.end,
        scaleBar: niceScale(seg.pxPerMeter, MAP_W * 0.16),
      }
    : null;

  const splits = activity.splits.map((s) => ({
    index: s.index,
    meters: s.distance,
    pace: s.averageSpeed ? speedToPace(s.averageSpeed) : pacePerKm(s.distance, s.movingTime),
    hr: s.averageHr ? Math.round(s.averageHr) : null,
    elevation: s.elevationDiff,
    movingTime: s.movingTime,
  }));

  // ------------------------------------------------------------ Analyse
  const paces = splits.filter((s) => s.meters > 500).map((s) => s.pace);
  const meanPace = paces.reduce((a, b) => a + b, 0) / (paces.length || 1);
  const stdDev = paces.length
    ? Math.sqrt(paces.reduce((a, p) => a + (p - meanPace) ** 2, 0) / paces.length)
    : 0;

  const withHr = splits.filter((s) => s.hr && s.meters > 500);
  let drift: number | null = null;
  if (withHr.length >= 4) {
    // Efficience (vitesse / FC) de la 2e moitié vs la 1re : isole la dérive
    // cardiaque des variations d'allure, contrairement à la FC brute.
    const half = Math.floor(withHr.length / 2);
    const eff = (arr: typeof withHr) =>
      arr.reduce((a, s) => a + 1000 / s.pace / (s.hr ?? 1), 0) / arr.length;
    drift = round(((eff(withHr.slice(0, half)) - eff(withHr.slice(half))) / eff(withHr.slice(0, half))) * 100, 1);
  }

  // Négative split : 2e moitié plus rapide que la 1re
  let splitDelta: number | null = null;
  if (splits.length >= 4) {
    const half = Math.floor(splits.length / 2);
    const t = (arr: typeof splits) =>
      arr.reduce((a, s) => a + s.movingTime, 0) / (arr.reduce((a, s) => a + s.meters, 0) / 1000);
    splitDelta = Math.round(t(splits.slice(half)) - t(splits.slice(0, half)));
  }

  const load = trainingLoad(activity, { maxHr, restHr: settings.restHr });
  const vdot = isRun ? vdotFromPerformance(activity.distance, activity.movingTime) : 0;

  // ------------------------------------------------------------ Intervalles
  const interval =
    isRun && activity.splits.length >= 4
      ? detectIntervals(
          activity.splits.map((s) => ({ distance: s.distance, seconds: s.movingTime }))
        )
      : null;

  // ------------------------------------------------------------ Cardio profond
  const hrStream = activity.hrStream?.series
    ? decodeStream(activity.hrStream.series)
    : null;
  const decoupling = hrStream ? aerobicDecoupling(hrStream) : null;

  // ------------------------------------------------------------ Même parcours
  const sig = routeSignature(activity.polyline);
  const sameRouteRuns = sig.length
    ? siblings.filter(
        (s) =>
          s.id !== activity.id &&
          sameRoute(activity, s, sig, routeSignature(s.polyline))
      )
    : [];
  const routeHistory = sameRouteRuns.length
    ? [...sameRouteRuns, activity]
        .map((s) => ({ ...s, pace: pacePerKm(s.distance, s.movingTime) }))
        .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
    : [];
  const routeRank = routeHistory.length
    ? [...routeHistory].sort((a, b) => a.pace - b.pace).findIndex((s) => s.id === activity.id) + 1
    : 0;

  // Rang parmi les sorties de distance comparable (±15 %)
  const comparable = siblings.filter(
    (s) => s.distance > 0 && Math.abs(s.distance / activity.distance - 1) <= 0.15
  );
  const compRank =
    [...comparable]
      .sort((a, b) => pacePerKm(a.distance, a.movingTime) - pacePerKm(b.distance, b.movingTime))
      .findIndex((s) => s.id === activity.id) + 1;

  const planned = activity.plannedSession;

  return (
    <div>
      <KeyNav
        left={older ? `/activities/${older.id}` : undefined}
        right={newer ? `/activities/${newer.id}` : undefined}
        escape="/activities"
      />

      {/* ------------------------------------------------ En-tête */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/activities" className="text-micro uppercase tracking-[0.1em] text-ink3 hover:text-clay">
            ← Activités
          </Link>
          <h1 className="mt-2 text-[1.75rem] font-semibold tracking-[-0.02em]">{activity.name}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-ink2">
            <span className="inline-block first-letter:uppercase">
              {activity.startDate.toLocaleDateString(locale, {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}{" "}
              ·{" "}
              {activity.startDate.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="tag">{activity.sportType ?? activity.type}</span>
            {activity.isRace && <span className="tag border-clay/40 text-clay">course</span>}
            {planned && (
              <span className="tag border-sage/40 text-sage">
                plan · {tc(KIND_LABELS[planned.kind as SessionKind] ?? `kind.${planned.kind}`)}
              </span>
            )}
            {gear && <span className="text-micro text-ink3">chaussures · {gear.name}</span>}
          </p>
        </div>
        <nav className="flex items-center gap-1" aria-label="Séances voisines">
          <NeighbourLink href={older ? `/activities/${older.id}` : null} label={t("previous")} dir="←" hint={older ? fmtDateShort(older.startDate, locale) : undefined} />
          <NeighbourLink href={newer ? `/activities/${newer.id}` : null} label={t("next")} dir="→" hint={newer ? fmtDateShort(newer.startDate, locale) : undefined} />
        </nav>
      </div>

      <MetricBand>
        <Metric label={t("distance")} value={(activity.distance / 1000).toFixed(2)} unit="km" size="d2" />
        <Metric label={t("time")} value={fmtDuration(activity.movingTime)} size="d2" />
        <Metric label={t("pace")} value={fmtPace(pace, "")} unit="/km" size="d2" />
        <Metric
          label={activity.averageHr ? t("avgHr") : t("elevation")}
          value={activity.averageHr ? Math.round(activity.averageHr) : Math.round(activity.totalElevation)}
          unit={activity.averageHr ? "bpm" : "m D+"}
          note={
            activity.averageHr
              ? `${Math.round((activity.averageHr / maxHr) * 100)} % FCmax · ${Math.round(activity.totalElevation)} m D+`
              : undefined
          }
          size="d2"
        />
      </MetricBand>

      <div className="mt-10 space-y-10">
        {/* ---------------------------------------------- Parcours */}
        {(geometry || splits.length > 0) && (
          <Section title={t("route")}>
            <ActivityRoute
              geometry={geometry}
              splits={splits}
              avgPace={pace}
              summary={{
                pace,
                time: activity.movingTime,
                hr: activity.averageHr,
                elevation: activity.totalElevation,
                km: activity.distance / 1000,
              }}
            />
          </Section>
        )}

        {/* ---------------------------------------------- Prévu vs fait */}
        {planned && (
          <Section
            title={t("plannedVsDone")}
            note={`Séance « ${planned.title} » du plan ${planned.plan.name}, validée automatiquement par cette activité.`}
            action={
              <Link href={`/training/${planned.plan.id}`} className="btn-quiet">
                Voir le plan →
              </Link>
            }
          >
            <div className="grid gap-x-10 sm:grid-cols-3">
              <PlanCompare
                label={t("distance")}
                planned={planned.distanceKm > 0 ? `${round(planned.distanceKm, 1)} km` : "—"}
                actual={`${round(activity.distance / 1000, 1)} km`}
                delta={planned.distanceKm > 0 ? activity.distance / 1000 / planned.distanceKm - 1 : null}
                t={t}
              />
              <PlanCompare
                label={t("duration")}
                planned={planned.durationMin ? `${planned.durationMin} min` : "—"}
                actual={`${Math.round(activity.movingTime / 60)} min`}
                delta={planned.durationMin ? activity.movingTime / 60 / planned.durationMin - 1 : null}
                t={t}
              />
              <PlanCompare
                label={t("pace")}
                planned={planned.paceTarget ? fmtPace(planned.paceTarget) : t("free")}
                actual={fmtPace(pace)}
                delta={planned.paceTarget ? planned.paceTarget / pace - 1 : null}
                paceMode
                t={t}
              />
            </div>
          </Section>
        )}

        {/* ---------------------------------------------- Contexte */}
        {(routeHistory.length > 1 || comparable.length > 2) && (
          <Section
            title={t("context")}
            note={t("contextNote")}
          >
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              {routeHistory.length > 1 ? (
                <div>
                  <div className="mb-3 flex items-baseline justify-between">
                    <span className="eyebrow">Sur ce parcours · {routeHistory.length} passages</span>
                    <span className="text-micro text-ink3">
                      {routeRank === 1 ? t("bestPass") : t("rankPass", { rank: routeRank })}
                    </span>
                  </div>
                  <RouteHistory rows={routeHistory} current={activity.id} />
                </div>
              ) : (
                <div className="flex items-center gap-4 text-[0.8125rem] text-ink3">
                  <RouteGlyph polyline={activity.polyline} size={56} stroke="rgb(var(--ink-3))" />
                  Premier passage sur ce parcours : les prochains y seront comparés.
                </div>
              )}
              {comparable.length > 2 && (
                <div>
                  <div className="eyebrow mb-3">
                    Sorties de {round((activity.distance * 0.85) / 1000, 0)} à {round((activity.distance * 1.15) / 1000, 0)} km
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="display text-d2">{compRank}</span>
                    <span className="text-sm text-ink2">
                      {compRank === 1 ? "ʳᵉ" : "ᵉ"} sur {comparable.length} en allure
                    </span>
                  </div>
                  <RankDots total={comparable.length} rank={compRank} />
                </div>
              )}
            </div>
          </Section>
        )}

        {/* ---------------------------------------------- Données + analyse */}
        <div className="grid gap-10 lg:grid-cols-2">
          <Section title={t("sessionData")}>
            <Row label={t("elapsed")} value={fmtDuration(activity.elapsedTime)} />
            <Row label={t("stopped")} value={fmtDuration(activity.elapsedTime - activity.movingTime)} />
            <Row label={t("maxSpeed")} value={activity.maxSpeed ? fmtPace(speedToPace(activity.maxSpeed)) : "—"} />
            <Row label={t("maxHr")} value={activity.maxHr ? `${Math.round(activity.maxHr)} bpm` : "—"} />
            <Row label={t("cadence")} value={activity.averageCadence ? t("stepsPerMin", { n: Math.round(activity.averageCadence) }) : "—"} />
            <Row label={t("elevation")} value={`${Math.round(activity.totalElevation)} m`} />
            <Row label={t("calories")} value={activity.calories ? `${Math.round(activity.calories)} kcal` : "—"} />
          </Section>

          <Section title={t("analysis")}>
            <Row label={t("load")} value={Math.round(load)} note={activity.averageHr ? t("trimp") : t("equivKm")} />
            {isRun && (
              <Row label={t("sessionVdot")} value={vdot > 0 ? vdot.toFixed(1) : "—"} note={activity.isRace ? t("race") : t("run")} />
            )}
            <Row
              label={t("consistency")}
              value={stdDev > 0 ? `± ${Math.round(stdDev)} s/km` : "—"}
              tone={stdDev === 0 ? "default" : stdDev < 10 ? "sage" : stdDev < 25 ? "ochre" : "rust"}
              note={stdDev === 0 ? undefined : stdDev < 10 ? t("veryRegular") : stdDev < 25 ? t("ok") : t("irregular")}
            />
            <Row
              label={t("split")}
              value={
                splitDelta === null
                  ? "—"
                  : Math.abs(splitDelta) < 3
                    ? t("even")
                    : `${splitDelta > 0 ? "+" : "−"}${Math.abs(splitDelta)} s/km`
              }
              tone={splitDelta === null ? "default" : splitDelta < -2 ? "sage" : splitDelta > 15 ? "ochre" : "default"}
              note={
                splitDelta === null ? undefined : splitDelta < -2 ? t("negativeSplit") : splitDelta > 2 ? t("positiveSplit") : undefined
              }
            />
            {!decoupling && (
              <Row
                label={t("hrDrift")}
                value={drift !== null ? `${drift > 0 ? "+" : ""}${drift} %` : "—"}
                tone={drift === null ? "default" : drift < 5 ? "sage" : drift < 10 ? "ochre" : "rust"}
                note={drift === null ? undefined : drift < 5 ? t("solidEndurance") : drift < 10 ? t("moderateDrift") : t("strongDrift")}
              />
            )}
            <Row label={t("stravaSuffer")} value={activity.sufferScore ? Math.round(activity.sufferScore) : "—"} />
            <p className="mt-3 text-micro leading-relaxed text-ink3">
              Le découplage compare l&apos;efficience (vitesse ÷ FC) de la seconde moitié à
              la première. Sous 5 %, la base aérobie tient la durée de la séance.
            </p>
          </Section>
        </div>

        {/* ---------------------------------------------- Courbe cardiaque */}
        {hrStream && hrStream.hr.length > 4 && (
          <Section
            title={t("hrCurve")}
            note={t("hrCurveNote")}
          >
            <HrCurveChart stream={hrStream} maxHr={maxHr} />
            {decoupling && (
              <div className="mt-5 grid gap-4 border-t border-hair pt-4 sm:grid-cols-4">
                <Metric
                  label={t("aerobicDecoupling")}
                  value={fmtSigned(decoupling.drift, 1, " %")}
                  note={decoupling.drift < 5 ? t("solidEndurance") : decoupling.drift < 10 ? t("moderateDrift") : t("strongDrift")}
                />
                <Metric
                  label={t("efficiency")}
                  value={decoupling.efficiency}
                  note={t("mPerBeat")}
                />
                <Metric label={t("avgHr")} value={`${decoupling.avgHr} bpm`} note={t("stableMins", { n: Math.round(decoupling.samples / 60) })} />
                <Metric label={t("stableSpeed")} value={fmtPace(Math.round((1000 / decoupling.avgSpeed) * 10) / 10)} />
              </div>
            )}
          </Section>
        )}

        {/* ---------------------------------------------- Intervalles */}
        {interval?.detected && interval.summary && (
          <Section
            title={t("intervals")}
            note={t("intervalsNote")}
          >
            <div className="flex flex-wrap gap-8">
              <Metric
                label={t("reps")}
                value={String(interval.summary.count)}
                note={`≈ ${fmtDistance(interval.summary.repDistance)} par fraction`}
              />
              <Metric
                label={t("avgIntervalPace")}
                value={fmtPace(interval.summary.avgPace)}
                note={`${fmtPace(interval.summary.bestPace)} au mieux`}
              />
              <Metric
                label={t("consistency")}
                value={`± ${interval.summary.cv} %`}
                note={interval.summary.cv < 3 ? t("veryRegular") : interval.summary.cv < 6 ? t("ok") : t("dispersed")}
              />
              <Metric
                label={t("fatigue")}
                value={fmtSigned(interval.summary.fatigue, 1, "%")}
                note={interval.summary.fatigue > 4 ? t("slowFinish") : interval.summary.fatigue < -2 ? t("fastFinish") : t("heldThrough")}
              />
              {interval.summary.recoveryPace !== null && (
                <Metric label={t("recovery")} value={fmtPace(interval.summary.recoveryPace)} note={t("jogPace")} />
              )}
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th className="text-right">Allure</th>
                    <th className="text-right">Écart au meilleur</th>
                    <th className="text-right">Temps</th>
                  </tr>
                </thead>
                <tbody>
                  {interval.reps.map((r, i) => (
                    <tr key={r.splitIndex}>
                      <td className="text-ink3">{i + 1}</td>
                      <td className="text-right font-mono">{fmtPace(r.pace)}</td>
                      <td className="text-right font-mono">
                        {r.pace - interval.summary!.bestPace <= 0.5 ? (
                          <span className="text-sage">meilleur</span>
                        ) : (
                          `+${Math.round(r.pace - interval.summary!.bestPace)} s`
                        )}
                      </td>
                      <td className="text-right font-mono">{fmtDuration(r.seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* ---------------------------------------------- Meilleurs efforts */}
        {activity.bestEfforts.length > 0 && (
          <Section title={t("bestEfforts")}>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("segment")}</th>
                    <th className="text-right">Temps</th>
                    <th className="text-right">Allure</th>
                    <th className="text-right">VDOT</th>
                    <th className="text-right">Record</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.bestEfforts.map((e) => (
                    <tr key={e.id}>
                      <td>{e.name}</td>
                      <td className="num text-right font-medium">{fmtDuration(e.movingTime)}</td>
                      <td className="num text-right text-ink2">{fmtPace(pacePerKm(e.distance, e.movingTime), "")}</td>
                      <td className="num text-right text-ink2">{vdotFromPerformance(e.distance, e.movingTime).toFixed(1)}</td>
                      <td className="text-right">
                        {e.prRank === 1 ? (
                          <span className="tag border-clay/40 text-clay">record</span>
                        ) : e.prRank ? (
                          <span className="tag">{e.prRank}ᵉ meilleur</span>
                        ) : (
                          <span className="text-ink3">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* ---------------------------------------------- Carnet */}
        <Section
          title={t("journal")}
          note={t("journalNote")}
        >
          <ActivityJournal
            id={activity.id}
            initial={{
              privateNote: activity.privateNote,
              perceivedExertion: activity.perceivedExertion,
              feeling: activity.feeling,
              isRace: activity.isRace,
            }}
          />
          {activity.notes && (
            <div className="mt-6 border-l-2 border-hairStrong pl-4">
              <div className="eyebrow mb-1.5">Strava</div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink2">{activity.notes}</p>
            </div>
          )}
        </Section>

        <p className="text-center text-micro text-ink3">
          <kbd className="kbd">←</kbd> <kbd className="kbd">→</kbd> {t("kbdPrevNext")} ·{" "}
          <kbd className="kbd">Échap</kbd> {t("kbdBack")}
        </p>
      </div>
    </div>
  );
}

function NeighbourLink({
  href,
  label,
  dir,
  hint,
}: {
  href: string | null;
  label: string;
  dir: string;
  hint?: string;
}) {
  if (!href) {
    return (
      <span className="btn-outline pointer-events-none opacity-35" aria-disabled>
        {dir === "←" && dir} {label} {dir === "→" && dir}
      </span>
    );
  }
  return (
    <Link href={href} className="btn-outline" title={hint}>
      {dir === "←" && <span aria-hidden>←</span>}
      <span>
        {label}
        {hint && <span className="ml-1.5 text-micro text-ink3">{hint}</span>}
      </span>
      {dir === "→" && <span aria-hidden>→</span>}
    </Link>
  );
}

function PlanCompare({
  label,
  planned,
  actual,
  delta,
  paceMode = false,
  t,
}: {
  label: string;
  planned: string;
  actual: string;
  delta: number | null;
  paceMode?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  // Pour l'allure, delta > 0 = plus rapide que prévu
  const pct = delta === null ? null : Math.round(delta * 100);
  const tone =
    pct === null || Math.abs(pct) <= 5 ? "text-sage" : Math.abs(pct) <= 12 ? "text-ochre" : "text-rust";
  return (
    <div className="border-b border-hair py-3 sm:border-b-0">
      <div className="eyebrow">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-sm text-ink3 line-through decoration-hairStrong">{planned}</span>
        <span className="text-ink3" aria-hidden>→</span>
        <span className="display text-d4">{actual}</span>
      </div>
      {pct !== null && (
        <div className={`mt-1 text-micro font-medium ${tone}`}>
          {Math.abs(pct) <= 2
            ? t("conforme")
            : paceMode
              ? t("vsPlanned", { pct: Math.abs(pct), dir: pct > 0 ? t("faster") : t("slower") })
              : `${pct > 0 ? "+" : "−"}${Math.abs(pct)} % vs prévu`}
        </div>
      )}
    </div>
  );
}

function RouteHistory({
  rows,
  current,
}: {
  rows: Array<{ id: string; startDate: Date; pace: number; movingTime: number; averageHr: number | null; distance: number }>;
  current: string;
}) {
  const best = Math.min(...rows.map((r) => r.pace));
  const worst = Math.max(...rows.map((r) => r.pace));
  const span = worst - best || 1;
  return (
    <div>
      {rows.slice(0, 8).map((r) => {
        const on = r.id === current;
        const w = 30 + (1 - (r.pace - best) / span) * 70;
        return (
          <Link
            key={r.id}
            href={`/activities/${r.id}`}
            className={`group grid grid-cols-[72px_minmax(0,1fr)_64px_48px] items-center gap-3 border-b border-hair py-2 text-[0.8125rem] last:border-b-0 ${
              on ? "font-medium" : "text-ink2 hover:text-ink"
            }`}
          >
            <span className="whitespace-nowrap">{fmtDateShort(r.startDate)}</span>
            <span className="h-[5px] rounded-full bg-sunken">
              <span
                className="block h-full rounded-full transition-all"
                style={{
                  width: `${w}%`,
                  background: on ? "rgb(var(--clay))" : r.pace === best ? "rgb(var(--sage))" : "rgb(var(--hair-strong))",
                }}
              />
            </span>
            <span className="num text-right">{fmtPace(r.pace, "")}</span>
            <span className="num text-right text-ink3">{r.averageHr ? Math.round(r.averageHr) : "—"}</span>
          </Link>
        );
      })}
    </div>
  );
}

function RankDots({ total, rank }: { total: number; rank: number }) {
  return (
    <div className="mt-4 flex flex-wrap gap-1" aria-hidden>
      {Array.from({ length: Math.min(total, 60) }, (_, i) => (
        <span
          key={i}
          className="h-2.5 w-2.5 rounded-full"
          style={{
            background: i + 1 === rank ? "rgb(var(--clay))" : i + 1 < rank ? "rgb(var(--ink-3))" : "rgb(var(--hair-strong))",
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Courbe FC

const HR_ZONE_STEPS = [0.5, 0.6, 0.7, 0.8, 0.9];
const HR_ZONE_COLORS = [
  "rgb(var(--sage) / 0.10)",
  "rgb(var(--slate) / 0.10)",
  "rgb(var(--ochre) / 0.10)",
  "rgb(var(--clay) / 0.12)",
  "rgb(var(--rust) / 0.12)",
];

/**
 * Profil FC de la séance : polyline du cœur, zones en fond, axe temps.
 * Sous-échantillonné à ~400 points pour un SVG léger.
 */
function HrCurveChart({
  stream,
  maxHr,
}: {
  stream: ReturnType<typeof decodeStream>;
  maxHr: number;
}) {
  const W = 720;
  const H = 200;
  const PAD = 6;
  const n = stream.hr.length;
  const step = Math.max(1, Math.floor(n / 400));
  const pts: Array<{ x: number; y: number }> = [];
  const tMax = Math.max(1, stream.time[n - 1] ?? 1);
  const hrMax = Math.max(maxHr, ...stream.hr.slice(0, n).filter((h) => h > 0), 120);
  const hrMin = Math.min(...stream.hr.filter((h) => h > 0), 90);

  for (let i = 0; i < n; i += step) {
    const hr = stream.hr[i];
    if (hr <= 0) continue;
    pts.push({
      x: PAD + (stream.time[i] / tMax) * (W - 2 * PAD),
      y: H - PAD - ((hr - hrMin) / (hrMax - hrMin)) * (H - 2 * PAD),
    });
  }
  if (pts.length === 0) return null;

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Profil de fréquence cardiaque de la séance">
      {HR_ZONE_STEPS.map((f, i) => {
        const y = H - PAD - ((f * maxHr - hrMin) / (hrMax - hrMin)) * (H - 2 * PAD);
        if (y < 0 || y > H) return null;
        return (
          <g key={f}>
            <rect x={PAD} y={Math.min(y, H - PAD)} width={W - 2 * PAD} height={Math.max(0, H - PAD - Math.min(y, H - PAD))} fill={HR_ZONE_COLORS[i]} />
            <line x1={PAD} x2={W - PAD} y1={y} y2={y} stroke="rgb(var(--hair))" strokeWidth="1" />
          </g>
        );
      })}
      <path d={line} fill="none" stroke="rgb(var(--clay))" strokeWidth="1.6" strokeLinejoin="round" />
      <text x={W - PAD} y={H - 2} fontSize="9" textAnchor="end" fill="rgb(var(--ink-3))">
        {Math.round(tMax / 60)} min
      </text>
    </svg>
  );
}
