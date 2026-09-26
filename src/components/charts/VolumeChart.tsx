"use client";

import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtPace } from "@/lib/format";
import { Tip, axisProps, useChartTheme } from "./theme";

type Row = {
  label: string;
  km: number;
  elevation: number;
  sessions: number;
  timeHours: number;
  avgPace: number;
  avgHr: number | null;
};

export function VolumeChart({ data, goalKm }: { data: Row[]; goalKm?: number }) {
  const t = useChartTheme();
  const tt = useTranslations("common");

  return (
    <ResponsiveContainer width="100%" height={230}>
      <ComposedChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps(t.axis)} dy={4} />
        <YAxis {...axisProps(t.axis)} width={40} />
        <Tooltip
          cursor={{ fill: t.grid, fillOpacity: 0.45 }}
          content={({ payload, label }) => {
            const d = payload?.[0]?.payload as Row | undefined;
            if (!d) return null;
            return (
              <Tip
                label={tt("weekOf", { label })}
                rows={[
                  { label: tt("volume"), value: `${d.km} km`, color: t.clay },
                  { label: tt("sessions"), value: d.sessions },
                  { label: tt("time"), value: `${d.timeHours} h` },
                  { label: tt("elevation"), value: `${d.elevation} m` },
                  ...(d.avgPace ? [{ label: tt("pace"), value: fmtPace(d.avgPace) }] : []),
                  ...(d.avgHr ? [{ label: tt("hr"), value: `${d.avgHr} bpm` }] : []),
                ]}
              />
            );
          }}
        />
        {goalKm ? (
          <ReferenceLine
            y={goalKm}
            stroke={t.axis}
            strokeDasharray="3 3"
            strokeWidth={1}
            label={{
              value: tt("goal", { km: goalKm }),
              position: "insideRight",
              fill: t.axis,
              fontSize: 10,
            }}
          />
        ) : null}
        {/* Barres neutres, seule la semaine courante prend l'accent */}
        <Bar dataKey="km" maxBarSize={26}>
          {data.map((_, i) => (
            <Cell key={i} fill={i === data.length - 1 ? t.clay : t.faint} />
          ))}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function ElevationChart({ data }: { data: Row[] }) {
  const t = useChartTheme();
  const tt = useTranslations("common");
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps(t.axis)} dy={4} />
        <YAxis {...axisProps(t.axis)} width={40} />
        <Tooltip
          cursor={{ fill: t.grid, fillOpacity: 0.45 }}
          content={({ payload, label }) => (
            <Tip
              label={tt("weekOf", { label })}
              rows={[
                {
                  label: tt("elevGain"),
                  value: `${payload?.[0]?.value ?? 0} m`,
                  color: t.slate,
                },
              ]}
            />
          )}
        />
        <Bar dataKey="elevation" maxBarSize={26}>
          {data.map((_, i) => (
            <Cell key={i} fill={i === data.length - 1 ? t.slate : t.faint} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
