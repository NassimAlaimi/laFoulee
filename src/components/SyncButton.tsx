"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

export function SyncButton({
  full = false,
  variant,
}: {
  full?: boolean;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const t = useTranslations("account");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [, startTransition] = useTransition();

  const style = variant ?? (full ? "secondary" : "primary");

  async function sync() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/strava/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? t("syncFail"));
      setResult({
        ok: true,
        text: t("syncResult", { n: data.imported, m: data.updated }),
      });
      startTransition(() => router.refresh());
    } catch (e) {
      setResult({
        ok: false,
        text: e instanceof Error ? e.message : t("unknownError"),
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={sync}
        disabled={loading}
        className={style === "primary" ? "btn-solid" : "btn-outline"}
      >
        {loading ? (
          <>
            <Spinner />
            {t("syncing")}
          </>
        ) : (
          <>
            {!full && <RefreshIcon />}
            {full ? t("syncFull") : t("sync")}
          </>
        )}
      </button>
      {result && (
        <span
          className={`max-w-xs text-right text-2xs ${result.ok ? "text-sage" : "text-rust"}`}
        >
          {result.text}
        </span>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity=".25" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
      <path
        d="M20 11A8 8 0 0 0 6.3 6.3L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 13.7 4.7L20 15.5M20 20v-4.5h-4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
