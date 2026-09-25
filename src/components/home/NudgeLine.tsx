"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "foulee:nudges:dismissed";

/**
 * Un rappel à la fois, sous l'en-tête du jour : filet terre cuite, une phrase,
 * un lien, une croix. Ignorer un rappel le fait taire (localStorage) jusqu'à
 * ce que la situation change — l'identifiant inclut la période.
 */
export function NudgeLine({
  nudges,
  labels,
}: {
  nudges: Array<{ id: string; text: string; cta: string; href: string }>;
  labels: { dismiss: string; eyebrow: string };
}) {
  const [dismissed, setDismissed] = useState<string[] | null>(null);
  useEffect(() => {
    try {
      setDismissed(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
    } catch {
      setDismissed([]);
    }
  }, []);
  if (dismissed === null) return null;
  const n = nudges.find((x) => !dismissed.includes(x.id));
  if (!n) return null;

  const dismiss = () => {
    const next = [...dismissed, n.id].slice(-60);
    setDismissed(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* stockage indisponible : le rappel reviendra, tant pis */
    }
  };

  return (
    <div className="rise -mt-4 mb-10 flex items-start gap-4 border-l-2 border-clay py-1 pl-4">
      <div className="min-w-0 flex-1">
        <div className="text-micro font-medium uppercase tracking-[0.14em] text-clay">{labels.eyebrow}</div>
        <p className="mt-1 text-[0.9375rem] leading-snug">
          {n.text}{" "}
          <Link href={n.href} className="whitespace-nowrap font-medium text-clay hover:underline">
            {n.cta} →
          </Link>
        </p>
      </div>
      <button type="button" onClick={dismiss} className="btn-quiet shrink-0 px-2 text-ink3" aria-label={labels.dismiss} title={labels.dismiss}>
        ×
      </button>
    </div>
  );
}
