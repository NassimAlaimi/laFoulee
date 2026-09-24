import { getTranslations } from "next-intl/server";
import { PageHead, Section } from "@/components/ui/Layout";
import { LEXIQUE_IDS } from "@/lib/help";

export const dynamic = "force-dynamic";

/**
 * Lexique — les termes du sport de haut niveau, en langage courant.
 * Accessible depuis le « ? » de chaque page et le pôle Plus.
 */
export default async function LexiquePage() {
  const t = await getTranslations("lexique");

  return (
    <div className="space-y-10">
      <PageHead
        title={t("title")}
        kicker={t("kicker")}
        meta={t("meta")}
      />

      <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {LEXIQUE_IDS.map((id) => {
          const term = t(`terms.${id}.term`);
          const def = t(`terms.${id}.def`);
          const abbr = t.has(`terms.${id}.abbr`) ? t(`terms.${id}.abbr`) : "";
          return (
            <div key={id} className="border-t-2 border-hair pt-3">
              <h2 className="text-lg font-semibold tracking-tight">
                {term}
                {abbr && <span className="ml-2 text-micro font-normal uppercase tracking-[0.12em] text-ink3">{abbr}</span>}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink2">{def}</p>
            </div>
          );
        })}
      </div>

      <Section title={t("missingTitle")}>
        <p className="text-sm text-ink2">{t("missingBody")}</p>
      </Section>
    </div>
  );
}
