"use client";

import { useMemo, useState } from "react";
import { distanceName, paceName, paceUsage } from "@/components/terms";
import { useTranslations } from "next-intl";
import { fmtDuration, fmtPace, pacePerKm } from "@/lib/format";
import { STANDARD_DISTANCES } from "@/lib/records";
import {
  danielsPaces,
  timeFromVdot,
  vdotFromPerformance,
  vdotLevel,
  vmaFromVdot,
} from "@/lib/vdot";

const PRESETS = STANDARD_DISTANCES.filter((d) => d.major || d.key === "mile");

/**
 * Calculateur interactif : on saisit une performance, tout le reste
 * (VDOT, VMA, chronos équivalents, allures d'entraînement) se recalcule.
 */
export function CalculatorClient({
  initialDistance,
  initialSeconds,
}: {
  initialDistance: number;
  initialSeconds: number;
}) {
  const t = useTranslations("calculator");
  const tt = useTranslations("terms");
  const [meters, setMeters] = useState(initialDistance);
  const [h, setH] = useState(Math.floor(initialSeconds / 3600));
  const [m, setM] = useState(Math.floor((initialSeconds % 3600) / 60));
  const [s, setS] = useState(initialSeconds % 60);

  const seconds = h * 3600 + m * 60 + s;
  const valid = meters > 0 && seconds > 0;

  const { vdot, vma, level, equivalents, paces, pace } = useMemo(() => {
    if (!valid) {
      return {
        vdot: 0,
        vma: 0,
        level: null,
        equivalents: [],
        paces: [],
        pace: 0,
      };
    }
    const v = vdotFromPerformance(meters, seconds);
    return {
      vdot: v,
      vma: vmaFromVdot(v),
      level: vdotLevel(v),
      pace: pacePerKm(meters, seconds),
      equivalents: STANDARD_DISTANCES.map((d) => {
        const t = timeFromVdot(v, d.meters);
        return {
          key: d.key,
          name: d.name,
          meters: d.meters,
          seconds: t,
          pace: pacePerKm(d.meters, t),
          isSource: Math.abs(d.meters - meters) < 1,
        };
      }),
      paces: danielsPaces(v),
    };
  }, [meters, seconds, valid]);

  return (
    <div className="space-y-10">
      {/* ---------------------------------------------------- Saisie */}
      <section className="border-t border-hair pt-5">
        <h2 className="eyebrow mb-5">{t("reference")}</h2>

        <div className="flex flex-wrap items-end gap-x-8 gap-y-5">
          <div>
            <span className="field-label">{t("distance")}</span>
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((d) => (
                <button
                  key={d.key}
                  onClick={() => setMeters(d.meters)}
                  className={`rounded-[6px] border px-2.5 py-1.5 text-[0.8125rem] transition-colors ${
                    Math.abs(meters - d.meters) < 1
                      ? "border-clay bg-clay/10 text-clay"
                      : "border-hair text-ink2 hover:border-hairStrong hover:text-ink"
                  }`}
                >
                  {distanceName(tt, d.key, d.name)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="custom-km">
              {t("freeDistance")}
            </label>
            <input
              id="custom-km"
              type="number"
              step="0.1"
              min="0.1"
              value={(meters / 1000).toFixed(meters % 1000 === 0 ? 0 : 2)}
              onChange={(e) => setMeters(Math.max(1, Number(e.target.value) * 1000))}
              className="field w-32"
            />
          </div>

          <div>
            <span className="field-label">{t("time")}</span>
            <div className="flex items-center gap-1.5">
              <TimeInput value={h} onChange={setH} max={23} suffix="h" />
              <TimeInput value={m} onChange={setM} max={59} suffix="min" />
              <TimeInput value={s} onChange={setS} max={59} suffix="s" />
            </div>
          </div>

          <div className="pb-1">
            <div className="eyebrow">{t("pace")}</div>
            <div className="mt-1.5 font-mono text-d4 tabular-nums">
              {valid ? fmtPace(pace, "") : "—"}
              <span className="ml-1 text-micro text-ink3">/km</span>
            </div>
          </div>
        </div>
      </section>

      {!valid ? (
        <p className="border-t border-hair pt-8 text-sm text-ink2">
          {t("enterPrompt")}
        </p>
      ) : (
        <>
          {/* ---------------------------------------------------- Résultat */}
          <section className="grid gap-px border-y border-hair bg-hair sm:grid-cols-3">
            <Figure
              label={t("vdot")}
              value={vdot.toFixed(1)}
              note={level ? tt(`level.${level.key}`) : undefined}
              big
            />
            <Figure label={t("vma")} value={vma.toFixed(1)} unit="km/h" />
            <Figure
              label={t("vmaPace")}
              value={fmtPace(3600 / vma, "")}
              unit="/km"
            />
          </section>

          {/* ---------------------------------------------------- Équivalents */}
          <section className="border-t border-hair pt-5">
            <h2 className="eyebrow mb-1.5">{t("equivalents")}</h2>
            <p className="mb-5 max-w-2xl text-[0.8125rem] leading-relaxed text-ink2">
              {t("equivalentsNote")}
            </p>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("distance")}</th>
                    <th className="text-right">{t("time")}</th>
                    <th className="text-right">{t("pace")}</th>
                    <th className="text-right">{t("speed")}</th>
                  </tr>
                </thead>
                <tbody>
                  {equivalents.map((e) => (
                    <tr key={e.key} className={e.isSource ? "text-clay" : ""}>
                      <td className={e.isSource ? "font-medium" : ""}>
                        {distanceName(tt, e.key, e.name)}
                        {e.isSource && <span className="ml-2 tag">{t("entered")}</span>}
                      </td>
                      <td className="num text-right font-medium">
                        {fmtDuration(e.seconds)}
                      </td>
                      <td className="num text-right text-ink2">
                        {fmtPace(e.pace, "")}
                      </td>
                      <td className="num text-right text-ink2">
                        {(3600 / e.pace).toFixed(1)} km/h
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ---------------------------------------------------- Allures */}
          <section className="border-t border-hair pt-5">
            <h2 className="eyebrow mb-1.5">{t("trainingPaces")}</h2>
            <p className="mb-5 text-[0.8125rem] text-ink2">
              {t("danielsNote", { vdot: vdot.toFixed(1) })}
            </p>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("intensity")}</th>
                    <th className="text-right">{t("pace")}</th>
                    <th className="text-right">{t("per400")}</th>
                    <th className="text-right">{t("per1k")}</th>
                    <th className="hidden md:table-cell">{t("usage")}</th>
                  </tr>
                </thead>
                <tbody>
                  {paces.map((p) => (
                    <tr key={p.key}>
                      <td>
                        <span className="flex items-center gap-2">
                          <span
                            className="h-[3px] w-3"
                            style={{ background: p.color }}
                          />
                          {paceName(tt, p.key)}
                        </span>
                      </td>
                      <td className="num text-right font-medium">
                        {fmtPace(p.paceFast, "")} – {fmtPace(p.pace, "")}
                      </td>
                      <td className="num text-right text-ink2">
                        {fmtDuration((p.pace * 0.4 + p.paceFast * 0.4) / 2)}
                      </td>
                      <td className="num text-right text-ink2">
                        {fmtDuration((p.pace + p.paceFast) / 2)}
                      </td>
                      <td className="hidden max-w-sm text-[0.8125rem] text-ink2 md:table-cell">
                        {paceUsage(tt, p.key)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function TimeInput({
  value,
  onChange,
  max,
  suffix,
}: {
  value: number;
  onChange: (n: number) => void;
  max: number;
  suffix: string;
}) {
  return (
    <span className="flex items-baseline">
      <input
        type="number"
        min="0"
        max={max}
        value={value}
        onChange={(e) =>
          onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))
        }
        className="field w-[3.75rem] text-center font-mono tabular-nums"
      />
      <span className="ml-1 mr-1.5 text-micro text-ink3">{suffix}</span>
    </span>
  );
}

function Figure({
  label,
  value,
  unit,
  note,
  big,
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  big?: boolean;
}) {
  return (
    <div className="bg-bg px-5 py-6 first:pl-0">
      <div className="eyebrow">{label}</div>
      <div className="mt-2.5 flex items-baseline gap-1.5">
        <span className={`display ${big ? "text-d2" : "text-d3"}`}>{value}</span>
        {unit && <span className="text-sm text-ink3">{unit}</span>}
      </div>
      {note && <div className="mt-2 text-[0.8125rem] text-ink2">{note}</div>}
    </div>
  );
}
