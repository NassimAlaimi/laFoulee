import Link from "next/link";
import {
  CriticalSpeedChart,
  DurationCurveChart,
  FormChart,
  PaceZoneChart,
  PolarizationChart,
  PotentialGapChart,
  YearCompareChart,
} from "@/components/charts/Lazy";
import { ConsistencyHeatmap } from "@/components/analysis/ConsistencyHeatmap";
import { Hint, PageHead, Section, SectionHead } from "@/components/ui/Layout";
import { Bar } from "@/components/ui/Metric";
import {
  consistencyGrid,
  paceByIntensity,
  polarizationByMonth,
  polarizationSummary,
  recordTimeline,
  yearCompare,
} from "@/lib/analysis";
import {
  formSeries,
  formSummary,
  plannedLoad,
  ZONE_LABEL,
  ZONE_TONE,
} from "@/lib/fitness-model";
import { fmtDuration, fmtPace } from "@/lib/format";
import { athleteContext } from "@/lib/plan-store";
import { criticalSpeed, durationCurve, RIEGEL_DEFAULT } from "@/lib/prediction";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { getBestEfforts } from "@/lib/queries";
import { trimLeadingEmpty } from "@/lib/stats";
import { STANDARD_DISTANCES } from "@/lib/records";

export const dynamic = "force-dynamic";

/** Distances mises en avant dans le tableau des prédictions. */
const FOCUS_DISTANCES = ["5k", "10k", "half", "marathon"];

