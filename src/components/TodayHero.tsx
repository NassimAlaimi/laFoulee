import Link from "next/link";
import { RouteGlyph } from "@/components/route/RouteGlyph";
import { fmtDuration, fmtPace, pacePerKm } from "@/lib/format";
import { actualKmForWeek, getActivePlan, linkActivities } from "@/lib/plan-store";
import { prisma } from "@/lib/prisma";
import { addDays, daysBetween, round, startOfWeek, type ActivityLike } from "@/lib/stats";
import { PHASE_LABELS, weekCompliance, type Phase } from "@/lib/training";
import { KIND_LABELS, type SessionKind, type Step } from "@/lib/workouts";
import { Frieze } from "@/components/training/Frieze";

const STEP_TONE: Record<string, string> = {
  warmup: "rgb(var(--sage) / 0.55)",
  cooldown: "rgb(var(--sage) / 0.55)",
  recovery: "rgb(var(--hair-strong))",
  work: "rgb(var(--clay))",
  block: "rgb(var(--ochre))",
};

const INTENSITY_WORD = ["", "très facile", "facile", "modérée", "soutenue", "maximale"];

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return "Bonne nuit";
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

/**
 * Ouverture du tableau de bord : la seule chose qui compte en arrivant,
 * c'est « qu'est-ce que je fais aujourd'hui ». En grand, la séance du jour
 * (ou ce qui a été fait), sa structure en frise, et trois repères autour :
 * la semaine, la course, la fraîcheur.
 */
