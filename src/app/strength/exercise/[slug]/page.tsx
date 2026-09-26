import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Section } from "@/components/ui/Layout";
import { Metric, MetricBand } from "@/components/ui/Metric";
import { requireUserId } from "@/lib/auth";
import { fmtDateShort } from "@/lib/format";
import { loadWorkouts } from "@/lib/strength-store";
import { MUSCLE_LABELS, exerciseHistories, exerciseInfo, isWorkSet, nextSuggestion } from "@/lib/strength";

export const dynamic = "force-dynamic";

const kg = (v: number) => (v % 1 ? v.toFixed(1).replace(".", ",") : String(v));

export default async function ExercisePage({ params }: { params: Promise<{ slug: string }> }) {
  const t = await getTranslations("strength");
  const locale = await getLocale();
  const { slug: raw } = await params;
  const slug = decodeURIComponent(raw);
  const userId = await requireUserId();
  const workouts = await loadWorkouts(userId);
  const h = exerciseHistories(workouts.map((w) => ({ id: w.id, date: w.date, sets: w.sets }))).find(
    (x) => x.exercise === slug
  );
  if (!h) notFound();

  const info = exerciseInfo(slug);
  const secs = info.unit === "seconds";
  const last = h.sessions[h.sessions.length - 1];
  const first = h.sessions[0];
  const suggestion = nextSuggestion(last.sets);
  const metric = (s: (typeof h.sessions)[number]) => (s.e1rm ?? (s.topWeight > 0 ? s.topWeight : s.topReps));
  const unit = h.bestE1rm ? "kg" : secs ? "s" : "reps";
  const gain = h.sessions.length > 1 ? metric(last) - metric(first) : null;

  return (
    <div>
      <Link href="/strength" className="text-micro uppercase tracking-[0.1em] text-ink3 hover:text-clay">
        {t("backToStrength")}
      </Link>
      <h1 className="mt-2 text-[1.75rem] font-semibold tracking-[-0.02em]">{info.name}</h1>
      <p className="mb-8 mt-1.5 text-sm text-ink2">
        {info.primary.map((m) => MUSCLE_LABELS[m]).join(" · ") || t("freeExercise")}
        {info.runner && <span className="ml-3 text-sage">{t("runnerFor", { hint: info.runner })}</span>}
      </p>

      <MetricBand>
        <Metric
          label={h.bestE1rm ? t("bestE1rm") : secs ? t("bestHold") : t("bestSeries")}
          value={h.bestE1rm ? kg(Math.round(h.bestE1rm)) : h.bestReps}
          unit={unit}
          size="d2"
        />
        <Metric
          label={t("progression")}
          value={gain == null ? "—" : `${gain > 0 ? "+" : ""}${kg(Math.round(gain * 10) / 10)}`}
          unit={gain == null ? undefined : unit}
          note={gain == null ? t("oneSession") : t("since", { date: fmtDateShort(first.date, locale) })}
          size="d2"
        />
        <Metric label={t("sessions")} value={h.sessions.length} note={t("last", { date: fmtDateShort(last.date, locale) })} size="d2" />
        <Metric
          label={t("nextTime")}
          value={
            suggestion
              ? suggestion.weightKg > 0
                ? `${suggestion.reps}×${kg(suggestion.weightKg)}`
                : `${suggestion.reps}${secs ? " s" : ""}`
              : "—"
          }
          unit={suggestion && suggestion.weightKg > 0 ? "kg" : undefined}
          note={suggestion?.reason}
          size="d2"
        />
      </MetricBand>

      <div className="mt-10 space-y-10">
        {h.sessions.length > 1 && (
          <Section title={t("evolution")} note={h.bestE1rm ? t("evolutionNoteE1rm") : t("evolutionNoteBest")}>
            <ProgressChart
              points={h.sessions.map((s) => ({ date: s.date, value: metric(s), bar: s.tonnage }))}
              unit={unit}
              locale={locale}
              ariaLabel={t("evolution")}
            />
          </Section>
        )}

        <Section title={t("allSessions")}>
          {[...h.sessions].reverse().map((s) => (
            <Link
              key={s.workoutId}
              href={`/strength/${s.workoutId}`}
              className="group grid grid-cols-[72px_minmax(0,1fr)_auto] items-baseline gap-4 border-b border-hair py-2.5 last:border-b-0"
            >
              <span className="font-mono text-micro text-ink3">{fmtDateShort(s.date, locale)}</span>
              <span className="flex flex-wrap gap-1.5">
                {s.sets.filter(isWorkSet).map((x, i) => (
                  <span key={i} className="rounded-[4px] bg-sunken px-1.5 py-0.5 font-mono text-micro">
                    {x.weightKg > 0 ? `${x.reps} × ${kg(x.weightKg)}` : `${x.reps}${secs ? " s" : ""}`}
                  </span>
                ))}
              </span>
              <span className="font-mono text-[0.8125rem] font-medium group-hover:text-clay">
                {s.e1rm ? `${kg(Math.round(s.e1rm))} kg` : ""}
              </span>
            </Link>
          ))}
        </Section>
      </div>
    </div>
  );
}

function ProgressChart({
  points,
  unit,
  locale,
  ariaLabel,
}: {
  points: Array<{ date: Date; value: number; bar: number }>;
  unit: string;
  locale: string;
  ariaLabel: string;
}) {
  const W = 900;
  const H = 240;
  const P = { l: 44, r: 12, t: 16, b: 28 };
  const t0 = points[0].date.getTime();
  const t1 = points[points.length - 1].date.getTime();
  const x = (d: Date) => P.l + ((d.getTime() - t0) / (t1 - t0 || 1)) * (W - P.l - P.r);
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals) * 0.95;
  const hi = Math.max(...vals) * 1.03;
  const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo || 1)) * (H - P.t - P.b);
  const maxBar = Math.max(1, ...points.map((p) => p.bar));
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)} ${y(p.value).toFixed(1)}`).join("");
  const ticks = [lo, (lo + hi) / 2, hi];
  const best = Math.max(...vals);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={ariaLabel}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="rgb(var(--hair))" />
          <text x={P.l - 8} y={y(t)} dy="0.35em" textAnchor="end" fontSize={10} fill="rgb(var(--ink-3))">
            {Math.round(t)}
          </text>
        </g>
      ))}
      {points.map((p, i) => {
        const bh = (p.bar / maxBar) * (H - P.t - P.b) * 0.35;
        return (
          <rect key={`b${i}`} x={x(p.date) - 4} y={H - P.b - bh} width={8} height={bh} fill="rgb(var(--plum) / 0.22)" rx={1.5} />
        );
      })}
      <path d={line} fill="none" stroke="rgb(var(--plum))" strokeWidth={2} strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={x(p.date)}
          cy={y(p.value)}
          r={p.value === best ? 5 : 3.2}
          fill={p.value === best ? "rgb(var(--clay))" : "rgb(var(--panel))"}
          stroke={p.value === best ? "rgb(var(--clay))" : "rgb(var(--plum))"}
          strokeWidth={1.8}
        >
          <title>{`${fmtDateShort(p.date, locale)} : ${Math.round(p.value * 10) / 10} ${unit}`}</title>
        </circle>
      ))}
      <text x={P.l} y={H - 8} fontSize={10} fill="rgb(var(--ink-3))">
        {fmtDateShort(points[0].date, locale)}
      </text>
      <text x={W - P.r} y={H - 8} fontSize={10} textAnchor="end" fill="rgb(var(--ink-3))">
        {fmtDateShort(points[points.length - 1].date, locale)}
      </text>
    </svg>
  );
}
