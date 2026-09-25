import { getTranslations, getLocale } from "next-intl/server";
import { fmtDuration, fmtPace } from "@/lib/format";
import {
  POLAR_COLORS,
  ZONE_COLORS,
  ZONE_KEYS,
  percents,
  polarVerdict,
  polarized,
  type Band,
  type Coverage,
  type WeekZones,
  type ZoneModel,
} from "@/lib/zones";

/**
 * Répartition de l'intensité — lecture polarisée (facile / intermédiaire /
 * intense) en tête, puis le détail des 5 zones en cardio ET en allure, et
 * l'évolution semaine par semaine. Rendu serveur, sans bibliothèque.
 */
export async function ZoneSplit({
  model,
  hr,
  pace,
  weeks,
  coverage,
  sessions,
  maxHrSet,
}: {
  model: ZoneModel;
  hr: number[];
  pace: number[];
  weeks: WeekZones[];
  coverage: Coverage;
  sessions: number;
  maxHrSet: boolean;
}) {
  const t = await getTranslations("zones");
  const locale = await getLocale();
  // Dimension principale : le cardio si on en a, sinon l'allure.
  const hrTotal = hr.reduce((a, b) => a + b, 0);
  const main = hrTotal > 0 ? hr : pace;
  const mainTotal = main.reduce((a, b) => a + b, 0);
  const pol = polarized(main);
  const [low, mid, high] = percents([pol.low, pol.mid, pol.high]);
  const verdict = polarVerdict(main, sessions);
  // Désaccord cardio / allure : une information en soi (chaleur, fatigue,
  // dénivelé, ou seuil cardio mal calé).
  const paceTotal = pace.reduce((a, b) => a + b, 0);
  const hardShare = (s: number[], tot: number) => (tot > 0 ? Math.round(((tot - polarized(s).low) / tot) * 100) : 0);
  const gap = hrTotal > 0 && paceTotal > 0 ? hardShare(hr, hrTotal) - hardShare(pace, paceTotal) : 0;
  const discord = sessions >= 4 && Math.abs(gap) >= 15 ? gap : null;

  if (mainTotal === 0) {
    return <p className="text-[0.8125rem] text-ink3">{t("empty")}</p>;
  }

  return (
    <div className="space-y-10">
      {/* Manchette : la part facile, en très grand */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-end">
        <div>
          <div className="flex items-baseline gap-3">
            <span className="num text-[clamp(3.2rem,8vw,5.5rem)] font-semibold leading-none tracking-[-0.04em]">
              {low}
              <span className="text-[0.45em] text-ink3">%</span>
            </span>
            <span className="text-[0.9375rem] text-ink2">{t("easyShare")}</span>
          </div>
          <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed">{t(`verdict.${verdict}`)}</p>
          {discord !== null && (
            <p className="mt-3 max-w-md border-l-2 border-ochre pl-3 text-[0.8125rem] leading-relaxed text-ink2">
              {t(discord > 0 ? "discordHeart" : "discordPace", { n: Math.abs(discord) })}
            </p>
          )}
        </div>

        <div>
          <div className="relative">
            <div className="flex h-3 w-full overflow-hidden">
              {(
                [
                  ["low", low],
                  ["mid", mid],
                  ["high", high],
                ] as const
              ).map(([k, v]) =>
                v > 0 ? (
                  <div key={k} style={{ width: `${v}%`, background: POLAR_COLORS[k] }} title={`${t(`polar.${k}`)} ${v} %`} />
                ) : null
              )}
            </div>
            {/* Repère 80 % */}
            <div className="absolute -top-2 bottom-[-8px] w-px bg-ink" style={{ left: "80%" }} aria-hidden />
            <span className="absolute -top-6 -translate-x-1/2 text-micro text-ink2" style={{ left: "80%" }}>
              80/20
            </span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4">
            {(
              [
                ["low", low],
                ["mid", mid],
                ["high", high],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="border-t-2 pt-2" style={{ borderColor: POLAR_COLORS[k] }}>
                <div className="num text-[1.25rem] font-semibold">{v} %</div>
                <div className="text-micro text-ink2">{t(`polar.${k}`)}</div>
                <div className="text-micro text-ink3">{t(`polarHint.${k}`)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Semaine par semaine */}
      <WeekBars weeks={weeks} useHr={hrTotal > 0} locale={locale} label={t("weekly")} />

      {/* Détail 5 zones : cardio | allure */}
      <div className="grid gap-10 md:grid-cols-2">
        <ZoneTable
          title={t("byHr")}
          seconds={hr}
          bands={model.hr}
          fmt={(b) => (b.high === Infinity ? `≥ ${b.low}` : b.low === 0 ? `< ${b.high}` : `${b.low}–${b.high - 1}`)}
          unit="bpm"
          empty={t("noHrData")}
          names={ZONE_KEYS.map((k) => t(`name.${k}`))}
        />
        <ZoneTable
          title={t("byPace")}
          seconds={pace}
          bands={model.pace}
          fmt={(b) =>
            b.high === Infinity
              ? `> ${fmtPace(b.low, "")}`
              : b.low === 0
                ? `< ${fmtPace(b.high, "")}`
                : `${fmtPace(b.high, "")}–${fmtPace(b.low, "")}`
          }
          unit="/km"
          empty={t("noPaceData")}
          names={ZONE_KEYS.map((k) => t(`name.${k}`))}
        />
      </div>

      {/* Sources : toujours dire d'où viennent les chiffres */}
      <div className="space-y-1 border-t border-hair pt-3 text-micro text-ink3">
        <p>
          {t(`source.hr.${model.hrSource}`, { lthr: model.lthr ?? 0 })}
          {" · "}
          {t(`source.pace.${model.paceSource}`, { pace: model.thresholdPace ? fmtPace(model.thresholdPace) : "—" })}
        </p>
        <p>
          {t("coverage", {
            sessions,
            stream: coverage.stream,
            splits: coverage.splits,
            average: coverage.average,
            noHr: coverage.noHr,
          })}
        </p>
        {!maxHrSet && model.hrSource === "reserve" && <p className="text-ochre">{t("maxHrEstimated")}</p>}
      </div>
    </div>
  );
}

function ZoneTable({
  title,
  seconds,
  bands,
  fmt,
  unit,
  empty,
  names,
}: {
  title: string;
  seconds: number[];
  bands: Band[] | null;
  fmt: (b: Band) => string;
  unit: string;
  empty: string;
  names: string[];
}) {
  const total = seconds.reduce((a, b) => a + b, 0);
  const pct = percents(seconds);
  return (
    <div>
      <div className="eyebrow mb-3">{title}</div>
      {!bands || total === 0 ? (
        <p className="text-[0.8125rem] text-ink3">{empty}</p>
      ) : (
        <>
          <div className="flex h-2 w-full overflow-hidden">
            {ZONE_KEYS.map((k, i) =>
              seconds[i] > 0 ? (
                <div key={k} style={{ width: `${(seconds[i] / total) * 100}%`, background: ZONE_COLORS[k] }} />
              ) : null
            )}
          </div>
          <div className="mt-2">
            {ZONE_KEYS.map((k, i) => (
              <div key={k} className="flex items-baseline gap-3 border-b border-hair py-1.5 last:border-b-0">
                <span className="h-[3px] w-3 shrink-0 translate-y-[-2px]" style={{ background: ZONE_COLORS[k] }} />
                <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink2">{names[i]}</span>
                <span className="hidden text-micro text-ink3 sm:inline">
                  {fmt(bands[i])} {unit}
                </span>
                <span className="w-14 text-right font-mono text-[0.8125rem] tabular-nums">{fmtDuration(seconds[i])}</span>
                <span className="w-10 text-right font-mono text-[0.8125rem] tabular-nums text-ink2">{pct[i]}%</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Barres empilées polarisées, une par semaine, hauteur = volume horaire. */
function WeekBars({ weeks, useHr, locale, label }: { weeks: WeekZones[]; useHr: boolean; locale: string; label: string }) {
  const totals = weeks.map((w) => (useHr ? w.hr : w.pace).reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...totals);
  return (
    <div>
      <div className="eyebrow mb-3">{label}</div>
      <div className="grid h-28 items-end gap-2" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.map((w, i) => {
          const pol = polarized(useHr ? w.hr : w.pace);
          const total = totals[i];
          const h = (total / max) * 100;
          return (
            <div key={i} className="flex h-full flex-col justify-end" title={`${fmtDuration(total)}`}>
              {total > 0 ? (
                <div className="flex w-full flex-col-reverse" style={{ height: `${h}%` }}>
                  {(["low", "mid", "high"] as const).map((k) =>
                    pol[k] > 0 ? (
                      <div key={k} style={{ height: `${(pol[k] / total) * 100}%`, background: POLAR_COLORS[k] }} />
                    ) : null
                  )}
                </div>
              ) : (
                <div className="h-px w-full bg-hair" />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 grid gap-2" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.map((w, i) => (
          <span key={i} className="truncate text-center text-[10px] text-ink3">
            {w.weekStart.toLocaleDateString(locale, { day: "numeric", month: "short" })}
          </span>
        ))}
      </div>
    </div>
  );
}
