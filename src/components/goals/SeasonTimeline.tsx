import { getTranslations } from "next-intl/server";
import { seasonPlan, type SeasonPhase, type SeasonRace } from "@/lib/season";
import { fmtDateShort } from "@/lib/format";

const COLOR: Record<SeasonPhase, string> = {
  base: "rgb(var(--sage) / 0.7)",
  build: "rgb(var(--slate) / 0.8)",
  peak: "rgb(var(--ochre) / 0.8)",
  taper: "rgb(var(--clay) / 0.8)",
  race: "rgb(var(--rust))",
  recovery: "rgb(var(--plum) / 0.7)",
  maintain: "rgb(var(--hair-strong))",
};

/**
 * Frise de saison : l'année en colonnes de semaines, colorées par phase,
 * avec les courses A/B/C en drapeaux. La « couverture » du pôle Courses.
 */
export async function SeasonTimeline({ races, startWeeklyKm }: { races: SeasonRace[]; startWeeklyKm: number }) {
  const t = await getTranslations("season");
  const season = seasonPlan({ races, startWeeklyKm });
  if (season.weeks.length === 0) return null;

  const W = 1000;
  const H = 88;
  const pad = 6;
  const n = season.weeks.length;
  const cw = (W - 2 * pad) / n;
  const flags: Array<{ x: number; label: string; color: string; name: string }> = [];
  for (const race of races) {
    const wk = season.weeks.find((w) => w.raceIds.includes(race.id));
    if (wk) {
      const i = season.weeks.indexOf(wk);
      flags.push({
        x: pad + i * cw + cw / 2,
        label: race.priority,
        color: race.priority === "A" ? "rgb(var(--rust))" : race.priority === "B" ? "rgb(var(--clay))" : "rgb(var(--ink-3))",
        name: race.name,
      });
    }
  }

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t("aria")}>
        {season.weeks.map((w, i) => {
          const x = pad + i * cw;
          return (
            <g key={i}>
              <rect x={x} y={26} width={Math.max(1, cw - 1)} height={H - 34} fill={COLOR[w.phase]} rx="1.5">
                <title>{`${fmtDateShort(w.weekStart)} — ${t(`phase.${w.phase}`)}${w.note ? ` · ${w.note}` : ""} · ~${w.targetKm} km`}</title>
              </rect>
              {(i % 4 === 0) && (
                <text x={x} y={H - 4} fontSize="8" fill="rgb(var(--ink-3))">
                  {w.weekStart.toLocaleDateString("fr-FR", { month: "short" })}
                </text>
              )}
            </g>
          );
        })}
        {flags.map((f, i) => (
          <g key={i}>
            <line x1={f.x} x2={f.x} y1={2} y2={24} stroke={f.color} strokeWidth="1.2" />
            <circle cx={f.x} cy={10} r="7" fill={f.color}>
              <title>{`${f.name}`}</title>
            </circle>
            <text x={f.x} y={13.5} fontSize="8" textAnchor="middle" fill="rgb(var(--bg))" fontWeight="700">
              {f.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-micro text-ink3">
        {(["base", "build", "peak", "taper", "race", "recovery"] as const).map((p) => (
          <span key={p} className="flex items-center gap-1.5">
            <span className="h-[9px] w-[9px] rounded-[1px]" style={{ background: COLOR[p] }} />
            {t(`phase.${p}`)}
          </span>
        ))}
      </div>
      {season.conflicts.length > 0 && <p className="mt-3 text-micro text-ochre">{t("conflict")}</p>}
    </div>
  );
}
