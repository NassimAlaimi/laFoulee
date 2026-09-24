import { PageHead, Section } from "@/components/ui/Layout";
import { LEXIQUE } from "@/lib/help";

export const dynamic = "force-dynamic";

/**
 * Lexique — les termes du sport de haut niveau, en langage courant.
 * Accessible depuis le « ? » de chaque page et le pôle Plus.
 */
export default function LexiquePage() {
  return (
    <div className="space-y-10">
      <PageHead
        title="Lexique"
        kicker="Les termes, simplement"
        meta="CTL, VDOT, seuils, efficience — chaque chiffre de l'app, traduit."
      />

      <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {LEXIQUE.map((e) => (
          <div key={e.term} className="border-t-2 border-hair pt-3">
            <h2 className="text-lg font-semibold tracking-tight">
              {e.term}
              {e.abbr && <span className="ml-2 text-micro font-normal uppercase tracking-[0.12em] text-ink3">{e.abbr}</span>}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink2">{e.def}</p>
          </div>
        ))}
      </div>

      <Section title="Un terme manque ?">
        <p className="text-sm text-ink2">
          Les définitions s'étoffent au fil des versions. Reviens par le « ? » d'une
          page ou le pôle Plus.
        </p>
      </Section>
    </div>
  );
}
