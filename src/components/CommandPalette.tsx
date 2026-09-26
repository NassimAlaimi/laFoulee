"use client";

import { useRouter } from "next/navigation";
import { syncErrorKey } from "@/lib/sync-errors";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtDuration, fmtPace } from "@/lib/format";
import { quickCalc, type QuickResult } from "@/lib/quick-calc";
import { isTyping } from "./KeyNav";
import { toggleTheme } from "./Theme";

type Index = {
  activities: Array<{ id: string; name: string; type: string; date: string; km: number; time: number; race: boolean; note: string | null; feeling: number | null }>;
  goals: Array<{ id: string; name: string; date: string; km: number; status: string }>;
  plans: Array<{ id: string; name: string; status: string }>;
};

type Item = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  keywords?: string;
  shortcut?: string[];
  run: () => void | Promise<void>;
};

/** Pages de l'app et leur raccourci « g + lettre ». */
export const PAGES: Array<{ href: string; labelKey: string; key: string; keywords?: string }> = [
  { href: "/", labelKey: "today", key: "r", keywords: "accueil dashboard tableau de bord résumé" },
  { href: "/activities", labelKey: "activities", key: "a", keywords: "liste courses sorties" },
  { href: "/activities?view=map", labelKey: "map", key: "k", keywords: "heatmap chaleur tracés gps" },
  { href: "/training", labelKey: "training", key: "e", keywords: "plan séances semaine" },
  { href: "/workouts", labelKey: "workouts", key: "w", keywords: "vdot allures fractionné seuil" },
  { href: "/goals", labelKey: "goals", key: "o", keywords: "course préparation plan de course gpx" },
  { href: "/records", labelKey: "records", key: "p", keywords: "records vdot prédictions chronos" },
  { href: "/analysis", labelKey: "analysis", key: "n", keywords: "pmc forme fraîcheur ctl atl tsb polarisation" },
  { href: "/analysis/modeles", labelKey: "modeles", key: "d", keywords: "vitesse critique seuils lt1 lt2 prédictions" },
  { href: "/analysis/seances", labelKey: "seances", key: "v", keywords: "intervalles dérive efficience" },
  { href: "/calculator", labelKey: "calculator", key: "c", keywords: "vma allure chrono" },
  { href: "/log", labelKey: "log", key: "j", keywords: "sommeil récupération score préparation" },
  { href: "/corps", labelKey: "corps", key: "b", keywords: "musculation renfo force matériel chaussures" },
  { href: "/strength", labelKey: "strength", key: "m", keywords: "musculation renfo force" },
  { href: "/gear", labelKey: "gear", key: "t", keywords: "chaussures usure" },
  { href: "/plus", labelKey: "plus", key: "u", keywords: "rétrospective réglages export agenda" },
  { href: "/recap", labelKey: "recap", key: "y", keywords: "année bilan wrapped résumé annuel mois" },
  { href: "/settings", labelKey: "settings", key: "s", keywords: "profil strava compte" },
];

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Ressenti (1-5) → mot cherchable, résolu à l'affichage. */
const FEELING_WORD: Record<number, string> = {
  1: "palette.feelings.1",
  2: "palette.feelings.2",
  3: "palette.feelings.3",
  4: "palette.feelings.4",
  5: "palette.feelings.5",
};

function score(item: Item, q: string): number {
  if (!q) return 1;
  const hay = strip(`${item.label} ${item.hint ?? ""} ${item.keywords ?? ""}`);
  const label = strip(item.label);
  const tokens = strip(q).split(/\s+/).filter(Boolean);
  let s = 0;
  for (const t of tokens) {
    const i = hay.indexOf(t);
    if (i < 0) return 0;
    s += label.startsWith(t) ? 6 : label.includes(` ${t}`) ? 4 : i < label.length ? 2 : 1;
  }
  return s;
}

const shortDate = (iso: string, locale: string) =>
  new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "2-digit" });

/**
 * Palette de commandes (⌘K / Ctrl+K ou « / »).
 *
 * Trois usages : aller n'importe où sans la souris, retrouver une séance par
 * son nom, sa date ou sa distance, et faire un calcul express (« 10k 48:30 »,
 * « 4'45/km ») sans ouvrir le calculateur.
 */
