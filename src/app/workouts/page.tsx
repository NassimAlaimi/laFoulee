import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Empty, PageHead, Section } from "@/components/ui/Layout";
import { PoleStrip } from "@/components/ui/PoleStrip";
import { PrintButton } from "@/components/PrintButton";
import { fmtPace } from "@/lib/format";
import { getBestEfforts, getRuns } from "@/lib/queries";
import { fitnessProfile, personalRecords } from "@/lib/records";
import { vdotLevel } from "@/lib/vdot";
import { paceSet } from "@/lib/workouts";
import {
  filterLibrary,
  librarySessions,
  TARGET_LABEL,
  type LibraryTarget,
} from "@/lib/workout-library";

export const dynamic = "force-dynamic";

/**
 * Bibliothèque de séances fondamentales, calibrée sur le VDOT actuel.
 * Tout est calculé côté serveur ; le filtre par profil est un simple lien
 * (aucun JavaScript nécessaire).
 */
export default async function WorkoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ cible?: string }>;
}) {
  const t = await getTranslations("workouts");
  const { cible } = await searchParams;
  const target = (cible as LibraryTarget | undefined) ?? "tous";

  const [runs, efforts] = await Promise.all([getRuns(), getBestEfforts()]);
  const records = personalRecords(efforts, runs);
  const profile = fitnessProfile(records, 365);

  const fallbackAvgPace = estimateEasyPace(runs);
  const paces = paceSet(profile.vdot, fallbackAvgPace);
  const level = profile.vdot > 0 ? vdotLevel(profile.vdot) : null;
  const sessions = filterLibrary(librarySessions(paces), target);

  return (
    <div className="space-y-12">
      <PageHead
        title={t("title")}
        kicker={t("kicker")}
        meta={t("meta")}
        action={<PrintButton />}
      />
      <PoleStrip
        items={[
          { href: "/training", label: t("polePlan") },
          { href: "/workouts", label: t("poleSessions") },
          { href: "/goals", label: t("poleGoals") },
        ]}
        active="/workouts"
      />

      {/* ------------------------------------------------ Allures de référence */}
      <section className="rise">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <div className="text-micro font-medium uppercase tracking-[0.16em] text-ink3">
              {t("levelNow")}
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="display text-d4">
                {profile.vdot > 0 ? profile.vdotDisplay : "—"}
              </span>
              <span className="text-sm text-ink3">
                {level
                  ? `${level.label} · VDOT`
                  : t("vdotMissing")}
              </span>
            </div>
          </div>
          {profile.source && (
            <p className="max-w-[30ch] text-sm text-ink2">
              {t("measuredOn", { name: profile.source.name })}
            </p>
          )}
        </div>

        <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-hair bg-hair sm:grid-cols-2 lg:grid-cols-5">
          {paceTable(paces, t).map((z) => (
            <div key={z.key} className="bg-bg px-4 py-3.5">
              <div className="flex items-center gap-1.5 text-micro font-medium uppercase tracking-[0.12em]" style={{ color: z.color }}>
                <span className="h-[7px] w-[7px] rounded-full" style={{ background: z.color }} />
                {z.name}
              </div>
              <div className="mt-1.5 text-xl font-semibold tracking-tight">
                {fmtPace(z.pace)}
                {z.paceFast ? (
                  <span className="text-sm font-normal text-ink3"> – {fmtPace(z.paceFast)}</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        {(["tous", "universel", "5k-10k", "semi", "marathon", "trail"] as const).map((tg) => (
          <Link
            key={tg}
            href={tg === "tous" ? "/workouts" : `/workouts?cible=${tg}`}
            className={`btn-quiet ${target === tg ? "bg-clay/10 text-clay" : ""}`}
          >
            {tg === "tous" ? t("all") : t(`targets.${targetKey(tg)}`)}
          </Link>
        ))}
      </div>

      {/* ------------------------------------------------ Séances */}
      {sessions.length === 0 ? (
        <Empty title={t("none")} body={t("noneBody")} />
      ) : (
        <div className="space-y-10">
          {sessions.map((s) => (
            <Section key={s.id} title={t(s.nameKey)} note={t(s.whyKey)}>
              <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-micro text-ink3">
                <span className="font-medium uppercase tracking-[0.12em] text-ink2">{t(s.familyKey)}</span>
                <span>{t(`targets.${s.target}`)}</span>
                <span>{s.km} km</span>
                <span>≈ {s.minutes} min</span>
                <span className="ml-auto">{intensityDots(s.intensity, t)}</span>
              </div>
              <ol className="divide-y divide-hair border-t border-hair">
                {s.steps.map((st, i) => (
                  <li key={i} className="flex items-baseline gap-4 py-2.5">
                    <span className="w-5 shrink-0 text-right text-micro text-ink3">{i + 1}</span>
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-medium">
                        {st.repeat && st.repeat > 1 ? `${st.repeat} × ` : ""}
                        {st.label}
                      </span>
                      {st.note && <span className="text-ink3"> · {st.note}</span>}
                    </span>
                    {st.pace !== undefined && st.pace > 0 && (
                      <span className="shrink-0 font-mono text-sm text-ink2">
                        {fmtPace(st.pace)}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </Section>
          ))}
        </div>
      )}
    </div>
  );
}

/** Table des allures de référence, ordonnée de la plus lente à la plus rapide. */
function paceTable(paces: ReturnType<typeof paceSet>, t: (key: string) => string) {
  return [
    { key: "easy", name: t("paces.easy"), color: "rgb(var(--sage))", pace: paces.easy, paceFast: paces.easyFast },
    { key: "marathon", name: t("paces.marathon"), color: "rgb(var(--slate))", pace: paces.marathon, paceFast: undefined },
    { key: "threshold", name: t("paces.threshold"), color: "rgb(var(--ochre))", pace: paces.threshold, paceFast: undefined },
    { key: "interval", name: t("paces.interval"), color: "rgb(var(--clay))", pace: paces.interval, paceFast: undefined },
    { key: "repetition", name: t("paces.repetition"), color: "rgb(var(--rust))", pace: paces.repetition, paceFast: undefined },
  ];
}

/** Clé i18n du filtre : mêmes valeurs que LibraryTarget. */
function targetKey(t: string): string {
  return t;
}

/** Allure « endurance » estimée : médiane des sorties faciles récentes. */
function estimateEasyPace(runs: Awaited<ReturnType<typeof getRuns>>): number | null {
  const paces = runs
    .filter((r) => r.averageSpeed && r.averageSpeed > 1.5)
    .map((r) => 1000 / (r.averageSpeed ?? 0))
    .sort((a, b) => a - b);
  if (paces.length === 0) return null;
  return paces[Math.floor(paces.length / 2)];
}

function intensityDots(level: number, t: (key: string, params?: Record<string, string | number>) => string) {
  return (
    <span className="flex items-center gap-1" title={t("intensityTitle", { n: level })}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className="h-[6px] w-[6px] rounded-full"
          style={{ background: i < level ? "rgb(var(--clay))" : "rgb(var(--hair-strong))" }}
        />
      ))}
    </span>
  );
}