export default async function AnalysisPage() {
  const now = new Date();
  const userId = await requireUserId();
  const [ctx, efforts, futureSessions] = await Promise.all([
    athleteContext(now, userId),
    getBestEfforts(userId),
    prisma.plannedSession.findMany({
      where: {
        date: { gt: now },
        status: "planned",
        plan: { userId, status: "active" },
      },
      orderBy: { date: "asc" },
      select: {
        date: true,
        distanceKm: true,
        durationMin: true,
        intensity: true,
        kind: true,
      },
    }),
  ]);

  const { runs, records, profile, endurance, fitness } = ctx;

  if (runs.length < 5) {
    return (
      <div className="space-y-6">
        <PageHead title="Analyse" meta="Modèles de performance et charge d'entraînement" />
        <Hint height={160}>
          Il faut au moins quelques sorties pour que les modèles aient du sens.
          Synchronise Strava depuis <Link href="/settings" className="text-clay">les réglages</Link>.
        </Hint>
      </div>
    );
  }

  // ---------------------------------------------------------------- Forme
  const future = futureSessions.map((s) => ({ date: s.date, load: plannedLoad(s) }));
  const series = formSeries({ activities: runs, days: 180, future, now });
  const form = formSummary(series, now);
  const formRows = series.map((p) => ({
    label: p.label,
    ctl: p.ctl,
    atl: p.atl,
    tsb: p.tsb,
    projected: p.projected,
    ctlPast: p.projected ? null : p.ctl,
    ctlFuture: p.projected ? p.ctl : null,
    tsbPast: p.projected ? null : p.tsb,
    tsbFuture: p.projected ? p.tsb : null,
  }));

  // ---------------------------------------------------------------- Modèles
  const cs = criticalSpeed(records);
  const curve = durationCurve(records, profile, endurance).filter((p) => p.seconds > 0);

  const predictions = STANDARD_DISTANCES.filter((d) => FOCUS_DISTANCES.includes(d.key))
    .map((d) => {
      const p = ctx.predict(d.meters);
      return p ? { ...p, name: d.name } : null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const gapRows = predictions.map((p) => ({
    name: p.name,
    potential: p.potential,
    realistic: p.realistic,
    gapPct: Math.round(((p.realistic - p.potential) / p.potential) * 1000) / 10,
  }));

  // ---------------------------------------------------------------- Volume
  const yoy = yearCompare(runs, { years: 3, now });
  const polar = trimLeadingEmpty(polarizationByMonth(runs, profile.vdot, { months: 8, now }), (r) => r.km === 0);
  const polarSum = polarizationSummary(runs, profile.vdot, { days: 90, now });
  const paceZones = trimLeadingEmpty(paceByIntensity(runs, profile.vdot, { months: 12, now }), (r) => r.easy == null && r.quality == null);
  const grid = consistencyGrid(runs, { weeks: 26, now });
  const timeline = recordTimeline(efforts).slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHead
        title="Analyse"
        meta="Modèles de performance, charge d'entraînement, régularité"
        action={
          <Link href="/recap" className="btn-outline btn-sm">
            Rétrospective {new Date().getFullYear()} →
          </Link>
        }
      />

      {/* ------------------------------------------------ Synthèse */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card
          label="Condition (CTL)"
          value={form ? String(Math.round(form.ctl)) : "—"}
          note={
            form
              ? `${form.ctlDelta28 >= 0 ? "+" : ""}${form.ctlDelta28} sur 28 j · ${form.rampPerWeek}/sem`
              : undefined
          }
        />
        <Card
          label="Fraîcheur (TSB)"
          value={form ? `${form.tsb > 0 ? "+" : ""}${Math.round(form.tsb)}` : "—"}
          note={form ? ZONE_LABEL[form.zone] : undefined}
          tone={form ? ZONE_TONE[form.zone] : undefined}
        />
        <Card
          label="Indice d'endurance"
          value={endurance.exponent.toFixed(3)}
          note={`${endurance.label} · référence ${RIEGEL_DEFAULT}`}
          tone={endurance.exponent <= RIEGEL_DEFAULT ? "text-sage" : "text-ochre"}
        />
        <Card
          label="Vitesse critique"
          value={cs ? fmtPace(cs.pace) : "—"}
          note={cs ? `D′ ${cs.dPrime} m · VMA ≈ ${cs.vmaEstimate} km/h` : "2 efforts de 2-20 min requis"}
        />
      </div>

      {/* ------------------------------------------------ PMC */}
      <Section>
        <SectionHead
          title="Condition, fatigue et fraîcheur"
          note="Moyennes exponentielles 42 j / 7 j — la partie pointillée est projetée depuis le plan"
        />
        <FormChart data={formRows} height={300} legend={false} />
        <div className="mt-4 grid gap-4 border-t border-hair pt-4 sm:grid-cols-3">
          <Legend color="rgb(var(--slate))" label="Condition (CTL)" note="ce que tu encaisses" />
          <Legend color="rgb(var(--clay))" label="Fatigue (ATL)" note="charge des 7 derniers jours" />
          <Legend color="rgb(var(--sage))" label="Fraîcheur (TSB)" note="condition − fatigue" />
        </div>
        {form && (
          <p className="mt-4 font-mono text-micro tabular-nums text-ink2">
            Progression de condition : {form.rampPerWeek}/semaine
            {form.rampPerWeek > 7 && " — au-delà de 7, le risque de blessure augmente nettement"}
          </p>
        )}
      </Section>

      {/* ------------------------------------------------ Potentiel vs réaliste */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section>
          <SectionHead
            title="Potentiel contre réalisable"
            note="Écart entre ce que la physiologie autorise et ce que l'entraînement actuel permet"
          />
          {gapRows.length > 0 ? (
            <>
              <PotentialGapChart data={gapRows} />
              <table className="data-table mt-4">
                <thead>
                  <tr>
                    <th>Distance</th>
                    <th className="text-right">Potentiel</th>
                    <th className="text-right">Réaliste</th>
                    <th className="text-right">Fourchette</th>
                  </tr>
                </thead>
                <tbody>
                  {predictions.map((p) => (
                    <tr key={p.name}>
                      <td className="text-ink2">{p.name}</td>
                      <td className="text-right font-mono tabular-nums text-ink3">
                        {fmtDuration(p.potential)}
                      </td>
                      <td className="text-right font-mono font-medium tabular-nums">
                        {fmtDuration(p.realistic)}
                      </td>
                      <td className="text-right font-mono text-micro tabular-nums text-ink3">
                        {fmtDuration(p.low)} – {fmtDuration(p.high)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="mt-3 space-y-1">
                {predictions
                  .filter((p) => p.limiters.length > 0)
                  .slice(0, 2)
                  .map((p) => (
                    <li key={p.name} className="font-mono text-micro tabular-nums text-ink3">
                      {p.name} : {p.limiters.map((l) => l.label).join(" · ")}
                    </li>
                  ))}
              </ul>
            </>
          ) : (
            <Hint height={120}>Pas encore assez de performances chronométrées.</Hint>
          )}
        </Section>

        <Section>
          <SectionHead
            title="Courbe allure-durée"
            note="Records par distance, comparés au modèle personnel"
          />
          <DurationCurveChart data={curve} />
          <div className="mt-4 border-t border-hair pt-4">
            <div className="flex items-baseline justify-between text-[0.8125rem]">
              <span className="text-ink2">Exposant de fatigue</span>
              <span className="font-mono font-medium tabular-nums">
                {endurance.exponent.toFixed(3)}
                <span className="ml-2 text-micro text-ink3">
                  {endurance.measured
                    ? `mesuré sur ${endurance.samples} perfs · R² ${endurance.r2.toFixed(2)}`
                    : "valeur de référence"}
                </span>
              </span>
            </div>
            <p className="mt-2 font-mono text-micro leading-relaxed tabular-nums text-ink3">
              Quand la distance double, ton allure ralentit de {endurance.slowdownPerDoubling} %
              (référence : 4,2 %). Les points au-dessus de la courbe signalent une distance
              où il reste du temps à prendre.
            </p>
          </div>
        </Section>
      </div>

      {/* ------------------------------------------------ Vitesse critique */}
      {cs && (
        <Section>
          <SectionHead
            title="Vitesse critique"
            note="Modèle à deux paramètres : distance = CS × temps + D′ (efforts de 2 à 20 min)"
          />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <CriticalSpeedChart points={cs.points} cs={cs.cs} dPrime={cs.dPrime} />
            <div className="space-y-4">
              <Stat
                label="Vitesse critique"
                value={`${cs.cs.toFixed(2)} m/s`}
                note={`${fmtPace(cs.pace)} — allure tenable ~45-60 min`}
              />
              <Stat
                label="Réserve anaérobie (D′)"
                value={`${cs.dPrime} m`}
                note="distance parcourable au-dessus de la vitesse critique"
              />
              <Stat
                label="VMA estimée"
                value={`${cs.vmaEstimate} km/h`}
                note={`CS ≈ 90 % de la VMA · ajustement R² ${cs.r2.toFixed(3)}`}
              />
              <p className="border-t border-hair pt-3 font-mono text-micro leading-relaxed tabular-nums text-ink3">
                Une CS élevée avec un D′ faible = profil diesel. L&apos;inverse = profil
                explosif qui s&apos;appuie sur la réserve anaérobie.
              </p>
            </div>
          </div>
        </Section>
      )}

      {/* ------------------------------------------------ Polarisation */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section>
          <SectionHead
            title="Répartition de l'intensité"
            note="Part du volume mensuel par zone — le modèle polarisé vise 80 % en facile"
          />
          {polar.length > 0 ? (
            <>
              <PolarizationChart data={polar} />
              {polarSum && (
                <div className="mt-4 grid grid-cols-3 gap-4 border-t border-hair pt-4">
                  <Stat label="Facile" value={`${polarSum.easy} %`} />
                  <Stat label="Zone grise" value={`${polarSum.moderate} %`} />
                  <Stat label="Intense" value={`${polarSum.hard} %`} />
                </div>
              )}
              {polarSum && (
                <p
                  className={`mt-3 font-mono text-micro tabular-nums ${
                    polarSum.tone === "good"
                      ? "text-sage"
                      : polarSum.tone === "warn"
                        ? "text-ochre"
                        : "text-rust"
                  }`}
                >
                  90 derniers jours : {polarSum.verdict}
                </p>
              )}
            </>
          ) : (
            <Hint height={120}>Niveau de forme inconnu — un effort chronométré suffit.</Hint>
          )}
        </Section>

        <Section>
          <SectionHead
            title="Allure par zone"
            note="Sorties faciles et séances rapides, mois par mois"
          />
          <PaceZoneChart data={paceZones} />
          <p className="mt-4 border-t border-hair pt-4 font-mono text-micro leading-relaxed tabular-nums text-ink3">
            Une allure facile qui s&apos;améliore sans que les séances rapides ne bougent
            signale une base aérobie qui progresse.
          </p>
        </Section>
      </div>

      {/* ------------------------------------------------ Année / année */}
      <Section>
        <SectionHead
          title="Cumul annuel"
          note="Kilomètres cumulés semaine après semaine, année après année"
        />
        <YearCompareChart data={yoy.rows as never} years={yoy.years} />
        <div className="mt-4 grid gap-4 border-t border-hair pt-4 sm:grid-cols-3">
          {yoy.totals.map((t) => (
            <div key={t.year}>
              <div className="eyebrow">{t.year}</div>
              <div className="mt-1.5 font-mono text-[0.9375rem] font-medium tabular-nums">
                {t.km} km
              </div>
              <div className="mt-0.5 text-micro text-ink3">
                {t.runs} sorties
                {t.atWeek !== null && ` · ${t.atWeek} km à la même date`}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------ Régularité */}
      <Section>
        <SectionHead
          title="Régularité"
          note="26 dernières semaines — une case par jour, l'intensité de la teinte suit le kilométrage"
        />
        <ConsistencyHeatmap grid={grid} />
        <div className="mt-5 grid gap-4 border-t border-hair pt-4 sm:grid-cols-3">
          <Stat label="Série en cours" value={`${grid.currentStreak} sem.`} note="avec au moins une sortie" />
          <Stat label="Meilleure série" value={`${grid.bestStreak} sem.`} />
          <Stat
            label="Semaines actives"
            value={`${grid.activeRate} %`}
            note={`${fitness.sessionsPerWeek} sorties/sem en moyenne`}
          />
        </div>
        <div className="mt-4">
          <Bar value={grid.activeRate} height={4} />
        </div>
      </Section>

      {/* ------------------------------------------------ Records */}
      {timeline.length > 0 && (
        <Section>
          <SectionHead
            title="Barres passées"
            note="Chaque fois qu'un record personnel est tombé"
          />
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Distance</th>
                <th className="text-right">Chrono</th>
                <th className="text-right">Gain</th>
              </tr>
            </thead>
            <tbody>
              {timeline.map((t, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap text-ink2">{t.label}</td>
                  <td className="text-ink2">{t.distance}</td>
                  <td className="text-right font-mono font-medium tabular-nums">
                    {fmtDuration(t.seconds)}
                  </td>
                  <td className="text-right font-mono tabular-nums text-sage">
                    −{fmtDuration(t.improvementSeconds)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Blocs

function Card({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: string;
}) {
  return (
    <div className="card card-pad">
      <div className="section-title">{label}</div>
      <div className={`display text-d3 mt-2.5 ${tone ?? ""}`}>{value}</div>
      {note && <p className="mt-2 text-micro leading-relaxed text-ink3">{note}</p>}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mt-1.5 font-mono text-[0.9375rem] font-medium tabular-nums">{value}</div>
      {note && <div className="mt-1 text-micro leading-relaxed text-ink3">{note}</div>}
    </div>
  );
}

function Legend({ color, label, note }: { color: string; label: string; note: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="mt-1.5 h-[3px] w-3.5 shrink-0" style={{ background: color }} />
      <span>
        <span className="text-[0.8125rem] text-ink2">{label}</span>
        <span className="ml-2 text-micro text-ink3">{note}</span>
      </span>
    </div>
  );
}
