"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtDuration, fmtPace } from "@/lib/format";
import { Tip, axisProps, useChartTheme } from "./theme";

export type SplitRow = {
  index: number;
  km: number;
  pace: number; // s/km
  hr: number | null;
  elevation: number;
  movingTime: number;
};

/**
 * Allure par kilomètre. Barres colorées selon l'écart à l'allure moyenne,
 * ce qui rend immédiatement lisible la régularité de la séance.
 */
export function SplitChart({
  data,
  avgPace,
}: {
  data: SplitRow[];
  avgPace: number;
}) {
  const t = useChartTheme();
  const hasHr = data.some((d) => d.hr !== null);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 10, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis
          {...axisProps(t.axis)}
          dataKey="index"
          tickFormatter={(v: number) => `${v}`}
          label={{
            value: "km",
            position: "insideBottomRight",
            fill: t.axis,
            fontSize: 10,
            offset: -2,
          }}
        />
        <YAxis
          {...axisProps(t.axis)}
          yAxisId="pace"
          width={52}
          reversed
          domain={["dataMin - 12", "dataMax + 12"]}
          tickFormatter={(v: number) => fmtPace(v, "")}
        />
        {hasHr && (
          <YAxis
            {...axisProps(t.axis)}
            yAxisId="hr"
            orientation="right"
            width={36}
            domain={["dataMin - 8", "dataMax + 8"]}
          />
        )}
        <Tooltip
          cursor={{ fill: t.grid, fillOpacity: 0.45 }}
          content={({ payload }) => {
            const d = payload?.[0]?.payload as SplitRow | undefined;
            if (!d) return null;
            const diff = d.pace - avgPace;
            return (
              <Tip
                label={`Kilomètre ${d.index}`}
                rows={[
                  { label: "Allure", value: fmtPace(d.pace), color: t.clay },
                  {
                    label: "vs moyenne",
                    value: `${diff > 0 ? "+" : "−"}${fmtDuration(Math.abs(diff))}`,
                  },
                  { label: "Temps", value: fmtDuration(d.movingTime) },
                  ...(d.hr
                    ? [{ label: "FC", value: `${d.hr} bpm`, color: t.slate }]
                    : []),
                  { label: "Dénivelé", value: `${d.elevation > 0 ? "+" : ""}${Math.round(d.elevation)} m` },
                ]}
              />
            );
          }}
        />
        <ReferenceLine
          yAxisId="pace"
          y={avgPace}
          stroke={t.axis}
          strokeDasharray="4 4"
          strokeWidth={1}
          label={{
            value: "moyenne",
            position: "insideTopLeft",
            fill: t.axis,
            fontSize: 10,
          }}
        />
        <Bar yAxisId="pace" dataKey="pace" maxBarSize={34}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.pace <= avgPace ? t.sage : t.clay} />
          ))}
        </Bar>
        {hasHr && (
          <Line
            yAxisId="hr"
            type="monotone"
            dataKey="hr"
            stroke={t.slate}
            strokeWidth={1.75}
            dot={false}
            connectNulls
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
