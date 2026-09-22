"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type AccountInfo = {
  name: string;
  avatarUrl: string | null;
  initials: string;
  athleteId: string;
  admin: boolean;
};

/**
 * Menu de compte. Volontairement minimal : qui suis-je, réglages, déconnexion.
 * L'avatar Strava sert de repère visuel quand plusieurs personnes utilisent la
 * même instance sur le même écran.
 */
export function AccountMenu({ user }: { user: AccountInfo }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    // replace + refresh : le bouton « précédent » ne doit pas réafficher une
    // page rendue avec les données de la session fermée.
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-hair py-1 pl-1 pr-2.5 text-[0.8125rem] text-ink2 transition-colors hover:text-ink"
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.name}
      >
        <Avatar user={user} />
        <span className="hidden max-w-[7rem] truncate sm:block">{user.name}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-60 rounded-card border border-hair bg-panel p-1.5 shadow-lg"
        >
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <Avatar user={user} />
            <div className="min-w-0">
              <div className="truncate text-[0.8125rem] font-medium">{user.name}</div>
              <div className="text-micro text-ink3">
                Athlète {user.athleteId}
                {user.admin && " · admin"}
              </div>
            </div>
          </div>

          <div className="my-1 h-px bg-hair" />

          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded px-2.5 py-2 text-[0.8125rem] text-ink2 transition-colors hover:bg-sunken hover:text-ink"
          >
            Réglages et compte Strava
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={logout}
            disabled={busy}
            className="block w-full rounded px-2.5 py-2 text-left text-[0.8125rem] text-ink2 transition-colors hover:bg-sunken hover:text-ink disabled:opacity-50"
          >
            {busy ? "Déconnexion…" : "Se déconnecter"}
          </button>
        </div>
      )}
    </div>
  );
}

function Avatar({ user }: { user: AccountInfo }) {
  if (user.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatarUrl}
        alt=""
        width={24}
        height={24}
        className="h-6 w-6 rounded-full object-cover"
      />
    );
  }
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-clay/20 text-micro font-medium text-clay">
      {user.initials}
    </span>
  );
}
