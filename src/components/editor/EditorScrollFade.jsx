import { forwardRef, useCallback, useEffect, useRef, useState } from "react";

// How far the text dissolves at each edge. Deliberately shorter than the 120px
// Writer uses — marky's panes are often split, and a tall fade eats a split
// pane's usable height.
const FADE = 36;
// Width of the strip the scrollbar lives in. `.quiet-scroll` draws a 10px
// track; the extra 2px keeps the thumb's rounded edge out of the gradient.
const GUTTER = 12;
// Slack so a sub-pixel scroll offset doesn't count as "scrolled".
const EPSILON = 2;

/**
 * The mask for the edges that currently have content beyond them.
 *
 * Fading an edge with nothing past it dims the first or last line for no
 * reason — at rest the top line sat under the gradient and read as blurred.
 * An edge only fades once there is something hidden behind it.
 *
 * Two gradients composited with `add`: the vertical one does the fading, the
 * horizontal one punches the scrollbar gutters back to opaque so the thumb
 * doesn't fade out along with the text.
 */
const buildMask = (fadeTop, fadeBottom) => {
  if (!fadeTop && !fadeBottom) return undefined;

  const start = fadeTop ? `transparent 0, black ${FADE}px` : "black 0";
  const end = fadeBottom ? `black calc(100% - ${FADE}px), transparent 100%` : "black 100%";

  return [
    `linear-gradient(to bottom, ${start}, ${end})`,
    `linear-gradient(to right, black ${GUTTER}px, transparent ${GUTTER}px, transparent calc(100% - ${GUTTER}px), black calc(100% - ${GUTTER}px))`,
  ].join(", ");
};

// A blur that only bites where the mask has already thinned the text, so lines
// entering and leaving the viewport soften instead of being cut by a hard edge.
function EdgeBlur({ position }) {
  const isTop = position === "top";
  const fade = isTop
    ? "linear-gradient(to bottom, black 35%, transparent 85%)"
    : "linear-gradient(to top, black 35%, transparent 85%)";

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-10"
      style={{
        [isTop ? "top" : "bottom"]: 0,
        left: GUTTER,
        right: GUTTER,
        height: FADE * 2,
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
        maskImage: fade,
        WebkitMaskImage: fade,
      }}
    />
  );
}

/**
 * A scroll container whose content dissolves at the top and bottom edges
 * instead of being cut by one.
 *
 * Two things must stay *outside* the masked element, because `mask-image`
 * clips descendants and neutralises `backdrop-filter` inside them:
 *
 *   - Floating chrome pinned to an edge (the find-results box) — pass it as
 *     `overlay` so it renders above the scroller, unmasked.
 *   - CodeMirror tooltips, which is why `extensions.js` portals them to
 *     `document.body` via `tooltips({ parent })`.
 *
 * `enabled={false}` degrades to a plain flex column that does not scroll. Focus
 * mode needs that: there CodeMirror owns its own scroller (`autoHeight` is
 * off), so masking this wrapper would fade nothing and clip the tooltips for
 * no gain. The ref always lands on whichever element actually scrolls.
 */
const EditorScrollFade = forwardRef(
  ({ children, overlay = null, className = "", enabled = true }, ref) => {
    const scrollerRef = useRef(null);
    const [edges, setEdges] = useState({ top: false, bottom: false });

    // The scroller is both the forwarded ref's target and ours.
    const attachScroller = useCallback(
      (node) => {
        scrollerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref]
    );

    const syncEdges = useCallback(() => {
      const el = scrollerRef.current;
      if (!el) return;
      const overflow = el.scrollHeight - el.clientHeight;
      const top = el.scrollTop > EPSILON;
      const bottom = overflow > EPSILON && el.scrollTop < overflow - EPSILON;
      setEdges((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
    }, []);

    // Re-checked on resize and on content growth as well as on scroll: a note
    // that grows past the viewport as you type has to start fading its bottom
    // edge without a scroll event ever firing.
    useEffect(() => {
      const el = scrollerRef.current;
      if (!enabled || !el) return undefined;

      syncEdges();
      const observer = new ResizeObserver(syncEdges);
      observer.observe(el);
      if (el.firstElementChild) observer.observe(el.firstElementChild);
      return () => observer.disconnect();
    }, [enabled, syncEdges, children]);

    if (!enabled) {
      return (
        <div ref={ref} className={`relative flex h-full w-full flex-col ${className}`}>
          {children}
          {overlay}
        </div>
      );
    }

    const mask = buildMask(edges.top, edges.bottom);

    return (
      <div className={`relative flex h-full min-h-0 w-full flex-col ${className}`}>
        <div
          ref={attachScroller}
          onScroll={syncEdges}
          className="quiet-scroll flex min-h-0 w-full flex-1 flex-col overflow-y-auto"
          style={{
            maskImage: mask,
            WebkitMaskImage: mask,
            maskComposite: mask ? "add" : undefined,
            WebkitMaskComposite: mask ? "source-over" : undefined,
          }}
        >
          {children}
        </div>
        {edges.top && <EdgeBlur position="top" />}
        {edges.bottom && <EdgeBlur position="bottom" />}
        {overlay}
      </div>
    );
  }
);

EditorScrollFade.displayName = "EditorScrollFade";

export default EditorScrollFade;
