"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ThemeToggle } from "./Theme";
import { AccountMenu, type AccountInfo } from "./AccountMenu";
import { POLES, locate } from "@/lib/poles";

/**
 * Barre horizontale avec onglets soulignés plutôt qu'une sidebar à pastilles.
 * L'état actif est porté par un filet sous l'onglet — sobre et lisible.
 */
export function TopNav({ user }: { user: AccountInfo | null }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const here = locate(pathname);
  const isActive = (href: string) => {
    const pole = POLES.find((p) => p.href === href);
    return Boolean(pole && here?.pole.key === pole.key);
  };
  const subPages = here && here.pole.pages.length > 1 ? here.pole.pages : null;

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
          {POLES.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative whitespace-nowrap px-2.5 py-3.5 text-[0.8125rem] transition-colors ${
                  active ? "text-ink" : "text-ink2 hover:text-ink"
                }`}
              >
                {t(item.key)}
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
            aria-label={t("search")}
            title={t("searchTitle")}
          >
            <SearchIcon />
            <kbd className="kbd hidden lg:inline-flex">⌘K</kbd>
          </button>
          <ThemeToggle />
          <Link
            href="/settings"
            className={`btn-quiet ${pathname.startsWith("/settings") ? "text-ink" : ""}`}
            aria-label={t("settings")}
            title={t("settings")}
          >
            <GearIcon />
          </Link>
          {user && <AccountMenu user={user} />}
        </div>
      </div>
      {subPages && (
        <nav
          aria-label={t("poleNav")}
          className="border-t border-hair/70"
        >
          <div className="mx-auto flex max-w-[1240px] items-center gap-5 overflow-x-auto px-gutter [scrollbar-width:none]">
            <span className="shrink-0 text-micro font-medium uppercase tracking-[0.14em] text-clay">
              {t(here!.pole.key)}
            </span>
            {subPages.map((p) => {
              const on = here!.page.href === p.href;
              return (
                <Link
                  key={p.href}
                  href={p.href}
                  aria-current={on ? "page" : undefined}
                  className={`relative whitespace-nowrap py-2 text-[0.78rem] transition-colors ${
                    on ? "text-ink" : "text-ink3 hover:text-ink"
                  }`}
                >
                  {t(`pages.${p.key}`)}
                  {on && <span className="absolute inset-x-0 -bottom-px h-px bg-clay" />}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </header>
    <MobileTabs isActive={isActive} />
    </>
  );
}

const MOBILE = [
  { href: "/", key: "today", icon: "M4 13h6V4H4zM14 20h6V11h-6zM4 20h6v-4H4zM14 7h6V4h-6z" },
  { href: "/activities", key: "activities", icon: "M3 17c3.5 0 4.5-10 8-10s4.5 10 8 10" },
  { href: "/training", key: "plan", icon: "M5 5h14v15H5zM5 10h14M9 3v4M15 3v4" },
  { href: "/analysis", key: "analysis", icon: "M3 17c4-6 7-6 9-3M5 7l3 3 4-4M15 12v6h6M3 21h18" },
];

/**
 * Barre d'onglets du bas sur mobile : les quatre pages du quotidien au pouce,
 * tout le reste passe par la palette (« Plus »).
 */
function MobileTabs({ isActive }: { isActive: (href: string) => boolean }) {
  const t = useTranslations("nav");
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-hair bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      aria-label={t("mainNav")}
    >
      {MOBILE.map((tab) => {
        const on = isActive(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={on ? "page" : undefined}
            className={`flex flex-col items-center gap-1 py-2.5 text-[10px] ${on ? "text-clay" : "text-ink2"}`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d={tab.icon} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t(tab.key)}
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
        {t("more")}
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
