"use client";

import dynamic from "next/dynamic";

export const SplitChart = dynamic(
  () => import("./SplitChart").then((m) => m.SplitChart),
  { ssr: false, loading: () => <div className="skeleton w-full" style={{ height: 260 }} /> }
);
