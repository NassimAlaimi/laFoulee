"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";

/** Les noms de langues s'affichent dans leur propre langue — convention
 *  standard des sélecteurs. */
const OPTIONS = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
] as const;

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("settings");
  const [busy, setBusy] = useState(false);

  const change = async (code: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: code }),
      });
      // Rechargement complet : le cookie NEXT_LOCALE vient d'être posé,
      // toutes les requêtes serveur suivantes utilisent la nouvelle langue.
      window.location.reload();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t("language")}>
      {OPTIONS.map((o) => (
        <button
          key={o.code}
          type="button"
          onClick={() => change(o.code)}
          disabled={busy}
          aria-pressed={locale === o.code}
          className={`btn-quiet px-3 py-1.5 text-[0.8125rem] ${
            locale === o.code ? "border-clay text-clay" : ""
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
