import { getTranslations } from "next-intl/server";
import type { Insight, InsightTone } from "@/lib/insights";

const TONE: Record<InsightTone, { mark: string; key: string }> = {
  good: { mark: "rgb(var(--sage))", key: "insights.tone.good" },
  warn: { mark: "rgb(var(--ochre))", key: "insights.tone.warn" },
  risk: { mark: "rgb(var(--rust))", key: "insights.tone.risk" },
  neutral: { mark: "rgb(var(--hair-strong))", key: "insights.tone.neutral" },
};

/**
 * Observations présentées comme des entrées de carnet : un filet coloré
 * à gauche, un titre, une explication, et la mesure qui la justifie.
 */
export async function InsightList({ insights }: { insights: Insight[] }) {
  const t = await getTranslations("home");

  if (!insights.length) {
    return (
      <p className="py-8 text-[0.8125rem] text-ink3">
        {t("insights.none")}
      </p>
    );
  }

  return (
    <ul className="space-y-0">
      {insights.map((i) => {
        const tone = TONE[i.tone];
        return (
          <li
            key={i.id}
            className="flex gap-4 border-b border-hair py-4 last:border-b-0"
          >
            <span
              className="mt-1.5 h-[calc(100%-0.75rem)] w-[2px] shrink-0"
              style={{ background: tone.mark }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-[0.9375rem] font-medium">
                  {t(i.titleKey, i.titleParams)}
                </h3>
                <span className="text-micro uppercase tracking-[0.08em] text-ink3">
                  {t(tone.key)}
                </span>
              </div>
              <p className="mt-1.5 max-w-2xl text-[0.8125rem] leading-relaxed text-ink2">
                {t(i.detailKey)}
              </p>
              <p className="mt-2 font-mono text-micro text-ink3">
                {t(i.evidenceKey, i.evidenceParams)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
