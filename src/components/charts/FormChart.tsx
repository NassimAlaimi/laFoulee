"use client";

import { useTranslations } from "next-intl";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Tip, axisProps, useChartTheme } from "./theme";
import type { ChartMark } from "@/lib/race-marks";

export type FormRow = {
  label: string;
  ctl: number;
  atl: number;
  tsb: number;
  projected: boolean;
  /** Séparation passé / projeté : deux séries pour un trait plein puis pointillé */
  ctlPast: number | null;
  ctlFuture: number | null;
  tsbPast: number | null;
  tsbFuture: number | null;
};

/**
 * Performance Management Chart, en deux étages qui partagent l'axe du temps :
 *
 * - en haut, condition (CTL, aire) et fatigue (ATL, trait fin) ;
 * - en bas, la fraîcheur (TSB = CTL − ATL) en aire autour de zéro, sage
 *   au-dessus, rouille en dessous.
 *
 * Deux échelles sur un même graphique obligeaient à lire deux axes ; ici
 * chaque étage a le sien. La partie projetée depuis le plan est en
 * pointillés : l'œil doit distinguer ce qui est mesuré de ce qui est prévu.
 *
 * `marks` pose un trait vertical au jour des courses (rouille) et des records
 * (prune) : « tes courses expliquent les creux de forme ».
 */
