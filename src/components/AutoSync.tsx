"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const STALE_MS = 3 * 60 * 60 * 1000; // 3 h
const TAB_KEY = "foulee:autosync";

/**
 * Synchronisation Strava automatique et silencieuse.
 *
 * À l'ouverture de l'app, si la dernière synchro date de plus de 3 h, une
 * synchro incrémentale part en arrière-plan (quelques requêtes Strava au
 * plus). On ne dérange que s'il y a du nouveau : « 2 nouvelles activités ».
 * Une seule tentative par onglet et par fenêtre de 3 h.
 */
export function AutoSync({ lastSyncAt, connected }: { lastSyncAt: string | null; connected: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | { imported: number } | "error">("idle");

  useEffect(() => {
    if (!connected) return;
    const last = lastSyncAt ? new Date(lastSyncAt).getTime() : 0;
    if (Date.now() - last < STALE_MS) return;
    try {
      const tried = Number(sessionStorage.getItem(TAB_KEY) ?? 0);
      if (Date.now() - tried < STALE_MS) return;
      sessionStorage.setItem(TAB_KEY, String(Date.now()));
    } catch {
      /* sessionStorage indisponible : on tente quand même, une fois */
    }

    let cancelled = false;
    const slow = setTimeout(() => !cancelled && setState("running"), 1500);
    fetch("/api/strava/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full: false, detailLimit: 10, auto: true }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        clearTimeout(slow);
        if (d?.ok && d.imported > 0) {
          setState({ imported: d.imported });
          router.refresh();
          setTimeout(() => setState("idle"), 7000);
        } else setState("idle");
      })
      .catch(() => {
        clearTimeout(slow);
        setState("idle");
      });
    return () => {
      cancelled = true;
      clearTimeout(slow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "idle" || state === "error") return null;

  return (
    <div
      className="rise fixed bottom-[calc(72px+env(safe-area-inset-bottom))] left-4 z-50 flex items-center gap-2.5 rounded-full border border-hairStrong bg-panel/95 py-2 pl-3 pr-4 text-[0.8125rem] shadow-lg backdrop-blur-md md:bottom-5"
      role="status"
    >
      {state === "running" ? (
        <>
          <span className="h-2 w-2 animate-pulse rounded-full bg-clay" />
          <span className="text-ink2">Synchronisation Strava…</span>
        </>
      ) : (
        <>
          <span className="h-2 w-2 rounded-full bg-sage" />
          <span>
            {state.imported} nouvelle{state.imported > 1 ? "s" : ""} activité{state.imported > 1 ? "s" : ""}
          </span>
          <Link href="/activities" className="font-medium text-clay hover:underline" onClick={() => setState("idle")}>
            Voir
          </Link>
        </>
      )}
    </div>
  );
}
