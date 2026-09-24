"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./Theme";
import { AccountMenu, type AccountInfo } from "./AccountMenu";

const NAV = [
  { href: "/", label: "Aujourd'hui" },
  { href: "/activities", label: "Activités" },
  { href: "/training", label: "Entraînement" },
  { href: "/analysis", label: "Analyse" },
  { href: "/corps", label: "Corps" },
  { href: "/plus", label: "Plus" },
];

/** Chaque pôle éclaire aussi ses pages intérieures dans la barre. */
const POLES: Record<string, string[]> = {
  "/training": ["/training", "/workouts", "/goals"],
  "/analysis": ["/analysis", "/records", "/calculator"],
  "/corps": ["/corps", "/strength", "/gear"],
  "/plus": ["/plus", "/settings", "/recap"],
};

/**
 * Barre horizontale avec onglets soulignés plutôt qu'une sidebar à pastilles.
 * L'état actif est porté par un filet sous l'onglet — sobre et lisible.
 */
export function TopNav({ user }: { user: AccountInfo | null }) {
  const pathname = usePathname();
  const isActive = (href: string) => {
    if (href === "/") return pathname === "/" || pathname.startsWith("/log");
    if (href === "/activities") return pathname.startsWith("/activities");
    return (
      POLES[href]?.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ??
      pathname.startsWith(href)
    );
  };

  return (
    <>
    <header className="sticky top-0 z-40 border-b border-hair bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1240px] items-center gap-6 px-gutter">
        <Link href="/" className="flex shrink-0 items-center gap-2 py-3.5">
          <Logo />
          <span className="text-[0.9375rem] font-semibold tracking-tight">
            Foulée
          </span>
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto md:flex">
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative whitespace-nowrap px-2.5 py-3.5 text-[0.8125rem] transition-colors ${
                  active ? "text-ink" : "text-ink2 hover:text-ink"
                }`}
              >
                {item.label}
                {active && (
                  <span className="absolute inset-x-2.5 -bottom-px h-px bg-clay" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("palette:open"))}
            className="btn-quiet gap-1.5 lg:border lg:border-hair lg:pr-1"
            aria-label="Rechercher (Ctrl+K)"
            title="Rechercher, naviguer, calculer · ⌘K"
          >
            <SearchIcon />
            <kbd className="kbd hidden lg:inline-flex">⌘K</kbd>
          </button>
          <ThemeToggle />
          <Link
            href="/settings"
            className={`btn-quiet ${pathname.startsWith("/settings") ? "text-ink" : ""}`}
            aria-label="Réglages"
            title="Réglages"
          >
            <GearIcon />
          </Link>
          {user && <AccountMenu user={user} />}
        </div>
      </div>
    </header>
    <MobileTabs isActive={isActive} />
    </>
  );
}

const MOBILE = [
  { href: "/", label: "Aujourd'hui", icon: "M4 13h6V4H4zM14 20h6V11h-6zM4 20h6v-4H4zM14 7h6V4h-6z" },
  { href: "/activities", label: "Activités", icon: "M3 17c3.5 0 4.5-10 8-10s4.5 10 8 10" },
  { href: "/training", label: "Plan", icon: "M5 5h14v15H5zM5 10h14M9 3v4M15 3v4" },
  { href: "/analysis", label: "Analyse", icon: "M3 17c4-6 7-6 9-3M5 7l3 3 4-4M15 12v6h6M3 21h18" },
];

/**
 * Barre d'onglets du bas sur mobile : les quatre pages du quotidien au pouce,
 * tout le reste passe par la palette (« Plus »).
 */
function MobileTabs({ isActive }: { isActive: (href: string) => boolean }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-hair bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      aria-label="Navigation principale"
    >
      {MOBILE.map((t) => {
        const on = isActive(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex flex-col items-center gap-1 py-2.5 text-[10px] ${on ? "text-clay" : "text-ink2"}`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d={t.icon} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("palette:open"))}
        className="flex flex-col items-center gap-1 py-2.5 text-[10px] text-ink2"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="5" cy="12" r="1.6" fill="currentColor" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
          <circle cx="19" cy="12" r="1.6" fill="currentColor" />
        </svg>
        Plus
      </button>
    </nav>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function Logo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 17c3.5 0 4.5-10 8-10s4.5 10 8 10"
        stroke="rgb(var(--clay))"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-2.77 1.14V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.35 19.4l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 3.38 14H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.14-2.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.6 1.6 0 0 0 10 3.38V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.77 1.14l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.6 1.6 0 0 0 20.62 10H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