export async function TodayHero({
  userId,
  firstname,
  runs,
  now = new Date(),
  tsb,
}: {
  userId: string;
  firstname: string | null;
  runs: ActivityLike[];
  now?: Date;
  tsb: number | null;
}) {
  const plan = await getActivePlan(userId);
  if (plan) await linkActivities(plan.id, now, userId);

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = addDays(today, 1);
  const monday = startOfWeek(now);

  const [todaySessions, nextSession, weekSessions, todayActivities, nextRace] = await Promise.all([
    plan
      ? prisma.plannedSession.findMany({
          where: { planId: plan.id, date: { gte: today, lt: tomorrow }, kind: { not: "rest" } },
          include: { activity: { select: { id: true, name: true, distance: true, movingTime: true, polyline: true } } },
          orderBy: { intensity: "desc" },
        })
      : Promise.resolve([]),
    plan
      ? prisma.plannedSession.findFirst({
          where: { planId: plan.id, date: { gte: tomorrow }, status: { in: ["planned", "moved"] }, kind: { not: "rest" } },
          orderBy: { date: "asc" },
          select: { date: true, title: true, distanceKm: true, durationMin: true, kind: true },
        })
      : Promise.resolve(null),
    plan
      ? prisma.plannedSession.findMany({
          where: { planId: plan.id, weekStart: monday },
          select: { distanceKm: true, status: true, kind: true, weekNumber: true, phase: true },
        })
      : Promise.resolve([]),
    prisma.activity.findMany({
      where: { userId, startDate: { gte: today, lt: tomorrow } },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, distance: true, movingTime: true, polyline: true, type: true },
    }),
    prisma.raceGoal.findFirst({
      where: { userId, status: "upcoming", raceDate: { gte: today } },
      orderBy: { raceDate: "asc" },
      select: { id: true, name: true, raceDate: true, distance: true },
    }),
  ]);

  const session = todaySessions.find((s) => s.kind !== "strength") ?? todaySessions[0] ?? null;
  const extra = todaySessions.filter((s) => s !== session);
  const done = session && (session.status === "done" || session.activity);
  const doneActivity = session?.activity ?? (todayActivities[0] || null);

  const doneKm = actualKmForWeek(runs, monday);
  const compliance = weekCompliance(weekSessions, doneKm);
  const weekInfo = weekSessions[0];

  const steps: Step[] = session?.structure ? safeSteps(session.structure) : [];

  const dateLabel = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const daysToRace = nextRace ? daysBetween(today, nextRace.raceDate) : null;
  const pct = compliance.plannedKm > 0 ? Math.min(1, compliance.doneKm / compliance.plannedKm) : 0;

  return (
    <section className="today-hero rise relative mb-10 overflow-hidden rounded-[14px] border border-hair">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* ------------------------------------------------ Séance du jour */}
        <div className="relative p-6 sm:p-8">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-micro font-medium uppercase tracking-[0.12em] text-ink3">
            <span className="text-clay">{greeting(now)}{firstname ? ` ${firstname}` : ""}</span>
            <span className="first-letter:uppercase">{dateLabel}</span>
            {weekInfo && (
              <span>
                semaine {weekInfo.weekNumber} · {PHASE_LABELS[weekInfo.phase as Phase] ?? weekInfo.phase}
              </span>
            )}
          </div>

          {session ? (
            <>
              <div className="mt-5 flex items-start gap-4">
                <h2 className={`text-[clamp(2.4rem,6vw,4.25rem)] font-semibold leading-[0.95] tracking-[-0.035em] ${done ? "text-ink2" : ""}`}>
                  {session.title}
                </h2>
                {done && (
                  <span className="mt-2 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-sage px-3 py-1 text-micro font-semibold uppercase tracking-[0.1em] text-white">
                    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
                      <path d="M2 6.5 5 9l5-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Fait
                  </span>
                )}
              </div>
              {session.tagline && <p className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-ink2">{session.tagline}</p>}

              <div className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
                {session.distanceKm > 0 && (
                  <HeroFig value={String(round(session.distanceKm, 1))} unit="km" />
                )}
                <HeroFig value={`~${session.durationMin}`} unit="min" />
                {session.paceTarget && <HeroFig value={fmtPace(session.paceTarget, "")} unit="/km" />}
                <span className="text-[0.8125rem] text-ink3">
                  {KIND_LABELS[session.kind as SessionKind] ?? session.kind} · intensité {INTENSITY_WORD[session.intensity] ?? session.intensity}
                </span>
              </div>

              {steps.length > 0 && (
                <div className="mt-6 max-w-2xl">
                  <Frieze steps={steps} fallbackPace={session.paceTarget ?? 360} />
                  <ol className="mt-2 space-y-1 text-[0.8125rem] text-ink2">
                    {steps.map((s, i) => (
                      <li key={i} className="flex items-baseline gap-2.5">
                        <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STEP_TONE[s.kind] ?? STEP_TONE.block }} />
                        <span>{s.label}</span>
                        {s.pace ? <span className="font-mono text-micro text-ink3">{fmtPace(s.pace)}</span> : null}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {done && doneActivity && (
                <Link
                  href={`/activities/${doneActivity.id}`}
                  className="group mt-6 inline-flex items-center gap-4 rounded-card border border-sage/35 bg-panel/70 py-2 pl-2 pr-4 transition-colors hover:border-sage"
                >
                  <RouteGlyph polyline={doneActivity.polyline} size={44} className="text-ink2" />
                  <span>
                    <span className="block text-[0.8125rem] font-medium group-hover:text-clay">{doneActivity.name}</span>
                    <span className="block font-mono text-micro text-ink3">
                      {(doneActivity.distance / 1000).toFixed(2)} km · {fmtDuration(doneActivity.movingTime)}
                      {doneActivity.distance > 0 && ` · ${fmtPace(pacePerKm(doneActivity.distance, doneActivity.movingTime))}`}
                    </span>
                  </span>
                </Link>
              )}

              <div className="mt-7 flex flex-wrap gap-2">
                {session.kind === "strength" && !done ? (
                  <Link href="/strength/new" className="btn-solid">
                    Commencer la séance de renfo
                  </Link>
                ) : (
                  <Link href="/training" className={done ? "btn-outline" : "btn-solid"}>
                    {done ? "Voir la semaine" : "Détail de la séance"}
                  </Link>
                )}
                {extra.map((x) => (
                  <Link key={x.id} href={x.kind === "strength" ? "/strength/new" : "/training"} className="btn-outline">
                    + {x.title}
                    {x.status === "done" && " ✓"}
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <>
              <h2 className="mt-5 text-[clamp(2.4rem,6vw,4.25rem)] font-semibold leading-[0.95] tracking-[-0.035em]">
                {todayActivities.length ? "Séance du jour faite" : plan ? "Repos" : "Pas de plan en cours"}
              </h2>
              <p className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-ink2">
                {todayActivities.length
                  ? `${todayActivities[0].name} · ${(todayActivities[0].distance / 1000).toFixed(1)} km.`
                  : plan
                    ? "Rien de prévu aujourd'hui : la récupération fait partie de l'entraînement."
                    : "Génère un plan séance par séance calé sur ton volume actuel, avec ou sans course à préparer."}
                {nextSession && (
                  <>
                    {" "}
                    Prochaine séance{" "}
                    {daysBetween(today, nextSession.date) <= 1
                      ? "demain"
                      : daysBetween(today, nextSession.date) < 7
                        ? nextSession.date.toLocaleDateString("fr-FR", { weekday: "long" })
                        : nextSession.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}{" "}
                    :{" "}
                    <span className="text-ink">{nextSession.title}</span>
                    {nextSession.distanceKm > 0 ? ` (${round(nextSession.distanceKm, 1)} km)` : ""}.
                  </>
                )}
              </p>
              <div className="mt-7">
                <Link href="/training" className="btn-solid">
                  {plan ? "Voir la semaine" : "Créer un plan"}
                </Link>
              </div>
            </>
          )}
        </div>

        {/* ------------------------------------------------ Repères */}
        <aside className="grid grid-cols-3 border-t border-hair lg:grid-cols-1 lg:border-l lg:border-t-0">
          <div className="flex flex-col items-start gap-3 border-r border-hair p-5 lg:border-b lg:border-r-0 lg:p-6">
            <span className="eyebrow">Semaine</span>
            <div className="flex items-center gap-3">
              <Ring pct={pct} />
              <span>
                <span className="display block text-d4">
                  {compliance.doneKm}
                  <span className="text-sm font-normal text-ink3">
                    {compliance.plannedKm ? ` / ${compliance.plannedKm}` : ""} km
                  </span>
                </span>
                <span className="text-micro text-ink3">
                  {compliance.plannedKm
                    ? `${Math.round(pct * 100)} % du prévu`
                    : plan && nextSession
                      ? `plan dès le ${nextSession.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`
                      : "hors plan"}
                </span>
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2 border-r border-hair p-5 lg:border-b lg:border-r-0 lg:p-6">
            <span className="eyebrow">Prochaine course</span>
            {nextRace && daysToRace !== null ? (
              <Link href={`/goals/${nextRace.id}`} className="group">
                <span className="display block text-d3 group-hover:text-clay">J−{daysToRace}</span>
                <span className="mt-1 block truncate text-micro text-ink3">
                  {nextRace.name} · {round(nextRace.distance / 1000, 1)} km
                </span>
              </Link>
            ) : (
              <Link href="/goals" className="text-[0.8125rem] text-ink2 hover:text-clay">
                Ajouter un objectif →
              </Link>
            )}
          </div>
          <div className="flex flex-col gap-2 p-5 lg:p-6">
            <span className="eyebrow">Fraîcheur</span>
            {tsb !== null ? (
              <Link href="/analysis" className="group">
                <span className={`display block text-d3 group-hover:text-clay ${tsb >= 5 ? "text-sage" : tsb <= -20 ? "text-rust" : ""}`}>
                  {tsb > 0 ? "+" : ""}
                  {Math.round(tsb)}
                </span>
                <span className="mt-1 block text-micro text-ink3">
                  {tsb >= 5 ? "frais, prêt à performer" : tsb <= -20 ? "fatigue marquée" : tsb < -5 ? "en construction" : "équilibré"}
                </span>
              </Link>
            ) : (
              <span className="text-[0.8125rem] text-ink3">—</span>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

function HeroFig({ value, unit }: { value: string; unit: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="display text-d3">{value}</span>
      <span className="text-sm text-ink3">{unit}</span>
    </span>
  );
}

function Ring({ pct }: { pct: number }) {
  const c = 2 * Math.PI * 17;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden className="shrink-0">
      <circle cx="22" cy="22" r="17" fill="none" stroke="rgb(var(--hair))" strokeWidth="5" />
      <circle
        cx="22"
        cy="22"
        r="17"
        fill="none"
        stroke={pct >= 1 ? "rgb(var(--sage))" : "rgb(var(--clay))"}
        strokeWidth="5"
        strokeDasharray={`${pct * c} ${c}`}
        strokeLinecap="round"
        transform="rotate(-90 22 22)"
      />
    </svg>
  );
}

function safeSteps(structure: string): Step[] {
  try {
    const v = JSON.parse(structure);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
