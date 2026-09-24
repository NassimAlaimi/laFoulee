"use client";

/**
 * Porte « Visite guidée » du pôle Plus : même langage que les autres portes,
 * mais elle déclenche le tour plutôt qu'un lien.
 */
export function TourDoor() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("foulee:tour"))}
      className="group block border-t-2 border-hair pt-4 text-left transition-colors hover:border-clay"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight group-hover:text-clay">
          Visite guidée
        </h2>
        <span className="text-ink3 transition-transform group-hover:translate-x-1">→</span>
      </div>
      <p className="mt-1.5 max-w-[44ch] text-sm leading-relaxed text-ink2">
        Redécouvre l'app en une minute : le tour passe en revue chaque pôle, bulle par bulle.
      </p>
      <p className="mt-2.5 text-micro uppercase tracking-[0.12em] text-ink3">
        8 étapes · 1 minute
      </p>
    </button>
  );
}
