import type { Config } from "tailwindcss";

/**
 * Direction : éditorial / data-journalism.
 *
 * Choix délibérés, à l'opposé du dashboard sombre générique :
 * - neutres CHAUDS (aucun bleu dans les gris) plutôt que le navy habituel
 * - une seule couleur d'accent (terre cuite), utilisée avec parcimonie
 * - palette de data-viz désaturée et cohérente, pas un arc-en-ciel saturé
 * - filets fins (hairlines) plutôt que des cartes bordées partout
 * - thème clair et sombre pilotés par variables CSS
 */
export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        panel: "rgb(var(--panel) / <alpha-value>)",
        sunken: "rgb(var(--sunken) / <alpha-value>)",
        hair: "rgb(var(--hair) / <alpha-value>)",
        hairStrong: "rgb(var(--hair-strong) / <alpha-value>)",

        ink: "rgb(var(--ink) / <alpha-value>)",
        ink2: "rgb(var(--ink-2) / <alpha-value>)",
        ink3: "rgb(var(--ink-3) / <alpha-value>)",

        clay: "rgb(var(--clay) / <alpha-value>)",
        ochre: "rgb(var(--ochre) / <alpha-value>)",
        sage: "rgb(var(--sage) / <alpha-value>)",
        slate: "rgb(var(--slate) / <alpha-value>)",
        plum: "rgb(var(--plum) / <alpha-value>)",
        rust: "rgb(var(--rust) / <alpha-value>)",

        // Alias sémantiques : mêmes teintes, nommées par l'usage plutôt que par
        // la couleur. Évite d'avoir à choisir entre « ochre » et « attention »
        // dans le code des pages.
        info: "rgb(var(--slate) / <alpha-value>)",
        positive: "rgb(var(--sage) / <alpha-value>)",
        caution: "rgb(var(--ochre) / <alpha-value>)",
        negative: "rgb(var(--rust) / <alpha-value>)",
        violet: "rgb(var(--plum) / <alpha-value>)",
      },
      borderRadius: {
        card: "10px",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        micro: ["0.6875rem", { lineHeight: "0.95rem", letterSpacing: "0.04em" }],
        // Échelle d'affichage pour les chiffres, avec un vrai contraste de tailles
        d1: ["4.5rem", { lineHeight: "0.9", letterSpacing: "-0.035em" }],
        d2: ["3rem", { lineHeight: "0.92", letterSpacing: "-0.03em" }],
        d3: ["2rem", { lineHeight: "0.95", letterSpacing: "-0.025em" }],
        d4: ["1.375rem", { lineHeight: "1", letterSpacing: "-0.015em" }],
      },
      spacing: {
        gutter: "clamp(1.25rem, 4vw, 3rem)",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(.16,1,.3,1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
