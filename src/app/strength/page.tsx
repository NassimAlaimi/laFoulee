import { Hint, PageHead, Section, SectionHead } from "@/components/ui/Layout";
import { Metric, MetricBand } from "@/components/ui/Metric";
import { MiniBars } from "@/components/ui/Spark";
import { fmtDate, fmtDuration } from "@/lib/format";
import { getStrengthSessions } from "@/lib/queries";
import { compareTrend, daysBetween, weeklyVolume } from "@/lib/stats";

export const dynamic = "force-dynamic";

/**
 * Section musculation — v0.
 * Affiche les séances importées de Strava (WeightTraining, Workout, Crossfit…).
 * La suite ajoutera la saisie d'exercices : séries, reps, charge, 1RM estimé.
 */
export default async function StrengthPage() {
  const sessions = await getStrengthSessions();
  const now = new Date();

  const last28 = sessions.filter((s) => daysBetween(s.startDate, now) <= 28);
  const prev28 = sessions.filter((s) => {
    const d = daysBetween(s.startDate, now);
    return d > 28 && d <= 56;
  });
  const weekly = weeklyVolume(sessions, 12, now);

  const totalHours = sessions.reduce((a, s) => a + s.movingTime, 0) / 3600;
  const avgDuration = sessions.length
    ? sessions.reduce((a, s) => a + s.movingTime, 0) / sessions.length
    : 0;

  return (
    <div className="space-y-6">
      <PageHead
        title="Musculation"
        meta="Séances de renforcement synchronisées depuis Strava"
      />

      <div className="rounded-card border border-info/25 bg-info/6 px-4 py-3.5">
        <p className="text-sm font-medium text-sky-200">Section en construction</p>
        <p className="mt-1.5 text-xs leading-relaxed text-sky-200/75">
          Pour l&apos;instant cette page se limite aux séances remontées par Strava, qui
          ne contient ni exercices ni charges. La prochaine étape est un module de
          saisie : exercices, séries, répétitions et charge, avec 1RM estimé (Epley /
          Brzycki), volume par groupe musculaire et courbes de progression par
          mouvement.
        </p>
      </div>

      <MetricBand>
        <Metric
          label="Séances totales"
          value={sessions.length}
          visual={<MiniBars data={weekly.map((w) => w.sessions)} />}
        />
        <Metric
          label="Séances · 28 jours"
          value={last28.length}
          trend={compareTrend(last28.length, prev28.length)}
        />
        <Metric label="Temps cumulé" value={totalHours.toFixed(1)} unit="h" />
        <Metric
          label="Durée moyenne"
          value={avgDuration ? fmtDuration(avgDuration) : "—"}
        />
      </MetricBand>

      {sessions.length > 0 ? (
        <>
          <Section>
            <SectionHead title="Fréquence hebdomadaire" note="12 dernières semaines" />
            <div className="flex items-end gap-1.5" style={{ height: 120 }}>
              {weekly.map((w) => {
                const max = Math.max(1, ...weekly.map((x) => x.sessions));
                return (
                  <div
                    key={w.label}
                    className="group flex flex-1 flex-col items-center justify-end gap-2"
                    style={{ height: "100%" }}
                    title={`${w.sessions} séance(s)`}
                  >
                    <div
                      className="w-full rounded-t bg-violet transition-all group-hover:brightness-125"
                      style={{
                        height: `${Math.max(3, (w.sessions / max) * 88)}%`,
                        opacity: w.sessions ? 1 : 0.18,
                      }}
                    />
                    <span className="text-[9px] text-ink3">{w.label}</span>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section>
            <div className="px-5 py-4">
              <h2 className="section-title">Historique des séances</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Séance</th>
                    <th>Type</th>
                    <th className="text-right">Durée</th>
                    <th className="text-right">FC moy</th>
                    <th className="text-right">Effort</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.slice(0, 60).map((s) => (
                    <tr key={s.id}>
                      <td className="whitespace-nowrap text-ink2">
                        {fmtDate(s.startDate)}
                      </td>
                      <td className="max-w-[320px] truncate">{s.name}</td>
                      <td>
                        <span className="badge bg-sunken text-ink2">
                          {s.type}
                        </span>
                      </td>
                      <td className="text-right font-mono tabular-nums">
                        {fmtDuration(s.movingTime)}
                      </td>
                      <td className="text-right font-mono tabular-nums text-ink2">
                        {s.averageHr ? Math.round(s.averageHr) : "—"}
                      </td>
                      <td className="text-right font-mono tabular-nums text-ink2">
                        {s.sufferScore ? Math.round(s.sufferScore) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      ) : (
        <Hint height={180}>
          Aucune séance de musculation trouvée. Enregistre-les sur Strava en type
          « Musculation » ou « Entraînement », puis synchronise.
        </Hint>
      )}
    </div>
  );
}
