import { Section, SectionHead } from "@/components/ui/Layout";
import { distanceName, limiterLabel } from "@/components/terms";
import { getTranslations } from "next-intl/server";
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
import { AnalysisHead, loadModeles, NotEnough } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * Modèles & seuils — la page « de quoi es-tu capable » : prédictions
 * potentiel/réaliste, courbe allure-durée, vitesse critique et seuils
 * personnalisés LT1/LT2 lus dans tes données.
 */
export default async function ModelesPage() {
  const t = await getTranslations("analysis");
  const now = new Date();
  const userId = await requireUserId();
  const data = await loadModeles(now, userId);
  if (data.runs.length < 5) return <NotEnough title={t("modeles")} />;

  const tt = await getTranslations("terms");
  const { settings, cs, curve, thresholds, endurance } = data;
  const predictions = data.predictions.map((p) => ({ ...p, name: distanceName(tt, p.key, p.name) }));
  const gapRows = data.gapRows.map((r) => ({ ...r, name: distanceName(tt, r.key, r.name) }));

  return (
    <div className="space-y-6">
      <AnalysisHead
        title={t("modeles")}
        meta={t("modelesMeta")}
      />

      {/* ------------------------------------------------ Ouverture */}
      <section className="rise">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <div className="text-micro font-medium uppercase tracking-[0.16em] text-ink3">
              {t("yourCs")}
            </div>
            <div className="mt-2 flex items-baseline gap-4">
              <span className="display text-d4">{cs ? fmtPace(cs.pace) : "—"}</span>
              <span className="text-sm text-ink3">
                {cs
                  ? t("csHeld", { d: cs.dPrime })
                  : t("need2Efforts")}
              </span>
            </div>
          </div>
          <dl className="flex gap-8">
            <Figure
              label={t("anaerobicThreshold")}
              value={thresholds ? `${thresholds.lt2Hr} bpm` : "—"}
              note={thresholds ? t("measuredR2", { r2: thresholds.r2 }) : undefined}
            />
            <Figure
              label={t("enduranceIndex")}
              value={endurance.exponent.toFixed(3)}
              note={t("referenceN", { n: RIEGEL_DEFAULT })}
            />
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------ Potentiel vs réaliste */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section>
          <SectionHead
            title={t("potentialVsReal")}
            note={t("potentialVsRealNote")}
          />
          {gapRows.length > 0 ? (
            <>
              <PotentialGapChart data={gapRows} />
              <table className="data-table mt-4">
                <thead>
                  <tr>
                    <th>{t("colDistance")}</th>
                    <th className="text-right">{t("colPotential")}</th>
                    <th className="text-right">{t("colRealistic")}</th>
                    <th className="text-right">{t("colRange")}</th>
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
                      {p.name} : {p.limiters.map((l) => limiterLabel(tt, l)).join(" · ")}
                    </li>
                  ))}
              </ul>
            </>
          ) : (
            <p className="py-6 text-sm text-ink3">{t("notEnoughEfforts")}</p>
          )}
        </Section>

        <Section>
          <SectionHead
            title={t("durationCurve")}
            note={t("durationCurveNote")}
          />
          <DurationCurveChart data={curve} />
          <div className="mt-4 border-t border-hair pt-4">
            <div className="flex items-baseline justify-between text-[0.8125rem]">
              <span className="text-ink2">{t("fatigueExponent")}</span>
              <span className="font-mono font-medium tabular-nums">
                {endurance.exponent.toFixed(3)}
                <span className="ml-2 text-micro text-ink3">
                  {endurance.measured
                    ? t("measuredOn", { n: endurance.samples, r2: endurance.r2.toFixed(2) })
                    : t("referenceValue")}
                </span>
              </span>
            </div>
            <p className="mt-2 font-mono text-micro leading-relaxed tabular-nums text-ink3">
              {t("slowdownNote", { pct: endurance.slowdownPerDoubling })}
            </p>
          </div>
        </Section>
      </div>

      {/* ------------------------------------------------ Vitesse critique */}
      {cs && (
        <Section>
          <SectionHead
            title={t("criticalSpeed")}
            note={t("criticalSpeedNote")}
          />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <CriticalSpeedChart points={cs.points} cs={cs.cs} dPrime={cs.dPrime} />
            <div className="space-y-4">
              <Stat
                label={t("csLabel")}
                value={`${cs.cs.toFixed(2)} m/s`}
                note={t("csPaceNote", { pace: fmtPace(cs.pace) })}
              />
              <Stat
                label={t("dprimeLabel")}
                value={`${cs.dPrime} m`}
                note={t("dprimeNote")}
              />
              <Stat
                label={t("vmaLabel")}
                value={`${cs.vmaEstimate} km/h`}
                note={t("csVmaNote", { r2: cs.r2.toFixed(3) })}
              />
              <p className="border-t border-hair pt-3 font-mono text-micro leading-relaxed tabular-nums text-ink3">
                {t("csProfileNote")}
              </p>
            </div>
          </div>
        </Section>
      )}

      {/* ------------------------------------------------ Seuils personnalisés */}
      <Section>
        <SectionHead
          title={t("thresholdsTitle")}
          note={t("thresholdsNote")}
        />
        {thresholds ? (
          <>
            <div className="grid gap-6 sm:grid-cols-3">
              <Stat
                label={t("lt1Label")}
                value={`${thresholds.lt1Hr} bpm`}
                note={t("upTo", { pace: fmtPace(thresholds.lt1Pace) })}
              />
              <Stat
                label={t("lt2Label")}
                value={`${thresholds.lt2Hr} bpm`}
                note={t("anchoredOnCs", { pace: fmtPace(thresholds.csPace) })}
              />
              <Stat
                label={t("qualityLabel")}
                value={`R² ${thresholds.r2}`}
                note={t("splitsWithHr", { n: thresholds.points })}
              />
            </div>

            {settings?.maxHr && (
              <p className="mt-4 font-mono text-micro tabular-nums text-ink3">
                {t("genericThreshold", { hr: genericLt2Hr(settings.maxHr) })}{" "}
                {Math.abs(thresholds.lt2Hr - genericLt2Hr(settings.maxHr)) <= 4
                  ? t("thresholdMatches")
                  : thresholds.lt2Hr > genericLt2Hr(settings.maxHr) ? t("thresholdAbove") : t("thresholdBelow")}
              </p>
            )}

            <div className="mt-5 overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("colZone")}</th>
                    <th className="text-right">{t("colHr")}</th>
                    <th className="text-right">{t("colPace")}</th>
                  </tr>
                </thead>
                <tbody>
                  {thresholds.zones.map((z) => (
                    <tr key={z.key}>
                      <td>
                        <span className="flex items-center gap-2">
                          <span className="h-[8px] w-[8px] rounded-full" style={{ background: z.color }} />
                          {`${z.key.toUpperCase()} · ${t(`zoneName.${z.key}`)}`}
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
                          ? t("free")
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
            {t("notEnoughHr")}
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
