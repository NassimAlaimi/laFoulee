import Link from "next/link";

/**
 * Bandeau de pôle : les pages d'un même univers, l'active soulignée d'un
 * filet terre cuite. Le pendant visuel de la nav à 6 pôles.
 */
export function PoleStrip({
  items,
  active,
}: {
  items: Array<{ href: string; label: string }>;
  active: string;
}) {
  return (
    <nav
      className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-hair pb-3"
      aria-label="Pages du pôle"
    >
      {items.map((it) => {
        const on = it.href === active;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`border-b-2 pb-3 text-[0.8125rem] transition-colors ${
              on ? "border-clay font-medium text-ink" : "border-transparent text-ink2 hover:text-ink"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
