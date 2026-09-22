"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { fmtDuration, fmtPace } from "@/lib/format";
import { Tip, axisProps, useChartTheme } from "./theme";

// ------------------------------------------------------- Courbe allure-durée

export type CurveRow = {
  name: string;
  meters: number;
  seconds: number;
  pace: number;
  modelPace: number | null;
  deltaPct: number | null;
};

/**
 * Équivalent course à pied de la courbe de puissance du cycliste : allure
 * record en fonction de la distance, comparée au modèle personnel. Les points
 * au-dessus de la courbe signalent une distance où il reste du temps à prendre.
 */
export function DurationCurveChart({ data }: { data: CurveRow[] }) {
  const t = useChartTheme();
  const paces = data.flatMap((d) => [d.pace, d.modelPace ?? d.pace]);
  const min = Math.min(...paces);
  const max = Math.max(...paces);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 12, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="name" {...axisProps(t.axis)} dy={4} minTickGap={10} />
        <YAxis
          {...axisProps(t.axis)}
          width={52}
          domain={[Math.floor(min - 15), Math.ceil(max + 15)]}
          reversed
          tickFormatter={(v: number) => fmtPace(v)}
        />
        <Tooltip
          cursor={{ stroke: t.grid }}
          content={({ payload }) => {
            const d = payload?.[0]?.payload as CurveRow | undefined;
            if (!d) return null;
            return (
              <Tip
                label={d.name}
                rows={[
                  { label: "Record", value: fmtDuration(d.seconds), color: t.clay },
                  { label: "Allure", value: fmtPace(d.pace) },
                  ...(d.modelPace
                    ? [{ label: "Modèle", value: fmtPace(d.modelPace), color: t.slate }]
                    : []),
                  ...(d.deltaPct !== null
                    ? [
                        {
                          label: "Écart",
                          value: `${d.deltaPct > 0 ? "+" : ""}${d.deltaPct} %`,
                        },
                      ]
                    : []),
                ]}
              />
            );
          }}
        />
        <Line
          type="monotone"
          dataKey="modelPace"
          stroke={t.slate}
          strokeWidth={1.2}
          strokeDasharray="4 3"
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="pace"
          stroke={t.clay}
          strokeWidth={1.8}
          dot={{ r: 3, fill: t.clay, strokeWidth: 0 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ------------------------------------------------------- Vitesse critique

export type CsPoint = { seconds: number; meters: number; name: string };

/**
 * Modèle à deux paramètres : distance = CS × temps + D′.
 * Les points doivent être alignés ; la pente est la vitesse critique.
 */
export function CriticalSpeedChart({
  points,
  cs,
  dPrime,
}: {
  points: CsPoint[];
  cs: number;
  dPrime: number;
}) {
  const t = useChartTheme();
  const maxT = Math.max(...points.map((p) => p.seconds)) * 1.15;
  const line = [
    { seconds: 0, meters: dPrime },
    { seconds: maxT, meters: dPrime + cs * maxT },
  ];

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ScatterChart margin={{ top: 12, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={t.grid} />
        <XAxis
          type="number"
          dataKey="seconds"
          {...axisProps(t.axis)}
          domain={[0, Math.ceil(maxT)]}
          tickFormatter={(v: number) => `${Math.round(v / 60)}′`}
          dy={4}
        />
        <YAxis
          type="number"
          dataKey="meters"
          {...axisProps(t.axis)}
          width={48}
          tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
        />
        <ZAxis range={[60, 60]} />
        <Tooltip
          cursor={{ strokeDasharray: "3 3", stroke: t.grid }}
          content={({ payload }) => {
            const d = payload?.[0]?.payload as CsPoint | undefined;
            if (!d || !d.name) return null;
            return (
              <Tip
                label={d.name}
                rows={[
                  { label: "Temps", value: fmtDuration(d.seconds) },
                  { label: "Distance", value: `${(d.meters / 1000).toFixed(2)} km` },
                  { label: "Vitesse", value: `${(d.meters / d.seconds).toFixed(2)} m/s` },
                ]}
              />
            );
          }}
        />
        <Scatter
          data={line}
          line={{ stroke: t.slate, strokeWidth: 1.2, strokeDasharray: "4 3" }}
          shape={() => <g />}
          isAnimationActive={false}
        />
        <Scatter data={points} fill={t.clay} isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ------------------------------------------------------- Cumul annuel

export type YearRow = {
  week: number;
  label: string;
  [year: string]: number | string;
};

/** Cumul kilométrique année après année : la comparaison la plus parlante. */
export function YearCompareChart({
  data,
  years,
}: {
  data: YearRow[];
  years: string[];
}) {
  const t = useChartTheme();
  const colors = [t.clay, t.slate, t.faint];

  return (
    <ResponsiveContainer width="100%" height={250}>
      <ComposedChart data={data} margin={{ top: 12, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps(t.axis)} dy={4} minTickGap={40} />
        <YAxis
          {...axisProps(t.axis)}
          width={46}
          tickFormatter={(v: number) => `${Math.round(v)}`}
        />
        <Tooltip
          cursor={{ stroke: t.grid }}
          content={({ payload, label }) => {
            if (!payload?.length) return null;
            return (
              <Tip
                label={`Semaine ${label}`}
                rows={payload
                  .filter((p) => p.value != null)
                  .map((p, i) => ({
                    label: String(p.dataKey),
                    value: `${Math.round(Number(p.value))} km`,
                    color: colors[i % colors.length],
                  }))}
              />
            );
          }}
        />
        {years.map((y, i) => (
          <Line
            key={y}
            type="monotone"
            dataKey={y}
            stroke={colors[i % colors.length]}
            strokeWidth={i === 0 ? 1.9 : 1.1}
            strokeDasharray={i === 0 ? undefined : "4 3"}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ------------------------------------------------------- Polarisation

export type PolarRow = {
  label: string;
  easy: number;
  moderate: number;
  hard: number;
};

/**
 * Répartition mensuelle du volume par intensité.
 * Le modèle polarisé (Seiler) vise ~80 % facile / ~20 % dur, avec le moins
 * possible de « zone grise » au milieu — la zone qui fatigue sans faire progresser.
 */
export function PolarizationChart({ data }: { data: PolarRow[] }) {
  const t = useChartTheme();

  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps(t.axis)} dy={4} minTickGap={12} />
        <YAxis {...axisProps(t.axis)} width={40} unit="%" domain={[0, 100]} />
        <ReferenceLine y={80} stroke={t.sage} strokeDasharray="3 3" />
        <Tooltip
          cursor={{ fill: t.grid, fillOpacity: 0.45 }}
          content={({ payload, label }) => {
            const d = payload?.[0]?.payload as PolarRow | undefined;
            if (!d) return null;
            return (
              <Tip
                label={label as string}
                rows={[
                  { label: "Facile", value: `${d.easy} %`, color: t.sage },
                  { label: "Modéré", value: `${d.moderate} %`, color: t.ochre },
                  { label: "Intense", value: `${d.hard} %`, color: t.clay },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="easy" stackId="a" fill={t.sage} radius={[0, 0, 0, 0]} />
        <Bar dataKey="moderate" stackId="a" fill={t.ochre} />
        <Bar dataKey="hard" stackId="a" fill={t.clay} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ------------------------------------------------------- Progression d'allure par zone

export type PaceZoneRow = {
  label: string;
  easy: number | null;
  quality: number | null;
};

/**
 * Allure moyenne des sorties faciles vs des séances rapides, mois par mois.
 * Quand l'allure facile s'améliore sans que l'allure rapide ne bouge, c'est la
 * base aérobie qui progresse.
 */
export function PaceZoneChart({ data }: { data: PaceZoneRow[] }) {
  const t = useChartTheme();
  const vals = data.flatMap((d) => [d.easy, d.quality]).filter((v): v is number => v != null);
  if (vals.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={230}>
      <ComposedChart data={data} margin={{ top: 12, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps(t.axis)} dy={4} minTickGap={16} />
        <YAxis
          {...axisProps(t.axis)}
          width={52}
          reversed
          domain={[Math.floor(Math.min(...vals) - 10), Math.ceil(Math.max(...vals) + 10)]}
          tickFormatter={(v: number) => fmtPace(v)}
        />
        <Tooltip
          cursor={{ stroke: t.grid }}
          content={({ payload, label }) => {
            const d = payload?.[0]?.payload as PaceZoneRow | undefined;
            if (!d) return null;
            return (
              <Tip
                label={label as string}
                rows={[
                  ...(d.easy ? [{ label: "Endurance", value: fmtPace(d.easy), color: t.sage }] : []),
                  ...(d.quality
                    ? [{ label: "Séances rapides", value: fmtPace(d.quality), color: t.clay }]
                    : []),
                ]}
              />
            );
          }}
        />
        <Line
          type="monotone"
          dataKey="easy"
          stroke={t.sage}
          strokeWidth={1.6}
          dot={{ r: 2.5, fill: t.sage, strokeWidth: 0 }}
          connectNulls
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="quality"
          stroke={t.clay}
          strokeWidth={1.6}
          dot={{ r: 2.5, fill: t.clay, strokeWidth: 0 }}
          connectNulls
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ------------------------------------------------------- Prédictions

export type PredictionRow = {
  name: string;
  potential: number;
  realistic: number;
  gapPct: number;
};

/** Écart entre potentiel physiologique et chrono réellement atteignable. */
export function PotentialGapChart({ data }: { data: PredictionRow[] }) {
  const t = useChartTheme();

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
        barCategoryGap="30%"
      >
        <CartesianGrid stroke={t.grid} horizontal={false} />
        <XAxis type="number" {...axisProps(t.axis)} unit="%" />
        <YAxis type="category" dataKey="name" {...axisProps(t.axis)} width={92} />
        <Tooltip
          cursor={{ fill: t.grid, fillOpacity: 0.4 }}
          content={({ payload }) => {
            const d = payload?.[0]?.payload as PredictionRow | undefined;
            if (!d) return null;
            return (
              <Tip
                label={d.name}
                rows={[
                  { label: "Potentiel", value: fmtDuration(d.potential), color: t.slate },
                  { label: "Réaliste", value: fmtDuration(d.realistic), color: t.clay },
                  { label: "Écart", value: `+${d.gapPct} %` },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="gapPct" radius={[0, 3, 3, 0]} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.gapPct > 6 ? t.clay : d.gapPct > 2 ? t.ochre : t.sage} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
