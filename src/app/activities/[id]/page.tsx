import Link from "next/link";
import { notFound } from "next/navigation";
import { Hint, Section, SectionHead } from "@/components/ui/Layout";
import { Row } from "@/components/ui/Metric";
import { SplitChart } from "@/components/charts/LazySplit";
import {
  fmtDate,
  fmtDuration,
  fmtPace,
  pacePerKm,
  speedToPace,
} from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { getSettings } from "@/lib/queries";
import { estimateMaxHr, round, trainingLoad } from "@/lib/stats";
import { vdotFromPerformance } from "@/lib/vdot";

export const dynamic = "force-dynamic";

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();

  const [activity, settings] = await Promise.all([
    prisma.activity.findFirst({
      where: { id, userId },
      include: {
        splits: { orderBy: { index: "asc" } },
        bestEfforts: { orderBy: { distance: "asc" } },
      },
    }),
    getSettings(userId),
  ]);

  if (!activity) notFound();

  const pace = pacePerKm(activity.distance, activity.movingTime);
  const maxHr = settings.maxHr ?? estimateMaxHr([], settings.birthYear);

  const splitRows = activity.splits.map((s) => ({
    index: s.index,
    km: round(s.distance / 1000, 2),
    pace: s.averageSpeed ? speedToPace(s.averageSpeed) : pacePerKm(s.distance, s.movingTime),
    hr: s.averageHr ? Math.round(s.averageHr) : null,
    elevation: s.elevationDiff,
    movingTime: s.movingTime,
  }));

  // Régularité : écart-type des allures au km, en secondes
  const paces = splitRows.map((s) => s.pace).filter((p) => p > 0);
  const meanPace = paces.reduce((a, b) => a + b, 0) / (paces.length || 1);
  const stdDev = paces.length
    ? Math.sqrt(
        paces.reduce((a, p) => a + (p - meanPace) ** 2, 0) / paces.length
      )
    : 0;

  // Dérive cardiaque : FC moyenne seconde moitié vs première moitié
  const withHr = splitRows.filter((s) => s.hr);
  let drift: number | null = null;
  if (withHr.length >= 4) {
    const half = Math.floor(withHr.length / 2);
    const first = withHr.slice(0, half);
    const second = withHr.slice(half);
    const avg = (arr: typeof withHr) =>
      arr.reduce((a, s) => a + (s.hr ?? 0), 0) / arr.length;
    drift = round(((avg(second) - avg(first)) / avg(first)) * 100, 1);
  }

  const load = trainingLoad(
    {
      id: activity.id,
      name: activity.name,
      type: activity.type,
      startDate: activity.startDate,
      distance: activity.distance,
      movingTime: activity.movingTime,
      elapsedTime: activity.elapsedTime,
      totalElevation: activity.totalElevation,
      averageSpeed: activity.averageSpeed,
      maxSpeed: activity.maxSpeed,
      averageHr: activity.averageHr,
      maxHr: activity.maxHr,
      sufferScore: activity.sufferScore,
      averageCadence: activity.averageCadence,
      isRace: activity.isRace,
    },
    { maxHr, restHr: settings.restHr }
  );

  const vdot = vdotFromPerformance(activity.distance, activity.movingTime);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/activities" className="text-xs text-ink3 hover:text-clay">
          ← Activités
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <h1 className="text-[1.6rem] font-semibold tracking-tight ">
            {activity.isRace && <span className="mr-2">🏁</span>}
            {activity.name}
          </h1>
          <span className="badge bg-sunken text-ink2">
            {activity.sportType ?? activity.type}
          </span>
        </div>
        <p className="mt-1 text-sm text-ink2">
          {fmtDate(activity.startDate)} à{" "}
          {activity.startDate.toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>

      {/* ------------------------------------------------ Chiffres clés */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <BigStat label="Distance" value={(activity.distance / 1000).toFixed(2)} unit="km" />
        <BigStat label="Temps" value={fmtDuration(activity.movingTime)} />
        <BigStat label="Allure" value={fmtPace(pace, "")} unit="/km" />
        <BigStat label="Dénivelé" value={Math.round(activity.totalElevation)} unit="m D+" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ------------------------------------------------ Splits */}
        <Section className="lg:col-span-2">
          <SectionHead title="Allure par kilomètre"
            note={
              splitRows.length
                ? "Vert = plus rapide que la moyenne de la séance"
                : undefined
            }
          />
          {splitRows.length ? (
            <SplitChart data={splitRows} avgPace={pace} />
          ) : (
            <Hint height={260}>
              Splits non disponibles — relance une synchronisation pour les importer.
            </Hint>
          )}
        </Section>

        {/* ------------------------------------------------ Détails */}
        <div className="space-y-4">
          <Section>
            <SectionHead title="Données de séance" />
            <div className="divide-y divide-hair/60">
              <Row label="Temps écoulé" value={fmtDuration(activity.elapsedTime)} />
              <Row
                label="Temps à l'arrêt"
                value={fmtDuration(activity.elapsedTime - activity.movingTime)}
              />
              <Row
                label="Vitesse max"
                value={activity.maxSpeed ? fmtPace(speedToPace(activity.maxSpeed)) : "—"}
              />
              <Row
                label="FC moyenne"
                value={activity.averageHr ? `${Math.round(activity.averageHr)} bpm` : "—"}
                note={
                  activity.averageHr
                    ? `${Math.round((activity.averageHr / maxHr) * 100)} % FCmax`
                    : undefined
                }
              />
              <Row
                label="FC max"
                value={activity.maxHr ? `${Math.round(activity.maxHr)} bpm` : "—"}
              />
              <Row
                label="Cadence"
                value={
                  activity.averageCadence
                    ? `${Math.round(activity.averageCadence)} pas/min`
                    : "—"
                }
              />
              <Row
                label="Calories"
                value={activity.calories ? `${Math.round(activity.calories)} kcal` : "—"}
              />
            </div>
          </Section>

          <Section>
            <SectionHead title="Analyse" />
            <div className="divide-y divide-hair/60">
              <Row label="Charge d'entraînement" value={Math.round(load)} />
              <Row
                label="Effort relatif Strava"
                value={activity.sufferScore ? Math.round(activity.sufferScore) : "—"}
              />
              <Row
                label="VDOT de la séance"
                value={vdot > 0 ? vdot.toFixed(1) : "—"}
                note={activity.isRace ? "course" : "sortie"}
              />
              <Row
                label="Régularité"
                value={stdDev > 0 ? `± ${Math.round(stdDev)} s/km` : "—"}
                tone={stdDev === 0 ? "default" : stdDev < 10 ? "sage" : stdDev < 25 ? "ochre" : "rust"}
                note={
                  stdDev === 0
                    ? undefined
                    : stdDev < 10
                      ? "très régulier"
                      : stdDev < 25
                        ? "correct"
                        : "irrégulier"
                }
              />
              <Row
                label="Dérive cardiaque"
                value={drift !== null ? `${drift > 0 ? "+" : ""}${drift} %` : "—"}
                tone={
                  drift === null
                    ? "default"
                    : drift < 3
                      ? "sage"
                      : drift < 8
                        ? "ochre"
                        : "rust"
                }
                note={
                  drift === null
                    ? undefined
                    : drift < 3
                      ? "bonne endurance"
                      : drift < 8
                        ? "fatigue modérée"
                        : "forte dérive"
                }
              />
            </div>
            <p className="mt-3 text-micro leading-relaxed text-ink3">
              La dérive cardiaque compare la FC de la seconde moitié à celle de la
              première, à allure comparable. Plus elle est basse, meilleure est
              l&apos;endurance aérobie.
            </p>
          </Section>
        </div>
      </div>

      {/* ------------------------------------------------ Best efforts */}
      {activity.bestEfforts.length > 0 && (
        <Section>
          <div className="px-5 py-4">
            <h2 className="section-title">Meilleurs efforts de cette séance</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Segment</th>
                  <th className="text-right">Temps</th>
                  <th className="text-right">Allure</th>
                  <th className="text-right">VDOT</th>
                  <th>Record</th>
                </tr>
              </thead>
              <tbody>
                {activity.bestEfforts.map((e) => (
                  <tr key={e.id}>
                    <td className="text-ink">{e.name}</td>
                    <td className="text-right font-mono font-medium tabular-nums ">
                      {fmtDuration(e.movingTime)}
                    </td>
                    <td className="text-right font-mono tabular-nums text-ink2">
                      {fmtPace(pacePerKm(e.distance, e.movingTime), "")}
                    </td>
                    <td className="text-right font-mono tabular-nums text-ink2">
                      {vdotFromPerformance(e.distance, e.movingTime).toFixed(1)}
                    </td>
                    <td>
                      {e.prRank === 1 ? (
                        <span className="badge bg-clay/15 text-clay">🏆 record</span>
                      ) : e.prRank ? (
                        <span className="badge bg-sunken text-ink2">
                          {e.prRank}ᵉ meilleur
                        </span>
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

      {activity.notes && (
        <Section>
          <SectionHead title="Notes" />
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink2">
            {activity.notes}
          </p>
        </Section>
      )}
    </div>
  );
}

function BigStat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | number;
  unit?: string;
}) {
  return (
    <div className="card card-pad">
      <div className="section-title">{label}</div>
      <div className="mt-2.5 flex items-baseline gap-1.5">
        <span className="display text-d3">{value}</span>
        {unit && <span className="text-sm text-ink3">{unit}</span>}
      </div>
    </div>
  );
}
