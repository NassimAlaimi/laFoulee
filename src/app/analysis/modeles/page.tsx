import { Section, SectionHead } from "@/components/ui/Layout";
import { Stat } from "@/components/analysis/Bits";
import {
  CriticalSpeedChart,
  DurationCurveChart,
  PotentialGapChart,
} from "@/components/charts/Lazy";
import { fmtDuration, fmtPace } from "@/lib/format";
import { requireUserId } from "@/lib/auth";
import { RIEGEL_DEFAULT } from "@/lib/prediction";
import { genericLt2Hr } from "@/lib/thresholds";
import { AnalysisHead, AnalysisPoleStrip, loadModeles, NotEnough } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * Modèles & seuils — la page « de quoi es-tu capable » : prédictions
 * potentiel/réaliste, courbe allure-durée, vitesse critique et seuils
 * personnalisés LT1/LT2 lus dans tes données.
 */
export default async function ModelesPage() {
  const now = new Date();
  const userId = await requireUserId();
  const data = await loadModeles(now, userId);
  if (data.runs.length < 5) return <NotEnough title="Modèles & seuils" />;

  const { settings, cs, curve, predictions, gapRows, thresholds, endurance } = data;

  return (
    <div className="space-y-6">
      <AnalysisHead
        title="Modèles & seuils"
        meta="Prédictions, vitesse critique, courbe allure-durée et seuils personnalisés"
      />
      <AnalysisPoleStrip active="/analysis/modeles" />

      {/* ------------------------------------------------ Ouverture */}
      <section className="rise">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <div className="text-micro font-medium uppercase tracking-[0.16em] text-ink3">
              Ta vitesse critique
            </div>
            <div className="mt-2 flex items-baseline gap-4">
              <span className="display text-d4">{cs ? fmtPace(cs.pace) : "—"}</span>
              <span className="text-sm text-ink3">
                {cs
                  ? `tenable ~45-60 min · D′ ${cs.dPrime} m`
                  : "2 efforts de 2 à 20 min requis pour la calculer"}
              </span>
            </div>
          </div>
          <dl className="flex gap-8">
            <Figure
              label="seuil anaérobie"
              value={thresholds ? `${thresholds.lt2Hr} bpm` : "—"}
              note={thresholds ? `mesuré · R² ${thresholds.r2}` : undefined}
            />
            <Figure
              label="indice d'endurance"
              value={endurance.exponent.toFixed(3)}
              note={`référence ${RIEGEL_DEFAULT}`}
            />
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------ Potentiel vs réaliste */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section>
          <SectionHead
            title="Potentiel contre réalisable"
            note="Écart entre ce que la physiologie autorise et ce que l'entraînement actuel permet"
          />
          {gapRows.length > 0 ? (
            <>
              <PotentialGapChart data={gapRows} />
              <table className="data-table mt-4">
                <thead>
                  <tr>
                    <th>Distance</th>
                    <th className="text-right">Potentiel</th>
                    <th className="text-right">Réaliste</th>
                    <th className="text-right">Fourchette</th>
                  </tr>
                </thead>
                <tbody>
                  {predictions.map((p) => (
                    <tr key={p.name}>
                      <td className="text-ink2">{p.name}</td>
                      <td className="text-right font-mono tabular-nums text-ink3">
                        {fmtDuration(p.potential)}
                      </td>
                      <td className="text-right font-mono font-medium tabular-nums">
                        {fmtDuration(p.realistic)}
                      </td>
                      <td className="text-right font-mono text-micro tabular-nums text-ink3">
                        {fmtDuration(p.low)} – {fmtDuration(p.high)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="mt-3 space-y-1">
                {predictions
                  .filter((p) => p.limiters.length > 0)
                  .slice(0, 2)
                  .map((p) => (
                    <li key={p.name} className="font-mono text-micro tabular-nums text-ink3">
                      {p.name} : {p.limiters.map((l) => l.label).join(" · ")}
                    </li>
                  ))}
              </ul>
            </>
          ) : (
            <p className="py-6 text-sm text-ink3">Pas encore assez de performances chronométrées.</p>
          )}
        </Section>

        <Section>
          <SectionHead
            title="Courbe allure-durée"
            note="Records par distance, comparés au modèle personnel"
          />
          <DurationCurveChart data={curve} />
          <div className="mt-4 border-t border-hair pt-4">
            <div className="flex items-baseline justify-between text-[0.8125rem]">
              <span className="text-ink2">Exposant de fatigue</span>
              <span className="font-mono font-medium tabular-nums">
                {endurance.exponent.toFixed(3)}
                <span className="ml-2 text-micro text-ink3">
                  {endurance.measured
                    ? `mesuré sur ${endurance.samples} perfs · R² ${endurance.r2.toFixed(2)}`
                    : "valeur de référence"}
                </span>
              </span>
            </div>
            <p className="mt-2 font-mono text-micro leading-relaxed tabular-nums text-ink3">
              Quand la distance double, ton allure ralentit de {endurance.slowdownPerDoubling} %
              (référence : 4,2 %). Les points au-dessus de la courbe signalent une distance
              où il reste du temps à prendre.
            </p>
          </div>
        </Section>
      </div>

      {/* ------------------------------------------------ Vitesse critique */}
      {cs && (
        <Section>
          <SectionHead
            title="Vitesse critique"
            note="Modèle à deux paramètres : distance = CS × temps + D′ (efforts de 2 à 20 min)"
          />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <CriticalSpeedChart points={cs.points} cs={cs.cs} dPrime={cs.dPrime} />
            <div className="space-y-4">
              <Stat
                label="Vitesse critique"
                value={`${cs.cs.toFixed(2)} m/s`}
                note={`${fmtPace(cs.pace)} — allure tenable ~45-60 min`}
              />
              <Stat
                label="Réserve anaérobie (D′)"
                value={`${cs.dPrime} m`}
                note="distance parcourable au-dessus de la vitesse critique"
              />
              <Stat
                label="VMA estimée"
                value={`${cs.vmaEstimate} km/h`}
                note={`CS ≈ 90 % de la VMA · ajustement R² ${cs.r2.toFixed(3)}`}
              />
              <p className="border-t border-hair pt-3 font-mono text-micro leading-relaxed tabular-nums text-ink3">
                Une CS élevée avec un D′ faible = profil diesel. L&apos;inverse = profil
                explosif qui s&apos;appuie sur la réserve anaérobie.
              </p>
            </div>
          </div>
        </Section>
      )}

      {/* ------------------------------------------------ Seuils personnalisés */}
      <Section>
        <SectionHead
          title="Seuils personnalisés"
          note="LT1 et LT2 lus sur ta relation allure → FC réelle, ancrés sur la vitesse critique"
        />
        {thresholds ? (
          <>
            <div className="grid gap-6 sm:grid-cols-3">
              <Stat
                label="Seuil aérobie (LT1)"
                value={`${thresholds.lt1Hr} bpm`}
                note={`jusqu'à ${fmtPace(thresholds.lt1Pace)}`}
              />
              <Stat
                label="Seuil anaérobie (LT2)"
                value={`${thresholds.lt2Hr} bpm`}
                note={`ancré sur la vitesse critique ${fmtPace(thresholds.csPace)}`}
              />
              <Stat
                label="Qualité de l'estimation"
                value={`R² ${thresholds.r2}`}
                note={`${thresholds.points} km-splits avec FC`}
              />
            </div>

            {settings?.maxHr && (
              <p className="mt-4 font-mono text-micro tabular-nums text-ink3">
                Les % de FC max donneraient un seuil à {genericLt2Hr(settings.maxHr)} bpm —
                {" "}
                {Math.abs(thresholds.lt2Hr - genericLt2Hr(settings.maxHr)) <= 4
                  ? "ton seuil mesuré colle au générique."
                  : `ton seuil mesuré est à ${thresholds.lt2Hr > genericLt2Hr(settings.maxHr) ? "au-dessus" : "en dessous"} : tes zones génériques sont ${thresholds.lt2Hr > genericLt2Hr(settings.maxHr) ? "sous-estimées" : "surestimées"}.`}
              </p>
            )}

            <div className="mt-5 overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Zone</th>
                    <th className="text-right">FC</th>
                    <th className="text-right">Allure</th>
                  </tr>
                </thead>
                <tbody>
                  {thresholds.zones.map((z) => (
                    <tr key={z.key}>
                      <td>
                        <span className="flex items-center gap-2">
                          <span className="h-[8px] w-[8px] rounded-full" style={{ background: z.color }} />
                          {z.name}
                        </span>
                      </td>
                      <td className="text-right font-mono">
                        {z.hrHigh === Infinity
                          ? `> ${z.hrLow}`
                          : z.hrLow === 0
                            ? `< ${z.hrHigh}`
                            : `${z.hrLow} – ${z.hrHigh}`}
                      </td>
                      <td className="text-right font-mono">
                        {z.paceCeil === Infinity
                          ? "libre"
                          : z.key === "z5"
                            ? `< ${fmtPace(z.paceCeil)}`
                            : `> ${fmtPace(z.paceCeil)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="py-6 text-sm text-ink3">
            Pas encore assez de kilomètres avec FC pour lire tes seuils (20 km-splits
            minimum, et une vitesse critique calculable). Continue à courir avec la
            ceinture — les zones se recaleront toutes seules.
          </p>
        )}
      </Section>
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <div className="text-xl font-semibold tracking-tight">{value}</div>
      <div className="mt-0.5 text-micro text-ink3">{label}{note ? ` · ${note}` : ""}</div>
    </div>
  );
}
