import Link from "next/link";
import { Empty, PageHead, Section } from "@/components/ui/Layout";
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
        title="Séances"
        kicker="Bibliothèque"
        meta="Les séances fondamentales de la préparation, calibrées sur ton niveau du moment"
        action={<PrintButton />}
      />

      {/* ------------------------------------------------ Allures de référence */}
      <section className="rise">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <div className="text-micro font-medium uppercase tracking-[0.16em] text-ink3">
              Ton niveau du moment
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="display text-d4">
                {profile.vdot > 0 ? profile.vdotDisplay : "—"}
              </span>
              <span className="text-sm text-ink3">
                {level
                  ? `${level.label} · VDOT`
                  : "VDOT pas encore mesuré — allures estimées depuis ton allure moyenne"}
              </span>
            </div>
          </div>
          {profile.source && (
            <p className="max-w-[30ch] text-sm text-ink2">
              Mesuré sur <span className="font-medium text-ink">{profile.source.name}</span> — un
              5 km à fond recale toutes les allures ci-dessous.
            </p>
          )}
        </div>

        <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-hair bg-hair sm:grid-cols-2 lg:grid-cols-5">
          {paceTable(paces).map((z) => (
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
        {(["tous", "universel", "5k-10k", "semi", "marathon", "trail"] as const).map((t) => (
          <Link
            key={t}
            href={t === "tous" ? "/workouts" : `/workouts?cible=${t}`}
            className={`btn-quiet ${target === t ? "bg-clay/10 text-clay" : ""}`}
          >
            {t === "tous" ? "Tout" : TARGET_LABEL[t]}
          </Link>
        ))}
      </div>

      {/* ------------------------------------------------ Séances */}
      {sessions.length === 0 ? (
        <Empty title="Aucune séance" body="Choisis un autre profil." />
      ) : (
        <div className="space-y-10">
          {sessions.map((s) => (
            <Section key={s.id} title={s.name} note={s.why}>
              <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-micro text-ink3">
                <span className="font-medium uppercase tracking-[0.12em] text-ink2">{s.family}</span>
                <span>{TARGET_LABEL[s.target]}</span>
                <span>{s.km} km</span>
                <span>≈ {s.minutes} min</span>
                <span className="ml-auto">{intensityDots(s.intensity)}</span>
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
function paceTable(paces: ReturnType<typeof paceSet>) {
  return [
    { key: "easy", name: "Endurance", color: "rgb(var(--sage))", pace: paces.easy, paceFast: paces.easyFast },
    { key: "marathon", name: "Allure marathon", color: "rgb(var(--slate))", pace: paces.marathon, paceFast: undefined },
    { key: "threshold", name: "Seuil", color: "rgb(var(--ochre))", pace: paces.threshold, paceFast: undefined },
    { key: "interval", name: "VO2max", color: "rgb(var(--clay))", pace: paces.interval, paceFast: undefined },
    { key: "repetition", name: "Vitesse", color: "rgb(var(--rust))", pace: paces.repetition, paceFast: undefined },
  ];
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

function intensityDots(level: number) {
  return (
    <span className="flex items-center gap-1" title={`Intensité ${level}/5`}>
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
