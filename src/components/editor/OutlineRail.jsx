import { useEffect, useMemo, useRef, useState } from "react";
import { parseHeadings, activeHeadingIndex, activeHeadingPath } from "../../utils/headings";

// Tick length per heading level. The rail reads as a miniature of the
// document's shape, so deeper headings get shorter marks.
const TICK_WIDTH = [22, 18, 14, 11, 9, 8];
const tickWidth = (level) => TICK_WIDTH[Math.min(level, TICK_WIDTH.length) - 1];

// Indent of each entry in the expanded panel, by heading level — the tree
// shape, mirroring the tick indentation on the rail. The panel owns the
// horizontal inset now (`px-2.5` on the <nav>), so a level-1 row sits flush at
// zero and every deeper level steps in from there.
const INDENT_STEP = 11; // px per extra level
const indentPx = (level) => (Math.min(level, 6) - 1) * INDENT_STEP;

/**
 * A quiet outline that lives on the right edge of the editor: one tick per
 * heading, expanding into a floating list on hover. Replaces the old
 * always-boxed table-of-contents panel and the toolbar button that toggled it —
 * the outline is simply there when the document has headings, and invisible
 * (a few hairlines) when you aren't looking for it.
 */
const OutlineRail = ({ markdown, activeLine = 0, onSelect }) => {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef(null);

  const headings = useMemo(() => parseHeadings(markdown), [markdown]);
  const active = useMemo(() => activeHeadingIndex(headings, activeLine), [headings, activeLine]);
  // The whole ancestor chain, not just the nearest heading — reading inside
  // "Key flows" under "Architecture" should show both, so the panel reads as a
  // position in the tree instead of one orphaned highlighted row.
  const path = useMemo(() => activeHeadingPath(headings, activeLine), [headings, activeLine]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // A heading link the note itself can use — the same `#slug` anchor the
  // preview generates for every heading.
  const copyLink = (event, heading) => {
    event.preventDefault();
    event.stopPropagation();
    void navigator.clipboard?.writeText(`[${heading.text}](#${heading.id})`);
  };

  // A short close delay keeps the panel up while the pointer crosses the gap
  // between the panel and the ticks.
  const show = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hide = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 140);
  };

  if (headings.length === 0) return null;

  const select = (heading) => {
    setOpen(false);
    onSelect?.(heading);
  };

  return (
    // The wrapper keeps `pointer-events-none` and carries the end padding, so
    // the interactive column stops short of the pane's scrollbar instead of
    // swallowing drags on it.
    <div className="pointer-events-none absolute inset-y-0 right-0 z-30 flex items-center justify-end pe-3">
      {open && (
        // An outline, not a menu: rows carry no fill and no hover highlight.
        // Colour and weight do all the work, so the panel reads as a list of
        // headings rather than a stack of buttons.
        <nav
          className="pointer-events-auto mr-1 max-h-[70vh] w-64 overflow-y-auto no-scrollbar rounded-xl border border-border bg-bg-sidebar/95 px-2.5 py-2 shadow-2xl backdrop-blur-md animate-fade-in"
          onMouseEnter={show}
          onMouseLeave={hide}
          aria-label="Document outline"
        >
          {headings.map((heading, i) => (
            <button
              key={`${heading.id}-${i}`}
              onClick={() => select(heading)}
              onContextMenu={(event) => copyLink(event, heading)}
              title={`${heading.text}\nRight-click to copy a link`}
              aria-current={i === active ? "location" : undefined}
              style={{ paddingInlineStart: `${indentPx(heading.level)}px` }}
              className={`block w-full truncate py-[3px] text-start text-[13px] transition-colors ${
                path.has(i)
                  ? "font-semibold text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {heading.text}
            </button>
          ))}
        </nav>
      )}

      <div
        className="pointer-events-auto flex flex-col items-end gap-[5px] py-3 ps-4"
        onMouseEnter={show}
        onMouseLeave={hide}
        aria-label="Document outline"
      >
        {headings.map((heading, i) => {
          // The heading you're actually in gets the accent; its ancestors stay
          // neutral but come up to full strength, so the rail shows the section
          // you're inside as well as the exact heading.
          const isActive = i === active;
          const onPath = path.has(i);

          return (
            <button
              key={`${heading.id}-${i}`}
              onClick={() => select(heading)}
              onContextMenu={(event) => copyLink(event, heading)}
              aria-label={`Go to ${heading.text}`}
              className="block rounded-full transition-all duration-150"
              style={{
                width: `${tickWidth(heading.level)}px`,
                height: isActive ? "2px" : "1px",
                background: isActive ? "var(--color-accent)" : "var(--color-text-muted)",
                opacity: isActive ? 1 : onPath ? 0.8 : 0.45,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

export default OutlineRail;
