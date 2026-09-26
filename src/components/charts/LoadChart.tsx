"use client";

import { useTranslations } from "next-intl";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Tip, axisProps, useChartTheme } from "./theme";

type Row = {
  label: string;
  acute: number;
  chronic: number;
  ratio: number;
  ready?: boolean;
};

/** Charge aiguë (7 j) vs chronique (28 j). */
export function LoadChart({ data }: { data: Row[] }) {
  const t = useChartTheme();
  const tt = useTranslations("common");

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="loadFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.slate} stopOpacity={0.16} />
            <stop offset="100%" stopColor={t.slate} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis
          dataKey="label"
          {...axisProps(t.axis)}
          dy={4}
          interval="preserveStartEnd"
          minTickGap={48}
        />
        <YAxis {...axisProps(t.axis)} width={40} />
        <Tooltip
          cursor={{ stroke: t.grid }}
          content={({ payload, label }) => {
            const d = payload?.[0]?.payload as Row | undefined;
            if (!d) return null;
            return (
              <Tip
                label={label as string}
                rows={[
                  { label: "Charge 7 j", value: d.acute.toFixed(0), color: t.clay },
                  { label: "Charge 28 j", value: d.chronic.toFixed(0), color: t.slate },
                  {
                    label: "Ratio",
                    value: d.ready === false ? "n/d" : d.ratio.toFixed(2),
                  },
                ]}
              />
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="chronic"
          stroke={t.slate}
          strokeWidth={1.5}
          fill="url(#loadFill)"
        />
        <Line
          type="monotone"
          dataKey="acute"
          stroke={t.clay}
          strokeWidth={1.75}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Ratio ACWR. Une seule bande verte matérialise la zone saine. */
export function AcwrChart({ data }: { data: Row[] }) {
  const t = useChartTheme();
  const tt = useTranslations("common");

  const values = data.filter((d) => d.ready !== false).map((d) => d.ratio);
  const top = Math.min(3, Math.max(2, Math.ceil(Math.max(0, ...values) * 2) / 2));
  const shown = data.map((d) => ({
    ...d,
    plotted: d.ready === false ? null : Math.min(d.ratio, top),
  }));

  return (
    <ResponsiveContainer width="100%" height={190}>
      <ComposedChart data={shown} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={t.grid} vertical={false} />
        {/* Une seule zone colorée : la plage saine. Le reste reste neutre. */}
        <ReferenceArea y1={0.8} y2={1.3} fill={t.sage} fillOpacity={0.13} />
        <ReferenceLine y={1.5} stroke={t.rust} strokeDasharray="3 3" strokeWidth={1} />
        <XAxis
          dataKey="label"
          {...axisProps(t.axis)}
          dy={4}
          interval="preserveStartEnd"
          minTickGap={48}
        />
        <YAxis
          {...axisProps(t.axis)}
          width={40}
          domain={[0, top]}
          ticks={[0, 0.8, 1.3, 1.5, top]}
        />
        <Tooltip
          cursor={{ stroke: t.grid }}
          content={({ payload, label }) => {
            const d = payload?.[0]?.payload as Row | undefined;
            if (!d) return null;
            const zone =
              d.ready === false
                ? "Historique insuffisant"
                : d.ratio < 0.8
                  ? tt("underLoad")
                  : d.ratio <= 1.3
                    ? tt("optimal")
                    : d.ratio <= 1.5
                      ? tt("caution")
                      : tt("riskHigh");
            return (
              <Tip
                label={label as string}
                rows={[
                  {
                    label: "Ratio",
                    value: d.ready === false ? "n/d" : d.ratio.toFixed(2),
                  },
                  { label: "Zone", value: zone },
                ]}
              />
            );
          }}
        />
        <Line
          type="monotone"
          dataKey="plotted"
          stroke={t.ink}
          strokeWidth={1.5}
          dot={false}
          connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
