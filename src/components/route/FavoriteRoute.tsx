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
import { useLocale, useTranslations } from "next-intl";

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
  const theme = useChartTheme();
  const tt = useTranslations("activity");
  const locale = useLocale();
  const tl = routeTimeline(items);
  const s = favoriteRouteSummary(tl);
  const data = tl.map((o) => ({
    label: fmtDateShort(o.date, locale),
    avgPace: o.pace,
    avgHr: o.hr,
  }));

  const fr = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

  let narrative: string;
  if (s.trend == null) {
    narrative =
      s.spanDays < MIN_TREND_SPAN_DAYS
        ? tt("favFew", { n: s.count, d: s.spanDays, s: s.spanDays > 1 ? "s" : "" })
        : tt("favNotRegular");
  } else if (s.trend <= -2) {
    narrative = tt("favGaining", { x: fr(Math.abs(s.trend)) });
  } else if (s.trend >= 2) {
    narrative = tt("favLosing", { x: fr(s.trend) });
  } else {
    narrative = tt("favStable");
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
        <h2 className="eyebrow">{tt("favoriteRoute")}</h2>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center">
        <div>
          <div className="flex items-baseline gap-2.5">
            <span className="display text-d2">× {s.count}</span>
            <span className="text-[0.9375rem] text-ink3">{tt("timesThisKm", { km: fr(s.km) })}</span>
          </div>
          <p className="mt-1 text-sm text-ink3">{tt("since", { date: fmtDate(s.first, locale) })}</p>

          <p className="mt-4 max-w-md text-[0.9375rem] leading-relaxed text-ink2">
            {narrative}
          </p>

          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[0.8125rem] text-ink2">
            <span>
              {tt("best")} <span className="font-mono text-ink">{fmtPace(s.bestPace)}</span>
            </span>
            <span>
              {tt("last")} <span className="font-mono text-ink">{fmtPace(s.recentPace)}</span>
            </span>
          </div>
        </div>

        <div>
          <PaceProgressionChart data={data} />
          <div className="mt-1">
            <Legend
              items={[
                { label: tt("pace"), color: theme.clay },
                ...(s.hr ? [{ label: tt("avgHr"), color: theme.slate, dashed: true }] : []),
              ]}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
