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

  async function disconnect() {
    setLoading(true);
    await fetch("/api/strava/disconnect", { method: "POST" });
    setLoading(false);
    setConfirming(false);
    router.refresh();
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-2">
        <span className="text-micro text-ink2">{t("confirmQuestion")}</span>
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
