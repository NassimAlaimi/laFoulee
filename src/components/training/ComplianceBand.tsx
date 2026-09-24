import { PHASE_COLOR, PHASE_LABELS, type Phase } from "@/lib/training";
import {
  COMPLIANCE_COLOR,
  COMPLIANCE_LABEL,
  overallCompliance,
  phaseCompliance,
  type WeekCompliance,
} from "@/lib/compliance";

/**
 * Conformité du plan — « as-tu fait ce que tu avais prévu ? »
 *
 * Le bandeau reprend la grammaire du calendrier coloré des outils élite
 * (WKO5, TrainingPeaks) : une colonne par semaine, hauteur = part des séances
 * réalisées, couleur = niveau de suivi, filet de phase sous chaque colonne.
 * Rendu statique, aucune bibliothèque de graphes.
 */

export function ComplianceOverview({ rows }: { rows: WeekCompliance[] }) {
  const overall = overallCompliance(rows);
  const phases = phaseCompliance(rows);
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
      <div>
        <div className="display text-d4">
          {overall.sessionPct === null ? "—" : `${overall.sessionPct} %`}
        </div>
        <div className="mt-1 text-micro text-ink3">
          des séances du plan réalisées
          {overall.kmPct !== null && (
            <> · {overall.kmPct} % des kilomètres prévus</>
          )}
        </div>
      </div>

      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        {phases.map((p) => (
          <div key={p.phase}>
            <dt
              className="text-micro font-medium uppercase tracking-[0.14em]"
              style={{ color: PHASE_COLOR[p.phase] ?? undefined }}
            >
              {PHASE_LABELS[p.phase as Phase] ?? p.phase}
            </dt>
            <dd className="mt-0.5 text-lg font-semibold leading-none">
              {p.sessionPct === null ? "—" : `${p.sessionPct} %`}
              <span className="ml-1.5 text-micro font-normal text-ink3">
                {p.sessionsDone}/{p.sessionsPlanned} séances
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ComplianceBand({ rows }: { rows: WeekCompliance[] }) {
  if (rows.length === 0) {
    return <p className="py-4 text-sm text-ink3">Aucune séance dans ce plan.</p>;
  }

  // La semaine en cours est la dernière semaine non future de la série.
  let currentWeek: number | null = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].zone !== "upcoming") {
      currentWeek = rows[i].weekNumber;
      break;
    }
  }

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div
          className="flex min-w-[560px] items-end gap-[3px]"
          role="img"
          aria-label="Conformité semaine par semaine : hauteur = part des séances réalisées, couleur = niveau de suivi"
        >
          {rows.map((r) => (
            <WeekBar key={r.weekNumber} row={r} current={r.weekNumber === currentWeek} />
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-micro text-ink3">
        {(["good", "fair", "low", "upcoming"] as const).map((z) => (
          <span key={z} className="flex items-center gap-1.5">
            <span
              className="h-[9px] w-[9px] rounded-[1px]"
              style={{ background: COMPLIANCE_COLOR[z] }}
            />
            {COMPLIANCE_LABEL[z]}
          </span>
        ))}
        <span className="ml-auto hidden sm:inline">
          barre = % de séances faites · filet = phase
        </span>
      </div>
    </div>
  );
}

function WeekBar({ row, current }: { row: WeekCompliance; current: boolean }) {
  const upcoming = row.zone === "upcoming";
  const pct = row.donePct ?? 0;
  const title = upcoming
    ? `Semaine ${row.weekNumber} — ${row.sessionsPlanned} séances prévues · ${row.plannedKm} km`
    : `${current ? "Semaine en cours" : `Semaine ${row.weekNumber}`} — ${row.sessionsDone}/${row.sessionsPlanned} séances · ${row.actualKm}/${row.plannedKm} km · ${COMPLIANCE_LABEL[row.zone]}`;

  return (
    <div
      className="group flex flex-1 flex-col items-center gap-1.5"
      title={title}
    >
      <div
        className={`relative h-16 w-full rounded-[2px] ${
          upcoming ? "border border-dashed border-hairStrong" : ""
        }`}
        style={{ background: upcoming ? "transparent" : "rgb(var(--hair))" }}
      >
        {/* Barre : part des séances réalisées */}
        {!upcoming && pct > 0 && (
          <div
            className="absolute inset-x-0 bottom-0 rounded-[2px] transition-[height] duration-300"
            style={{
              height: `${Math.max(pct, 3)}%`,
              background: COMPLIANCE_COLOR[row.zone],
            }}
          />
        )}
        {/* Filet de phase */}
        <div
          className="absolute inset-x-0 bottom-0 h-[3px] rounded-b-[2px]"
          style={{ background: PHASE_COLOR[row.phase] ?? "transparent" }}
        />
      </div>
      <span
        className={`text-[9px] leading-none ${
          current ? "font-semibold text-ink" : "text-ink3"
        }`}
      >
        {row.weekNumber}
      </span>
    </div>
  );
}
