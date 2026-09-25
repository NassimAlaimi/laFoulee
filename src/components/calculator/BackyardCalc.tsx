"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { backyardTable, backyardWeeklyHours } from "@/lib/backyard";
import { fmtDuration } from "@/lib/format";

/** Calculateur backyard : allure mixte course/marche → temps de boucle et repos. */
export function BackyardCalc() {
  const t = useTranslations("backyard");
  const [run, setRun] = useState("6:00");
  const [walk, setWalk] = useState("11:00");
  const [ratio, setRatio] = useState(0.7);
  const [loops, setLoops] = useState(24);

  const pace = (s: string) => {
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : 360;
  };
  const table = useMemo(() => backyardTable({ runPace: pace(run), walkPace: pace(walk), runRatio: ratio, loops }), [run, walk, ratio, loops]);
  const week = backyardWeeklyHours(loops);

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]">
      <div className="space-y-5">
        <div className="flex flex-wrap gap-4">
          <label>
            <div className="eyebrow mb-1.5">{t("runPace")}</div>
            <input className="field w-24" value={run} onChange={(e) => setRun(e.target.value)} placeholder="6:00" />
          </label>
          <label>
            <div className="eyebrow mb-1.5">{t("walkPace")}</div>
            <input className="field w-24" value={walk} onChange={(e) => setWalk(e.target.value)} placeholder="11:00" />
          </label>
          <label>
            <div className="eyebrow mb-1.5">{t("loops")}</div>
            <input className="field w-24" type="number" min={1} max={100} value={loops} onChange={(e) => setLoops(Number(e.target.value) || 1)} />
          </label>
        </div>
        <label className="block">
          <div className="eyebrow mb-1.5">{t("mix")} — <span className="normal-case">{t("runShare", { p: Math.round(ratio * 100) })}</span></div>
          <input type="range" min={0.3} max={1} step={0.05} value={ratio} onChange={(e) => setRatio(Number(e.target.value))} className="w-full accent-clay" />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="num text-[2rem] font-semibold leading-none">{table.totalKm.toFixed(0)} <span className="text-micro text-ink3">km</span></div>
            <div className="mt-1 text-micro text-ink3">{t("total")}</div>
          </div>
          <div>
            <div className="num text-[2rem] font-semibold leading-none">{table.rows[0] ? fmtDuration(table.rows[0].loopSeconds) : "—"}</div>
            <div className="mt-1 text-micro text-ink3">{t("perLoop")}</div>
          </div>
        </div>
        <div className="border-t border-hair pt-3 text-[0.8125rem] text-ink2">
          <p>{t("weekly", { peak: week.peak, base: week.base, long: week.longRun })}</p>
          {table.rows[0]?.tooSlow && <p className="mt-2 text-rust">{t("tooSlow")}</p>}
          {table.sleepBorrowed > 0 && <p className="mt-2 text-ochre">{t("sleep", { h: table.sleepBorrowed })}</p>}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("loop")}</th>
              <th className="text-right">{t("km")}</th>
              <th className="text-right">{t("loopTime")}</th>
              <th className="text-right">{t("rest")}</th>
              <th className="text-right">{t("cumHours")}</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr key={r.loop} className={r.tooSlow ? "text-rust" : ""}>
                <td className="font-mono tabular-nums">{r.loop}</td>
                <td className="text-right font-mono tabular-nums text-ink2">{r.km.toFixed(1)}</td>
                <td className="text-right font-mono tabular-nums">{fmtDuration(r.loopSeconds)}</td>
                <td className="text-right font-mono tabular-nums text-ink3">{r.restSeconds > 0 ? fmtDuration(r.restSeconds) : "—"}</td>
                <td className="text-right font-mono tabular-nums text-ink2">{r.hours.toFixed(1)} h</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
