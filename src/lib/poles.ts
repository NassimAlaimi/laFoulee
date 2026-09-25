/**
 * Architecture de navigation : les pôles et leurs pages intérieures.
 *
 * Source unique pour la barre principale, la sous-barre de pôle et la
 * palette : une page ajoutée ici devient visible partout. Les pages d'un
 * pôle s'affichent en sous-barre dès qu'on entre dans le pôle — fini les
 * fonctionnalités qu'on oublie faute de les voir.
 *
 * Fonctions pures, testées dans tests/poles.test.ts.
 */

export type PoleKey = "today" | "activities" | "training" | "races" | "analysis" | "body" | "more";

export type PolePage = { href: string; key: string };

export type Pole = { key: PoleKey; href: string; pages: PolePage[] };

export const POLES: Pole[] = [
  { key: "today", href: "/", pages: [{ href: "/", key: "today" }, { href: "/log", key: "log" }] },
  { key: "activities", href: "/activities", pages: [{ href: "/activities", key: "activities" }] },
  {
    key: "training",
    href: "/training",
    pages: [
      { href: "/training", key: "plan" },
      { href: "/workouts", key: "workouts" },
    ],
  },
  {
    key: "races",
    href: "/goals",
    pages: [
      { href: "/goals", key: "goals" },
      { href: "/records", key: "records" },
      { href: "/calculator", key: "calculator" },
    ],
  },
  {
    key: "analysis",
    href: "/analysis",
    pages: [
      { href: "/analysis", key: "forme" },
      { href: "/analysis/modeles", key: "modeles" },
      { href: "/analysis/seances", key: "seances" },
    ],
  },
  {
    key: "body",
    href: "/corps",
    pages: [
      { href: "/corps", key: "corps" },
      { href: "/strength", key: "strength" },
      { href: "/gear", key: "gear" },
    ],
  },
  {
    key: "more",
    href: "/plus",
    pages: [
      { href: "/plus", key: "plus" },
      { href: "/recap", key: "recap" },
      { href: "/lexique", key: "lexique" },
      { href: "/settings", key: "settings" },
    ],
  },
];

/** `href` couvre-t-il `pathname` (égalité ou sous-chemin) ? */
export function covers(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Page du pôle la plus spécifique pour ce chemin (plus long préfixe), et son
 * pôle. `/analysis/modeles` → Analyse › Modèles, pas Analyse › Forme.
 */
export function locate(pathname: string): { pole: Pole; page: PolePage } | null {
  let best: { pole: Pole; page: PolePage } | null = null;
  for (const pole of POLES) {
    for (const page of pole.pages) {
      if (covers(page.href, pathname) && (!best || page.href.length > best.page.href.length)) {
        best = { pole, page };
      }
    }
  }
  return best;
}
