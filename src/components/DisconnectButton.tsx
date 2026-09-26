"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function DisconnectButton() {
  const router = useRouter();
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  async function disconnect() {
    setLoading(true);
    const res = await fetch("/api/strava/disconnect", { method: "POST" }).catch(() => null);
    const j = res?.ok ? await res.json().catch(() => null) : null;
    setLoading(false);
    setConfirming(false);
    // Confirmation écrite de l'effacement (politique API Strava §2.5).
    if (j?.ok) setDone(j.purged?.activities ?? 0);
    router.refresh();
  }

  if (done !== null) {
    return (
      <p role="status" className="max-w-sm text-micro text-ink2">
        {t("disconnectDone", { n: done })}
      </p>
    );
  }

  if (confirming) {
    return (
      <span className="flex max-w-md flex-wrap items-center gap-2">
        <span className="text-micro text-ink2">{t("disconnectWarn")}</span>
        <button onClick={disconnect} disabled={loading} className="btn btn-sm border border-hairStrong text-rust">
          {loading ? "…" : t("yes")}
        </button>
        <button onClick={() => setConfirming(false)} className="btn-quiet">
          {tc("cancel")}
        </button>
      </span>
    );
  }

  return (
    <button onClick={() => setConfirming(true)} className="btn-outline btn-sm">
      {t("disconnect")}
    </button>
  );
}
