import type { ReactNode } from "react";

/** En-tête de page : titre net, sous-titre discret, actions à droite. */
export function PageHead({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        <h1 className="text-[1.75rem] font-semibold tracking-[-0.02em]">{title}</h1>
        {meta && <p className="mt-1.5 text-sm text-ink2">{meta}</p>}
      </div>
      {action}
    </header>
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
    <section className={`border-t border-hair pt-5 ${className}`}>
      {(title || action) && (
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && <h2 className="eyebrow">{title}</h2>}
            {note && (
              <p className="mt-1.5 max-w-2xl text-[0.8125rem] leading-relaxed text-ink2">
                {note}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
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
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="eyebrow">{title}</h2>
        {note && (
          <p className="mt-1.5 max-w-2xl text-[0.8125rem] leading-relaxed text-ink2">
            {note}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
