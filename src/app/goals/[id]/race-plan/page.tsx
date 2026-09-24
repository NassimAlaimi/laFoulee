import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { PageHead, Section } from "@/components/ui/Layout";
import { PrintButton } from "@/components/PrintButton";
import { RacePlanForm } from "@/components/goals/RacePlanForm";
import { DeleteRacePlanButton } from "@/components/goals/DeleteRacePlanButton";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { fmtDuration, fmtPace } from "@/lib/format";
import { elevationPacingPlan, fuelingStops, type ProfileBin } from "@/lib/gpx";

export const dynamic = "force-dynamic";

/**
 * Plan de course détaillé : profil GPX, allures par tronçon ajustées à la
 * pente, ravitaillement et checklists. Tout est rendu côté serveur à partir
 * du profil stocké — imprimable tel quel.
 */
export default async function RacePlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("goals");
  const { id } = await params;
  const userId = await requireUserId();
  const goal = await prisma.raceGoal.findFirst({
    where: { id, userId },
    include: { racePlan: true },
  });
  if (!goal) notFound();

  const plan = goal.racePlan;
  const profile: ProfileBin[] = plan?.profile ? (JSON.parse(plan.profile) as ProfileBin[]) : [];
  const targetSeconds = plan?.targetSeconds ?? goal.targetTime ?? null;
  const distanceKm = goal.distance / 1000;
  const basePace = targetSeconds ? targetSeconds / distanceKm : null;
  const segments =
    profile.length > 0 && basePace
      ? elevationPacingPlan(profile, targetSeconds!, basePace)
      : [];
  const gain = profile.reduce((a, b) => a + b.gain, 0);
  const stops =
    plan && plan.fuelingKm > 0 ? fuelingStops(distanceKm, plan.fuelingKm) : [];

  return (
    <div className="space-y-12">
      <PageHead
        title={t("racePlan.title")}
        kicker={goal.name}
        meta={t("racePlan.meta")}
        action={<PrintButton />}
      />

      {!plan ? (
        <>
          <section className="rise">
            <div className="max-w-[52ch]">
              <div className="text-micro font-medium uppercase tracking-[0.16em] text-ink3">
                {fmtDuration(targetSeconds ?? 0)} visé · {distanceKm.toFixed(1)} km
              </div>
              <h2 className="mt-2 text-[clamp(1.7rem,3.6vw,2.6rem)] font-semibold leading-tight tracking-[-0.03em]">
                Connais ton parcours avant de le courir.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-ink2">
                Importe le fichier GPX du parcours : l'app découpe le tracé en tronçons,
                mesure la pente de chacun et répartit ton chrono visé — plus lent en
                montée, plus vite en descente, exactement sur le total.
              </p>
            </div>
          </section>
          <Section title={t("racePlan.import")} note={t("racePlan.importNote")}>
            <RacePlanForm goalId={goal.id} existing={undefined} />
          </Section>
        </>
      ) : (
        <>
          {/* ------------------------------------------------ Ouverture */}
          <section className="rise">
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
              <div>
                <div className="text-micro font-medium uppercase tracking-[0.16em] text-ink3">
                  {distanceKm.toFixed(1)} km · {Math.round(gain)} m D+
                </div>
                <div className="mt-2 flex items-baseline gap-3">
                  {targetSeconds ? (
                    <span className="display text-d4">{fmtDuration(targetSeconds)}</span>
                  ) : (
                    <span className="display text-d4 text-ink3">—</span>
                  )}
                  <span className="text-sm text-ink3">
                    {targetSeconds ? t("racePlan.targetOn") : t("racePlan.targetOff")}
                  </span>
                </div>
              </div>
              <dl className="flex gap-8">
                <Figure label={t("racePlan.totalClimb")} value={`${Math.round(gain)} m`} />
                <Figure
                  label={t("racePlan.fueling")}
                  value={stops.length ? String(stops.length) : "—"}
                  note={plan.fuelingKm > 0 ? `tous les ${plan.fuelingKm} km` : undefined}
                />
              </dl>
            </div>
          </section>

          {/* ------------------------------------------------ Profil */}
          {profile.length > 0 && (
            <Section title={t("racePlan.profile")} note={t("racePlan.profileNote")}>
              <ElevationChart profile={profile} />
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-micro text-ink3">
                <span className="flex items-center gap-1.5">
                  <span className="h-[9px] w-[9px] rounded-[1px] bg-clay" /> montée
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-[9px] w-[9px] rounded-[1px] bg-sage" /> descente
                </span>
                <span className="ml-auto">pente moyenne par tronçon · échelle bornée à ±10 %</span>
              </div>
            </Section>
          )}

          {/* ------------------------------------------------ Allures */}
          {segments.length > 0 && (
            <Section
              title={t("racePlan.segmentPaces")}
              note={t("racePlan.segmentNote")}
            >
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Du km</th>
                      <th>Longueur</th>
                      <th className="text-right">Pente</th>
                      <th className="text-right">Allure</th>
                      <th className="text-right">Temps du tronçon</th>
                      <th className="text-right">Cumulé</th>
                    </tr>
                  </thead>
                  <tbody>
                    {segments.map((s, i) => (
                      <tr key={i}>
                        <td className="font-mono tabular-nums text-ink2">{s.km.toFixed(1)}</td>
                        <td className="font-mono tabular-nums text-ink3">{s.lengthKm.toFixed(2)} km</td>
                        <td
                          className={`text-right font-mono tabular-nums ${
                            s.grade > 1 ? "text-clay" : s.grade < -1 ? "text-sage" : "text-ink3"
                          }`}
                        >
                          {s.grade > 0 ? "+" : ""}{s.grade} %
                        </td>
                        <td className="text-right font-mono font-medium tabular-nums">{fmtPace(s.pace)}</td>
                        <td className="text-right font-mono tabular-nums">{fmtDuration(s.seconds)}</td>
                        <td className="text-right font-mono tabular-nums">{fmtDuration(s.cumulative)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* ------------------------------------------------ Ravitaillement */}
          <Section title={t("racePlan.fuelingTitle")} note={plan.fuelingNote ?? t("racePlan.fuelingDefault")}>
            {stops.length > 0 ? (
              <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                {stops.map((s) => (
                  <li key={s.km} className="border-l-2 border-hairStrong pl-3 text-sm">
                    <span className="font-mono font-medium tabular-nums text-clay">{s.label}</span>
                    <span className="text-ink3"> — boire, et {plan.fuelingNote ? "suivre ta stratégie" : "recharger"}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="py-4 text-sm text-ink3">
                Ravitaillement désactivé — ou distance trop courte pour en prévoir.
              </p>
            )}
          </Section>

          {/* ------------------------------------------------ Réglages */}
          <Section title={t("racePlan.adjust")} note={t("racePlan.adjustNote")}>
            <RacePlanForm
              goalId={goal.id}
              existing={{
                targetSeconds: plan.targetSeconds,
                strategy: plan.strategy,
                fuelingKm: plan.fuelingKm,
                fuelingNote: plan.fuelingNote,
              }}
            />
            <div className="mt-6 border-t border-hair pt-4">
              <DeleteRacePlanButton goalId={goal.id} />
            </div>
          </Section>

          {/* ------------------------------------------------ Checklists */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title={t("racePlan.eve")}>
              <ul className="space-y-2 text-sm text-ink2">
                {[
                  t("racePlan.eve0"),
                  t("racePlan.eve1"),
                  t("racePlan.eve2"),
                  t("racePlan.eve3"),
                  t("racePlan.eve4"),
                ].map((t) => (
                  <li key={t} className="flex gap-2.5">
                    <span className="mt-[7px] h-[7px] w-[7px] shrink-0 rounded-full bg-clay" />
                    {t}
                  </li>
                ))}
              </ul>
            </Section>
            <Section title={t("racePlan.day")}>
              <ul className="space-y-2 text-sm text-ink2">
                {[
                  t("racePlan.day0"),
                  t("racePlan.day1"),
                  t("racePlan.day2"),
                  t("racePlan.day3"),
                  t("racePlan.day4"),
                  t("racePlan.day5"),
                ].map((t) => (
                  <li key={t} className="flex gap-2.5">
                    <span className="mt-[7px] h-[7px] w-[7px] shrink-0 rounded-full bg-ochre" />
                    {t}
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <p className="text-sm text-ink3">
            Retour à <Link href={`/goals/${goal.id}`} className="text-clay hover:underline">l'objectif</Link>.
          </p>
        </>
      )}
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <div className="text-xl font-semibold tracking-tight">{value}</div>
      <div className="mt-0.5 text-micro text-ink3">{label}{note ? ` · ${note}` : ""}</div>
    </div>
  );
}

/** Profil de dénivelé : barreaux par tronçon, montée = terre cuite, descente = sauge. */
function ElevationChart({ profile }: { profile: ProfileBin[] }) {
  const W = 720;
  const H = 160;
  const PAD = 4;
  const totalKm = profile.reduce((a, b) => a + b.lengthKm, 0);
  const maxGrade = Math.max(10, ...profile.map((b) => Math.abs(b.grade)));
  const y = (grade: number) => H / 2 - (grade / maxGrade) * (H / 2 - PAD);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Profil de dénivelé du parcours">
      <line x1={PAD} x2={W - PAD} y1={H / 2} y2={H / 2} stroke="rgb(var(--hair-strong))" strokeWidth="1" />
      {profile.map((b, i) => {
        const x = PAD + (b.km / totalKm) * (W - 2 * PAD);
        const w = Math.max(2, (b.lengthKm / totalKm) * (W - 2 * PAD) - 1);
        const up = b.grade >= 0;
        const top = up ? y(b.grade) : H / 2;
        const height = Math.max(2, Math.abs(y(b.grade) - H / 2));
        const tip = `km ${b.km.toFixed(1)} — ${b.grade > 0 ? "+" : ""}${b.grade} % sur ${b.lengthKm.toFixed(2)} km${b.gain > 0 ? ` · +${Math.round(b.gain)} m` : ""}${b.loss > 0 ? ` · −${Math.round(b.loss)} m` : ""}`;
        return (
          <g key={i}>
            <rect
              x={x}
              y={top}
              width={w}
              height={height}
              rx="1.5"
              fill={up ? "rgb(var(--clay) / 0.75)" : "rgb(var(--sage) / 0.75)"}
            >
              <title>{tip}</title>
            </rect>
            {(i % Math.max(1, Math.floor(profile.length / 16)) === 0 || i === profile.length - 1) && (
              <text x={x} y={H - 2} fontSize="8" fill="rgb(var(--ink-3))" textAnchor="start">
                {Math.round(b.km)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
