import Link from "next/link";
import { pageMeta } from "@/lib/page-meta";
import { getLocale, getTranslations } from "next-intl/server";
import { confidenceLabel, distanceName, enduranceLabel, paceName, paceUsage, predictionReason } from "@/components/terms";
import { Empty, Hint, PageHead, Section } from "@/components/ui/Layout";
import { VdotChart } from "@/components/charts/Lazy";
import { fmtDate, fmtDuration, fmtPace } from "@/lib/format";
import { getBestEfforts, getRuns } from "@/lib/queries";
import { trimLeadingEmpty } from "@/lib/stats";
import {
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

export async function generateMetadata() {
  return pageMeta("records");
}


const CONF_TONE: Record<Confidence, string> = {
  high: "text-sage",
  medium: "text-ochre",
  low: "text-ink3",
};

export default async function RecordsPage() {
  const t = await getTranslations("records");
  const tt = await getTranslations("terms");
  const locale = await getLocale();
  const [runs, efforts] = await Promise.all([getRuns(), getBestEfforts()]);

  if (runs.length === 0) {
    return (
      <>
        <PageHead title={t("title")} />
        <Empty
          title={t("emptyTitle")}
          body={t("emptyBody")}
          action={
            <Link href="/import" className="btn-solid">
              {t("emptyAction")}
            </Link>
          }
        />
        <EmptySteps steps={[t("step1"), t("step2"), t("step3")]} />
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
  const history = trimLeadingEmpty(vdotHistory(efforts, 12, now, locale), (r) => r.vdot == null);
  const paces = profile.vdot > 0 ? danielsPaces(profile.vdot) : [];
  const marathon = preds.find((p) => p.key === "marathon");
  const headline = t(`headline.${level.key}`);

  return (
    <>
      <PageHead
        title={t("title")}
        kicker={t("kicker")}
        meta={t("meta", { efforts: efforts.length, runs: runs.length })}
        action={
          <Link href="/calculator" className="btn-outline btn-sm">
            {t("calculator")}
          </Link>
        }
      />

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
            {tt(`runnerLevel.${level.key}`)}
          </div>
          <p className="mt-6 max-w-lg text-[clamp(1.1rem,2vw,1.5rem)] font-medium leading-snug tracking-[-0.01em]">
            {headline}
          </p>
          {marathon && (
            <p className="mt-3 text-[0.9375rem] text-ink2">
              {t.rich("marathonWorth", {
                time: fmtDuration(marathon.realistic),
                pace: fmtPace(marathon.pace),
                b: (c) => <span className="font-mono font-medium text-ink">{c}</span>,
                m: (c) => <span className="text-ink3">{c}</span>,
              })}
            </p>
          )}
          {profile.source && (
            <p className="mt-6 text-[0.8125rem] text-ink2">
              {t.rich("reference", {
                name: distanceName(tt, profile.source.key, profile.source.name),
                time: fmtDuration(profile.source.seconds!),
                b: (c) => <span className="font-medium text-ink">{c}</span>,
                m: (c) => <span className="font-mono">{c}</span>,
              })}
              {profile.source.date ? ` · ${fmtDate(profile.source.date, locale)}` : ""}
            </p>
          )}
        </div>

        <div>
          <div className="eyebrow mb-3">{t("evolution")}</div>
          {history.some((h) => h.vdot !== null) ? (
            <VdotChart data={history} />
          ) : (
            <Hint height={200}>{t("notEnough")}</Hint>
          )}
          <dl className="mt-8 grid grid-cols-2 border-t border-hair">
            <HeroStat label={t("vma")} value={profile.vma > 0 ? `${profile.vma} km/h` : "—"} />
            <HeroStat label={t("weeklyVolume")} value={`${fitness.weeklyKm} km`} />
            <HeroStat label={t("endurance")} value={endurance.exponent.toFixed(3)} note={enduranceLabel(tt, endurance.labelKey)} />
            <HeroStat label={t("longestRun")} value={`${fitness.longestRunKm} km`} />
          </dl>
        </div>
      </section>

      <div className="mt-10 space-y-10">
        {/* ------------------------------------------------ Records */}
        <Section
          title={t("prTitle")}
          note={t.rich("prNote", { tag: (c) => <span className="tag">{c}</span> })}
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
                              {distanceName(tt, r.key, r.name)}
                            </span>
                            {isRef && (
                              <span className="tag border-clay/40 text-clay">
                                {t("tagReference")}
                              </span>
                            )}
                            {r.estimated && <span className="tag">{t("tagEstimated")}</span>}
                            {!isRef && !maximal && <span className="tag">{t("tagOuting")}</span>}
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
                          {r.date ? fmtDate(r.date, locale) : "—"}
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
          title={t("predTitle")}
          note={t("predNote", {
            vdot: profile.vdotDisplay,
            km: fitness.weeklyKm,
            long: fitness.longestRunKm,
            exponent: endurance.exponent.toFixed(3),
          })}
        >
          {preds.length ? (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("distance")}</th>
                    <th className="text-right">{t("potential")}</th>
                    <th className="text-right">{t("realistic")}</th>
                    <th className="text-right">{t("pace")}</th>
                    <th className="text-right">{t("yourRecord")}</th>
                    <th className="text-right">{t("gap")}</th>
                    <th>{t("reliability")}</th>
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
                            {distanceName(tt, p.key, p.name)}
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
                                {confidenceLabel(tt, p.confidence)}
                              </span>
                              <span className="text-micro text-ink3">
                                {predictionReason(tt, p, profile.source?.name ?? "")}
                              </span>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ) : (
            <Hint height={120}>{t("needEffort")}</Hint>
          )}
        </Section>

        {/* ------------------------------------------------ Allures */}
        {paces.length > 0 && (
          <Section
            title={t("pacesTitle")}
            note={t("pacesNote", { vdot: profile.vdotDisplay })}
          >
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("intensity")}</th>
                    <th className="text-right">{t("pacePerKm")}</th>
                    <th className="hidden sm:table-cell">{t("usage")}</th>
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
                          <span className="font-medium">{paceName(tt, p.key)}</span>
                        </span>
                      </td>
                      <td className="num whitespace-nowrap text-right font-medium">
                        {fmtPace(p.paceFast, "")} – {fmtPace(p.pace, "")}
                      </td>
                      <td className="hidden max-w-xl text-[0.8125rem] text-ink2 sm:table-cell">
                        {paceUsage(tt, p.key)}
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
function EmptySteps({ steps }: { steps: string[] }) {
  return (
    <ol className="mt-8 max-w-xl space-y-2 border-t border-hair pt-5">
      {steps.map((t, i) => (
        <li key={i} className="flex items-baseline gap-2.5 text-sm text-ink2">
          <span className="font-mono text-clay">{i + 1}.</span>
          {t}
        </li>
      ))}
    </ol>
  );
}
