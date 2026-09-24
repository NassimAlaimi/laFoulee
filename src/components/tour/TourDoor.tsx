"use client";

import { useTranslations } from "next-intl";

/**
 * Porte « Visite guidée » du pôle Plus : même langage que les autres portes,
 * mais elle déclenche le tour plutôt qu'un lien.
 */
export function TourDoor() {
  const t = useTranslations("tour");
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("foulee:tour"))}
      className="group block border-t-2 border-hair pt-4 text-left transition-colors hover:border-clay"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight group-hover:text-clay">
          {t("doorTitle")}
        </h2>
        <span className="text-ink3 transition-transform group-hover:translate-x-1">→</span>
      </div>
      <p className="mt-1.5 max-w-[44ch] text-sm leading-relaxed text-ink2">
        {t("doorBody")}
      </p>
      <p className="mt-2.5 text-micro uppercase tracking-[0.12em] text-ink3">
        {t("doorMeta")}
      </p>
    </button>
  );
}
