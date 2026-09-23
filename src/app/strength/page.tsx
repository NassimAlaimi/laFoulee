import Link from "next/link";
import { Empty, PageHead, Section } from "@/components/ui/Layout";
import { Metric, MetricBand } from "@/components/ui/Metric";
import { Sparkline } from "@/components/ui/Spark";
import { requireUserId } from "@/lib/auth";
import { fmtDateShort, fmtDuration } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getStrengthSessions } from "@/lib/queries";
import { addDays, compareTrend, daysBetween, startOfWeek } from "@/lib/stats";
import { loadWorkouts } from "@/lib/strength-store";
import {
  MUSCLE_LABELS,
  RUNNER_WEEKLY_SETS,
  TEMPLATES,
  exerciseHistories,
  exerciseInfo,
  isHardSet,
  setsByMuscle,
  tonnage,
  workoutPRs,
  type Muscle,
} from "@/lib/strength";

export const dynamic = "force-dynamic";

const kg = (v: number) => (v % 1 ? v.toFixed(1).replace(".", ",") : String(v));

/**
 * Musculation — le renforcement vu depuis la course à pied.
 *
 * Deux sources : les séances détaillées saisies ici (exercices, séries,
 * charges) et les séances Strava de type musculation, qui n'ont qu'une durée.
 * Une séance Strava peut être « détaillée » : elle devient alors une séance
 * saisie, rattachée à l'activité.
 */
