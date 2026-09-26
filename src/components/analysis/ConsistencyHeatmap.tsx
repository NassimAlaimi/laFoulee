import { getLocale, getTranslations } from "next-intl/server";
import type { ConsistencyGrid } from "@/lib/analysis";

const DAYS = ["L", "M", "M", "J", "V", "S", "D"];

/**
 * Carte de chaleur jour × semaine.
 *
 * Pas de graphique ici : une grille CSS suffit, elle se lit d'un coup d'œil et
 * ne coûte rien à afficher. Les trous (coupures, blessures) sautent aux yeux
 * bien mieux que sur une courbe de volume.
 */
export async function ConsistencyHeatmap({ grid }: { grid: ConsistencyGrid }) {
  const t = await getTranslations("common");
  const locale = await getLocale();
  const max = Math.max(grid.max, 1);

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-[3px] pb-1">
        {/* Colonne des jours */}
        <div className="mr-1 flex shrink-0 flex-col gap-[3px] pt-[14px]">
          {DAYS.map((d, i) => (
            <div
              key={i}
              className="flex h-[13px] w-3 items-center justify-center text-[9px] leading-none text-ink3"
            >
              {i % 2 === 0 ? d : ""}
            </div>
          ))}
        </div>

        {grid.weeks.map((week, wi) => {
          const showLabel = wi % 4 === 0;
          return (
            <div key={wi} className="flex shrink-0 flex-col gap-[3px]">
              <div className="h-[11px] whitespace-nowrap text-[9px] leading-none text-ink3">
                {showLabel ? week.label.replace(".", "") : ""}
              </div>
              {week.days.map((day, di) => {
                const intensity = day.km > 0 ? 0.18 + (day.km / max) * 0.82 : 0;
                return (
                  <div
                    key={di}
                    title={`${day.date.toLocaleDateString(locale)} — ${
                      day.km > 0 ? `${day.km} km` : t("rest")
                    }`}
                    className="h-[13px] w-[13px] rounded-[2px] border border-hair/60"
                    style={{
                      background:
                        day.km > 0
                          ? `rgb(var(--clay) / ${intensity.toFixed(2)})`
                          : "rgb(var(--sunken))",
                    }}
                  />
                );
              })}
              <div className="mt-0.5 h-[10px] text-center font-mono text-[8px] leading-none text-ink3">
                {week.km > 0 ? Math.round(week.km) : ""}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2 text-micro text-ink3">
        <span>moins</span>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <span
            key={v}
            className="h-[10px] w-[10px] rounded-[2px] border border-hair/60"
            style={{
              background: v === 0 ? "rgb(var(--sunken))" : `rgb(var(--clay) / ${0.18 + v * 0.82})`,
            }}
          />
        ))}
        <span>{t("heatmapMax", { km: Math.round(max) })}</span>
      </div>
    </div>
  );
}
