import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Empty, Hint, PageHead, Section } from "@/components/ui/Layout";
import { AnalysisPoleStrip } from "@/app/analysis/_shared";
import { VdotChart } from "@/components/charts/Lazy";
import { fmtDate, fmtDuration, fmtPace } from "@/lib/format";
import { getBestEfforts, getRuns } from "@/lib/queries";
import { trimLeadingEmpty } from "@/lib/stats";
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

const LEVEL_HEADLINE: Record<string, string> = {
  Débutant: "Tout est à construire — et c'est la meilleure nouvelle : le niveau monte vite au début.",
  Régulier: "Une base solide est posée. La marge est désormais dans la régularité.",
  Confirmé: "Tu cours avec méthode. Les chronos suivront le volume, saison après saison.",
  Avancé: "Un niveau sérieux. La marge se joue désormais sur les détails.",
  Compétiteur: "Niveau compétiteur : tout se décide dans la finesse de la préparation.",
  Élite: "Niveau élite. Protège la récupération, c'est elle qui fait la différence.",
  default: "Chaque effort chronométré affine ton niveau réel.",
};

const CONF_TONE: Record<Confidence, string> = {
  high: "text-sage",
  medium: "text-ochre",
  low: "text-ink3",
};

export default async function RecordsPage() {
  const t = await getTranslations("records");
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
        <EmptySteps />
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
  const history = trimLeadingEmpty(vdotHistory(efforts, 12, now), (r) => r.vdot == null);
  const paces = profile.vdot > 0 ? danielsPaces(profile.vdot) : [];
  const marathon = preds.find((p) => p.key === "marathon");
  const headline = LEVEL_HEADLINE[level.label] ?? LEVEL_HEADLINE.default;

  return (
    <>
      <PageHead
        title="Performance"
        kicker="Niveau de forme"
        meta={`${efforts.length} efforts chronométrés · ${runs.length} courses`}
        action={
          <Link href="/calculator" className="btn-outline btn-sm">
            Calculateur
          </Link>
        }
      />
      <AnalysisPoleStrip active="/records" />

      {/* ------------------------------------------------ Le niveau, en grand */}
      <section className="rise grid gap-12 border-y border-hair py-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div>
          <div className="flex items-baseline gap-3">
            <span className="display text-[clamp(5rem,12vw,8.5rem)] leading-[0.82] tracking-[-0.05em]">
              {profile.vdot > 0 ? profile.vdotDisplay : "—"}
            </span>
            <span className="text-[clamp(1.25rem,2.6vw,1.9rem)] font-medium text-ink3">VDOT</span>
          </div>
          <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium" style={{ color: level.color }}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: level.color }} aria-hidden />
            Coureur {level.label.toLowerCase()}
          </div>
          <p className="mt-6 max-w-lg text-[clamp(1.1rem,2vw,1.5rem)] font-medium leading-snug tracking-[-0.01em]">
            {headline}
          </p>
          {marathon && (
            <p className="mt-3 text-[0.9375rem] text-ink2">
              Tu vaux un marathon en{" "}
              <span className="font-mono font-medium text-ink">{fmtDuration(marathon.realistic)}</span>
              {" "}({fmtPace(marathon.pace)}) — <span className="text-ink3">à ton niveau actuel</span>
            </p>
          )}
          {profile.source && (
            <p className="mt-6 text-[0.8125rem] text-ink2">
              Référence : <span className="font-medium text-ink">{profile.source.name}</span> en{" "}
              <span className="font-mono">{fmtDuration(profile.source.seconds!)}</span>
              {profile.source.date ? ` · ${fmtDate(profile.source.date)}` : ""}
            </p>
          )}
        </div>

        <div>
          <div className="eyebrow mb-3">Évolution · meilleure performance glissante sur 90 jours</div>
          {history.some((h) => h.vdot !== null) ? (
            <VdotChart data={history} />
          ) : (
            <Hint height={200}>{t("notEnough")}</Hint>
          )}
          <dl className="mt-8 grid grid-cols-2 border-t border-hair">
            <HeroStat label="VMA estimée" value={profile.vma > 0 ? `${profile.vma} km/h` : "—"} />
            <HeroStat label="Volume hebdo" value={`${fitness.weeklyKm} km`} />
            <HeroStat label="Endurance" value={endurance.exponent.toFixed(3)} note={endurance.label} />
            <HeroStat label="Sortie la plus longue" value={`${fitness.longestRunKm} km`} />
          </dl>
        </div>
      </section>

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
                  <th>{t("distance")}</th>
                  <th className="text-right">{t("time")}</th>
                  <th className="text-right">{t("pace")}</th>
                  <th className="text-right">VDOT</th>
                  <th>{t("date")}</th>
                  <th>{t("session")}</th>
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
                    <th className="text-right">{t("potential")}</th>
                    <th className="text-right">{t("realistic")}</th>
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
                            <div className="font-mono text-micro font-normal tabular-nums text-ink3">
                              {fmtDuration(p.low)} – {fmtDuration(p.high)}
                            </div>
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

function HeroStat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="border-l border-hair py-4 pl-4 first:border-l-0 first:pl-0 [&:nth-child(n+3)]:border-t">
      <dt className="eyebrow">{label}</dt>
      <dd className="display mt-2 text-d3">
        {value}
        {note && <span className="ml-1.5 text-sm font-normal text-ink3">{note}</span>}
      </dd>
    </div>
  );
}

/** Ce qui débloque la page Performance, en trois étapes. */
function EmptySteps() {
  return (
    <ol className="mt-8 max-w-xl space-y-2 border-t border-hair pt-5">
      {[
        "Synchronise Strava : tes activités et tes efforts chronométrés arrivent.",
        "Cours un 5 km (ou un 10 km) à fond : c'est lui qui cale ton VDOT.",
        "Les records tombent tout seuls ensuite — et le niveau de forme monte.",
      ].map((t, i) => (
        <li key={i} className="flex items-baseline gap-2.5 text-sm text-ink2">
          <span className="font-mono text-clay">{i + 1}.</span>
          {t}
        </li>
      ))}
    </ol>
  );
}
