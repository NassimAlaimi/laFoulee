import { Bar } from "@/components/ui/Metric";
import { getLocale, getTranslations } from "next-intl/server";
import { Section, SectionHead } from "@/components/ui/Layout";
import { ConsistencyHeatmap } from "@/components/analysis/ConsistencyHeatmap";
import { Legend, Stat } from "@/components/analysis/Bits";import {
  FormChart,
  PaceZoneChart,
  PolarizationChart,
  YearCompareChart,
} from "@/components/charts/Lazy";
import { fmtDuration } from "@/lib/format";
import { requireUserId } from "@/lib/auth";
import { ZONE_LABEL, ZONE_TONE } from "@/lib/fitness-model";
import { AnalysisHead, AnalysisPoleStrip, loadForme, NotEnough } from "./_shared";

export const dynamic = "force-dynamic";

/**
 * Forme & charge — la page « comment va la machine » : condition/fatigue/
 * fraîcheur (PMC), répartition de l'intensité, régularité, cumul annuel.
 */
export default async function FormePage() {
  const t = await getTranslations("analysis");
  const tc = await getTranslations("common");
  const tz = await getTranslations("zones");
  const now = new Date();
  const userId = await requireUserId();
  const data = await loadForme(now, userId, await getLocale());
  if (data.runs.length < 5) return <NotEnough title={t("title")} />;

  const { form, formRows, marks, yoy, polar, polarSum, paceZones, grid, timeline, fitness } = data;

  return (
    <div className="space-y-6">
      <AnalysisHead
        title={t("title")}
        meta={t("meta")}
      />
      <AnalysisPoleStrip active="/analysis" />

      {/* ------------------------------------------------ Ouverture */}
      <section className="rise" data-tour="forme">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <div className="text-micro font-medium uppercase tracking-[0.16em] text-ink3">
              {t("freshnessNow")}
            </div>
            <div className="mt-2 flex items-baseline gap-4">
              <span
                className={`display text-d4 ${form ? ZONE_TONE[form.zone] : ""}`}
              >
                {form ? `${form.tsb > 0 ? "+" : ""}${Math.round(form.tsb)}` : "—"}
              </span>
              <span className="text-sm text-ink3">
                {form ? `${tc(ZONE_LABEL[form.zone])} · TSB` : t("condMinusFat")}
              </span>
            </div>
          </div>
          <dl className="flex gap-8">
            <Figure
              label={t("conditionCtl")}
              value={form ? String(Math.round(form.ctl)) : "—"}
              note={form ? `${form.ctlDelta28 >= 0 ? "+" : ""}${form.ctlDelta28} sur 28 j` : undefined}
            />
            <Figure
              label={t("progression")}
              value={form ? `${form.rampPerWeek}/sem` : "—"}
              note={form && form.rampPerWeek > 7 ? t("rampRisk") : t("rampTarget")}
            />
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------ PMC */}
      <Section>
        <SectionHead
          title={t("pmcTitle")}
          note={t("pmcNote")}
        />
        <FormChart data={formRows} height={300} legend={false} marks={marks} />
        <div className="mt-4 grid gap-4 border-t border-hair pt-4 sm:grid-cols-3">
          <Legend color="rgb(var(--slate))" label={t("ctlLegend")} note={t("ctlNote")} />
          <Legend color="rgb(var(--clay))" label={t("atlLegend")} note={t("atlNote")} />
          <Legend color="rgb(var(--sage))" label={t("tsbLegend")} note={t("tsbNote")} />
          {marks.some((m) => m.kind === "race") && (
            <Legend color="rgb(var(--rust))" label={t("raceLegend")} note={t("raceNote")} />
          )}
          {marks.some((m) => m.kind === "pr") && (
            <Legend color="rgb(var(--plum))" label={t("recordLegend")} note={t("recordNote")} />
          )}
        </div>
      </Section>

      {/* ------------------------------------------------ Polarisation */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section>
          <SectionHead
            title={t("intensitySplit")}
            note={t("intensityNote")}
          />
          {polar.length > 0 ? (
            <>
              <PolarizationChart data={polar} />
              {polarSum && (
                <div className="mt-4 grid grid-cols-3 gap-4 border-t border-hair pt-4">
                  <Stat label={t("easy")} value={`${polarSum.easy} %`} />
                  <Stat label={t("greyZone")} value={`${polarSum.moderate} %`} />
                  <Stat label={t("hard")} value={`${polarSum.hard} %`} />
                </div>
              )}
              {polarSum && (
                <p
                  className={`mt-3 text-[0.8125rem] leading-relaxed ${
                    polarSum.verdict === "balanced" || polarSum.verdict === "allEasy"
                      ? "text-sage"
                      : polarSum.verdict === "thin"
                        ? "text-ink3"
                        : "text-ochre"
                  }`}
                >
                  {t("last90")} {tz(`verdict.${polarSum.verdict}`)}
                </p>
              )}
              {polarSum && (
                <p className="mt-1 text-micro text-ink3">{t("polarSource", { source: tz(`source.pace.${polarSum.source}`, { pace: "" }).trim() })}</p>
              )}
            </>
          ) : (
            <p className="py-6 text-sm text-ink3">{t("unknownLevel")}</p>
          )}
        </Section>

        <Section>
          <SectionHead
            title={t("paceByZone")}
            note={t("paceByZoneNote")}
          />
          <PaceZoneChart data={paceZones} />
          <p className="mt-4 border-t border-hair pt-4 font-mono text-micro leading-relaxed tabular-nums text-ink3">
            Une allure facile qui s&apos;améliore sans que les séances rapides ne bougent
            signale une base aérobie qui progresse.
          </p>
        </Section>
      </div>

      {/* ------------------------------------------------ Année / année */}
      <Section>
        <SectionHead
          title={t("yearCumul")}
          note={t("yearCumulNote")}
        />
        <YearCompareChart data={yoy.rows as never} years={yoy.years} />
        <div className="mt-4 grid gap-4 border-t border-hair pt-4 sm:grid-cols-3">
          {yoy.totals.map((t) => (
            <div key={t.year}>
              <div className="eyebrow">{t.year}</div>
              <div className="mt-1.5 font-mono text-[0.9375rem] font-medium tabular-nums">
                {t.km} km
              </div>
              <div className="mt-0.5 text-micro text-ink3">
                {t.runs} sorties
                {t.atWeek !== null && ` · ${t.atWeek} km à la même date`}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------ Régularité */}
      <Section>
        <SectionHead
          title={t("consistency")}
          note={t("consistencyNote")}
        />
        <ConsistencyHeatmap grid={grid} />
        <div className="mt-5 grid gap-4 border-t border-hair pt-4 sm:grid-cols-3">
          <Stat label={t("currentStreak")} value={`${grid.currentStreak} sem.`} note={t("streakNote")} />
          <Stat label={t("bestStreak")} value={`${grid.bestStreak} sem.`} />
          <Stat
            label={t("activeWeeks")}
            value={`${grid.activeRate} %`}
            note={`${fitness.sessionsPerWeek} sorties/sem en moyenne`}
          />
        </div>
        <div className="mt-4">
          <Bar value={grid.activeRate} height={4} />
        </div>
      </Section>

      {/* ------------------------------------------------ Records */}
      {timeline.length > 0 && (
        <Section>
          <SectionHead
            title={t("prBars")}
            note={t("prBarsNote")}
          />
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Distance</th>
                <th className="text-right">Chrono</th>
                <th className="text-right">Gain</th>
              </tr>
            </thead>
            <tbody>
              {timeline.map((t, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap text-ink2">{t.label}</td>
                  <td className="text-ink2">{t.distance}</td>
                  <td className="text-right font-mono font-medium tabular-nums">
                    {fmtDuration(t.seconds)}
                  </td>
                  <td className="text-right font-mono tabular-nums text-sage">
                    −{fmtDuration(t.improvementSeconds)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
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
