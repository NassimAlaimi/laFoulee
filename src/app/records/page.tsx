import Link from "next/link";
import { Empty, Hint, PageHead, Section } from "@/components/ui/Layout";
import { VdotChart } from "@/components/charts/Lazy";
import { fmtDate, fmtDuration, fmtPace } from "@/lib/format";
import { getBestEfforts, getRuns } from "@/lib/queries";
import {
  CONFIDENCE_LABELS,
  STANDARD_DISTANCES,
  fitnessProfile,
  isMaximalEffort,
  personalRecords,
  vdotHistory,
  type Confidence,
} from "@/lib/records";
import { enduranceIndex, racePrediction } from "@/lib/prediction";
import { currentFitness } from "@/lib/training";
import { danielsPaces, vdotLevel } from "@/lib/vdot";

export const dynamic = "force-dynamic";

const CONF_TONE: Record<Confidence, string> = {
  high: "text-sage",
  medium: "text-ochre",
  low: "text-ink3",
};

export default async function RecordsPage() {
  const [runs, efforts] = await Promise.all([getRuns(), getBestEfforts()]);

  if (runs.length === 0) {
    return (
      <>
        <PageHead title="Performance" />
        <Empty
          title="Pas encore de données"
          body="Synchronise tes activités Strava pour voir apparaître tes records, ton niveau de forme et tes prédictions."
          action={
            <Link href="/settings" className="btn-solid">
              Réglages
            </Link>
          }
        />
      </>
    );
  }

  const now = new Date();
  const records = personalRecords(efforts, runs);
  const profile = fitnessProfile(records, 365, now);
  const level = vdotLevel(profile.vdot);

  // Volume et sortie longue de référence : la MÊME mesure que le plan
  // d'entraînement et la page Objectifs (médiane des semaines actives).
  const fitness = currentFitness(runs, now);
  const endurance = enduranceIndex(records, profile.vdot);

  const preds = STANDARD_DISTANCES.map((d) => {
    const p = racePrediction(d.meters, {
      records,
      profile,
      weeklyKm: fitness.weeklyKm,
      longestRunKm: fitness.longestRunKm,
      endurance,
    });
    const record = records.find((r) => r.key === d.key);
    return p
      ? {
          ...p,
          key: d.key,
          name: d.name,
          major: d.major,
          currentRecord: record?.seconds ?? null,
        }
      : null;
  }).filter((p): p is NonNullable<typeof p> => p !== null);
  const history = vdotHistory(efforts, 12, now);
  const paces = profile.vdot > 0 ? danielsPaces(profile.vdot) : [];

  return (
    <>
      <PageHead
        title="Performance"
        meta={`${efforts.length} efforts chronométrés sur ${runs.length} courses`}
      />

      {/* ------------------------------------------------ Niveau */}
      <div className="grid gap-10 border-y border-hair py-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div>
          <div className="eyebrow">Niveau de forme</div>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="display text-d1">
              {profile.vdot > 0 ? profile.vdotDisplay : "—"}
            </span>
            <span className="text-sm text-ink3">VDOT</span>
          </div>
          <div className="mt-2.5 text-sm font-medium" style={{ color: level.color }}>
            {level.label}
          </div>

          {profile.source && (
            <div className="mt-6 border-t border-hair pt-4">
              <div className="eyebrow">Performance de référence</div>
              <p className="mt-2 text-[0.9375rem]">
                {profile.source.name} en{" "}
                <span className="font-mono font-medium">
                  {fmtDuration(profile.source.seconds!)}
                </span>
              </p>
              <p className="mt-1 text-[0.8125rem] text-ink2">
                {fmtPace(profile.source.pace!)} ·{" "}
                {profile.source.date ? fmtDate(profile.source.date) : "—"}
              </p>
            </div>
          )}

          <div className="mt-5 border-t border-hair pt-4 text-[0.8125rem]">
            <div className="flex justify-between py-1">
              <span className="text-ink2">VMA estimée</span>
              <span className="font-medium">
                {profile.vma > 0 ? `${profile.vma} km/h` : "—"}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-ink2">Volume hebdomadaire</span>
              <span className="font-medium">{fitness.weeklyKm} km</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-ink2">Indice d&apos;endurance</span>
              <span className="font-medium">
                {endurance.exponent.toFixed(3)}
                <span className="ml-1.5 text-micro text-ink3">{endurance.label}</span>
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-ink2">Sortie la plus longue</span>
              <span className="font-medium">{fitness.longestRunKm} km</span>
            </div>
          </div>

          <Link href="/calculator" className="btn-outline mt-6">
            Ouvrir le calculateur
          </Link>
        </div>

        <div>
          <div className="eyebrow mb-3">
            Évolution · meilleure performance glissante sur 90 jours
          </div>
          {history.some((h) => h.vdot !== null) ? (
            <VdotChart data={history} />
          ) : (
            <Hint height={200}>Pas encore assez d&apos;historique.</Hint>
          )}
        </div>
      </div>

      <div className="mt-10 space-y-10">
        {/* ------------------------------------------------ Records */}
        <Section
          title="Records personnels"
          note={
            <>
              Extraits des efforts chronométrés par Strava. Les lignes marquées{" "}
              <span className="tag">sortie</span> ont été courues nettement sous ton
              potentiel : ce sont des records par défaut, pas des efforts maximaux.
            </>
          }
        >
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Distance</th>
                  <th className="text-right">Chrono</th>
                  <th className="text-right">Allure</th>
                  <th className="text-right">VDOT</th>
                  <th>Date</th>
                  <th>Séance</th>
                </tr>
              </thead>
              <tbody>
                {records
                  .filter((r) => r.seconds)
                  .map((r) => {
                    const isRef = profile.source?.key === r.key;
                    const maximal = isMaximalEffort(r.vdot, profile.vdot);
                    return (
                      <tr key={r.key}>
                        <td>
                          <span className="flex items-center gap-2">
                            <span className={r.major ? "font-medium" : "text-ink2"}>
                              {r.name}
                            </span>
                            {isRef && (
                              <span className="tag border-clay/40 text-clay">
                                référence
                              </span>
                            )}
                            {r.estimated && <span className="tag">estimé</span>}
                            {!isRef && !maximal && <span className="tag">sortie</span>}
                          </span>
                        </td>
                        <td className="num text-right font-medium">
                          {fmtDuration(r.seconds!)}
                        </td>
                        <td className="num text-right text-ink2">
                          {fmtPace(r.pace!, "")}
                        </td>
                        <td className="num text-right text-ink2">
                          {r.vdot ? r.vdot.toFixed(1) : "—"}
                        </td>
                        <td className="whitespace-nowrap text-ink2">
                          {r.date ? fmtDate(r.date) : "—"}
                        </td>
                        <td>
                          {r.activityId ? (
                            <Link
                              href={`/activities/${r.activityId}`}
                              className="inline-block max-w-[260px] truncate align-middle text-ink2 hover:text-clay"
                            >
                              {r.activityName ?? "—"}
                            </Link>
                          ) : (
                            <span className="text-ink3">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ------------------------------------------------ Prédictions */}
        <Section
          title="Prédictions de chrono"
          note={`Potentiel = ce que ton VDOT ${profile.vdotDisplay} autorise. Réaliste = ce que ton entraînement actuel permet (volume ${fitness.weeklyKm} km/sem, sortie longue ${fitness.longestRunKm} km, exposant d'endurance ${endurance.exponent.toFixed(3)}). Les deux pages Objectifs et Analyse affichent ces mêmes chiffres.`}
        >
          {preds.length ? (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Distance</th>
                    <th className="text-right">Potentiel</th>
                    <th className="text-right">Réaliste</th>
                    <th className="text-right">Allure</th>
                    <th className="text-right">Ton record</th>
                    <th className="text-right">Écart</th>
                    <th>Fiabilité</th>
                  </tr>
                </thead>
                <tbody>
                  {preds
                    .filter((p) => p.major || p.currentRecord)
                    .map((p) => {
                      const delta =
                        p.currentRecord !== null ? p.currentRecord - p.realistic : null;
                      return (
                        <tr key={p.key}>
                          <td className={p.major ? "font-medium" : "text-ink2"}>
                            {p.name}
                          </td>
                          <td className="num text-right text-ink3">
                            {fmtDuration(p.potential)}
                          </td>
                          <td className="num text-right font-medium">
                            {fmtDuration(p.realistic)}
                            {p.gap > 30 && (
                              <span className="ml-1.5 text-micro text-ink3">
                                +{fmtDuration(p.gap)}
                              </span>
                            )}
                          </td>
                          <td className="num text-right text-ink2">
                            {fmtPace(p.pace, "")}
                          </td>
                          <td className="num text-right text-ink2">
                            {p.currentRecord ? fmtDuration(p.currentRecord) : "—"}
                          </td>
                          <td className="num text-right">
                            {delta === null ? (
                              <span className="text-ink3">—</span>
                            ) : Math.abs(delta) < 5 ? (
                              <span className="text-ink3">=</span>
                            ) : (
                              <span className={delta < 0 ? "text-sage" : "text-ink2"}>
                                {delta < 0 ? "−" : "+"}
                                {fmtDuration(Math.abs(delta))}
                              </span>
                            )}
                          </td>
                          <td>
                            <span className="flex flex-wrap items-baseline gap-x-2">
                              <span
                                className={`text-[0.8125rem] font-medium ${CONF_TONE[p.confidence]}`}
                              >
                                {CONFIDENCE_LABELS[p.confidence]}
                              </span>
                              <span className="text-micro text-ink3">{p.reason}</span>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ) : (
            <Hint height={120}>Il faut au moins un effort chronométré.</Hint>
          )}
        </Section>

        {/* ------------------------------------------------ Allures */}
        {paces.length > 0 && (
          <Section
            title="Allures d'entraînement"
            note={`Méthode Daniels, dérivées de ton VDOT ${profile.vdotDisplay}.`}
          >
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Intensité</th>
                    <th className="text-right">Allure /km</th>
                    <th className="hidden sm:table-cell">Usage</th>
                  </tr>
                </thead>
                <tbody>
                  {paces.map((p) => (
                    <tr key={p.key}>
                      <td>
                        <span className="flex items-center gap-2.5">
                          <span
                            className="h-[3px] w-3.5 shrink-0"
                            style={{ background: p.color }}
                          />
                          <span className="font-medium">{p.name}</span>
                        </span>
                      </td>
                      <td className="num whitespace-nowrap text-right font-medium">
                        {fmtPace(p.paceFast, "")} – {fmtPace(p.pace, "")}
                      </td>
                      <td className="hidden max-w-xl text-[0.8125rem] text-ink2 sm:table-cell">
                        {p.usage}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}
      </div>
    </>
  );
}
