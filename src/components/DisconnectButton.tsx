"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DisconnectButton() {
  const router = useRouter();
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
        <span className="text-micro text-ink2">Confirmer ?</span>
        <button onClick={disconnect} disabled={loading} className="btn btn-sm border border-hairStrong text-rust">
          {loading ? "…" : "Oui"}
        </button>
        <button onClick={() => setConfirming(false)} className="btn-quiet">
          Annuler
        </button>
      </span>
    );
  }

  return (
    <button onClick={() => setConfirming(true)} className="btn-outline btn-sm">
      Déconnecter
    </button>
  );
}
