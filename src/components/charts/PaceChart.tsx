"use client";

import {
  Area,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { fmtDateShort, fmtDuration, fmtPace } from "@/lib/format";
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

/** Zones FC : barres horizontales empilées, plus lisibles qu'un donut. */
export function HrZoneBars({
  zones,
}: {
  zones: Array<{
    name: string;
    percent: number;
    seconds: number;
    min: number;
    max: number;
    index: number;
  }>;
}) {
  const t = useChartTheme();
  // Ramp du plus calme au plus intense, dans la famille de couleurs du thème
  const ramp = [t.faint, t.sage, t.ochre, t.clay, t.rust];
  const total = zones.reduce((a, z) => a + z.seconds, 0);

  return (
    <div className="space-y-2.5">
      <div className="flex h-2 w-full overflow-hidden">
        {zones.map((z, i) =>
          z.seconds > 0 ? (
            <div
              key={z.index}
              style={{
                width: `${(z.seconds / total) * 100}%`,
                background: ramp[i],
              }}
              title={`${z.name} — ${z.percent} %`}
            />
          ) : null
        )}
      </div>
      <div className="space-y-0">
        {zones.map((z, i) => (
          <div
            key={z.index}
            className="flex items-baseline gap-3 border-b border-hair py-1.5 last:border-b-0"
          >
            <span
              className="h-[3px] w-3 shrink-0 translate-y-[-2px]"
              style={{ background: ramp[i] }}
            />
            <span className="flex-1 text-[0.8125rem] text-ink2">{z.name}</span>
            <span className="text-micro text-ink3">
              {z.min}–{z.max}
            </span>
            <span className="w-16 text-right font-mono text-[0.8125rem] tabular-nums text-ink">
              {fmtDuration(z.seconds)}
            </span>
            <span className="w-11 text-right font-mono text-[0.8125rem] tabular-nums text-ink2">
              {z.percent}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Conservé pour compatibilité : donut compact. */
export function HrZoneChart({
  zones,
}: {
  zones: Array<{ name: string; percent: number; color: string; seconds: number }>;
}) {
  const t = useChartTheme();
  const data = zones.filter((z) => z.seconds > 0);
  const ramp = [t.faint, t.sage, t.ochre, t.clay, t.rust];
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie
          data={data}
          dataKey="seconds"
          nameKey="name"
          innerRadius={52}
          outerRadius={78}
          paddingAngle={1.5}
          stroke="none"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={ramp[i % ramp.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
