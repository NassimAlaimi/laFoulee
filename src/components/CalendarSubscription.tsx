"use client";

import { useState } from "react";

/**
 * Abonnement agenda : une URL secrète à coller dans Google Agenda, Apple
 * Calendrier ou Outlook. Le plan y apparaît séance par séance et se met à
 * jour tout seul quand il se réadapte.
 */
export function CalendarSubscription({ initialToken, origin }: { initialToken: string | null; origin: string }) {
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const url = token ? `${origin}/api/calendar/${token}.ics` : "";
  const webcal = url.replace(/^https?:\/\//, "webcal://");

  async function call(method: "POST" | "DELETE") {
    if (method === "POST" && token && !confirm("L'ancienne adresse cessera de fonctionner. Continuer ?")) return;
    setBusy(true);
    const res = await fetch("/api/settings/calendar", { method });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (data?.ok) setToken(method === "POST" ? data.token : null);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* presse-papiers refusé : l'utilisateur peut sélectionner le champ */
    }
  }

  if (!token) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-lg text-[0.8125rem] leading-relaxed text-ink2">
          Tes séances planifiées et tes courses objectif, directement dans ton agenda. Les
          modifications du plan (réadaptation, séance déplacée) s&apos;y reportent
          automatiquement.
        </p>
        <button type="button" className="btn-solid" onClick={() => call("POST")} disabled={busy}>
          Activer l&apos;abonnement
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="field flex-1 font-mono text-micro"
          aria-label="Adresse de l'agenda"
        />
        <button type="button" className="btn-outline shrink-0" onClick={copy}>
          {copied ? "Copié ✓" : "Copier"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={webcal} className="btn-outline btn-sm">
          Ouvrir dans Calendrier (Apple)
        </a>
        <a
          href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`}
          target="_blank"
          rel="noreferrer"
          className="btn-outline btn-sm"
        >
          Ajouter à Google Agenda
        </a>
        <a href={url} className="btn-quiet">
          Télécharger le .ics
        </a>
      </div>
      <div className="grid gap-4 text-micro leading-relaxed text-ink3 sm:grid-cols-2">
        <p>
          <span className="font-medium text-ink2">Outlook :</span> Ajouter un calendrier → À
          partir d&apos;Internet → coller l&apos;adresse. Les agendas se resynchronisent
          d&apos;eux-mêmes (de quelques minutes à 24 h selon le service).
        </p>
        <p>
          <span className="font-medium text-ink2">Confidentialité :</span> quiconque possède
          cette adresse peut lire ton plan. Régénère-la si tu l&apos;as partagée par erreur.
        </p>
      </div>
      <div className="flex gap-2 border-t border-hair pt-3">
        <button type="button" className="btn-quiet" onClick={() => call("POST")} disabled={busy}>
          Régénérer l&apos;adresse
        </button>
        <button type="button" className="btn-quiet text-rust" onClick={() => call("DELETE")} disabled={busy}>
          Désactiver
        </button>
      </div>
    </div>
  );
}
