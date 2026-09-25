"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

type Brief = { content: string; usedLlm: boolean; createdAt: string };

/**
 * Le brief de l'agent : bilan, semaine à venir, objectif, conseil. Calculé
 * par règles (aucun LLM requis) ; un LLM le met en forme si une clé est
 * configurée. Bouton « Générer » — l'agent ne fait que proposer.
 */
export function BriefCard({ latest }: { latest: Brief | null }) {
  const t = useTranslations("brief");
  const router = useRouter();
  const [brief, setBrief] = useState<Brief | null>(latest);
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    const res = await fetch("/api/agent/brief", { method: "POST" });
    const j = await res.json().catch(() => null);
    setBusy(false);
    if (j?.ok) {
      setBrief({ content: j.content, usedLlm: j.usedLlm, createdAt: j.createdAt });
      router.refresh();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="max-w-2xl text-[0.8125rem] leading-relaxed text-ink2">{t("note")}</p>
        <button type="button" className="btn-outline btn-sm" onClick={generate} disabled={busy}>
          {brief ? t("regenerate") : t("generate")}
        </button>
      </div>
      {brief ? (
        <div className="whitespace-pre-wrap border-l-2 border-clay pl-4 text-[0.9375rem] leading-relaxed">
          {brief.content}
          <div className="mt-3 text-micro text-ink3">
            {brief.usedLlm ? t("viaLlm") : t("viaRules")}
          </div>
        </div>
      ) : (
        <p className="text-[0.8125rem] text-ink3">{t("empty")}</p>
      )}
    </div>
  );
}
