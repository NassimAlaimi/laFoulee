"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function DeleteGoalButton({ id }: { id: string }) {
  const t = useTranslations("goals");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function remove() {
    setLoading(true);
    await fetch(`/api/goals/${id}`, { method: "DELETE" });
    setLoading(false);
    router.refresh();
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-1.5">
        <button
          onClick={remove}
          disabled={loading}
          className="btn btn-sm border border-hairStrong text-rust"
        >
          {loading ? "…" : "Supprimer"}
        </button>
        <button onClick={() => setConfirming(false)} className="btn-quiet">
          Annuler
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      title="Supprimer cet objectif"
      aria-label="Supprimer cet objectif"
      className="rounded-lg p-1.5 text-ink3 transition-colors hover:text-rust"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
        <path
          d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
