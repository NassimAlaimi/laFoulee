"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

type Brief = { content: string; usedLlm: boolean; createdAt: string };

/**
 * Le brief de la semaine : un mot du coach (interprétation, tendance, conseil),
 * pas une redite des chiffres. Calculé par règles, reformulé par un LLM si une
 * clé est configurée. Rendu en paragraphes — le premier est le « chapeau ».
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

  const paras = (brief?.content ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[0.8125rem] leading-relaxed text-ink2">{t("note")}</p>
        <button type="button" className="btn-outline btn-sm" onClick={generate} disabled={busy}>
          {brief ? t("regenerate") : t("generate")}
        </button>
      </div>

      {paras.length > 0 ? (
        <div className="max-w-2xl space-y-3 border-l-2 border-clay pl-5">
          {paras.map((p, i) => (
            <p key={i} className={i === 0 ? "text-[1.05rem] font-medium leading-snug tracking-[-0.01em]" : "text-[0.9375rem] leading-relaxed text-ink2"}>
              {p}
            </p>
          ))}
          <div className="pt-1 text-micro text-ink3">{brief!.usedLlm ? t("viaLlm") : t("viaRules")}</div>
        </div>
      ) : (
        <p className="text-[0.8125rem] text-ink3">{t("empty")}</p>
      )}
    </div>
  );
}
