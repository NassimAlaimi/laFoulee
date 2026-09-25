"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { fmtDateShort, fmtPace } from "@/lib/format";
import { Tip, axisProps, useChartTheme } from "./theme";

export function PaceProgressionChart({
  data,
}: {
  data: Array<{ label: string; avgPace: number | null; avgHr: number | null }>;
}) {
  const t = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps(t.axis)} dy={4} />
        <YAxis
          {...axisProps(t.axis)}
          yAxisId="pace"
          width={50}
          reversed
          domain={["dataMin - 20", "dataMax + 20"]}
          tickFormatter={(v: number) => fmtPace(v, "")}
        />
        <YAxis
          {...axisProps(t.axis)}
          yAxisId="hr"
          orientation="right"
          width={34}
          domain={["dataMin - 8", "dataMax + 8"]}
        />
        <Tooltip
          cursor={{ stroke: t.grid }}
          content={({ payload, label }) => {
            const d = payload?.[0]?.payload;
            if (!d) return null;
            return (
              <Tip
                label={label as string}
                rows={[
                  {
                    label: "Allure",
                    value: d.avgPace ? fmtPace(d.avgPace) : "—",
                    color: t.clay,
                  },
                  {
                    label: "FC",
                    value: d.avgHr ? `${d.avgHr} bpm` : "—",
                    color: t.slate,
                  },
                ]}
              />
            );
          }}
        />
        <Line
          yAxisId="hr"
          type="monotone"
          dataKey="avgHr"
          stroke={t.slate}
          strokeWidth={1.25}
          strokeDasharray="3 3"
          dot={false}
          connectNulls
        />
        <Line
          yAxisId="pace"
          type="monotone"
          dataKey="avgPace"
          stroke={t.clay}
          strokeWidth={1.75}
          dot={{ r: 2.5, fill: t.clay, strokeWidth: 0 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function VdotChart({
  data,
}: {
  data: Array<{ label: string; vdot: number | null }>;
}) {
  const t = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="vdotFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.clay} stopOpacity={0.18} />
            <stop offset="100%" stopColor={t.clay} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps(t.axis)} dy={4} />
        <YAxis {...axisProps(t.axis)} width={40} domain={["dataMin - 3", "dataMax + 3"]} />
        <Tooltip
          cursor={{ stroke: t.grid }}
          content={({ payload, label }) => (
            <Tip
              label={label as string}
              rows={[
                { label: "VDOT", value: payload?.[0]?.value ?? "—", color: t.clay },
              ]}
            />
          )}
        />
        <Area
          type="monotone"
          dataKey="vdot"
          stroke={t.clay}
          strokeWidth={1.75}
          fill="url(#vdotFill)"
          dot={{ r: 2.5, fill: t.clay, strokeWidth: 0 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function PaceHrScatter({
  data,
}: {
  data: Array<{
    pace: number;
    hr: number;
    km: number;
    name: string;
    date: Date;
    efficiency: number;
  }>;
}) {
  const t = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ScatterChart margin={{ top: 12, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={t.grid} />
        <XAxis
          type="number"
          dataKey="pace"
          {...axisProps(t.axis)}
          dy={4}
          domain={["dataMin - 15", "dataMax + 15"]}
          tickFormatter={(v: number) => fmtPace(v, "")}
        />
        <YAxis
          type="number"
          dataKey="hr"
          {...axisProps(t.axis)}
          width={40}
          domain={["dataMin - 6", "dataMax + 6"]}
        />
        <ZAxis type="number" dataKey="km" range={[30, 260]} />
        <Tooltip
          cursor={{ strokeDasharray: "3 3", stroke: t.grid }}
          content={({ payload }) => {
            const d = payload?.[0]?.payload;
            if (!d) return null;
            return (
              <Tip
                label={d.name}
                rows={[
                  { label: "Date", value: fmtDateShort(d.date) },
                  { label: "Allure", value: fmtPace(d.pace), color: t.clay },
                  { label: "FC", value: `${d.hr} bpm` },
                  { label: "Distance", value: `${d.km} km` },
                  { label: "Efficience", value: `${d.efficiency} m/batt.` },
                ]}
              />
            );
          }}
        />
        <Scatter data={data} fill={t.clay} fillOpacity={0.5} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}


/**
 * Allure à FC fixe : la ligne (plus haut = plus rapide) et sa bande de
 * confiance à 95 %. Les marques (courses) sont des filets verticaux.
 */
export function AerobicPaceChart({
  data,
  refHr,
  labels,
}: {
  data: Array<{ label: string; pace: number; band: [number, number] }>;
  refHr: number;
  labels: { pace: string; range: string };
}) {
  const t = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={230}>
      <ComposedChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps(t.axis)} dy={4} minTickGap={24} />
        <YAxis
          {...axisProps(t.axis)}
          width={50}
          reversed
          domain={["dataMin - 10", "dataMax + 10"]}
          tickFormatter={(v: number) => fmtPace(v, "")}
        />
        <Tooltip
          cursor={{ stroke: t.grid }}
          content={({ payload, label }) => {
            const d = payload?.[0]?.payload;
            if (!d) return null;
            return (
              <Tip
                label={`${label} · ${refHr} bpm`}
                rows={[
                  { label: labels.pace, value: fmtPace(d.pace), color: t.clay },
                  { label: labels.range, value: `${fmtPace(d.band[0], "")}–${fmtPace(d.band[1])}`, color: t.faint },
                ]}
              />
            );
          }}
        />
        <Area type="monotone" dataKey="band" stroke="none" fill={t.clay} fillOpacity={0.12} isAnimationActive={false} />
        <Line type="monotone" dataKey="pace" stroke={t.clay} strokeWidth={2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
