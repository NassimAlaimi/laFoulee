import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Section } from "@/components/ui/Layout";
import { Metric, MetricBand } from "@/components/ui/Metric";
import { requireUserId } from "@/lib/auth";
import { fmtDuration } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { loadWorkouts, toBlocks } from "@/lib/strength-store";
import {
  MUSCLE_LABELS,
  MUSCLE_ORDER,
  best1RM,
  exerciseInfo,
  isWorkSet,
  setsByMuscle,
  tonnage,
  workoutPRs,
} from "@/lib/strength";

export const dynamic = "force-dynamic";

const kg = (v: number) => (v % 1 ? v.toFixed(1).replace(".", ",") : String(v));

export default async function StrengthWorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("strength");
  const locale = await getLocale();
  const { id } = await params;
  const userId = await requireUserId();
  const workouts = await loadWorkouts(userId);
  const w = workouts.find((x) => x.id === id);
  if (!w) notFound();

  const activity = w.activityId
    ? await prisma.activity.findFirst({
        where: { id: w.activityId, userId },
        select: { averageHr: true, maxHr: true, movingTime: true, calories: true, name: true },
      })
    : null;

  const prs = workoutPRs(w, workouts);
  const blocks = toBlocks(w.sets);
  const muscles = setsByMuscle(w.sets);
  const maxMuscle = Math.max(1, ...Object.values(muscles));
  const work = w.sets.filter(isWorkSet);

  // Séance précédente contenant chaque exercice, pour l'écart de 1RM
  const previousFor = (exercise: string) =>
    workouts.find((x) => x.date < w.date && x.sets.some((s) => s.exercise === exercise && isWorkSet(s)));

  const idx = workouts.findIndex((x) => x.id === w.id);
  const older = workouts[idx + 1];
  const newer = idx > 0 ? workouts[idx - 1] : undefined;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/strength" className="text-micro uppercase tracking-[0.1em] text-ink3 hover:text-clay">
            {t("backToStrength")}
          </Link>
          <h1 className="mt-2 text-[1.75rem] font-semibold tracking-[-0.02em]">{w.name}</h1>
          <p className="mt-1.5 text-sm text-ink2">
            <span className="inline-block first-letter:uppercase">
              {w.date.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </span>
            {activity && <span className="ml-2.5 tag border-sage/40 text-sage">Strava · {activity.name}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {older && (
            <Link href={`/strength/${older.id}`} className="btn-outline" title={older.name}>
              ←
            </Link>
          )}
          {newer && (
            <Link href={`/strength/${newer.id}`} className="btn-outline" title={newer.name}>
              →
            </Link>
          )}
          <Link href={`/strength/new?from=${w.id}`} className="btn-outline">
            {t("redo")}
          </Link>
          <Link href={`/strength/${w.id}/edit`} className="btn-solid">
            {t("edit")}
          </Link>
        </div>
      </div>

      <MetricBand>
        <Metric label={t("exercises")} value={blocks.length} note={t("workSets", { n: work.length })} />
        <Metric label={t("tonnage")} value={Math.round(tonnage(w.sets)).toLocaleString(locale)} unit="kg" />
        <Metric
          label={t("duration")}
          value={w.durationMin ? w.durationMin : activity ? Math.round(activity.movingTime / 60) : "—"}
          unit="min"
          note={activity?.averageHr ? t("avgHr", { hr: Math.round(activity.averageHr) }) : undefined}
        />
        <Metric label={t("effort")} value={w.rpe ?? "—"} unit={w.rpe ? "/10" : undefined} />
      </MetricBand>

      <div className="mt-10 space-y-10">
        {prs.length > 0 && (
          <section className="rise relative overflow-hidden rounded-card border border-clay/30 bg-clay/[.05] p-6">
            <div className="text-micro font-medium uppercase tracking-[0.14em] text-clay">
              {prs.length > 1 ? t("records", { n: prs.length }) : t("record")}
            </div>
            <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {prs.map((p) => (
                <div key={p.exercise}>
                  <div className="text-[0.8125rem] text-ink2">{exerciseInfo(p.exercise).name}</div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="display text-d3 text-clay">{kg(p.value)}</span>
                    <span className="text-sm text-ink3">
                      {p.kind === "reps" ? (exerciseInfo(p.exercise).unit === "seconds" ? "s" : t("repsUnit")) : "kg"}
                    </span>
                  </div>
                  <div className="mt-1 text-micro text-ink3">
                    {p.kind === "e1rm"
                      ? t("e1rmLabel")
                      : p.kind === "weight"
                        ? t("maxLoad")
                        : exerciseInfo(p.exercise).unit === "seconds"
                          ? t("held")
                          : t("repetitions")}{" "}
                    · {t("before")}{" "}
                    {p.previous != null ? kg(p.previous) : "—"}
                  </div>
                </div>
              ))}
            </div>
            <svg className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 text-clay/10" viewBox="0 0 100 100" aria-hidden>
              <path d="M50 5 61 38h35L68 58l11 34-29-21-29 21 11-34L4 38h35Z" fill="currentColor" />
            </svg>
          </section>
        )}

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Section title={t("exercises")}>
            {blocks.map((b, i) => {
              const info = exerciseInfo(b.exercise);
              const secs = info.unit === "seconds";
              const e1 = best1RM(b.sets.map((s) => ({ ...s, exercise: b.exercise })));
              const prev = previousFor(b.exercise);
              const prevE1 = prev ? best1RM(prev.sets.filter((s) => s.exercise === b.exercise)) : null;
              const delta = e1 != null && prevE1 != null ? e1 - prevE1 : null;
              return (
                <div key={i} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-baseline gap-3 border-b border-hair py-3.5 last:border-b-0">
                  <span className="font-mono text-micro text-ink3">{String(i + 1).padStart(2, "0")}</span>
                  <div className="min-w-0">
                    <Link href={`/strength/exercise/${encodeURIComponent(b.exercise)}`} className="font-medium hover:text-clay">
                      {info.name}
                    </Link>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {b.sets.map((s, j) => (
                        <span
                          key={j}
                          className={`rounded-[4px] px-1.5 py-0.5 font-mono text-micro ${
                            s.isWarmup ? "bg-ochre/10 text-ochre" : "bg-sunken text-ink"
                          }`}
                          title={s.rir != null ? `RIR ${s.rir}` : undefined}
                        >
                          {s.weightKg > 0 ? `${s.reps}${secs ? "s" : ""} × ${kg(s.weightKg)}` : `${s.reps}${secs ? " s" : ` ${t("repsUnit")}`}`}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    {e1 != null && (
                      <>
                        <div className="font-mono text-[0.8125rem] font-medium">{kg(Math.round(e1))} kg</div>
                        <div className="text-micro text-ink3">
                          1RM est.
                          {delta != null && Math.abs(delta) >= 0.5 && (
                            <span className={delta > 0 ? "ml-1 text-sage" : "ml-1 text-rust"}>
                              {delta > 0 ? "+" : "−"}
                              {kg(Math.abs(Math.round(delta * 10) / 10))}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </Section>

          <Section title={t("musclesUsed")} note={t("musclesNote")}>
            {MUSCLE_ORDER.filter((m) => muscles[m] > 0).map((m) => (
              <div key={m} className="grid grid-cols-[120px_minmax(0,1fr)_32px] items-center gap-3 py-1.5 text-[0.8125rem]">
                <span className="text-ink2">{MUSCLE_LABELS[m]}</span>
                <span className="h-2 rounded-full bg-sunken">
                  <span className="block h-full rounded-full bg-plum" style={{ width: `${(muscles[m] / maxMuscle) * 100}%` }} />
                </span>
                <span className="text-right font-mono text-micro">{muscles[m]}</span>
              </div>
            ))}
          </Section>
        </div>

        {w.notes && (
          <Section title={t("notes")}>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink2">{w.notes}</p>
          </Section>
        )}
        {activity?.calories ? (
          <p className="text-micro text-ink3">{t("kcalStrava", { kcal: Math.round(activity.calories), time: fmtDuration(activity.movingTime) })}</p>
        ) : null}
      </div>
    </div>
  );
}
