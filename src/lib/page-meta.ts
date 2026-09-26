import { getTranslations } from "next-intl/server";

/**
 * Metadata de page : le titre est repris du namespace de la page (template
 * « %s · Foulée » posé dans le layout racine), la description vient de la clé
 * demandée ou, à défaut, de la description générique de l'app.
 */
export async function pageMeta(
  ns: string,
  keys?: { title?: string; description?: string }
) {
  const t = await getTranslations(ns);
  const tc = await getTranslations("common");
  return {
    title: keys?.title ? t(keys.title) : t("title"),
    description: keys?.description ? t(keys.description) : tc("appDescription"),
  };
}