export function FormChart({
  data,
  marks,
  height = 260,
  legend = true,
}: {
  data: FormRow[];
  marks?: ChartMark[];
  height?: number;
  legend?: boolean;
}) {
  const t = useChartTheme();
  const tt = useTranslations("common");
  const firstProjected = data.find((d) => d.projected)?.label;
  const topH = Math.round(height * 0.6);
  const bottomH = height - topH;

  // Point de bascule du dégradé : la position de zéro dans l'étendue du TSB
  const tsbs = data.map((d) => d.tsb);
  const hi = Math.max(5, ...tsbs);
  const lo = Math.min(-5, ...tsbs);
  const zero = hi / (hi - lo);
  const uid = `f${data.length}${Math.round(hi)}${Math.round(lo)}`;

  const list = marks ?? [];
  const hasRace = list.some((m) => m.kind === "race");
  const hasPr = list.some((m) => m.kind === "pr");
  // Un seul repère : on peut se permettre un libellé, sinon ça se chevauche.
  const single = list.length === 1;

  const markLines = list.map((m) => (
    <ReferenceLine
      key={`${m.label}-${m.kind}`}
      x={m.label}
      stroke={m.kind === "race" ? t.rust : t.plum}
      strokeDasharray="2 2"
      strokeWidth={1}
    />
  ));

  const markLabels = single
    ? list.map((m) => (
        <ReferenceLine
          key={`${m.label}-lbl`}
          x={m.label}
          stroke="transparent"
          label={{
            value: m.kind === "race" ? "course" : "record",
            position: "insideTopRight",
            fill: m.kind === "race" ? t.rust : t.plum,
            fontSize: 10,
          }}
        />
      ))
    : null;

  const tooltip = (
    <Tooltip
      cursor={{ stroke: t.axis, strokeDasharray: "2 2" }}
      content={({ payload, label }) => {
        const d = payload?.[0]?.payload as FormRow | undefined;
        if (!d) return null;
        return (
          <Tip
            label={`${label}${d.projected ? " · prévu" : ""}`}
            rows={[
              { label: "Condition (CTL)", value: d.ctl.toFixed(0), color: t.slate },
              { label: "Fatigue (ATL)", value: d.atl.toFixed(0), color: t.ochre },
              { label: "Fraîcheur (TSB)", value: `${d.tsb > 0 ? "+" : ""}${d.tsb.toFixed(0)}`, color: d.tsb >= 0 ? t.sage : t.rust },
            ]}
          />
        );
      }}
    />
  );

  return (
    <div>
      <ResponsiveContainer width="100%" height={topH}>
        <ComposedChart data={data} syncId={uid} margin={{ top: 14, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`${uid}ctl`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={t.slate} stopOpacity={0.28} />
              <stop offset="100%" stopColor={t.slate} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={t.grid} vertical={false} />
          <XAxis dataKey="label" hide />
          <YAxis {...axisProps(t.axis)} width={38} />
          {firstProjected && (
            <ReferenceLine x={firstProjected} stroke={t.faint} strokeDasharray="3 3" />
          )}
          {markLines}
          {markLabels}
          {firstProjected && (
            <ReferenceLine
              x={firstProjected}
              stroke="transparent"
              label={{ value: "prévu →", position: "insideTopLeft", fill: t.axis, fontSize: 10 }}
            />
          )}
          <Area type="monotone" dataKey="ctl" stroke="none" fill={`url(#${uid}ctl)`} isAnimationActive={false} />
          <Line type="monotone" dataKey="ctlPast" stroke={t.slate} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          <Line
            type="monotone"
            dataKey="ctlFuture"
            stroke={t.slate}
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line type="monotone" dataKey="atl" stroke={t.ochre} strokeWidth={1} strokeOpacity={0.85} dot={false} isAnimationActive={false} />
          {tooltip}
        </ComposedChart>
      </ResponsiveContainer>

      <ResponsiveContainer width="100%" height={bottomH}>
        <ComposedChart data={data} syncId={uid} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`${uid}tsb`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={t.sage} stopOpacity={0.55} />
              <stop offset={zero} stopColor={t.sage} stopOpacity={0.08} />
              <stop offset={zero} stopColor={t.rust} stopOpacity={0.08} />
              <stop offset="100%" stopColor={t.rust} stopOpacity={0.55} />
            </linearGradient>
            <linearGradient id={`${uid}tsbl`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={zero} stopColor={t.sage} />
              <stop offset={zero} stopColor={t.rust} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" {...axisProps(t.axis)} dy={4} interval="preserveStartEnd" minTickGap={56} />
          <YAxis {...axisProps(t.axis)} width={38} domain={[lo, hi]} ticks={[Math.round(lo), 0, Math.round(hi)]} />
          <ReferenceLine y={0} stroke={t.axis} strokeOpacity={0.6} />
          {firstProjected && (
            <ReferenceLine x={firstProjected} stroke={t.faint} strokeDasharray="3 3" />
          )}
          {markLines}
          <Area
            type="monotone"
            dataKey="tsbPast"
            baseValue={0}
            stroke={`url(#${uid}tsbl)`}
            strokeWidth={1.4}
            fill={`url(#${uid}tsb)`}
            connectNulls
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="tsbFuture"
            baseValue={0}
            stroke={`url(#${uid}tsbl)`}
            strokeWidth={1.4}
            strokeDasharray="4 3"
            fill={`url(#${uid}tsb)`}
            fillOpacity={0.5}
            connectNulls
            isAnimationActive={false}
          />
          {tooltip}
        </ComposedChart>
      </ResponsiveContainer>
      {legend && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-micro text-ink3">
          <Key color={t.slate} label={tt("condition")} />
          <Key color={t.ochre} label={tt("fatigue")} thin />
          <Key color={t.sage} label={tt("freshness")} area />
          {hasRace && <Key color={t.rust} label={tt("race")} dashed />}
          {hasPr && <Key color={t.plum} label={tt("record")} dashed />}
        </div>
      )}
    </div>
  );
}

function Key({
  color,
  label,
  thin,
  area,
  dashed,
}: {
  color: string;
  label: string;
  thin?: boolean;
  area?: boolean;
  dashed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block w-3.5"
        style={
          dashed
            ? {
                backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 3px, transparent 3px 6px)`,
                height: 2,
              }
            : { background: color, height: area ? 8 : thin ? 1 : 2, opacity: area ? 0.6 : 1 }
        }
      />
      {label}
    </span>
  );
}
