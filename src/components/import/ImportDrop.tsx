"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

type Result = { created: number; merged: number; skipped: number; failed: number; wellness: number; errors: Array<{ file: string; error: string }> };

/**
 * Zone de dépôt : glisser des .fit / .gpx / .tcx ou l'export .zip complet.
 * Envoi en un seul multipart ; le serveur rapproche chaque sortie de
 * l'existant (fusion avec Strava, pas de doublon).
 */
export function ImportDrop() {
  const t = useTranslations("import");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (list: FileList | File[]) => {
    const files = Array.from(list).filter((f) => /\.(fit|gpx|tcx|zip)$/i.test(f.name));
    if (!files.length) {
      setError(t("wrongType"));
      return;
    }
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    setBusy(t("sending", { n: files.length }));
    setError(null);
    setResult(null);
    const res = await fetch("/api/import", { method: "POST", body: fd }).catch(() => null);
    setBusy(null);
    const j = res ? await res.json().catch(() => null) : null;
    if (!res || !res.ok || !j?.ok) {
      setError(t(j?.error === "tooLarge" || j?.error === "quota" || j?.error === "rate" ? j.error : "failed"));
      return;
    }
    setResult(j);
    router.refresh();
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          send(e.dataTransfer.files);
        }}
        className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-3 border border-dashed px-6 py-10 text-center transition-colors motion-reduce:transition-none ${
          over ? "border-clay bg-clay/5" : "border-hairStrong hover:border-clay"
        }`}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden className="text-clay">
          <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="text-[1.05rem] font-semibold">{busy ?? t("drop")}</p>
        <p className="max-w-md text-[0.8125rem] text-ink2">{t("dropHint")}</p>
        <input
          ref={input}
          type="file"
          multiple
          accept=".fit,.gpx,.tcx,.zip"
          className="hidden"
          onChange={(e) => e.target.files && send(e.target.files)}
        />
      </div>
      {error && <p className="mt-3 text-[0.8125rem] text-rust" role="status">{error}</p>}
      {result && (
        <div className="mt-6 grid grid-cols-2 gap-6 border-t border-hair pt-4 sm:grid-cols-5" role="status">
          <Fig v={result.created} l={t("created")} tone="text-sage" />
          <Fig v={result.merged} l={t("merged")} tone="text-slate" />
          <Fig v={result.skipped} l={t("skipped")} tone="text-ink3" />
          <Fig v={result.wellness} l={t("wellness")} tone="text-plum" />
          <Fig v={result.failed} l={t("failedN")} tone={result.failed ? "text-rust" : "text-ink3"} />
          {result.errors.length > 0 && (
            <ul className="col-span-full space-y-0.5 text-micro text-ink3">
              {result.errors.map((e, i) => (
                <li key={i}>
                  {e.file} — {t(`err.${["format", "zip", "too-large", "quota", "short", "header", "signature", "undefined-local"].includes(e.error) ? e.error : "other"}`)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Fig({ v, l, tone }: { v: number; l: string; tone: string }) {
  return (
    <div>
      <div className={`num text-[2rem] font-semibold leading-none ${tone}`}>{v}</div>
      <div className="mt-1 text-micro text-ink3">{l}</div>
    </div>
  );
}
