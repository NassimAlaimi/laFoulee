"use client";

/**
 * Lanceur flottant de la visite guidée : un « ? » discret, partout.
 * Déclenche l'événement `foulee:tour` écouté par GuidedTour.
 */
export function TourLauncher() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("foulee:tour"))}
      className="fixed bottom-20 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-hair bg-bg text-ink2 shadow-[0_6px_24px_rgb(0_0_0/0.14)] transition-all hover:border-clay hover:text-clay md:bottom-6"
      title="Visite guidée"
      aria-label="Lancer la visite guidée"
    >
      ?
    </button>
  );
}
