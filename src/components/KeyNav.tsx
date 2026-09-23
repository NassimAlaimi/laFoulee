"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Vrai si la frappe vise un champ de saisie : les raccourcis doivent se taire. */
export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}

/**
 * Navigation clavier d'une page de détail : ← / → vers les voisines,
 * Échap vers la liste. Les liens sont préchargés pour un passage instantané.
 */
export function KeyNav({
  left,
  right,
  escape,
}: {
  left?: string;
  right?: string;
  escape?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    if (left) router.prefetch(left);
    if (right) router.prefetch(right);
  }, [left, right, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft" && left) router.push(left);
      else if (e.key === "ArrowRight" && right) router.push(right);
      else if (e.key === "Escape" && escape && !document.querySelector("[data-overlay-open]")) {
        router.push(escape);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [left, right, escape, router]);

  return null;
}
