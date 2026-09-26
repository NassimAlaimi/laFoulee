import Link from "next/link";
import { Section, SectionHead } from "@/components/ui/Layout";
import { getLocale, getTranslations } from "next-intl/server";
import { Sparkline } from "@/components/ui/Spark";
import { fmtDateShort, fmtDuration, fmtPace, fmtSigned } from "@/lib/format";
import { requireUserId } from "@/lib/auth";
import {
  type IntervalClass,
} from "@/lib/intervals";
import { AnalysisHead, loadSeances } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * Séances passées — la page « qu'as-tu exécuté » : intervalles repérés
 * automatiquement et dérive/efficience des sorties longues.
 */
export default async function SeancesPage() {
  const t = await getTranslations("analysis");
  const locale = await getLocale();
  const now = new Date();
  const userId = await requireUserId();
  const { intervalList, longStreams, efTrend, classProgression, intervalClass } =
    await loadSeances(now, userId);

  const ef = efTrend.length > 0 ? efTrend[efTrend.length - 1].efficiency : null;

  return (
    <div className="space-y-6">
      <AnalysisHead
        title={t("seances")}
        meta={t("seancesMeta")}
      />

      {/* ------------------------------------------------ Ouverture */}
      <section className="rise">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <div className="text-micro font-medium uppercase tracking-[0.16em] text-ink3">
              {t("yourEf")}
            </div>
            <div className="mt-2 flex items-baseline gap-4">
              <span className="display text-d4">{ef ?? "—"}</span>
              <span className="text-sm text-ink3">
                {ef ? t("efLegend") : t("noLongRun")}
              </span>
            </div>
          </div>
          <dl className="flex gap-8">
            <Figure
              label={t("intervalSessions")}
              value={String(intervalList.length)}
              note={t("last6m")}
            />
            <Figure
              label={t("longRuns")}
              value={String(longStreams.length)}
              note={t("withHr")}
            />
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------ Intervalles */}
      {intervalList.length > 0 && (
        <Section>
          <SectionHead
            title={t("intervalTitle")}
            note={t("intervalNote")}
          />
          <div className="space-y-8">
            {(["court", "1000", "long"] as IntervalClass[])
              .filter((cls) =>
                intervalList.some(
                  (s) => s.analysis.summary && intervalClass(s.analysis.summary.repDistance) === cls
                )
              )
              .map((cls) => {
                const prog = classProgression(intervalList, cls, 6);
                const sessions = intervalList
                  .filter(
                    (s) =>
                      s.analysis.summary &&
                      intervalClass(s.analysis.summary.repDistance) === cls
                  )
                  .sort((a, b) => b.date.getTime() - a.date.getTime())
                  .slice(0, 4);
                const gain =
                  prog.length >= 2 ? prog[prog.length - 1].pace - prog[0].pace : null;
                return (
                  <div key={cls} className="border-t border-hair pt-5">
                    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                      <div>
                        <div className="eyebrow">{t(`intervalClass.${cls}`)}</div>
                        <div className="mt-1 flex items-baseline gap-3">
                          {gain !== null ? (
                            <span
                              className={`text-xl font-semibold tracking-tight ${gain <= 0 ? "text-sage" : "text-ochre"}`}
                            >
                              {fmtSigned(gain, 1, " s/km")}
                            </span>
                          ) : (
                            <span className="text-xl font-semibold tracking-tight text-ink3">—</span>
                          )}
                          <span className="text-micro text-ink3">
                            {t("overLastSessions", { n: prog.length })}
                          </span>
                        </div>
                      </div>
                      {prog.length >= 2 && (
                        <Sparkline
                          data={prog.map((p) => p.pace)}
                          stroke="rgb(var(--clay))"
                          width={120}
                          height={28}
                        />
                      )}
                    </div>
                    <div className="mt-3 overflow-x-auto">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>{t("colDate")}</th>
                            <th>{t("colSession")}</th>
                            <th className="text-right">{t("colReps")}</th>
                            <th className="text-right">{t("colAvgPace")}</th>
                            <th className="text-right">{t("colRegularity")}</th>
                            <th className="text-right">{t("colFatigue")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sessions.map((s) => (
                            <tr key={s.id}>
                              <td className="text-ink3">{fmtDateShort(s.date, locale)}</td>
                              <td>
                                <Link
                                  href={`/activities/${s.id}`}
                                  className="text-clay hover:underline"
                                >
                                  {s.name}
                                </Link>
                              </td>
                              <td className="text-right font-mono">
                                {s.analysis.summary!.count} ×{" "}
                                {Math.round(s.analysis.summary!.repDistance)} m
                              </td>
                              <td className="text-right font-mono">
                                {fmtPace(s.analysis.summary!.avgPace)}
                              </td>
                              <td className="text-right font-mono">
                                ± {s.analysis.summary!.cv} %
                              </td>
                              <td className="text-right font-mono">
                                {fmtSigned(s.analysis.summary!.fatigue, 1, " %")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
          </div>
          <p className="mt-4 border-t border-hair pt-4 font-mono text-micro leading-relaxed tabular-nums text-ink3">
            {t("intervalFootnote")}
          </p>
        </Section>
      )}

      {/* ------------------------------------------------ Dérive & efficience */}
      {longStreams.length > 0 && (
        <Section>
          <SectionHead
            title={t("driftTitle")}
            note={t("driftNote")}
          />
          {efTrend.length >= 2 && (
            <div className="mb-4 flex items-center gap-3">
              <Sparkline
                data={efTrend.map((p) => p.efficiency)}
                stroke="rgb(var(--sage))"
                width={160}
                height={30}
              />
              <span className="text-micro text-ink3">{t("efTrend")}</span>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("colDate")}</th>
                  <th>{t("colSession")}</th>
                  <th className="text-right">{t("colDuration")}</th>
                  <th className="text-right">{t("colAvgHr")}</th>
                  <th className="text-right">EF</th>
                  <th className="text-right">{t("colDecoupling")}</th>
                </tr>
              </thead>
              <tbody>
                {longStreams.slice(0, 10).map((s) => (
                  <tr key={s.id}>
                    <td className="text-ink3">{fmtDateShort(s.date, locale)}</td>
                    <td>
                      <Link href={`/activities/${s.id}`} className="text-clay hover:underline">
                        {s.name}
                      </Link>
                    </td>
                    <td className="text-right font-mono">{fmtDuration(s.movingTime)}</td>
                    <td className="text-right font-mono">{s.decoupling!.avgHr} bpm</td>
                    <td className="text-right font-mono">{s.decoupling!.efficiency}</td>
                    <td
                      className={`text-right font-mono ${
                        s.decoupling!.drift < 5
                          ? "text-sage"
                          : s.decoupling!.drift < 10
                            ? "text-ochre"
                            : "text-rust"
                      }`}
                    >
                      {fmtSigned(s.decoupling!.drift, 1, " %")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 border-t border-hair pt-4 font-mono text-micro leading-relaxed tabular-nums text-ink3">
            {t("decouplingFootnote")}
          </p>
        </Section>
      )}

      {/* ------------------------------------------------ Rien à montrer */}
      {intervalList.length === 0 && longStreams.length === 0 && (
        <div className="border-t-2 border-hair pt-4">
          <p className="text-sm text-ink2">
            {t("seancesEmpty")}
          </p>
          <ol className="mt-3 space-y-2">
            <li className="flex items-baseline gap-2.5 text-sm text-ink2">
              <span className="font-mono text-clay">1.</span>
              {t("seancesStep1")}
            </li>
            <li className="flex items-baseline gap-2.5 text-sm text-ink2">
              <span className="font-mono text-clay">2.</span>
              {t("seancesStep2")}
            </li>
            <li className="flex items-baseline gap-2.5 text-sm text-ink2">
              <span className="font-mono text-clay">3.</span>
              <span>
                {t("seancesStep3")}{" "}
                <Link href="/workouts" className="text-clay hover:underline">{t("seancesLibrary")} →</Link>
              </span>
            </li>
          </ol>
        </div>
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
