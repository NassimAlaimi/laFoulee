import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { Hint, NightBand, PageHead, Section, SectionHead } from "@/components/ui/Layout";
import { RacePoster, type PosterWeek } from "@/components/goals/RacePoster";
import { Bar } from "@/components/ui/Metric";
import { DeleteGoalButton } from "@/components/DeleteGoalButton";
import { fmtDate, fmtDuration, fmtPace } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { STANDARD_DISTANCES } from "@/lib/records";
import { raceReadiness } from "@/lib/goal";
import { FACTOR_KEY, PHASE_KEY, factLines } from "@/components/goals/readiness-text";
import { distanceName } from "@/components/terms";
import { goalProgress, type GoalKind } from "@/lib/goal-progress";
import { SeasonTimeline } from "@/components/goals/SeasonTimeline";
import { athleteContext } from "@/lib/plan-store";

export const dynamic = "force-dynamic";

const PRIORITY_STYLE: Record<string, string> = {
  A: "bg-clay/15 text-clay",
  B: "bg-info/12 text-info",
  C: "bg-sunken text-ink2",
};


export default async function GoalsPage() {
  const t = await getTranslations("goals");
  const tt = await getTranslations("terms");
  const locale = await getLocale();
  const now = new Date();
  const userId = await requireUserId();
  const [goals, ctx, plans] = await Promise.all([
    prisma.raceGoal.findMany({ where: { userId }, orderBy: { raceDate: "asc" } }),
    athleteContext(now, userId),
    prisma.trainingPlan.findMany({
      where: { userId, status: { in: ["active", "paused"] }, raceGoalId: { not: null } },
      select: { id: true, raceGoalId: true },
    }),
  ]);

  const planByGoal = new Map(plans.map((p) => [p.raceGoalId as string, p.id]));

  const raceGoals = goals.filter((g) => g.kind === "race");
  const dailyGoals = goals.filter((g) => g.kind !== "race");
  const upcoming = raceGoals.filter((g) => g.raceDate >= now);
  const past = raceGoals.filter((g) => g.raceDate < now);

  // L'affiche : la prochaine course de priorité A, sinon la plus proche
  const primary = upcoming.find((g) => g.priority === "A") ?? upcoming[0] ?? null;
  const others = upcoming.filter((g) => g !== primary);
  const readinessOf = (goal: (typeof goals)[number]) =>
    raceReadiness({ goal, fitness: ctx.fitness, records: ctx.records, profile: ctx.profile, endurance: ctx.endurance, now });
  const primaryPlan = primary ? planByGoal.get(primary.id) : undefined;
  const posterWeeks: PosterWeek[] = primaryPlan
    ? (
        await prisma.plannedSession.groupBy({
          by: ["weekStart", "phase"],
          where: { planId: primaryPlan, plan: { userId } },
          _sum: { distanceKm: true },
          orderBy: { weekStart: "asc" },
        })
      ).map((w) => ({ weekStart: w.weekStart, phase: w.phase, km: w._sum.distanceKm ?? 0 }))
    : [];
  const firstSession = primaryPlan
    ? await prisma.plannedSession.findFirst({
        where: { planId: primaryPlan, plan: { userId }, kind: { not: "rest" } },
        orderBy: { date: "asc" },
        select: { date: true },
      })
    : null;

  async function createGoal(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    const raceDate = String(formData.get("raceDate") ?? "");
    const distanceKm = Number(formData.get("distanceKm"));
    const hours = Number(formData.get("hours") || 0);
    const minutes = Number(formData.get("minutes") || 0);
    const seconds = Number(formData.get("seconds") || 0);
    const priority = String(formData.get("priority") ?? "A");

    if (!name || !raceDate || !Number.isFinite(distanceKm) || distanceKm <= 0) return;

    const targetTime = hours * 3600 + minutes * 60 + seconds;

    // L'action serveur revalide sa propre session : le userId capturé plus haut
    // n'est pas une autorisation, c'en est juste une lecture.
    const owner = await requireUserId();
    await prisma.raceGoal.create({
      data: {
        userId: owner,
        name,
        kind: "race",
        raceDate: new Date(raceDate),
        distance: distanceKm * 1000,
        targetTime: targetTime > 0 ? targetTime : null,
        priority,
      },
    });
    revalidatePath("/goals");
  }

  async function createDailyGoal(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    const kind = String(formData.get("kind") ?? "volume");
    const targetValue = Number(formData.get("targetValue"));
    const endDate = String(formData.get("endDate") ?? "");

    if (!name || !Number.isFinite(targetValue) || targetValue <= 0) return;
    if (!["volume", "streak", "frequency"].includes(kind)) return;

    const owner = await requireUserId();
    await prisma.raceGoal.create({
      data: {
        userId: owner,
        name,
        kind,
        raceDate: endDate ? new Date(endDate) : new Date(),
        distance: 0,
        targetValue,
        priority: "B",
      },
    });
    revalidatePath("/goals");
  }

  return (
    <div className="space-y-10">
      <div data-tour="objectifs">
      <PageHead
        title={t("title")}
        meta={
          upcoming.length
            ? t("upcoming", {
                n: upcoming.length,
                s: upcoming.length > 1 ? "s" : "",
                past: past.length ? t("pastTail", { n: past.length, s: past.length > 1 ? "s" : "" }) : "",
              })
            : t("none")
        }
        action={
          <a href="#nouvel-objectif" className="btn-outline">
            + {t("newGoalShort")}
          </a>
        }
      />
      </div>

      {upcoming.length >= 2 && (
        <section className="rise">
          <SeasonTimeline
            races={upcoming.map((g) => ({ id: g.id, name: g.name, date: g.raceDate, distanceKm: g.distance / 1000, priority: g.priority as "A" | "B" | "C" }))}
            startWeeklyKm={ctx.fitness.weeklyKm || 30}
          />
        </section>
      )}

      {primary && (
        <NightBand className="!mt-0">
          <RacePoster
            goal={primary}
            p={readinessOf(primary)}
            weeks={posterWeeks}
            planId={primaryPlan}
            now={now}
            extra={<DeleteGoalButton id={primary.id} />}
            startsOn={firstSession?.date ?? null}
          />
        </NightBand>
      )}

      {/* ------------------------------------------------ Objectifs du quotidien */}
      {dailyGoals.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-[1.3125rem] font-semibold tracking-[-0.018em]">{t("dailyGoals")}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {dailyGoals.map((g) => {
              const p = goalProgress({
                kind: g.kind as GoalKind,
                targetValue: g.targetValue,
                now,
                runs: ctx.runs,
              });
              return (
                <Section key={g.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[0.9375rem] font-semibold tracking-tight">{g.name}</h3>
                        <span className="badge bg-sunken text-ink2">{t(`kind.${g.kind === "streak" || g.kind === "frequency" ? g.kind : "volume"}`)}</span>
                      </div>
                      {p && (
                        <p className="mt-1 text-sm text-ink2">
                          {t(`progress.${g.kind === "streak" || g.kind === "frequency" ? g.kind : "volume"}`, { n: p.current })} ·{" "}
                          {t(`progressTarget.${g.kind === "streak" || g.kind === "frequency" ? g.kind : "volume"}`, { n: p.target })}
                        </p>
                      )}
                    </div>
                    <DeleteGoalButton id={g.id} />
                  </div>
                  {p && (
                    <div className="mt-4 flex items-center gap-3">
                      <div className="flex-1">
                        <Bar value={p.percent} height={6} />
                      </div>
                      <span className={`w-14 text-right font-mono text-sm font-semibold tabular-nums ${p.done ? "text-sage" : "text-ink"}`}>
                        {p.percent} %
                      </span>
                    </div>
                  )}
                </Section>
              );
            })}
          </div>
        </div>
      )}

      {/* -------------------------------------------------- À venir */}
      {others.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-[1.3125rem] font-semibold tracking-[-0.018em]">{t("alsoPlanned")}</h2>
          {others.map((goal) => {
            const p = readinessOf(goal);
            const facts = factLines(p, t);
            const planId = planByGoal.get(goal.id);
            return (
              <Section key={goal.id}>
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold tracking-tight ">
                        {goal.name}
                      </h3>
                      <span className={`badge ${PRIORITY_STYLE[goal.priority]}`}>
                        {t("priorityBadge", { p: goal.priority })}
                      </span>
                      <span className="badge bg-sunken text-ink2">
                        {t(`racePhase.${PHASE_KEY[p.phase] ?? "prep"}`)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-ink2">
                      {fmtDate(goal.raceDate, locale)} · {(goal.distance / 1000).toFixed(1)} km
                      {goal.targetTime && (
                        <>
                          {` · ${t("goalTag")} `}
                          <span className="font-medium text-ink">
                            {fmtDuration(goal.targetTime)}
                          </span>
                          {p.targetPace && ` (${fmtPace(p.targetPace)})`}
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex items-start gap-5">
                    <div className="text-right">
                      <div className="display text-d3">{p.daysRemaining}</div>
                      <div className="text-micro text-ink3">
                        {t("dayLeft", { s: p.daysRemaining > 1 ? "s" : "", w: p.weeksRemaining })}
                      </div>
                    </div>
                    <DeleteGoalButton id={goal.id} />
                  </div>
                </div>

                {/* Préparation */}
                <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                  <div>
                    <div className="mb-2 flex items-baseline justify-between">
                      <span className="section-title">{t("preparation")}</span>
                      <span className="text-sm font-semibold ">
                        {p.readiness}
                        <span className="text-ink3">/100</span>
                      </span>
                    </div>
                    <Bar value={p.readiness} height={7} />
                    <ul className="mt-2.5 space-y-0.5">
                      {facts.map((f, i) => (
                        <li
                          key={i}
                          className="font-mono text-micro leading-relaxed tabular-nums text-ink2"
                        >
                          {f}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-4 space-y-2.5">
                      {p.factors.map((b) => (
                        <div key={b.label}>
                          <div className="flex items-baseline justify-between text-micro">
                            <span className="text-ink2">{t(`factor.${FACTOR_KEY[b.label] ?? "pace"}`)}</span>
                            <span className="font-mono tabular-nums text-ink3">
                              {b.score}/{b.max}
                            </span>
                          </div>
                          <div className="mt-1">
                            <Bar value={b.score} max={b.max} height={3} />
                          </div>
                          <div className="mt-0.5 font-mono text-micro tabular-nums text-ink3">
                            {b.unit === "s/km"
                              ? b.target > 0
                                ? t("paceVsTarget", { value: fmtPace(b.value), target: fmtPace(b.target) })
                                : fmtPace(b.value)
                              : `${b.value} / ${b.target} ${b.unit}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Metric
                      label={t("weeklyVolume")}
                      value={`${ctx.fitness.weeklyKm} km`}
                      note={t("referenceKm", { km: p.needs.weeklyKm })}
                      ok={ctx.fitness.weeklyKm >= p.needs.weeklyKm}
                    />
                    <Metric
                      label={t("longestRun")}
                      value={`${ctx.fitness.longestRunKm} km`}
                      note={t("targetKm", { km: p.needs.longRunKm })}
                      ok={ctx.fitness.longestRunKm >= p.needs.longRunKm}
                    />
                    <Metric
                      label={t("realisticTime")}
                      value={p.prediction ? fmtDuration(p.prediction.realistic) : "—"}
                      note={
                        p.prediction
                          ? t("potentialShort", { time: fmtDuration(p.prediction.potential) })
                          : undefined
                      }
                      ok={
                        p.targetSeconds && p.prediction
                          ? p.prediction.realistic <= p.targetSeconds
                          : undefined
                      }
                    />
                    <Metric
                      label={t("requiredLevel")}
                      value={p.gap ? `VDOT ${p.gap.requiredVdot}` : "—"}
                      note={p.gap ? t("currentShort", { n: p.gap.currentVdot }) : undefined}
                      ok={p.gap ? p.gap.gap <= 0 : undefined}
                    />
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2 border-t border-hair pt-4">
                  <Link href={`/goals/${goal.id}`} className="btn-outline btn-sm">
                    {t("prepDetail")} →
                  </Link>
                  {planId ? (
                    <Link href={`/training/${planId}`} className="btn-quiet btn-sm">
                      {t("planBySession")}
                    </Link>
                  ) : (
                    <Link href={`/goals/${goal.id}`} className="btn-quiet btn-sm">
                      {t("noPlanGenerate")}
                    </Link>
                  )}
                </div>
              </Section>
            );
          })}
        </div>
      )}

      {/* -------------------------------------------------- Nouvel objectif */}
      <Section className="scroll-mt-24">
        <div id="nouvel-objectif" className="scroll-mt-24" />
        <SectionHead title={t("newGoal")} note={t("newGoalNote")} />
        <form action={createGoal} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="name">
              {t("raceName")}
            </label>
            <input
              id="name"
              name="name"
              required
              placeholder={t("placeholder")}
              className="field"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="raceDate">
              {t("date")}
            </label>
            <input id="raceDate" name="raceDate" type="date" required className="field" />
          </div>
          <div>
            <label className="field-label" htmlFor="distanceKm">
              {t("distanceKm")}
            </label>
            <input
              id="distanceKm"
              name="distanceKm"
              type="number"
              step="0.1"
              min="0.4"
              required
              defaultValue="21.1"
              list="distances"
              className="field"
            />
            <datalist id="distances">
              {STANDARD_DISTANCES.filter((d) => d.major).map((d) => (
                <option key={d.key} value={(d.meters / 1000).toFixed(1)}>
                  {distanceName(tt, d.key, d.name)}
                </option>
              ))}
            </datalist>
          </div>
          <div className="sm:col-span-2">
            <span className="field-label">{t("targetTimeOptional")}</span>
            <div className="flex gap-2">
              <input name="hours" type="number" min="0" max="23" placeholder="h" className="field" />
              <input name="minutes" type="number" min="0" max="59" placeholder="min" className="field" />
              <input name="seconds" type="number" min="0" max="59" placeholder="s" className="field" />
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="priority">
              {t("priority")}
            </label>
            <select id="priority" name="priority" className="field">
              <option value="A">{t("priorityA")}</option>
              <option value="B">{t("priorityB")}</option>
              <option value="C">{t("priorityC")}</option>
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn-solid w-full">
              {t("addGoal")}
            </button>
          </div>
        </form>
      </Section>

      {/* -------------------------------------------------- Objectif du quotidien */}
      <Section className="scroll-mt-24">
        <div id="nouvel-objectif-quotidien" className="scroll-mt-24" />
        <SectionHead
          title={t("dailyGoal")}
          note={t("dailyGoalNote")}
        />
        <form action={createDailyGoal} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="dname">
              {t("name")}
            </label>
            <input id="dname" name="name" required placeholder={t("dailyPlaceholder")} className="field" />
          </div>
          <div>
            <label className="field-label" htmlFor="kind">
              {t("type")}
            </label>
            <select id="kind" name="kind" className="field">
              <option value="volume">{t("optVolume")}</option>
              <option value="streak">{t("optStreak")}</option>
              <option value="frequency">{t("optFrequency")}</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="targetValue">
              {t("targetValue")}
            </label>
            <input id="targetValue" name="targetValue" type="number" step="1" min="1" required placeholder="200" className="field" />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="endDate">
              {t("deadlineOptional")}
            </label>
            <input id="endDate" name="endDate" type="date" className="field" />
          </div>
          <div className="flex items-end sm:col-span-2 xl:col-span-1">
            <button type="submit" className="btn-solid w-full">
              {t("addGoal")}
            </button>
          </div>
        </form>
      </Section>

      {/* -------------------------------------------------- Passées */}
      {past.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-[1.3125rem] font-semibold tracking-[-0.018em]">{t("pastRaces")}</h2>
          <Section>
            <table className="data-table">
              <tbody>
                {past.map((goal) => (
                  <tr key={goal.id}>
                    <td className="font-medium text-ink">{goal.name}</td>
                    <td className="text-ink2">{fmtDate(goal.raceDate, locale)}</td>
                    <td className="text-right font-mono tabular-nums text-ink2">
                      {(goal.distance / 1000).toFixed(1)} km
                    </td>
                    <td className="text-right font-mono tabular-nums ">
                      {goal.resultTime ? fmtDuration(goal.resultTime) : "—"}
                    </td>
                    <td className="w-10 text-right">
                      <DeleteGoalButton id={goal.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </div>
      )}

      {goals.length === 0 && (
        <Hint height={140}>
          {t("noGoals")}
        </Hint>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  note,
  ok,
}: {
  label: string;
  value: string;
  note?: string;
  ok?: boolean;
}) {
  // Sans verdict, le chiffre reste à l'encre (c'était `text-white` :
  // invisible en thème clair)
  const tone = ok === undefined ? "text-ink" : ok ? "text-sage" : "text-ochre";
  return (
    <div className="border-t border-hair pt-3">
      <div className="eyebrow">{label}</div>
      <div className={`display mt-1.5 text-d4 ${tone}`}>
        {value}
      </div>
      {note && <div className="mt-0.5 text-micro text-ink3">{note}</div>}
    </div>
  );
}
