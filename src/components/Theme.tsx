"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type Mode = "light" | "dark";

/**
 * Script injecté avant l'hydratation : applique le thème stocké dès le premier
 * paint, sinon on verrait un flash blanc au chargement en thème sombre.
 */
export const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('theme');
    if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

/** Bascule le thème — utilisable depuis n'importe quel composant client. */
export function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next: Mode = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem("theme", next);
  } catch {
    /* stockage indisponible : le thème reste valable pour la session */
  }
}

export function ThemeToggle() {
  const t = useTranslations("common");
  const [mode, setMode] = useState<Mode | null>(null);

  // L'attribut peut changer ailleurs (palette, raccourci Maj+D) : on l'observe
  // plutôt que de supposer être le seul à le modifier.
  useEffect(() => {
    const read = () =>
      setMode(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const toggle = toggleTheme;

  return (
    <button
      onClick={toggle}
      className="btn-quiet"
      aria-label={mode === "dark" ? t("toLight") : t("toDark")}
      title={mode === "dark" ? t("lightTheme") : t("darkTheme")}
    >
      {mode === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 2.6v2M12 19.4v2M2.6 12h2M19.4 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path
        d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
