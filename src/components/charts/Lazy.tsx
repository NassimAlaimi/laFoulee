"use client";

import dynamic from "next/dynamic";

/** Recharts chargé en différé : la page s'affiche avant les graphiques. */

function Sk({ h }: { h: number }) {
  return <div className="skeleton w-full" style={{ height: h }} />;
}

export const VolumeChart = dynamic(
  () => import("./VolumeChart").then((m) => m.VolumeChart),
  { ssr: false, loading: () => <Sk h={230} /> }
);

export const ElevationChart = dynamic(
  () => import("./VolumeChart").then((m) => m.ElevationChart),
  { ssr: false, loading: () => <Sk h={180} /> }
);

export const LoadChart = dynamic(
  () => import("./LoadChart").then((m) => m.LoadChart),
  { ssr: false, loading: () => <Sk h={220} /> }
);

export const AcwrChart = dynamic(
  () => import("./LoadChart").then((m) => m.AcwrChart),
  { ssr: false, loading: () => <Sk h={190} /> }
);

export const PaceProgressionChart = dynamic(
  () => import("./PaceChart").then((m) => m.PaceProgressionChart),
  { ssr: false, loading: () => <Sk h={220} /> }
);

export const VdotChart = dynamic(
  () => import("./PaceChart").then((m) => m.VdotChart),
  { ssr: false, loading: () => <Sk h={200} /> }
);

export const PaceHrScatter = dynamic(
  () => import("./PaceChart").then((m) => m.PaceHrScatter),
  { ssr: false, loading: () => <Sk h={220} /> }
);


export const FormChart = dynamic(
  () => import("./FormChart").then((m) => m.FormChart),
  { ssr: false, loading: () => <Sk h={260} /> }
);

export const DurationCurveChart = dynamic(
  () => import("./AnalysisCharts").then((m) => m.DurationCurveChart),
  { ssr: false, loading: () => <Sk h={240} /> }
);

export const CriticalSpeedChart = dynamic(
  () => import("./AnalysisCharts").then((m) => m.CriticalSpeedChart),
  { ssr: false, loading: () => <Sk h={240} /> }
);

export const YearCompareChart = dynamic(
  () => import("./AnalysisCharts").then((m) => m.YearCompareChart),
  { ssr: false, loading: () => <Sk h={250} /> }
);

export const PolarizationChart = dynamic(
  () => import("./AnalysisCharts").then((m) => m.PolarizationChart),
  { ssr: false, loading: () => <Sk h={230} /> }
);

export const PaceZoneChart = dynamic(
  () => import("./AnalysisCharts").then((m) => m.PaceZoneChart),
  { ssr: false, loading: () => <Sk h={230} /> }
);

export const PotentialGapChart = dynamic(
  () => import("./AnalysisCharts").then((m) => m.PotentialGapChart),
  { ssr: false, loading: () => <Sk h={200} /> }
);

export const AerobicPaceChart = dynamic(
  () => import("./PaceChart").then((m) => m.AerobicPaceChart),
  { ssr: false, loading: () => <Sk h={230} /> }
);