export function CommandPalette() {
  const router = useRouter();
  const t = useTranslations("palette");
  const tErr = useTranslations("syncErrors");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [index, setIndex] = useState<Index | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setSel(0);
    setHelp(false);
  }, []);

  const loadIndex = useCallback(async () => {
    try {
      const res = await fetch("/api/palette");
      if (res.ok) setIndex(await res.json());
    } catch {
      /* hors ligne : la navigation reste disponible */
    }
  }, []);

  // --------------------------------------------------------- Raccourcis globaux
  useEffect(() => {
    let pendingG = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/" ) {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setOpen(true);
        setHelp(true);
        return;
      }
      if (e.key === "g") {
        pendingG = Date.now();
        return;
      }
      if (pendingG && Date.now() - pendingG < 1200) {
        const page = PAGES.find((p) => p.key === e.key.toLowerCase());
        pendingG = 0;
        if (page) {
          e.preventDefault();
          router.push(page.href);
        }
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("palette:open", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("palette:open", onOpen);
    };
  }, [router]);

  useEffect(() => {
    if (!open) return;
    loadIndex();
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = "";
    };
  }, [open, loadIndex]);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router]
  );

  // --------------------------------------------------------- Éléments
  const baseItems = useMemo<Item[]>(() => {
    const nav: Item[] = PAGES.map((p) => ({
      id: `nav:${p.href}`,
      group: t("go"),
      label: t(`pages.${p.labelKey}`),
      keywords: p.keywords,
      shortcut: ["g", p.key],
      run: () => go(p.href),
    }));
    const actions: Item[] = [
      {
        id: "act:sync",
        group: t("actions"),
        label: t("sync"),
        keywords: "import mise à jour refresh",
        run: async () => {
          setStatus(t("syncRunning"));
          const res = await fetch("/api/strava/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ full: false }),
          }).catch(() => null);
          const data = res ? await res.json().catch(() => null) : null;
          setStatus(
            data?.ok
              ? t("syncResult", { n: data.imported, m: data.updated })
              : t("syncFail", { error: tErr(syncErrorKey(data?.error)) })
          );
          router.refresh();
          loadIndex();
        },
      },
      {
        id: "act:theme",
        group: t("actions"),
        label: t("theme"),
        keywords: "dark light nuit jour",
        shortcut: ["⇧", "D"],
        run: () => {
          toggleTheme();
          close();
        },
      },
      {
        id: "act:strength",
        group: t("actions"),
        label: t("strength"),
        keywords: "muscu renfo nouvelle séance log",
        run: () => go("/strength/new"),
      },
      {
        id: "act:plan",
        group: t("actions"),
        label: t("planAction"),
        keywords: "nouveau plan générer semaine",
        run: () => go("/training"),
      },
      {
        id: "act:goal",
        group: t("actions"),
        label: t("goalAction"),
        keywords: "nouvelle course objectif",
        run: () => go("/goals#nouvel-objectif"),
      },
      {
        id: "act:ics",
        group: t("actions"),
        label: t("ics"),
        keywords: "calendrier ics google apple outlook agenda",
        run: () => go("/settings#agenda"),
      },
      {
        id: "act:help",
        group: t("actions"),
        label: t("helpAction"),
        keywords: "aide help touches",
        shortcut: ["?"],
        run: () => setHelp(true),
      },
    ];
    const acts: Item[] = (index?.activities ?? []).map((a) => ({
      id: `a:${a.id}`,
      group: t("sessions"),
      label: a.name,
      hint: `${shortDate(a.date, locale)} · ${a.km > 0 ? `${a.km} km · ` : ""}${fmtDuration(a.time)}`,
      keywords: `${shortDate(a.date, locale)} ${new Date(a.date).toLocaleDateString(locale, { month: "long", year: "numeric", weekday: "long" })} ${a.km}km ${Math.round(a.km)}k ${a.type} ${a.race ? "course race compétition" : ""} ${a.note ?? ""} ${a.feeling ? t(FEELING_WORD[a.feeling]) : ""}`,
      run: () => go(`/activities/${a.id}`),
    }));
    const goals: Item[] = (index?.goals ?? []).map((g) => ({
      id: `g:${g.id}`,
      group: t("goals"),
      label: g.name,
      hint: `${shortDate(g.date, locale)} · ${g.km} km`,
      keywords: "objectif course",
      run: () => go(`/goals/${g.id}`),
    }));
    const plans: Item[] = (index?.plans ?? []).map((p) => ({
      id: `p:${p.id}`,
      group: t("plans"),
      label: p.name,
      hint: p.status === "active" ? t("activePlan") : p.status,
      keywords: "plan entraînement",
      run: () => go(`/training/${p.id}`),
    }));
    return [...nav, ...actions, ...goals, ...plans, ...acts];
  }, [index, go, close, router, loadIndex]);

  const calc: QuickResult | null = useMemo(() => quickCalc(q), [q]);

  const items = useMemo(() => {
    if (!q.trim()) {
      return [
        ...baseItems.filter((i) => i.group === "Aller à" || i.group === "Actions"),
        ...baseItems.filter((i) => i.group === "Séances").slice(0, 5),
      ];
    }
    const scored = baseItems
      .map((i) => ({ i, s: score(i, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
    // On garde l'ordre des groupes, et au plus 8 séances
    const groups = [t("go"), t("actions"), t("goals"), t("plans"), t("sessions")];
    return groups.flatMap((g) =>
      scored
        .filter((x) => x.i.group === g)
        .slice(0, g === "Séances" ? 8 : 6)
        .map((x) => x.i)
    );
  }, [baseItems, q]);

  const calcItem: Item | null = calc
    ? {
        id: "calc",
        group: t("calc"),
        label: t("openCalc"),
        run: () => go("/calculator"),
      }
    : null;
  const all = calcItem ? [calcItem, ...items] : items;

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${sel}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  // Maj+D bascule le thème, où qu'on soit
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.shiftKey && e.key === "D") toggleTheme();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (help) setHelp(false);
      else close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => (s + 1) % Math.max(1, all.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => (s - 1 + all.length) % Math.max(1, all.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      all[sel]?.run();
    }
  }

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-ink/25 px-4 pt-[12vh] backdrop-blur-[3px] animate-[fade_.12s_ease-out]"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
      data-overlay-open
    >
      <div
        role="dialog"
        aria-modal
        aria-label={t("aria")}
        className="palette w-full max-w-[640px] overflow-hidden rounded-[14px] border border-hairStrong bg-panel shadow-[0_24px_80px_-12px_rgb(0_0_0/0.35)]"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-hair px-4">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0 text-ink3" aria-hidden>
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setHelp(false);
              setStatus(null);
            }}
            placeholder={t("placeholder")}
            className="h-14 flex-1 bg-transparent text-[1.0625rem] placeholder:text-ink3"
            aria-autocomplete="list"
            spellCheck={false}
          />
          <kbd className="kbd">esc</kbd>
        </div>

        {status && (
          <div className="flex items-center gap-2 border-b border-hair bg-sunken/60 px-4 py-2.5 text-[0.8125rem] text-ink2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-clay" />
            {status}
          </div>
        )}

        {help ? (
          <ShortcutHelp />
        ) : (
          <div ref={listRef} className="max-h-[min(60vh,520px)] overflow-y-auto overscroll-contain p-2">
            {calc && <CalcCard r={calc} />}
            {all.length === 0 && (
              <div className="px-3 py-10 text-center text-sm text-ink3">
                {t("noResult", { q })}
              </div>
            )}
            {all.map((item, i) => {
              const header = item.group !== lastGroup && item.group !== t("calc");
              lastGroup = item.group;
              return (
                <div key={item.id}>
                  {header && (
                    <div className="px-3 pb-1.5 pt-3 text-micro font-medium uppercase tracking-[0.11em] text-ink3">
                      {item.group}
                    </div>
                  )}
                  <button
                    type="button"
                    data-idx={i}
                    onMouseMove={() => sel !== i && setSel(i)}
                    onClick={() => item.run()}
                    className={`relative flex w-full items-center gap-3 rounded-[8px] px-3 py-2 text-left text-[0.875rem] transition-colors ${
                      sel === i ? "bg-sunken text-ink" : "text-ink2"
                    }`}
                  >
                    {sel === i && <span className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-clay" />}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.hint && <span className="shrink-0 font-mono text-micro text-ink3">{item.hint}</span>}
                    {item.shortcut && (
                      <span className="flex shrink-0 gap-0.5">
                        {item.shortcut.map((k) => (
                          <kbd key={k} className="kbd">
                            {k}
                          </kbd>
                        ))}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-4 border-t border-hair bg-sunken/40 px-4 py-2 text-micro text-ink3">
          <span className="flex items-center gap-1">
            <kbd className="kbd">↑</kbd>
            <kbd className="kbd">↓</kbd> {t("navigate")}
          </span>
          <span className="flex items-center gap-1">
            <kbd className="kbd">↵</kbd> {t("openWord")}
          </span>
          <span className="ml-auto flex items-center gap-1">
            <kbd className="kbd">?</kbd> {t("shortcuts")}
          </span>
        </div>
      </div>
    </div>
  );
}

function CalcCard({ r }: { r: QuickResult }) {
  const t = useTranslations("palette");
  if (r.kind === "pace") {
    return (
      <div className="mb-1 rounded-[10px] border border-hair bg-bg p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-micro font-medium uppercase tracking-[0.11em] text-clay">{t("calc")}</span>
          <span className="font-mono text-micro text-ink3">{r.kmh} km/h</span>
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="display text-d3">{fmtPace(r.pace, "")}</span>
          <span className="text-sm text-ink3">/km</span>
        </div>
        <div className="mt-3 grid grid-cols-5 gap-2 border-t border-hair pt-3">
          {r.splits.map((s) => (
            <div key={s.label}>
              <div className="text-micro text-ink3">{s.label}</div>
              <div className="font-mono text-[0.8125rem] font-medium">{fmtDuration(s.seconds)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="mb-1 rounded-[10px] border border-hair bg-bg p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-micro font-medium uppercase tracking-[0.11em] text-clay">{t("calc")}</span>
        <span className="font-mono text-micro text-ink3">
          {(r.meters / 1000).toFixed(r.meters % 1000 ? 2 : 0)} km en {fmtDuration(r.seconds)}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-5">
        <span className="flex items-baseline gap-1.5">
          <span className="display text-d3">{r.vdot.toFixed(1)}</span>
          <span className="text-sm text-ink3">VDOT</span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="display text-d4">{fmtPace(r.pace, "")}</span>
          <span className="text-sm text-ink3">/km</span>
        </span>
      </div>
      {r.equivalents.length > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-2 border-t border-hair pt-3">
          {r.equivalents.map((s) => (
            <div key={s.label}>
              <div className="text-micro text-ink3">{t("equiv", { label: s.label })}</div>
              <div className="font-mono text-[0.8125rem] font-medium">{fmtDuration(s.seconds)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ShortcutHelp() {
  const t = useTranslations("palette");
  const rows: Array<[string[], string]> = [
    [["⌘", "K"], t("openPalette")],
    [["?"], t("thisHelp")],
    [["⇧", "D"], t("themeShortcut")],
    [["←", "→"], t("prevNext")],
    [["Échap"], t("backToList")],
  ];
  return (
    <div className="grid max-h-[60vh] gap-8 overflow-y-auto p-5 sm:grid-cols-2">
      <div>
        <div className="eyebrow mb-3">{t("navG")}</div>
        {PAGES.map((p) => (
          <div key={p.href} className="flex items-center justify-between border-b border-hair py-1.5 text-[0.8125rem] last:border-b-0">
            <span className="text-ink2">{t(`pages.${p.labelKey}`)}</span>
            <span className="flex gap-0.5">
              <kbd className="kbd">g</kbd>
              <kbd className="kbd">{p.key}</kbd>
            </span>
          </div>
        ))}
      </div>
      <div>
        <div className="eyebrow mb-3">{t("everywhere")}</div>
        {rows.map(([keys, label]) => (
          <div key={label} className="flex items-center justify-between gap-3 border-b border-hair py-1.5 text-[0.8125rem] last:border-b-0">
            <span className="text-ink2">{label}</span>
            <span className="flex shrink-0 gap-0.5">
              {keys.map((k) => (
                <kbd key={k} className="kbd">
                  {k}
                </kbd>
              ))}
            </span>
          </div>
        ))}
        <div className="eyebrow mb-2 mt-6">{t("calc")}</div>
        <p className="text-[0.8125rem] leading-relaxed text-ink2">
          {t("calcHint")}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-micro">
          {["5k 24:30", "semi 1h45", "10 km en 49'50", "4'45/km", "13 km/h"].map((x) => (
            <span key={x} className="tag">
              {x}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
