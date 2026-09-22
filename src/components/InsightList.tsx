import type { Insight, InsightTone } from "@/lib/insights";

const TONE: Record<InsightTone, { mark: string; label: string }> = {
  good: { mark: "rgb(var(--sage))", label: "Positif" },
  warn: { mark: "rgb(var(--ochre))", label: "À surveiller" },
  risk: { mark: "rgb(var(--rust))", label: "Alerte" },
  neutral: { mark: "rgb(var(--hair-strong))", label: "Note" },
};

/**
 * Observations présentées comme des entrées de carnet : un filet coloré
 * à gauche, un titre, une explication, et la mesure qui la justifie.
 */
export function InsightList({ insights }: { insights: Insight[] }) {
  if (!insights.length) {
    return (
      <p className="py-8 text-[0.8125rem] text-ink3">
        Rien à signaler sur la période — continue comme ça.
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
                <h3 className="text-[0.9375rem] font-medium">{i.title}</h3>
                <span className="text-micro uppercase tracking-[0.08em] text-ink3">
                  {tone.label}
                </span>
              </div>
              <p className="mt-1.5 max-w-2xl text-[0.8125rem] leading-relaxed text-ink2">
                {i.detail}
              </p>
              <p className="mt-2 font-mono text-micro text-ink3">{i.evidence}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
