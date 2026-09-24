"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

/** Supprime le plan de course (GPX inclus) — confirmation intégrée. */
export function DeleteRacePlanButton({ goalId }: { goalId: string }) {
  const t = useTranslations("racePlan");
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    const res = await fetch("/api/race-plan", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goalId }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  if (!armed) {
    return (
      <button type="button" className="btn-quiet text-ink3" onClick={() => setArmed(true)}>
        Supprimer le plan (pour changer de parcours)
      </button>
    );
  }
  return (
    <span className="flex items-center gap-3 text-sm">
      <span className="text-ink3">{t("deleteConfirm")}</span>
      <button type="button" className="btn-outline btn-sm" disabled={busy} onClick={remove}>
        Oui, supprimer
      </button>
      <button type="button" className="btn-quiet" onClick={() => setArmed(false)}>
        Annuler
      </button>
    </span>
  );
}
