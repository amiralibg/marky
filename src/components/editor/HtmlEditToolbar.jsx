import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BLOCK_STYLES, blockLabel, isAcceptableHref } from "../../utils/htmlFrameMessages";

/**
 * The frosted formatting bar for editing an HTML document in place.
 *
 * It lives in the app, not in the document's frame — Marky's chrome must not
 * be styled by the document, and the document must not be styled by Marky —
 * and floats over the frame at the selection the frame reports. Buttons keep
 * focus in the frame (mousedown is cancelled) and send commands to it.
 *
 * Block style, bold, italic, link: the mockup's `.etool`.
 */

const GAP = 10;
const keepFocus = (event) => event.preventDefault();

const Chevron = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="h-3 w-3"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const LinkGlyph = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="h-4 w-4"
  >
    <path d="M14 4.5h5.5V10M19.5 4.5 11 13M17.5 14v4a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V8A1.5 1.5 0 0 1 6 6.5h4" />
  </svg>
);

const buttonClass = (on) =>
  `grid h-7 min-w-7 place-items-center rounded-[calc(var(--radius-control)-2px)] px-1 text-[13px] transition-colors ${
    on
      ? "bg-item-hover text-text-primary"
      : "text-text-secondary hover:bg-item-hover hover:text-text-primary"
  }`;

/**
 * @param {object} props
 * @param {object|null} props.selection  What the frame last reported (frame coordinates).
 * @param {{ top: number, left: number, width: number }|null} props.frameBox  The frame's box in the container.
 * @param {(name: string, value?: string) => void} props.onCommand
 * @param {boolean} props.linkRequested  The frame asked for the link field (⌘K).
 * @param {() => void} props.onLinkRequestHandled
 */
const HtmlEditToolbar = ({
  selection,
  frameBox,
  onCommand,
  linkRequested,
  onLinkRequestHandled,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("");
  const [width, setWidth] = useState(220);
  const barRef = useRef(null);
  const inputRef = useRef(null);

  const active = Boolean(selection?.active && selection.rect && frameBox);

  useLayoutEffect(() => {
    if (barRef.current) setWidth(barRef.current.offsetWidth);
  });

  useEffect(() => {
    if (!active) {
      setMenuOpen(false);
      setLinkOpen(false);
    }
  }, [active]);

  useEffect(() => {
    if (!linkRequested) return;
    onLinkRequestHandled?.();
    if (!active) return;
    setHref(selection?.link || "");
    setLinkOpen(true);
    setMenuOpen(false);
  }, [linkRequested, active, selection?.link, onLinkRequestHandled]);

  useEffect(() => {
    if (linkOpen) inputRef.current?.focus();
  }, [linkOpen]);

  if (!active) return null;

  // Above the selection when there is one, otherwise above the block with
  // the caret; kept inside the frame horizontally, flipped below when the
  // block starts at the very top.
  const anchor = selection.collapsed ? selection.blockRect || selection.rect : selection.rect;
  const rawLeft = frameBox.left + anchor.left;
  const left = Math.max(
    frameBox.left + 8,
    Math.min(rawLeft, frameBox.left + frameBox.width - width - 8)
  );
  const above = anchor.top > 56;
  const top = above ? frameBox.top + anchor.top - GAP : frameBox.top + anchor.bottom + GAP;

  const applyLink = (event) => {
    event.preventDefault();
    if (!isAcceptableHref(href)) return;
    onCommand("link", href.trim());
    setLinkOpen(false);
  };

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label="Text formatting"
      className="glass-panel absolute z-30 flex items-center gap-0.5 rounded-card p-1 font-sans text-text-primary animate-fade-in"
      style={{ left, top, transform: above ? "translateY(-100%)" : undefined }}
      onMouseDown={linkOpen ? undefined : keepFocus}
    >
      {linkOpen ? (
        <form className="flex items-center gap-1" onSubmit={applyLink}>
          <input
            ref={inputRef}
            type="text"
            value={href}
            onChange={(event) => setHref(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setLinkOpen(false);
              }
            }}
            placeholder="https://"
            aria-label="Link address"
            aria-invalid={href !== "" && !isAcceptableHref(href)}
            className="field h-7 w-56 text-[12.5px]"
          />
          <button type="submit" className={buttonClass(false)} disabled={!isAcceptableHref(href)}>
            <span className="px-1.5 font-semibold">Apply</span>
          </button>
          {selection.link && (
            <button
              type="button"
              className={buttonClass(false)}
              onClick={() => {
                onCommand("unlink");
                setLinkOpen(false);
              }}
            >
              <span className="px-1.5">Remove</span>
            </button>
          )}
        </form>
      ) : (
        <>
          <div className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`Block style: ${blockLabel(selection.tag)}`}
              disabled={!selection.styleable}
              onClick={() => setMenuOpen((open) => !open)}
              className={`flex h-7 items-center gap-1 rounded-[calc(var(--radius-control)-2px)] px-2 text-[13px] font-[550] text-text-primary transition-colors ${
                selection.styleable ? "hover:bg-item-hover" : "opacity-70"
              }`}
            >
              {blockLabel(selection.tag)}
              {selection.styleable && <Chevron />}
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="glass-panel absolute start-0 top-full z-40 mt-2 w-44 rounded-card p-1.5"
              >
                {BLOCK_STYLES.map((style) => (
                  <button
                    key={style.tag}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selection.tag === style.tag}
                    className="menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      onCommand("block", style.tag);
                    }}
                  >
                    {style.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="mx-0.5 h-4 w-px bg-border-light" aria-hidden="true" />
          <button
            type="button"
            aria-label="Bold"
            aria-pressed={Boolean(selection.bold)}
            className={buttonClass(selection.bold)}
            onClick={() => onCommand("bold")}
          >
            <b>B</b>
          </button>
          <button
            type="button"
            aria-label="Italic"
            aria-pressed={Boolean(selection.italic)}
            className={buttonClass(selection.italic)}
            onClick={() => onCommand("italic")}
          >
            <i className="font-serif">I</i>
          </button>
          <button
            type="button"
            aria-label="Link"
            aria-pressed={Boolean(selection.link)}
            className={buttonClass(Boolean(selection.link))}
            onClick={() => {
              setHref(selection.link || "");
              setLinkOpen(true);
              setMenuOpen(false);
            }}
          >
            <LinkGlyph />
          </button>
        </>
      )}
    </div>
  );
};

export default HtmlEditToolbar;
