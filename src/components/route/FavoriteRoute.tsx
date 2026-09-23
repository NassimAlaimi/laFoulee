"use client";

import { RouteGlyph } from "./RouteGlyph";
import { PaceProgressionChart } from "@/components/charts/PaceChart";
import { Legend, useChartTheme } from "@/components/charts/theme";
import {
  MIN_TREND_SPAN_DAYS,
  favoriteRouteSummary,
  routeTimeline,
} from "@/lib/favorite-route";
import { fmtDate, fmtDateShort, fmtPace } from "@/lib/format";

type Item = {
  id: string;
  startDate: Date;
  distance: number;
  movingTime: number;
  averageHr: number | null;
  isRace: boolean;
  polyline: string | null;
};

/**
 * « Ton parcours fétiche » — le tracé le plus couru, et sa progression.
 *
 * Un grand « × N », la distance moyenne, l'année de la première sortie, puis
 * la courbe d'allure (et de cardio si mesuré) occurrence par occurrence, avec
 * la tendance racontée en une phrase. Le tout sans toucher aux zones gelées.
 */
export function FavoriteRoute({
  items,
  polyline,
}: {
  items: Item[];
  polyline: string | null;
}) {
  const t = useChartTheme();
  const tl = routeTimeline(items);
  const s = favoriteRouteSummary(tl);
  const data = tl.map((o) => ({
    label: fmtDateShort(o.date),
    avgPace: o.pace,
    avgHr: o.hr,
  }));

  const fr = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

  let narrative: string;
  if (s.trend == null) {
    narrative =
      s.spanDays < MIN_TREND_SPAN_DAYS
        ? `${s.count} passages en ${s.spanDays} jour${s.spanDays > 1 ? "s" : ""} — trop récent pour lire une tendance annuelle.`
        : "Pas assez de régularité pour lire une tendance.";
  } else if (s.trend <= -2) {
    narrative = `Tu gagnes ${fr(Math.abs(s.trend))} s/km par an sur ce parcours.`;
  } else if (s.trend >= 2) {
    narrative = `Tu perds ${fr(s.trend)} s/km par an — un creux passager ?`;
  } else {
    narrative = "Allure remarquablement stable d'une sortie à l'autre.";
  }

  return (
    <section className="mt-8 border-t border-hair pt-6">
      <div className="flex items-center gap-3">
        <RouteGlyph
          polyline={polyline}
          size={44}
          strokeWidth={1.5}
          className="shrink-0 text-ink2"
        />
        <h2 className="eyebrow">Ton parcours fétiche</h2>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center">
        <div>
          <div className="flex items-baseline gap-2.5">
            <span className="display text-d2">× {s.count}</span>
            <span className="text-[0.9375rem] text-ink3">fois ce {fr(s.km)} km</span>
          </div>
          <p className="mt-1 text-sm text-ink3">depuis {fmtDate(s.first)}</p>

          <p className="mt-4 max-w-md text-[0.9375rem] leading-relaxed text-ink2">
            {narrative}
          </p>

          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[0.8125rem] text-ink2">
            <span>
              Meilleur <span className="font-mono text-ink">{fmtPace(s.bestPace)}</span>
            </span>
            <span>
              Dernier <span className="font-mono text-ink">{fmtPace(s.recentPace)}</span>
            </span>
          </div>
        </div>

        <div>
          <PaceProgressionChart data={data} />
          <div className="mt-1">
            <Legend
              items={[
                { label: "Allure", color: t.clay },
                ...(s.hr ? [{ label: "FC", color: t.slate, dashed: true }] : []),
              ]}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
