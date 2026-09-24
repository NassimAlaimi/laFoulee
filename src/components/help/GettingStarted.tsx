"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { onboardingSteps } from "@/lib/help";

/**
 * Carte « Bien démarrer » de l'accueil : quatre étapes vérifiées sur des
 * données réelles (pas des clics). Disparaît d'elle-même une fois le
 * parcours complet.
 */
export function GettingStarted({
  stravaConnected,
  hasRuns,
  hasGoal,
  logDays,
}: {
  stravaConnected: boolean;
  hasRuns: boolean;
  hasGoal: boolean;
  logDays: number;
}) {
  const t = useTranslations("home");
  const result = onboardingSteps({ stravaConnected, hasRuns, hasGoal, logDays });
  if (!result) return null;

  return (
    <section className="rise mb-8 border-y border-hair py-5">
      <div className="flex items-baseline justify-between gap-4">
        <div className="text-micro font-medium uppercase tracking-[0.16em] text-clay">
          {t("onboarding.title")}
        </div>
        <span className="font-mono text-micro tabular-nums text-ink3">
          {result.done}/{result.total}
        </span>
      </div>
      <ul className="mt-3 space-y-1.5">
        {result.steps.map((s) =>
          s.done ? (
            <li key={s.id} className="flex items-baseline gap-2.5 text-sm text-ink3">
              <span className="text-sage">✓</span>
              <span className="line-through decoration-hair-strong">
                {t(`onboarding.steps.${s.id}`)}
              </span>
            </li>
          ) : (
            <li key={s.id}>
              <Link
                href={s.href}
                className="flex items-baseline gap-2.5 text-sm text-ink transition-colors hover:text-clay"
              >
                <span className="text-clay">→</span>
                {t(`onboarding.steps.${s.id}`)}
              </Link>
            </li>
          )
        )}
      </ul>
    </section>
  );
}
