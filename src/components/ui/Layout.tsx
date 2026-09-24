import type { ReactNode } from "react";
import { NightScope } from "@/components/ui/NightScope";
import { PageHelp } from "@/components/help/PageHelp";

/**
 * En-tête de page : un titre qui a de la présence (grand, serré), un
 * surtitre optionnel en terre cuite, un sous-titre discret, actions à droite.
 */
export function PageHead({
  title,
  meta,
  action,
  kicker,
}: {
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
  kicker?: ReactNode;
}) {
  return (
    <header className="rise mb-10 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {kicker && (
          <div className="mb-3 text-micro font-medium uppercase tracking-[0.16em] text-clay">{kicker}</div>
        )}
        <div className="flex items-center gap-3">
          <h1 className="text-[clamp(2.1rem,4.4vw,3.1rem)] font-semibold leading-[0.95] tracking-[-0.035em]">{title}</h1>
          <PageHelp />
        </div>
        {meta && <p className="mt-3 text-[0.9375rem] text-ink2">{meta}</p>}
      </div>
      {action}
    </header>
  );
}

/**
 * Titre de section : un vrai titre (pas un surtitre gris), posé sur un filet
 * que marque un trait d'encre plus épais — la signature typographique des
 * pages, comme les rubriques d'un journal.
 */
function SectionTitle({ title, note, action }: { title?: string; note?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0">
        {title && (
          <h2 className="text-[1.3125rem] font-semibold leading-tight tracking-[-0.018em]">{title}</h2>
        )}
        {note && <p className="mt-1.5 max-w-2xl text-[0.8125rem] leading-relaxed text-ink2">{note}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/**
 * Section de contenu. Par défaut : simple filet supérieur + titre.
 * Aucune boîte — c'est la respiration et le filet qui séparent.
 */
export function Section({
  title,
  note,
  action,
  children,
  className = "",
}: {
  title?: string;
  note?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`section-rule pt-6 ${className}`}>
      {(title || action) && <SectionTitle title={title} note={note} action={action} />}
      {children}
    </section>
  );
}

/** Panneau détaché, réservé aux éléments qui doivent flotter (formulaires…). */
export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`panel p-5 ${className}`}>{children}</div>;
}

export function Stack({
  children,
  gap = "gap-10",
}: {
  children: ReactNode;
  gap?: string;
}) {
  return <div className={`flex flex-col ${gap}`}>{children}</div>;
}

export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-t border-hair py-20 text-center">
      <h3 className="text-lg font-medium tracking-tight">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink2">{body}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

export function Hint({ children, height = 200 }: { children: ReactNode; height?: number }) {
  return (
    <div
      className="flex items-center justify-center text-[0.8125rem] text-ink3"
      style={{ height }}
    >
      {children}
    </div>
  );
}

/**
 * En-tête utilisable à l'intérieur d'une Section, quand le titre doit être
 * déclaré au même niveau que le contenu plutôt que passé en prop.
 */
export function SectionHead({
  title,
  note,
  action,
}: {
  title: string;
  note?: ReactNode;
  action?: ReactNode;
}) {
  return <SectionTitle title={title} note={note} action={action} />;
}

/**
 * Bande « nuit » pleine largeur : le contrepoint sombre qui donne du relief
 * aux pages claires. Les variables de couleur y sont redéfinies, donc tout
 * ce qu'on y pose (textes, filets, graphiques) bascule tout seul.
 */
export function NightBand({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`night full-bleed ${className}`}>
      <NightScope>
        <div className="mx-auto max-w-[1240px] px-gutter py-14 sm:py-16">{children}</div>
      </NightScope>
    </section>
  );
}
