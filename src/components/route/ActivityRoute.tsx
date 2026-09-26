"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fmtDuration, fmtPace } from "@/lib/format";

export type RouteSplit = {
  index: number;
  meters: number;
  pace: number; // s/km
  hr: number | null;
  elevation: number;
  movingTime: number;
};

export type RouteGeometry = {
  w: number;
  h: number;
  segments: Array<{ km: number; d: string }>;
  markers: Array<{ km: number; at: [number, number] }>;
  start: [number, number] | null;
  end: [number, number] | null;
  scaleBar: { px: number; label: string } | null;
};

/**
 * Couleur d'un kilomètre selon son écart à l'allure moyenne de la séance.
 * Mélange continu sauge → encre → terre cuite : ±6 % d'écart suffit à
 * saturer, au-delà la nuance n'apporte plus rien à l'œil.
 */
export function paceColor(pace: number, avg: number): string {
  if (!pace || !avg) return "rgb(var(--ink-3))";
  const t = Math.max(-1, Math.min(1, (pace - avg) / (avg * 0.06)));
  if (t < 0) {
    return `color-mix(in oklab, rgb(var(--sage)) ${Math.round(-t * 100)}%, rgb(var(--ochre)))`;
  }
  return `color-mix(in oklab, rgb(var(--clay)) ${Math.round(t * 100)}%, rgb(var(--ochre)))`;
}

/**
 * Tracé + bande d'allure, liés : survoler un kilomètre sur la carte le met en
 * évidence dans la bande, et inversement. Le panneau de lecture à droite
 * affiche le kilomètre survolé, ou la séance entière par défaut.
 */
export function ActivityRoute({
  geometry,
  splits,
  avgPace,
  summary,
}: {
  geometry: RouteGeometry | null;
  splits: RouteSplit[];
  avgPace: number;
  summary: { pace: number; time: number; hr: number | null; elevation: number; km: number };
}) {
  const tt = useTranslations("activity");
  const [active, setActive] = useState<number | null>(null);
  const split = active != null ? splits.find((s) => s.index === active) : undefined;

  // ← → au clavier pour parcourir les kilomètres quand la bande a le focus
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      e.stopPropagation();
      setActive((cur) => {
        const max = splits.length;
        if (cur == null) return e.key === "ArrowRight" ? 1 : max;
        const next = cur + (e.key === "ArrowRight" ? 1 : -1);
        return next < 1 ? max : next > max ? 1 : next;
      });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [focused, splits.length]);

  const colorFor = (km: number) => {
    const s = splits.find((x) => x.index === km);
    return s ? paceColor(s.pace, avgPace) : "rgb(var(--ink-2))";
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="min-w-0 space-y-5">
        {geometry && geometry.segments.length > 0 ? (
          <RouteCanvas
            geometry={geometry}
            active={active}
            onHover={setActive}
            colorFor={colorFor}
            hasSplits={splits.length > 0}
          />
        ) : (
          <div className="flex h-[200px] items-center justify-center rounded-card border border-dashed border-hairStrong text-[0.8125rem] text-ink3">
            {tt("noGps")}
          </div>
        )}

        {splits.length > 0 && (
          <div
            tabIndex={0}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className="rounded-[6px] outline-offset-4"
            aria-label={tt("pacePerKmNav")}
          >
            <SplitStrip
              splits={splits}
              avgPace={avgPace}
              active={active}
              onHover={setActive}
            />
          </div>
        )}
      </div>

      {/* ------------------------------------------------ Lecture */}
      <aside className="lg:border-l lg:border-hair lg:pl-6">
        <div className="eyebrow">{split ? tt("kmN", { n: split.index }) : tt("wholeSession")}</div>
        <div className="mt-3 flex items-baseline gap-1.5">
          <span
            className="display text-d2 transition-colors"
            style={split ? { color: paceColor(split.pace, avgPace) } : undefined}
          >
            {fmtPace(split ? split.pace : summary.pace, "")}
          </span>
          <span className="text-sm text-ink3">/km</span>
        </div>
        <div className="mt-2 h-5 text-[0.8125rem] text-ink2">
          {split ? <DiffToAvg pace={split.pace} avg={avgPace} /> : `${summary.km.toFixed(2)} km`}
        </div>
        <dl className="mt-5 text-[0.8125rem]">
          <ReadRow label={tt("time")} value={fmtDuration(split ? split.movingTime : summary.time)} />
          <ReadRow
            label={tt("avgHr")}
            value={(split ? split.hr : summary.hr) ? `${Math.round((split ? split.hr : summary.hr)!)} bpm` : "—"}
          />
          <ReadRow
            label={split ? tt("elevation") : "D+"}
            value={
              split
                ? `${split.elevation > 0 ? "+" : ""}${Math.round(split.elevation)} m`
                : `${Math.round(summary.elevation)} m`
            }
          />
          {split && split.meters < 950 && (
            <ReadRow label={tt("segment")} value={`${Math.round(split.meters)} m`} />
          )}
        </dl>
        <p className="mt-5 text-micro leading-relaxed text-ink3">
          {geometry ? tt("hoverHint") : tt("hoverHintShort")}
        </p>
      </aside>
    </div>
  );
}

