import { useEffect, useRef, useState } from "react";

export function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** True once a mouse-like pointer is available; drag affordances are gated on it. */
export function useFinePointer() {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine)");
    const sync = () => setFine(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return fine;
}

/**
 * Adds `data-revealed` to the element the first time it scrolls into view, so
 * entrance animations can live entirely in CSS. Resolves immediately when the
 * visitor has asked for reduced motion, so nothing is ever hidden from them.
 */
export function useReveal<T extends HTMLElement>(options: { threshold?: number } = {}) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (prefersReducedMotion()) {
      el.setAttribute("data-revealed", "");
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.setAttribute("data-revealed", "");
        io.disconnect();
      },
      { threshold: options.threshold ?? 0.15, rootMargin: "0px 0px -8% 0px" }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [options.threshold]);

  return ref;
}
