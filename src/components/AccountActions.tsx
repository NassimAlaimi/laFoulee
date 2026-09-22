"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
      setError("La suppression a échoué. Réessaie.");
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Activités" value={activityCount} />
        <Stat label="Plans" value={planCount} />
        <Stat label="Appareils connectés" value={sessionCount} />
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={logoutEverywhere}
          disabled={busy}
          className="btn-outline btn-sm"
        >
          Déconnecter tous les appareils
        </button>

        {mode === "idle" && (
          <button
            type="button"
            onClick={() => setMode("confirm")}
            className="btn-quiet btn-sm text-rust"
          >
            Supprimer mon compte
          </button>
        )}
      </div>

      {mode === "confirm" && (
        <div className="rounded-card border border-negative/35 bg-negative/8 p-4">
          <p className="text-sm font-medium text-red-200">
            Suppression définitive du compte
          </p>
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-red-200/85">
            {activityCount} activités, {planCount} plans, tes objectifs, tes réglages
            et ton matériel seront effacés. Rien n&apos;est archivé, rien n&apos;est
            récupérable. Ton compte Strava, lui, n&apos;est pas touché.
          </p>

          <label className="field-label mt-4 block" htmlFor="confirm-name">
            Tape <span className="font-mono">{expected}</span> pour confirmer
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
              {busy ? "Suppression…" : "Supprimer définitivement"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("idle");
                setTyped("");
              }}
              className="btn-quiet btn-sm"
            >
              Annuler
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
