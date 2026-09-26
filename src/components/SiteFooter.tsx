import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PoweredByStrava } from "@/components/StravaBrand";

/**
 * Pied de page discret, sur toutes les pages (connexion comprise) : liens
 * légaux et attribution Strava (lignes directrices de marque : logo officiel,
 * jamais plus visible que le nom de l'app).
 */
export async function SiteFooter() {
  const t = await getTranslations("footer");
  return (
    <footer className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-hair px-gutter pb-28 pt-5 text-micro text-ink3 md:pb-8">
      <nav aria-label={t("label")} className="flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/legal" className="hover:text-ink2">
          {t("legal")}
        </Link>
        <Link href="/privacy" className="hover:text-ink2">
          {t("privacy")}
        </Link>
      </nav>
      <PoweredByStrava className="opacity-70" />
    </footer>
  );
}
