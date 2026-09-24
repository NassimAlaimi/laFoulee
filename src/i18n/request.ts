import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { routing, type AppLocale } from "./routing";

/** Résolution de la locale, sans middleware ni préfixe d'URL : le cookie
 *  NEXT_LOCALE (posé par le sélecteur de langue et synchronisé avec le
 *  profil) fait foi, sinon la négociation d'en-têtes, sinon le français. */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const cookieLang = (await cookies()).get("NEXT_LOCALE")?.value;

  let locale: AppLocale = routing.defaultLocale;
  if (hasLocale(routing.locales, cookieLang)) locale = cookieLang as AppLocale;
  else if (hasLocale(routing.locales, requested)) locale = requested as AppLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
