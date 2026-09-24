"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { helpFor } from "@/lib/help";

/**
 * Bouton « ? » des en-têtes de page : un panneau « cette page en trois
 * phrases » avec des raccourcis. Ferme au clic extérieur et à Échap.
 */
export function PageHelp() {
  const pathname = usePathname();
  const help = helpFor(pathname);
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<"left" | "right">("left");
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false); // changer de page referme le panneau
  }, [pathname]);

  if (!help) return null;

  const toggle = () => {
    if (!open) {
      // Si le bouton est près du bord droit, le panneau s'aligne à droite.
      const btn = btnRef.current;
      const vw = window.innerWidth;
      setAlign(btn && btn.getBoundingClientRect().left + 352 > vw ? "right" : "left");
    }
    setOpen((o) => !o);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={`flex h-7 w-7 items-center justify-center rounded-full border text-[0.8125rem] transition-colors ${
          open
            ? "border-clay text-clay"
            : "border-hair text-ink3 hover:border-clay hover:text-clay"
        }`}
        aria-label="Aide sur cette page"
        title="Aide sur cette page"
      >
        ?
      </button>

      {open && (
        <div
          className={`tour-bubble-in absolute top-9 z-[60] w-[min(340px,calc(100vw-3rem))] rounded-xl border border-hair bg-bg p-4 shadow-[0_18px_50px_rgb(0_0_0/0.24)] max-sm:fixed max-sm:inset-x-4 max-sm:top-24 max-sm:w-auto ${
            align === "right" ? "right-0" : "left-0"
          }`}
          role="dialog"
          aria-label={`Aide : ${help.title}`}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold tracking-tight">{help.title}</span>
            <Link href="/lexique" className="text-micro text-clay hover:underline" onClick={() => setOpen(false)}>
              Lexique
            </Link>
          </div>
          <ul className="mt-2.5 space-y-2">
            {help.lines.map((line, i) => (
              <li key={i} className="flex gap-2.5 text-[0.8125rem] leading-relaxed text-ink2">
                <span className="mt-[8px] h-[5px] w-[5px] shrink-0 rounded-full bg-clay/60" />
                {line}
              </li>
            ))}
          </ul>
          {help.links && help.links.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-hair pt-2.5">
              {help.links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="text-micro text-clay hover:underline"
                  onClick={() => setOpen(false)}
                >
                  {l.label} →
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
