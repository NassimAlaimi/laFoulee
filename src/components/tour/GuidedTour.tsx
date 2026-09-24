"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  bubblePosition,
  centeredBubble,
  TOUR_STEPS,
  TOUR_STORAGE_KEY,
  type BubblePos,
  type Rect,
} from "@/lib/tour";

/**
 * Visite guidée — un projecteur qui se promène sur les six pôles.
 *
 * - S'ouvre tout seul à la première visite (localStorage `foulee:tour:v1`),
 *   puis se relance via le bouton flottant « ? » ou l'événement `foulee:tour`.
 * - Le projecteur (fond assombri + anneau terre cuite) glisse d'une ancre à
 *   l'autre — y compris à travers les changements de page.
 * - Les transitions respectent `prefers-reduced-motion` (voir globals.css).
 */

const PAD = 10; // respire du projecteur autour de l'ancre

export function GuidedTour() {
  const router = useRouter();
  const pathname = usePathname();

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const [vp, setVp] = useState({ width: 1200, height: 800 });
  const [bubbleSize, setBubbleSize] = useState({ width: 360, height: 210 });
  const [reduced, setReduced] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const step = TOUR_STEPS[stepIndex];
  const last = stepIndex === TOUR_STEPS.length - 1;

  // ---------------------------------------------------------- Ouverture
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onMq = () => setReduced(mq.matches);
    mq.addEventListener("change", onMq);

    const onStart = () => {
      setStepIndex(0);
      setAnchor(null);
      setActive(true);
    };
    window.addEventListener("foulee:tour", onStart);

    const seen = window.localStorage.getItem(TOUR_STORAGE_KEY);
    if (!seen) {
      const t = window.setTimeout(onStart, 800);
      return () => {
        window.clearTimeout(t);
        mq.removeEventListener("change", onMq);
        window.removeEventListener("foulee:tour", onStart);
      };
    }
    return () => {
      mq.removeEventListener("change", onMq);
      window.removeEventListener("foulee:tour", onStart);
    };
  }, []);

  // ---------------------------------------------------------- Verrou du défilement
  useEffect(() => {
    if (active) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [active]);

  // ---------------------------------------------------------- Routage inter-pages
  useEffect(() => {
    if (!active) return;
    if (step.path && pathname !== step.path) router.push(step.path);
  }, [active, step, pathname, router]);

  // ---------------------------------------------------------- Ancre et géométrie
  useEffect(() => {
    const onVp = () => setVp({ width: window.innerWidth, height: window.innerHeight });
    onVp();
    window.addEventListener("resize", onVp);
    return () => window.removeEventListener("resize", onVp);
  }, []);

  useEffect(() => {
    if (!active) {
      setAnchor(null);
      return;
    }
    // Carte finale : pas d'ancre, bulle centrée.
    if (!step.anchor) {
      setAnchor(null);
      return;
    }
    if (step.path && pathname !== step.path) return; // la page arrive

    let cancelled = false;
    let attempts = 0;

    const measure = () => {
      if (cancelled) return;
      const el =
        document.querySelector<HTMLElement>(step.anchor) ??
        document.querySelector<HTMLElement>("main h1");
      if (!el) {
        if (attempts++ < 50) window.setTimeout(measure, 120);
        return;
      }
      const r = el.getBoundingClientRect();
      setAnchor({ top: r.top, left: r.left, width: r.width, height: r.height });
      el.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
      const after = () => {
        if (cancelled) return;
        const r2 = el.getBoundingClientRect();
        setAnchor({ top: r2.top, left: r2.left, width: r2.width, height: r2.height });
      };
      // La position peut bouger pendant le défilement : on re-mesure.
      window.setTimeout(after, reduced ? 0 : 500);
      window.setTimeout(after, reduced ? 0 : 1000);
    };
    measure();

    return () => {
      cancelled = true;
    };
  }, [active, stepIndex, pathname, reduced, step.anchor, step.path]);

  // Taille réelle de la bulle (la position en dépend, une passe suffit).
  useLayoutEffect(() => {
    if (!active) return;
    const el = bubbleRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width > 0) setBubbleSize({ width: r.width, height: r.height });
  }, [active, stepIndex, anchor]);

  // ---------------------------------------------------------- Actions
  const finish = () => {
    window.localStorage.setItem(TOUR_STORAGE_KEY, "1");
    setActive(false);
    setAnchor(null);
  };
  const next = () => (last ? finish() : setStepIndex(stepIndex + 1));
  const prev = () => setStepIndex(Math.max(0, stepIndex - 1));

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex]);

  if (!active) return null;

  const pos: BubblePos | null = anchor
    ? bubblePosition(anchor, bubbleSize, vp)
    : centeredBubble(vp, bubbleSize.height);
  const spot = anchor
    ? {
        left: anchor.left - PAD,
        top: anchor.top - PAD,
        width: anchor.width + 2 * PAD,
        height: anchor.height + 2 * PAD,
      }
    : null;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Visite guidée">
      {/* Fond assombri avec la fenêtre du projecteur */}
      {spot ? (
        <>
          <div
            className="tour-backdrop fixed rounded-[12px]"
            style={{
              left: spot.left,
              top: spot.top,
              width: spot.width,
              height: spot.height,
              boxShadow: "0 0 0 9999px rgb(10 10 11 / 0.62)",
            }}
            aria-hidden
          />
          <div
            className="tour-ring pointer-events-none fixed rounded-[14px]"
            style={{
              left: spot.left - 3,
              top: spot.top - 3,
              width: spot.width + 6,
              height: spot.height + 6,
              boxShadow:
                "inset 0 0 0 1.5px rgb(var(--clay)), 0 0 0 4px rgb(var(--clay) / 0.14), 0 8px 40px rgb(0 0 0 / 0.35)",
            }}
            aria-hidden
          />
        </>
      ) : (
        <div className="tour-backdrop-fade fixed inset-0 bg-[rgb(10_10_11/0.62)]" aria-hidden />
      )}

      {/* Bulle */}
      {pos && (
        <div
          ref={bubbleRef}
          className="tour-bubble fixed z-[75] w-[min(360px,calc(100vw-3rem))]"
          style={{ left: pos.left, top: pos.top }}
        >
          <div
            key={step.id}
            className="tour-bubble-in relative rounded-2xl border border-hair bg-bg p-5 shadow-[0_18px_60px_rgb(0_0_0/0.28)]"
          >
            {/* Flèche vers l'ancre */}
            {anchor && (
              <span
                className="absolute h-3.5 w-3.5 rotate-45 border-hair bg-bg"
                style={
                  pos.arrow === "top"
                    ? { top: -7, left: pos.arrowOffset - 7, borderLeftWidth: 1, borderTopWidth: 1 }
                    : pos.arrow === "bottom"
                      ? { bottom: -7, left: pos.arrowOffset - 7, borderRightWidth: 1, borderBottomWidth: 1 }
                      : pos.arrow === "left"
                        ? { left: -7, top: pos.arrowOffset - 7, borderLeftWidth: 1, borderBottomWidth: 1 }
                        : { right: -7, top: pos.arrowOffset - 7, borderRightWidth: 1, borderTopWidth: 1 }
                }
                aria-hidden
              />
            )}

            <div className="flex items-center justify-between gap-3">
              <span className="text-micro font-medium uppercase tracking-[0.16em] text-clay">
                {last ? "Dernière étape" : `Visite guidée · ${stepIndex + 1}/${TOUR_STEPS.length - 1}`}
              </span>
              <button type="button" onClick={finish} className="text-micro text-ink3 hover:text-ink">
                Passer
              </button>
            </div>

            <h2 className="mt-2.5 text-lg font-semibold leading-snug tracking-[-0.01em]">
              {step.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink2">{step.body}</p>

            <div className="mt-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-1.5" aria-hidden>
                {TOUR_STEPS.map((s, i) => (
                  <span
                    key={s.id}
                    className="h-[5px] rounded-full transition-all duration-300"
                    style={{
                      width: i === stepIndex ? 16 : 5,
                      background: i <= stepIndex ? "rgb(var(--clay))" : "rgb(var(--hair-strong))",
                    }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                {stepIndex > 0 && (
                  <button type="button" onClick={prev} className="btn-quiet">
                    ←
                  </button>
                )}
                <button type="button" onClick={next} className="btn-primary btn-sm">
                  {last ? "C'est parti →" : "Suivant →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