export default async function StrengthPage() {
  const userId = await requireUserId();
  const now = new Date();
  const [workouts, strava] = await Promise.all([loadWorkouts(userId), getStrengthSessions(undefined, userId)]);

  const linked = new Set(workouts.map((w) => w.activityId).filter(Boolean));
  const undetailed = strava.filter((s) => !linked.has(s.id));

  // Séance de renfo prévue par le plan, aujourd'hui ou demain
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const planned = await prisma.plannedSession.findFirst({
    where: {
      kind: "strength",
      status: { in: ["planned", "moved"] },
      date: { gte: today, lt: addDays(today, 2) },
      plan: { userId, status: "active" },
    },
    orderBy: { date: "asc" },
    select: { date: true, title: true, durationMin: true, tagline: true },
  });

  if (!workouts.length && !strava.length) {
    return (
      <>
        <PageHead title="Musculation" />
        <Empty
          title="Ton carnet de renforcement"
          body="Note tes séances exercice par exercice : l'app retient tes charges, estime ton 1RM, propose la progression de la séance suivante et vérifie que la chaîne du coureur (fessiers, ischios, mollets, hanches) reçoit assez de travail."
          action={
            <Link href="/strength/new" className="btn-solid">
              Première séance
            </Link>
          }
        />
        <Templates />
      </>
    );
  }

  // ------------------------------------------------------------ Chiffres
  const within = (d: Date, a: number, b = 0) => {
    const n = daysBetween(d, now);
    return n <= a && n > b;
  };
  const w28 = workouts.filter((w) => within(w.date, 28, -1));
  const w56 = workouts.filter((w) => within(w.date, 56, 28));
  const sessions28 = w28.length + undetailed.filter((s) => within(s.startDate, 28, -1)).length;
  const sessionsPrev = w56.length + undetailed.filter((s) => within(s.startDate, 56, 28)).length;
  const tonnage28 = w28.reduce((a, w) => a + tonnage(w.sets), 0);
  const hardPerWeek = w28.reduce((a, w) => a + w.sets.filter(isHardSet).length, 0) / 4;

  const prs90 = workouts
    .filter((w) => within(w.date, 90, -1))
    .flatMap((w) => workoutPRs(w, workouts).map((p) => ({ ...p, date: w.date, workoutId: w.id })));

  // ------------------------------------------------------------ Équilibre
  const muscle28 = setsByMuscle(w28.flatMap((w) => w.sets));
  const runnerRows = (Object.keys(RUNNER_WEEKLY_SETS) as Muscle[]).map((m) => {
    const [lo, hi] = RUNNER_WEEKLY_SETS[m]!;
    const perWeek = muscle28[m] / 4;
    return { m, lo, hi, perWeek };
  });
  const scaleMax = Math.max(12, ...runnerRows.map((r) => r.perWeek + 1));

  // ------------------------------------------------------------ Exercices
  const histories = exerciseHistories(workouts.map((w) => ({ id: w.id, date: w.date, sets: w.sets })));

  // ------------------------------------------------------------ Régularité
  const monday = startOfWeek(now);
  const weeks = Array.from({ length: 16 }, (_, i) => {
    const start = addDays(monday, -7 * (15 - i));
    const end = addDays(start, 7);
    const inWeek = (d: Date) => d >= start && d < end;
    return {
      start,
      detailed: workouts.filter((w) => inWeek(w.date)).length,
      strava: undetailed.filter((s) => inWeek(s.startDate)).length,
    };
  });
  const maxWeek = Math.max(4, ...weeks.map((w) => w.detailed + w.strava));

  // ------------------------------------------------------------ Historique fusionné
  const history = [
    ...workouts.map((w) => ({ kind: "detailed" as const, date: w.date, w })),
    ...undetailed.map((s) => ({ kind: "strava" as const, date: s.startDate, s })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <>
      <PageHead
        title="Musculation"
        meta={`${workouts.length} séance${workouts.length > 1 ? "s" : ""} détaillée${workouts.length > 1 ? "s" : ""} · ${strava.length} depuis Strava`}
        action={
          <Link href="/strength/new" className="btn-solid">
            + Nouvelle séance
          </Link>
        }
      />

      {planned && (
        <Link
          href="/strength/new"
          className="group mb-8 flex items-center justify-between gap-4 rounded-card border border-sage/40 bg-sage/[.07] px-5 py-4 transition-colors hover:bg-sage/[.12]"
        >
          <span>
            <span className="block text-micro font-medium uppercase tracking-[0.12em] text-sage">
              Prévu {planned.date.toDateString() === now.toDateString() ? "aujourd'hui" : "demain"} par ton plan
            </span>
            <span className="mt-1 block font-medium">
              {planned.title}
              <span className="ml-2 text-[0.8125rem] font-normal text-ink2">~{planned.durationMin} min</span>
            </span>
          </span>
          <span className="text-[0.8125rem] font-medium text-sage transition-transform group-hover:translate-x-0.5">
            Commencer →
          </span>
        </Link>
      )}

      <MetricBand>
        <Metric label="Séances · 28 jours" value={sessions28} trend={compareTrend(sessions28, sessionsPrev)} />
        <Metric label="Séries dures / semaine" value={Math.round(hardPerWeek * 10) / 10} note="moyenne 4 semaines" />
        <Metric label="Tonnage · 28 jours" value={Math.round(tonnage28).toLocaleString("fr-FR")} unit="kg" />
        <Metric
          label="Records · 90 jours"
          value={prs90.length}
          note={prs90[0] ? `dernier : ${exerciseInfo(prs90[0].exercise).name}` : undefined}
        />
      </MetricBand>

      <div className="mt-10 space-y-10">
        {/* ---------------------------------------------- Équilibre du coureur */}
        <Section
          title="La chaîne du coureur"
          note="Séries dures par semaine (moyenne sur 4 semaines) face à une fourchette de complément à la course : assez pour gagner en force et en solidité des tendons, sans empiéter sur la récupération."
        >
          <div className="space-y-1">
            {runnerRows.map((r) => {
              const status = r.perWeek < r.lo ? "under" : r.perWeek > r.hi ? "over" : "in";
              return (
                <div key={r.m} className="grid grid-cols-[150px_minmax(0,1fr)_120px] items-center gap-4 py-2">
                  <span className="text-[0.8125rem]">{MUSCLE_LABELS[r.m]}</span>
                  <div className="relative h-6">
                    <div className="absolute inset-y-[9px] left-0 right-0 rounded-full bg-sunken" />
                    <div
                      className="absolute inset-y-[5px] rounded-[3px] border border-dashed border-sage/60 bg-sage/10"
                      style={{ left: `${(r.lo / scaleMax) * 100}%`, width: `${((r.hi - r.lo) / scaleMax) * 100}%` }}
                      title={`Cible ${r.lo}–${r.hi} séries/semaine`}
                    />
                    <div
                      className={`absolute inset-y-[9px] left-0 rounded-full ${status === "in" ? "bg-sage" : status === "over" ? "bg-ochre" : "bg-clay"}`}
                      style={{ width: `${Math.max(1, (r.perWeek / scaleMax) * 100)}%` }}
                    />
                  </div>
                  <span className="text-right text-micro">
                    <span className="font-mono text-[0.8125rem] font-medium">{kg(Math.round(r.perWeek * 10) / 10)}</span>
                    <span className={`ml-2 ${status === "in" ? "text-sage" : status === "over" ? "text-ochre" : "text-clay"}`}>
                      {status === "in" ? "dans la cible" : status === "over" ? "au-dessus" : `vise ${r.lo}+`}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ---------------------------------------------- Exercices */}
        {histories.length > 0 && (
          <Section title="Tes exercices" note="Meilleur 1RM estimé (Epley/Brzycki, répétitions en réserve incluses) et son évolution séance après séance.">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Exercice</th>
                    <th className="text-right">Séances</th>
                    <th className="text-right">Dernière</th>
                    <th className="text-right">Meilleure série</th>
                    <th className="text-right">1RM est.</th>
                    <th className="text-right">Tendance</th>
                  </tr>
                </thead>
                <tbody>
                  {histories.map((h) => {
                    const info = exerciseInfo(h.exercise);
                    const top = h.sessions.reduce((a, b) => (b.topWeight > a.topWeight ? b : a));
                    const trend = h.sessions.map((s) => s.e1rm ?? s.topReps);
                    return (
                      <tr key={h.exercise}>
                        <td>
                          <Link href={`/strength/exercise/${encodeURIComponent(h.exercise)}`} className="hover:text-clay">
                            {info.name}
                          </Link>
                        </td>
                        <td className="num text-right text-ink2">{h.sessions.length}</td>
                        <td className="num text-right text-ink2">{fmtDateShort(h.lastDate)}</td>
                        <td className="num text-right">
                          {top.topWeight > 0 ? `${top.topReps} × ${kg(top.topWeight)} kg` : `${h.bestReps}${info.unit === "seconds" ? " s" : " reps"}`}
                        </td>
                        <td className="num text-right font-medium">{h.bestE1rm ? `${kg(Math.round(h.bestE1rm))} kg` : "—"}</td>
                        <td className="text-right">
                          <span className="inline-block">
                            <Sparkline data={trend} width={72} height={20} />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* ---------------------------------------------- Régularité */}
        <Section title="Régularité" note="16 dernières semaines — séances détaillées et séances Strava sans détail.">
          <div className="flex h-[120px] items-end gap-1.5">
            {weeks.map((w) => (
              <div
                key={w.start.toISOString()}
                className="mx-auto flex w-full max-w-[22px] flex-1 flex-col-reverse gap-[3px]"
                title={`Semaine du ${fmtDateShort(w.start)} : ${w.detailed} détaillée(s), ${w.strava} Strava`}
              >
                {Array.from({ length: w.detailed }, (_, i) => (
                  <span key={`d${i}`} className="block rounded-[2px] bg-plum" style={{ height: `${110 / maxWeek - 3}px` }} />
                ))}
                {Array.from({ length: w.strava }, (_, i) => (
                  <span key={`s${i}`} className="block rounded-[2px] bg-plum/35" style={{ height: `${110 / maxWeek - 3}px` }} />
                ))}
                {w.detailed + w.strava === 0 && <span className="block h-[2px] rounded-full bg-hair" />}
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-ink3">
            <span>{fmtDateShort(weeks[0].start)}</span>
            <span className="flex gap-3">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-[2px] bg-plum" /> détaillée
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-[2px] bg-plum/35" /> Strava
              </span>
            </span>
            <span>cette semaine</span>
          </div>
        </Section>

        {/* ---------------------------------------------- Historique */}
        <Section title="Historique">
          {history.slice(0, 40).map((h) =>
            h.kind === "detailed" ? (
              <Link
                key={h.w.id}
                href={`/strength/${h.w.id}`}
                className="group grid grid-cols-[72px_minmax(0,1fr)_auto] items-baseline gap-4 border-b border-hair py-3 last:border-b-0"
              >
                <span className="font-mono text-micro text-ink3">{fmtDateShort(h.date)}</span>
                <span className="min-w-0">
                  <span className="font-medium transition-colors group-hover:text-clay">{h.w.name}</span>
                  <span className="mt-0.5 block truncate text-micro text-ink3">
                    {[...new Set(h.w.sets.map((s) => s.exercise))].map((e) => exerciseInfo(e).name).join(" · ")}
                  </span>
                </span>
                <span className="text-right font-mono text-micro text-ink2">
                  {Math.round(tonnage(h.w.sets)).toLocaleString("fr-FR")} kg
                  {workoutPRs(h.w, workouts).length > 0 && <span className="ml-2 text-clay">★ record</span>}
                </span>
              </Link>
            ) : (
              <div
                key={h.s.id}
                className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-baseline gap-4 border-b border-hair py-3 last:border-b-0"
              >
                <span className="font-mono text-micro text-ink3">{fmtDateShort(h.date)}</span>
                <span className="min-w-0">
                  <span className="text-ink2">{h.s.name}</span>
                  <span className="mt-0.5 block text-micro text-ink3">
                    Strava · {fmtDuration(h.s.movingTime)}
                    {h.s.averageHr ? ` · ${Math.round(h.s.averageHr)} bpm` : ""}
                  </span>
                </span>
                <Link href={`/strength/new?activity=${h.s.id}`} className="btn-quiet">
                  Détailler →
                </Link>
              </div>
            )
          )}
        </Section>

        <Templates />
      </div>
    </>
  );
}

function Templates() {
  return (
    <Section title="Modèles de séance" note="Choisis-en un en créant une séance : les charges sont préremplies d'après ta dernière fois.">
      <div className="grid gap-x-10 gap-y-4 md:grid-cols-2">
        {TEMPLATES.map((t) => (
          <div key={t.key} className="border-b border-hair pb-4">
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-medium">{t.name}</span>
              <span className="text-micro text-ink3">{t.note}</span>
            </div>
            <div className="mt-1.5 text-micro leading-relaxed text-ink2">
              {t.items.map((i) => `${exerciseInfo(i.exercise).name} ${i.sets}×${i.reps}${exerciseInfo(i.exercise).unit === "seconds" ? "s" : ""}`).join(" · ")}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
