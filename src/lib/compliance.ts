/**
 * Conformité du plan — « as-tu fait ce que tu avais prévu ? »
 *
 * Deux mesures distinctes, semaine par semaine :
 *
 * - **% de séances** (sessionPct) — la part des séances de course marquées
 *   « fait » parmi celles planifiées. C'est la fidélité au plan, le chiffre
 *   que colorent les calendriers des outils élite (WKO5, TrainingPeaks).
 * - **% de kilomètres** (kmPct) — le volume réellement couru face au volume
 *   prévu. Il peut dépasser 100 % (semaine où l'on a couru plus que prévu)
 *   sans que la conformité de séances bouge.
 *
 * Seules les séances de course comptent : la musculation, le cross et le
 * repos sont des bonus qui ne pénalisent jamais la conformité. Une séance
 * déplacée reste « planifiée » dans sa semaine cible.
 */

import { round, startOfWeek } from "./stats";
import { isRun, type SessionKind } from "./workouts";

export type PlanSessionLike = {
  weekNumber: number;
  weekStart: Date;
  phase: string;
  distanceKm: number;
  status: string; // planned | done | skipped | moved
  kind: string;
};

export type ComplianceZone = "upcoming" | "empty" | "good" | "fair" | "low";

export type WeekCompliance = {
  weekNumber: number;
  weekStart: Date;
  phase: string;
  /** km de course planifiés */
  plannedKm: number;
  /** km réellement courus dans la semaine (toutes sorties confondues) */
  actualKm: number;
  /** km réels / km prévus — null pour les semaines à venir */
  kmRatio: number | null;
  sessionsPlanned: number;
  sessionsDone: number;
  sessionsSkipped: number;
  /** % de séances faites (0-100) — null pour les semaines à venir ou vides */
  donePct: number | null;
  zone: ComplianceZone;
};

/** Libellés de conformité — clés i18n `common.compliance.*`. */
export const COMPLIANCE_LABEL: Record<ComplianceZone, string> = {
  upcoming: "compliance.upcoming",
  empty: "compliance.empty",
  good: "compliance.good",
  fair: "compliance.fair",
  low: "compliance.low",
};

/** Couleurs du bandeau — alignées sur les tokens de la palette. */
export const COMPLIANCE_COLOR: Record<ComplianceZone, string> = {
  upcoming: "rgb(var(--hair-strong))",
  empty: "rgb(var(--hair))",
  good: "rgb(var(--sage))",
  fair: "rgb(var(--ochre))",
  low: "rgb(var(--rust))",
};

/** Seuils de lecture : ≥ 90 % on est au rendez-vous, ≥ 60 % on décroche. */
export function zoneFor(
  donePct: number | null,
  sessionsPlanned: number,
  upcoming: boolean
): ComplianceZone {
  if (upcoming) return "upcoming";
  if (sessionsPlanned === 0) return "empty";
  if (donePct === null) return "empty";
  if (donePct >= 90) return "good";
  if (donePct >= 60) return "fair";
  return "low";
}

/**
 * Série de conformité semaine par semaine, triée par numéro de semaine.
 * `actualKmByWeek` : km réellement courus par numéro de semaine.
 * `thisMonday` : lundi de la semaine en cours — les semaines strictement
 * ultérieures sont marquées « à venir ».
 */
export function complianceSeries(
  sessions: PlanSessionLike[],
  actualKmByWeek: Map<number, number>,
  thisMonday: Date
): WeekCompliance[] {
  const byWeek = new Map<number, PlanSessionLike[]>();
  for (const s of sessions) {
    const list = byWeek.get(s.weekNumber) ?? [];
    list.push(s);
    byWeek.set(s.weekNumber, list);
  }

  return [...byWeek.keys()].sort((a, b) => a - b).map((weekNumber) => {
    const list = byWeek.get(weekNumber)!;
    const runs = list.filter((s) => isRun(s.kind as SessionKind));
    const plannedKm = round(runs.reduce((a, s) => a + s.distanceKm, 0), 1);
    const done = runs.filter((s) => s.status === "done").length;
    const skipped = runs.filter((s) => s.status === "skipped").length;
    const upcoming =
      startOfWeek(list[0].weekStart).getTime() > startOfWeek(thisMonday).getTime();
    const sessionsPlanned = runs.length;
    const donePct =
      upcoming || sessionsPlanned === 0
        ? null
        : Math.round((done / sessionsPlanned) * 100);
    const actualKm = round(actualKmByWeek.get(weekNumber) ?? 0, 1);
    const kmRatio =
      upcoming || plannedKm === 0 ? null : round(actualKm / plannedKm, 2);

    return {
      weekNumber,
      weekStart: list[0].weekStart,
      phase: list[0].phase,
      plannedKm,
      actualKm,
      kmRatio,
      sessionsPlanned,
      sessionsDone: done,
      sessionsSkipped: skipped,
      donePct,
      zone: zoneFor(donePct, sessionsPlanned, upcoming),
    };
  });
}

export type PhaseCompliance = {
  phase: string;
  plannedKm: number;
  actualKm: number;
  sessionsPlanned: number;
  sessionsDone: number;
  sessionsSkipped: number;
  kmPct: number | null;
  sessionPct: number | null;
};

/** Conformité agrégée par phase (base, développement, spécifique…). */
export function phaseCompliance(rows: WeekCompliance[]): PhaseCompliance[] {
  const byPhase = new Map<string, PhaseCompliance>();
  for (const r of rows) {
    if (r.zone === "upcoming") continue;
    const p =
      byPhase.get(r.phase) ??
      ({
        phase: r.phase,
        plannedKm: 0,
        actualKm: 0,
        sessionsPlanned: 0,
        sessionsDone: 0,
        sessionsSkipped: 0,
        kmPct: null,
        sessionPct: null,
      } satisfies PhaseCompliance);
    p.plannedKm += r.plannedKm;
    p.actualKm += r.actualKm;
    p.sessionsPlanned += r.sessionsPlanned;
    p.sessionsDone += r.sessionsDone;
    p.sessionsSkipped += r.sessionsSkipped;
    byPhase.set(r.phase, p);
  }
  return [...byPhase.values()].map((p) => ({
    ...p,
    plannedKm: round(p.plannedKm, 1),
    actualKm: round(p.actualKm, 1),
    kmPct: p.plannedKm > 0 ? Math.round((p.actualKm / p.plannedKm) * 100) : null,
    sessionPct:
      p.sessionsPlanned > 0
        ? Math.round((p.sessionsDone / p.sessionsPlanned) * 100)
        : null,
  }));
}

export type OverallCompliance = {
  sessionPct: number | null;
  kmPct: number | null;
};

/** Conformité globale sur toutes les semaines écoulées du plan. */
export function overallCompliance(rows: WeekCompliance[]): OverallCompliance {
  const past = rows.filter((r) => r.zone !== "upcoming" && r.sessionsPlanned > 0);
  const done = past.reduce((a, r) => a + r.sessionsDone, 0);
  const planned = past.reduce((a, r) => a + r.sessionsPlanned, 0);
  const km = past.reduce((a, r) => a + r.actualKm, 0);
  const kmPlanned = past.reduce((a, r) => a + r.plannedKm, 0);
  return {
    sessionPct: planned > 0 ? Math.round((done / planned) * 100) : null,
    kmPct: kmPlanned > 0 ? Math.round((km / kmPlanned) * 100) : null,
  };
}
