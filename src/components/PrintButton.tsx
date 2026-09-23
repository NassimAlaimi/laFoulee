"use client";

/** Imprimer / enregistrer en PDF — la page est mise en forme pour le papier. */
export function PrintButton() {
  return (
    <button type="button" className="btn-outline btn-sm" onClick={() => window.print()}>
      Imprimer · PDF
    </button>
  );
}
