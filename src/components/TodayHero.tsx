import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { privatePolyline } from "@/lib/polyline";
import { getPrivacyZone } from "@/lib/queries";
import { RouteGlyph } from "@/components/route/RouteGlyph";
import { fmtDuration, fmtPace, pacePerKm } from "@/lib/format";
import { actualKmForWeek, getActivePlan, linkActivities } from "@/lib/plan-store";
import { prisma } from "@/lib/prisma";
import { addDays, daysBetween, round, startOfWeek, type ActivityLike } from "@/lib/stats";
import { PHASE_LABELS, weekCompliance, type Phase } from "@/lib/training";
import { KIND_LABELS, type SessionKind, type Step } from "@/lib/workouts";
import { Frieze } from "@/components/training/Frieze";
import { ZONE_LABEL as FORM_LABEL, ZONE_TONE as FORM_TONE, type FormZone } from "@/lib/fitness-model";

const STEP_TONE: Record<string, string> = {
  warmup: "rgb(var(--sage) / 0.55)",
  cooldown: "rgb(var(--sage) / 0.55)",
  recovery: "rgb(var(--hair-strong))",
  work: "rgb(var(--clay))",
  block: "rgb(var(--ochre))",
};

/** Clé i18n du salut selon l'heure — `home.hero.*`. */
function greetingKey(now: Date): string {
  const h = now.getHours();
  if (h < 5) return "hero.night";
  if (h < 12) return "hero.morning";
  if (h < 18) return "hero.afternoon";
  return "hero.evening";
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
  form,
}: {
  userId: string;
  firstname: string | null;
  runs: ActivityLike[];
  now?: Date;
  /** Fraîcheur du jour et sa zone — mêmes mots que la bande « forme » */
  form: { tsb: number; zone: FormZone } | null;
}) {
  const t = await getTranslations("home");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const tsb = form?.tsb ?? null;
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

  const dateLabel = now.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
  const daysToRace = nextRace ? daysBetween(today, nextRace.raceDate) : null;
  const pct = compliance.plannedKm > 0 ? Math.min(1, compliance.doneKm / compliance.plannedKm) : 0;

  return (
    <section className="today-hero rise relative mb-10 overflow-hidden rounded-[14px] border border-hair" data-tour="today">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* ------------------------------------------------ Séance du jour */}
        <div className="relative p-6 sm:p-8">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-micro font-medium uppercase tracking-[0.12em] text-ink3">
            <span className="text-clay">{t(greetingKey(now))}{firstname ? ` ${firstname}` : ""}</span>
            <span className="first-letter:uppercase">{dateLabel}</span>
            {weekInfo && (
              <span>
                {t("hero.weekOf", {
                  week: weekInfo.weekNumber,
                  phase: tc(PHASE_LABELS[weekInfo.phase as Phase] ?? `phase.${weekInfo.phase}`),
                })}
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
                    {t("hero.done")}
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
                  {tc(KIND_LABELS[session.kind as SessionKind] ?? `kind.${session.kind}`)} ·{" "}
                  {t("hero.intensity", { word: tc(`intensity.${session.intensity || 3}`) })}
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
                  <RouteGlyph polyline={privatePolyline(doneActivity.polyline, await getPrivacyZone(userId))} size={44} className="text-ink2" />
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
                    {t("hero.startStrength")}
                  </Link>
                ) : (
                  <Link href="/training" className={done ? "btn-outline" : "btn-solid"}>
                    {done ? t("hero.seeWeek") : t("hero.sessionDetail")}
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
                {todayActivities.length ? t("hero.doneToday") : plan ? t("hero.rest") : t("hero.noPlan")}
              </h2>
              <p className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-ink2">
                {todayActivities.length
                  ? `${todayActivities[0].name} · ${(todayActivities[0].distance / 1000).toFixed(1)} km.`
                  : plan
                    ? t("hero.restText")
                    : t("hero.noPlanText")}
                {nextSession && (
                  <>
                    {" "}
                    {t("hero.nextSession")}{" "}
                    {daysBetween(today, nextSession.date) <= 1
                      ? t("hero.tomorrow")
                      : daysBetween(today, nextSession.date) < 7
                        ? nextSession.date.toLocaleDateString(locale, { weekday: "long" })
                        : nextSession.date.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}{" "}
                    :{" "}
                    <span className="text-ink">{nextSession.title}</span>
                    {nextSession.distanceKm > 0 ? ` (${round(nextSession.distanceKm, 1)} km)` : ""}.
                  </>
                )}
              </p>
              <div className="mt-7">
                <Link href="/training" className="btn-solid">
                  {plan ? t("hero.seeWeek") : t("hero.createPlan")}
                </Link>
              </div>
            </>
          )}
        </div>

        {/* ------------------------------------------------ Repères */}
        <aside className="grid grid-cols-3 border-t border-hair lg:grid-cols-1 lg:border-l lg:border-t-0">
          <div className="flex flex-col items-start gap-3 border-r border-hair p-5 lg:border-b lg:border-r-0 lg:p-6">
            <span className="eyebrow">{t("hero.weekSide")}</span>
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
                    ? t("hero.pctOf", { pct: Math.round(pct * 100) })
                    : plan && nextSession
                      ? t("hero.planFrom", {
                          date: nextSession.date.toLocaleDateString(locale, { day: "numeric", month: "short" }),
                        })
                      : t("hero.offPlan")}
                </span>
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2 border-r border-hair p-5 lg:border-b lg:border-r-0 lg:p-6">
            <span className="eyebrow">{t("hero.nextRace")}</span>
            {nextRace && daysToRace !== null ? (
              <Link href={`/goals/${nextRace.id}`} className="group">
                <span className="display block text-d3 group-hover:text-clay">J−{daysToRace}</span>
                <span className="mt-1 block truncate text-micro text-ink3">
                  {nextRace.name} · {round(nextRace.distance / 1000, 1)} km
                </span>
              </Link>
            ) : (
              <Link href="/goals" className="text-[0.8125rem] text-ink2 hover:text-clay">
                {t("hero.addGoal")}
              </Link>
            )}
          </div>
          <div className="flex flex-col gap-2 p-5 lg:p-6">
            <span className="eyebrow">{t("hero.freshness")}</span>
            {tsb !== null ? (
              <Link href="/#forme" className="group">
                <span className={`display block text-d3 group-hover:text-clay ${FORM_TONE[form!.zone]}`}>
                  {tsb > 0 ? "+" : ""}
                  {Math.round(tsb)}
                </span>
                <span className="mt-1 block text-micro text-ink3">{tc(FORM_LABEL[form!.zone]).toLowerCase()}</span>
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
