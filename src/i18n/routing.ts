import { defineRouting } from "next-intl/routing";

export const locales = ["fr", "en", "es"] as const;
export type AppLocale = (typeof locales)[number];

/** Langue par défaut : le français. La langue est un choix utilisateur
 *  silencieux (cookie NEXT_LOCALE + profil), jamais un préfixe d'URL. */
export const routing = defineRouting({
  locales: [...locales],
  defaultLocale: "fr",
  localePrefix: "never",
});
