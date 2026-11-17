import { useState } from "react";
import { prefersReducedMotion, useDelayedFlag, useLoadingPhase } from "./useDelayedFlag";

/**
 * Loading, two ways (styles in index.css, next to `.switch`):
 *
 * - A skeleton: flat blocks shaped like what is coming — rows for lists,
 *   cards for Home, lines for text — pulsing in opacity only.
 * - `BusyDots`: three dots in the surrounding ink, for work with no shape
 *   (a button, a status line).
 *
 * Both wait `LOADING_DELAY_MS` before showing and then stay at least
 * `LOADING_MIN_MS` (see useDelayedFlag.js), and both hold still under
 * reduced motion.
 */

const useMotion = () => {
  const [still] = useState(prefersReducedMotion);
  return still ? "none" : undefined;
};

/** One flat block. Size it with classes or `style`. */
export const Skeleton = ({ className = "", style }) => (
  <span className={`skeleton ${className}`} style={style} aria-hidden="true" />
);

// Widths that read as real text without being random from render to render.
const ROW_WIDTHS = ["72%", "58%", "84%", "46%", "66%", "78%", "52%", "62%"];
const LINE_WIDTHS = ["94%", "88%", "97%", "72%", "90%", "84%", "60%"];

/** List rows: a leading icon block and a label, like a sidebar or palette row. */
export const SkeletonRows = ({ count = 6, rowHeight = 32, className = "" }) => (
  <div className={`flex flex-col ${className}`} aria-hidden="true">
    {Array.from({ length: count }, (_, i) => (
      <div
        key={i}
        className="flex items-center gap-2.5 px-2.5"
        style={{ height: `${rowHeight}px` }}
      >
        <Skeleton className="h-4 w-4 shrink-0" />
        <Skeleton className="h-2.5" style={{ width: ROW_WIDTHS[i % ROW_WIDTHS.length] }} />
      </div>
    ))}
  </div>
);

/** Lines of text: a heading, then body lines, the last one short. */
export const SkeletonLines = ({ count = 6, heading = true, className = "" }) => (
  <div className={`flex flex-col gap-3 ${className}`} aria-hidden="true">
    {heading && <Skeleton className="mb-3 h-6 w-2/5" />}
    {Array.from({ length: count }, (_, i) => (
      <Skeleton
        key={i}
        className="h-3"
        style={{ width: i === count - 1 ? "48%" : LINE_WIDTHS[i % LINE_WIDTHS.length] }}
      />
    ))}
  </div>
);

/** Home's cards: a page block over a name and a meta line. */
export const SkeletonCards = ({ count = 6, className = "" }) => (
  <div
    className={`grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))] ${className}`}
    aria-hidden="true"
  >
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="flex flex-col gap-3">
        <Skeleton className="h-[188px] rounded-panel" />
        <Skeleton className="h-3" style={{ width: ROW_WIDTHS[i % ROW_WIDTHS.length] }} />
        <Skeleton className="h-2.5 w-1/3" />
      </div>
    ))}
  </div>
);

/** Three dots in the ink colour, for work with no shape. */
export const BusyDots = ({ className = "" }) => {
  const motion = useMotion();
  return (
    <span className={`busy-dots ${className}`} data-motion={motion} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
};

/**
 * A skeleton (or any placeholder) that appears only once the wait is worth
 * showing, announced to assistive tech by `label`.
 */
export const LoadingState = ({ active = true, label, children, className = "" }) => {
  const visible = useDelayedFlag(active);
  const motion = useMotion();
  if (!visible) return null;
  return (
    <div role="status" aria-live="polite" className={className} data-motion={motion}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
};

/**
 * Content that arrives after some work: blank for the first moment, then the
 * placeholder, then the content — and the placeholder, once up, stays its
 * minimum time even if the content was ready sooner.
 */
export const Loadable = ({ loading, label, placeholder, className = "", children }) => {
  const phase = useLoadingPhase(loading);
  const motion = useMotion();
  if (phase === "waiting") return null;
  if (phase === "loading") {
    return (
      <div role="status" aria-live="polite" className={className} data-motion={motion}>
        <span className="sr-only">{label}</span>
        {placeholder}
      </div>
    );
  }
  return children;
};

/**
 * A button that starts slow work. While `busy` it is disabled, and once the
 * wait is long enough to notice the dots take the icon's place (or, with no
 * icon, sit over the label) — the button never changes width.
 */
export const BusyButton = ({
  busy = false,
  icon = null,
  children,
  className = "btn",
  disabled = false,
  type = "button",
  ...rest
}) => {
  const showDots = useDelayedFlag(busy);
  return (
    <button
      type={type}
      className={`busy-button ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      data-busy={showDots ? "" : undefined}
      {...rest}
    >
      {icon && (
        <span className="busy-icon" aria-hidden="true">
          {showDots ? <BusyDots /> : icon}
        </span>
      )}
      <span className="busy-label">{children}</span>
      {!icon && showDots && (
        <span className="busy-overlay" aria-hidden="true">
          <BusyDots />
        </span>
      )}
    </button>
  );
};
