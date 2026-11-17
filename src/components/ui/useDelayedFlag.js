import { useEffect, useRef, useState } from "react";

/**
 * Loading indicators only for waits a person would notice, and never as a
 * flash. Nothing shows until the work has run `LOADING_DELAY_MS`; once shown,
 * an indicator stays up at least `LOADING_MIN_MS`, so a wait that ends just
 * after the delay does not blink the indicator on and straight off again.
 */
export const LOADING_DELAY_MS = 150;
export const LOADING_MIN_MS = 300;

/**
 * Whether the indicator for `active` work should be on screen now.
 *
 * - `active` false → true: still false for `delay` ms, then true.
 * - `active` true → false before the delay: stays false (nothing flashes).
 * - `active` true → false after it showed: true until it has been up for
 *   `minimum` ms, then false.
 */
export function useDelayedFlag(
  active,
  { delay = LOADING_DELAY_MS, minimum = LOADING_MIN_MS } = {}
) {
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef(0);

  useEffect(() => {
    let timer = null;
    if (active && !visible) {
      timer = setTimeout(() => {
        shownAtRef.current = Date.now();
        setVisible(true);
      }, delay);
    } else if (!active && visible) {
      const left = Math.max(0, minimum - (Date.now() - shownAtRef.current));
      timer = setTimeout(() => setVisible(false), left);
    }
    return () => clearTimeout(timer);
  }, [active, visible, delay, minimum]);

  return visible;
}

/**
 * The three phases a loadable view goes through, for views that swap their
 * content for a skeleton: `"waiting"` (work running, nothing shown yet — keep
 * the area blank), `"loading"` (show the skeleton) and `"ready"`.
 */
export function useLoadingPhase(loading, options) {
  const showSkeleton = useDelayedFlag(loading, options);
  if (showSkeleton) return "loading";
  return loading ? "waiting" : "ready";
}

/** True when the person has asked for reduced motion. Read once per mount. */
export const prefersReducedMotion = () => {
  try {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  } catch {
    return false;
  }
};
