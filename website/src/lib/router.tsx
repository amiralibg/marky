import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { prefersReducedMotion } from "./motion";

export type Location = {
  /** Always starts with `/` and never ends with one (except the root itself). */
  path: string;
  /** Fragment without the `#`, or "" when there is none. */
  hash: string;
};

type NavigateOptions = { replace?: boolean };

const listeners = new Set<() => void>();

/**
 * Scroll offsets keyed by history entry, so Back lands where you left rather
 * than at the top. The browser's own restoration cannot help here: it measures
 * the page before React has re-rendered the previous route into it.
 */
const scrollByEntry = new Map<number, number>();
let entryId = 0;

function normalise(pathname: string) {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

export function readLocation(): Location {
  if (typeof window === "undefined") return { path: "/", hash: "" };
  return {
    path: normalise(window.location.pathname),
    hash: window.location.hash.replace(/^#/, ""),
  };
}

/** Splits an internal href into its path and fragment, resolving bare `#id`. */
export function parseHref(href: string): Location {
  const [rawPath, rawHash = ""] = href.split("#");
  return {
    path: rawPath === "" ? readLocation().path : normalise(rawPath),
    hash: rawHash,
  };
}

export function isInternalHref(href: string) {
  // `//host` is protocol-relative and so points off the site, despite the
  // leading slash.
  if (href.startsWith("//")) return false;
  return href.startsWith("/") || href.startsWith("#");
}

function emit() {
  for (const listener of listeners) listener();
}

export function navigate(href: string, options: NavigateOptions = {}) {
  const next = parseHref(href);
  const current = readLocation();
  const url = `${next.path}${next.hash ? `#${next.hash}` : ""}`;

  if (next.path === current.path && next.hash === current.hash) {
    // Re-clicking the link for the section you are on should still take you
    // there, since you may have scrolled away from it since.
    scrollToTarget(next.hash);
    return;
  }

  scrollByEntry.set(entryId, window.scrollY);
  entryId += 1;
  const state = { entryId };

  if (options.replace) window.history.replaceState(state, "", url);
  else window.history.pushState(state, "", url);

  emit();
  scrollToTarget(next.hash);
}

/**
 * Smooth for in-page jumps, instant for a route change: gliding through a whole
 * page of content that is about to be replaced only ever looks like a stutter.
 *
 * The target is looked for over several frames rather than once, because on a
 * route change React has not committed the new page yet when the click is
 * handled — the element being scrolled to does not exist during that frame.
 */
export function scrollToId(
  id: string,
  options: { smooth?: boolean; block?: ScrollLogicalPosition } = {}
) {
  const behavior: ScrollBehavior = options.smooth && !prefersReducedMotion() ? "smooth" : "auto";

  const attempt = (framesLeft: number) => {
    requestAnimationFrame(() => {
      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView({ behavior, block: options.block ?? "start" });
        return;
      }
      if (framesLeft > 0) attempt(framesLeft - 1);
    });
  };

  attempt(12);
}

export function scrollToTop() {
  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
}

function scrollToTarget(hash: string, samePage = true) {
  if (!hash) {
    scrollToTop();
    return;
  }
  // A route change starts the new page at the top and then settles onto the
  // section, so a fragment that no longer exists still leaves you somewhere
  // sensible rather than halfway down the previous page's scroll offset.
  if (!samePage) scrollToTop();
  scrollToId(hash, { smooth: samePage });
}

export function useLocation(): Location {
  const [location, setLocation] = useState<Location>(readLocation);

  useEffect(() => {
    const sync = () => setLocation(readLocation());
    listeners.add(sync);

    const onPop = (event: PopStateEvent) => {
      sync();
      const state = event.state as { entryId?: number } | null;
      entryId = state?.entryId ?? 0;
      const saved = scrollByEntry.get(entryId);
      const hash = window.location.hash.replace(/^#/, "");
      requestAnimationFrame(() => {
        if (saved !== undefined) window.scrollTo({ top: saved, behavior: "auto" });
        else scrollToTarget(hash, false);
      });
    };

    window.addEventListener("popstate", onPop);
    return () => {
      listeners.delete(sync);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  return location;
}

/**
 * Honours the fragment a visitor pasted in, which the browser cannot do for a
 * client-rendered page: the element does not exist yet when the browser looks.
 *
 * It scrolls twice. The first pass runs as soon as the target exists; the
 * second runs once the web fonts have swapped in, because that reflows every
 * entry above the target and otherwise leaves a deep link a screen or two off.
 * The correction is dropped the moment the visitor scrolls for themselves —
 * being yanked away from what you are reading is worse than a poor landing.
 */
export function useInitialHashScroll(ready: boolean) {
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !ready) return;
    done.current = true;

    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;

    scrollToId(hash);

    let interacted = false;
    const mark = () => {
      interacted = true;
    };
    const options = { passive: true, once: true } as const;
    window.addEventListener("wheel", mark, options);
    window.addEventListener("touchstart", mark, options);
    window.addEventListener("keydown", mark, options);

    void document.fonts?.ready.then(() => {
      if (!interacted) scrollToId(hash);
    });

    return () => {
      window.removeEventListener("wheel", mark);
      window.removeEventListener("touchstart", mark);
      window.removeEventListener("keydown", mark);
    };
  }, [ready]);
}

type LinkProps = {
  to: string;
  children: ReactNode;
  className?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  "aria-label"?: string;
  /** "page" for a route, "location" for a section within the current one. */
  "aria-current"?: "page" | "location" | undefined;
};

/**
 * An ordinary <a> that the router intercepts. Modified clicks (new tab, new
 * window, download) and anything external fall through to the browser, so the
 * link keeps working as a link — including right-click ▸ Copy Link Address.
 */
export function Link({ to, children, onClick, ...rest }: LinkProps) {
  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (event.button !== 0) return;
      if (!isInternalHref(to)) return;
      event.preventDefault();
      navigate(to);
    },
    [onClick, to]
  );

  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