function DiffToAvg({ pace, avg }: { pace: number; avg: number }) {
  const tt = useTranslations("activity");
  const diff = Math.round(pace - avg);
  if (Math.abs(diff) < 2) return <span>{tt("atAverage")}</span>;
  return (
    <span>
      <span className={diff < 0 ? "text-sage" : "text-clay"}>
        {diff < 0 ? "−" : "+"}
        {Math.abs(diff)} s
      </span>{" "}
      {tt("vsAverage")}
    </span>
  );
}

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-hair py-2 last:border-b-0">
      <dt className="text-ink2">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}

function RouteCanvas({
  geometry: g,
  active,
  onHover,
  colorFor,
  hasSplits,
}: {
  geometry: RouteGeometry;
  active: number | null;
  onHover: (km: number | null) => void;
  colorFor: (km: number) => string;
  hasSplits: boolean;
}) {
  const tt = useTranslations("activity");
  const every = g.markers.length > 30 ? 5 : g.markers.length > 14 ? 2 : 1;
  return (
    <div className="route-paper relative overflow-hidden rounded-card border border-hair">
      <svg
        viewBox={`0 0 ${g.w} ${g.h}`}
        className="block h-auto w-full"
        role="img"
        aria-label={tt("trackAria")}
        onMouseLeave={() => onHover(null)}
      >
        {/* Liseré : le tracé se détache du quadrillage */}
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          {g.segments.map((s) => (
            <path key={`c${s.km}`} d={s.d} stroke="rgb(var(--panel))" strokeWidth={9} />
          ))}
          {g.segments.map((s) => {
            const on = active === s.km;
            const dim = active != null && !on;
            return (
              <path
                key={s.km}
                d={s.d}
                stroke={hasSplits ? colorFor(s.km) : "rgb(var(--clay))"}
                strokeWidth={on ? 6.5 : 3.75}
                opacity={dim ? 0.28 : 1}
                style={{ transition: "opacity .2s, stroke-width .2s" }}
              />
            );
          })}
          {/* Zones de survol, plus larges que le trait visible */}
          {g.segments.map((s) => (
            <path
              key={`h${s.km}`}
              d={s.d}
              stroke="transparent"
              strokeWidth={18}
              onMouseEnter={() => onHover(s.km)}
              style={{ cursor: "crosshair" }}
            >
              <title>{`Kilomètre ${s.km}`}</title>
            </path>
          ))}
        </g>

        {g.markers
          .filter((m) => m.km % every === 0)
          .map((m) => (
            <g key={m.km} transform={`translate(${m.at[0]} ${m.at[1]})`} pointerEvents="none">
              <circle r={7.5} fill="rgb(var(--panel))" stroke="rgb(var(--hair-strong))" />
              <text
                textAnchor="middle"
                dy="0.35em"
                fontSize={8}
                fontWeight={600}
                fill={active === m.km || active === m.km + 1 ? "rgb(var(--ink))" : "rgb(var(--ink-2))"}
                style={{ fontFeatureSettings: '"tnum"' }}
              >
                {m.km}
              </text>
            </g>
          ))}

        {g.end && (
          <g transform={`translate(${g.end[0]} ${g.end[1]})`} pointerEvents="none">
            <rect x={-5} y={-5} width={10} height={10} fill="rgb(var(--ink))" />
            <rect x={-5} y={-5} width={5} height={5} fill="rgb(var(--panel))" />
            <rect x={0} y={0} width={5} height={5} fill="rgb(var(--panel))" />
          </g>
        )}
        {g.start && (
          <g transform={`translate(${g.start[0]} ${g.start[1]})`} pointerEvents="none">
            <circle r={7} fill="rgb(var(--panel))" stroke="rgb(var(--ink))" strokeWidth={2} />
            <circle r={2.75} fill="rgb(var(--ink))" />
          </g>
        )}
      </svg>

      {/* Nord + échelle : repères de cartographe, pas de fond de carte */}
      <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-center text-ink3">
        <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden>
          <path d="M5 0 9.5 13 5 10 0.5 13Z" fill="currentColor" />
        </svg>
        <span className="mt-0.5 text-[9px] font-semibold">N</span>
      </div>
      {g.scaleBar && (
        <div className="pointer-events-none absolute bottom-3 left-3 text-[10px] text-ink3">
          <div
            className="h-[5px] border-x border-b border-current"
            style={{ width: `${(g.scaleBar.px / g.w) * 100}%`, minWidth: 24 }}
          />
          <span className="mt-0.5 block font-mono">{g.scaleBar.label}</span>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-3 text-[10px] text-ink3">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full border-2 border-ink" /> {tt("start")}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 bg-ink" /> {tt("finish")}
        </span>
      </div>
    </div>
  );
}

function SplitStrip({
  splits,
  avgPace,
  active,
  onHover,
}: {
  splits: RouteSplit[];
  avgPace: number;
  active: number | null;
  onHover: (km: number | null) => void;
}) {
  const tt = useTranslations("activity");
  const speeds = splits.map((s) => (s.pace > 0 ? 1000 / s.pace : 0));
  const minS = Math.min(...speeds.filter((v) => v > 0));
  const maxS = Math.max(...speeds);
  const span = maxS - minS || 1;
  const heightOf = (v: number) => (v > 0 ? 28 + ((v - minS) / span) * 72 : 6);

  const hrs = splits.map((s) => s.hr).filter((h): h is number => h != null);
  const hrMin = Math.min(...hrs);
  const hrMax = Math.max(...hrs);
  const total = splits.reduce((a, s) => a + s.meters, 0);

  // Position horizontale du centre de chaque tronçon, en % de la largeur
  let acc = 0;
  const centers = splits.map((s) => {
    const c = ((acc + s.meters / 2) / total) * 100;
    acc += s.meters;
    return c;
  });
  const hrPoints =
    hrs.length >= 2
      ? splits
          .map((s, i) =>
            s.hr == null
              ? null
              : `${centers[i].toFixed(2)},${(100 - (((s.hr - hrMin) / (hrMax - hrMin || 1)) * 70 + 15)).toFixed(2)}`
          )
          .filter(Boolean)
          .join(" ")
      : null;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="eyebrow">{tt("pacePerKm")}</span>
        {hrPoints && (
          <span className="flex items-center gap-1.5 text-micro text-ink3">
            <span className="h-px w-3.5 bg-slate" /> FC {Math.round(hrMin)}–{Math.round(hrMax)}
          </span>
        )}
      </div>
      <div className="relative" onMouseLeave={() => onHover(null)}>
        <div className="flex h-[132px] items-end gap-[3px]">
          {splits.map((s, i) => {
            const on = active === s.index;
            const dim = active != null && !on;
            return (
              <button
                type="button"
                key={s.index}
                onMouseEnter={() => onHover(s.index)}
                onFocus={() => onHover(s.index)}
                className="group relative flex h-full min-w-[4px] flex-col justify-end focus:outline-none"
                style={{ flexGrow: s.meters, flexBasis: 0 }}
                aria-label={`Kilomètre ${s.index} : ${fmtPace(s.pace)}`}
              >
                <span
                  className="block w-full rounded-t-[3px] transition-all duration-200"
                  style={{
                    height: `${heightOf(speeds[i])}%`,
                    background: paceColor(s.pace, avgPace),
                    opacity: dim ? 0.3 : 1,
                  }}
                />
              </button>
            );
          })}
        </div>
        {hrPoints && (
          <svg
            className="pointer-events-none absolute inset-x-0 top-0 h-[132px] w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            <polyline
              points={hrPoints}
              fill="none"
              stroke="rgb(var(--slate))"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {/* Allure moyenne : repère horizontal */}
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-ink3/60"
          style={{ bottom: `${heightOf(1000 / avgPace) * 1.32}px` }}
        />
      </div>
      <div className="mt-1.5 flex gap-[3px] text-center text-[10px] text-ink3">
        {splits.map((s) => (
          <span
            key={s.index}
            className={`min-w-[4px] truncate font-mono ${active === s.index ? "text-ink" : ""}`}
            style={{ flexGrow: s.meters, flexBasis: 0 }}
          >
            {splits.length <= 30 || s.index % 5 === 0 ? s.index : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
