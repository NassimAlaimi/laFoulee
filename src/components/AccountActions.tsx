"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Actions destructives du compte.
 *
 * La suppression exige de retaper son prénom : une modale « Êtes-vous sûr ? »
 * se clique sans lire, recopier un mot non.
 */
export function AccountActions({
  firstname,
  activityCount,
  planCount,
  sessionCount,
}: {
  firstname: string;
  activityCount: number;
  planCount: number;
  sessionCount: number;
}) {
  const router = useRouter();
  const t = useTranslations("account");
  const tc = useTranslations("common");
  const [mode, setMode] = useState<"idle" | "confirm">("idle");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expected = firstname.trim();
  const matches = typed.trim().toLowerCase() === expected.toLowerCase();

  async function logoutEverywhere() {
    setBusy(true);
    await fetch("/api/auth/sessions", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  async function destroy() {
    if (!matches) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/account", { method: "DELETE" });
    if (!res.ok) {
      setBusy(false);
      setError(t("deleteFail"));
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={t("statActivities")} value={activityCount} />
        <Stat label={t("statPlans")} value={planCount} />
        <Stat label={t("statDevices")} value={sessionCount} />
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={logoutEverywhere}
          disabled={busy}
          className="btn-outline btn-sm"
        >
          {t("logoutAll")}
        </button>

        {mode === "idle" && (
          <button
            type="button"
            onClick={() => setMode("confirm")}
            className="btn-quiet btn-sm text-rust"
          >
            {t("deleteAccount")}
          </button>
        )}
      </div>

      {mode === "confirm" && (
        <div className="rounded-card border border-negative/35 bg-negative/8 p-4">
          <p className="text-sm font-medium text-red-200">
            {t("deleteTitle")}
          </p>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-red-200/85">
            {t("deleteBody", { activities: activityCount, plans: planCount })}
          </p>

          <label className="field-label mt-4 block" htmlFor="confirm-name">
            {t("typeToConfirm", { name: expected })}
          </label>
          <input
            id="confirm-name"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="field mt-2 max-w-xs"
            autoComplete="off"
          />

          {error && <p className="mt-2 text-[0.8125rem] text-rust">{error}</p>}

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={destroy}
              disabled={!matches || busy}
              className="btn-solid btn-sm bg-rust disabled:opacity-40"
            >
              {busy ? t("deleting") : t("deleteFinal")}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("idle");
                setTyped("");
              }}
              className="btn-quiet btn-sm"
            >
              {tc("cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-hair bg-sunken px-3.5 py-3">
      <div className="text-micro uppercase tracking-wider text-ink3">{label}</div>
      <div className="num mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
