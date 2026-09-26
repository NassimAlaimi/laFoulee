import { getLocale } from "next-intl/server";
import { LEGAL, fillLegal, type LegalIdentity } from "@/content/legal";

/** Identité de l'éditeur, renseignée dans .env (voir .env.example). */
export function legalIdentity(): LegalIdentity {
  const missing = (k: string) => `[à renseigner : ${k} dans .env]`;
  return {
    publisher: process.env.LEGAL_PUBLISHER?.trim() || missing("LEGAL_PUBLISHER"),
    contact: process.env.LEGAL_CONTACT?.trim() || missing("LEGAL_CONTACT"),
    host: process.env.LEGAL_HOST?.trim() || missing("LEGAL_HOST"),
    url: (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "") || "Foulée",
  };
}

/**
 * Page légale (mentions ou confidentialité) : lisible d'abord — une colonne
 * étroite, titres de section en marge sur grand écran, filets fins.
 */
export async function LegalPage({ page }: { page: "legal" | "privacy" }) {
  const locale = await getLocale();
  const content = (LEGAL[locale] ?? LEGAL.fr)[page];
  const id = legalIdentity();
  return (
    <article className="mx-auto max-w-3xl py-4">
      <p className="eyebrow">{content.updated}</p>
      <h1 className="display mt-3 text-d2">{content.title}</h1>
      <p className="mt-4 max-w-2xl text-[1.0625rem] leading-relaxed text-ink2">{fillLegal(content.lead, id)}</p>
      <div className="mt-10 border-t border-hair">
        {content.sections.map((s) => (
          <section key={s.title} className="grid gap-2 border-b border-hair py-6 md:grid-cols-[12rem_1fr] md:gap-8">
            <h2 className="text-[0.9375rem] font-semibold tracking-tight">{s.title}</h2>
            <div className="space-y-3 text-[0.9375rem] leading-relaxed text-ink2">
              {s.body.map((p, i) => (
                <p key={i} className="whitespace-pre-line">
                  {fillLegal(p, id)}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
