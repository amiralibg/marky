import { useState } from "react";
import { prefersReducedMotion } from "./useDelayedFlag";
import { EMPTY_GLYPHS } from "./emptyGlyphs";

/**
 * The one empty state: a 40px line drawing in muted ink, a short title, one
 * line of help and at most one action — a quiet `.btn` unless it is the
 * view's single accent action (`action.primary`).
 *
 * It enters once: the drawing's strokes draw in over ~600ms while the text
 * fades up 4px, then everything is still. Nothing loops. Under reduced
 * motion it simply appears.
 *
 * @param {object} props
 * @param {keyof typeof EMPTY_GLYPHS} [props.icon]
 * @param {string} props.title
 * @param {import("react").ReactNode} [props.body]
 * @param {{ label: string, onClick: () => void, primary?: boolean }} [props.action]
 * @param {boolean} [props.compact]  Tighter spacing, for the sidebar and small panels.
 */
const EmptyState = ({ icon = "doc", title, body, action, compact = false, className = "" }) => {
  const [still] = useState(prefersReducedMotion);
  const d = EMPTY_GLYPHS[icon] || EMPTY_GLYPHS.doc;
  return (
    <div
      className={`empty-state ${compact ? "is-compact" : ""} ${className}`}
      data-motion={still ? "none" : undefined}
    >
      <svg
        className="empty-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.1}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        {/* pathLength=1 makes the draw-in one dash the length of the path. */}
        <path d={d} pathLength="1" />
      </svg>
      <div className="empty-text">
        <p className="empty-title">{title}</p>
        {body && <p className="empty-body">{body}</p>}
        {action && (
          <button
            type="button"
            className={`btn ${action.primary ? "btn-primary" : ""} empty-action`}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
};

export default EmptyState;
