"use client";

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
 * Performance Management Chart.
 *
 * Condition (CTL) en aire, fatigue (ATL) en trait fin, fraîcheur (TSB) sur
 * l'axe de droite. La partie projetée depuis le plan est en pointillés :
 * l'œil doit distinguer ce qui est mesuré de ce qui est prévu.
 */
export function FormChart({
  data,
  raceLabel,
  height = 260,
}: {
  data: FormRow[];
  raceLabel?: string | null;
  height?: number;
}) {
  const t = useChartTheme();
  const firstProjected = data.find((d) => d.projected)?.label;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="ctlFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.slate} stopOpacity={0.2} />
            <stop offset="100%" stopColor={t.slate} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis
          dataKey="label"
          {...axisProps(t.axis)}
          dy={4}
          interval="preserveStartEnd"
          minTickGap={56}
        />
        <YAxis {...axisProps(t.axis)} width={38} />
        <YAxis yAxisId="tsb" orientation="right" {...axisProps(t.axis)} width={34} />

        <ReferenceLine yAxisId="tsb" y={0} stroke={t.grid} strokeWidth={1} />
        {firstProjected && (
          <ReferenceLine
            x={firstProjected}
            stroke={t.faint}
            strokeDasharray="3 3"
            label={{ value: "prévu", position: "insideTopLeft", fill: t.axis, fontSize: 10 }}
          />
        )}
        {raceLabel && (
          <ReferenceLine
            x={raceLabel}
            stroke={t.rust}
            strokeDasharray="2 2"
            label={{ value: "course", position: "insideTopRight", fill: t.rust, fontSize: 10 }}
          />
        )}

        <Area
          type="monotone"
          dataKey="ctl"
          stroke="none"
          fill="url(#ctlFill)"
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="ctlPast"
          stroke={t.slate}
          strokeWidth={1.8}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="ctlFuture"
          stroke={t.slate}
          strokeWidth={1.8}
          strokeDasharray="4 3"
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="atl"
          stroke={t.clay}
          strokeWidth={1}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          yAxisId="tsb"
          type="monotone"
          dataKey="tsbPast"
          stroke={t.sage}
          strokeWidth={1.4}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
        <Line
          yAxisId="tsb"
          type="monotone"
          dataKey="tsbFuture"
          stroke={t.sage}
          strokeWidth={1.4}
          strokeDasharray="4 3"
          dot={false}
          connectNulls
          isAnimationActive={false}
        />

        <Tooltip
          cursor={{ stroke: t.grid }}
          content={({ payload, label }) => {
            const d = payload?.[0]?.payload as FormRow | undefined;
            if (!d) return null;
            return (
              <Tip
                label={`${label}${d.projected ? " · prévu" : ""}`}
                rows={[
                  { label: "Condition (CTL)", value: d.ctl.toFixed(0), color: t.slate },
                  { label: "Fatigue (ATL)", value: d.atl.toFixed(0), color: t.clay },
                  {
                    label: "Fraîcheur (TSB)",
                    value: `${d.tsb > 0 ? "+" : ""}${d.tsb.toFixed(0)}`,
                    color: t.sage,
                  },
                ]}
              />
            );
          }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
