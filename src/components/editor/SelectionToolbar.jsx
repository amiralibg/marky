import { useEffect, useRef, useState } from "react";
import useSettingsStore, { formatKeymap } from "../../store/settingsStore";

// Notion-style bubble toolbar — appears above the current text selection.
// Styling and spring motion follow the Marky "Vault" claude.ai/design.

const Icon = ({ path, strokeWidth = 2.1 }) => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {path}
  </svg>
);

const ACTIONS = [
  {
    id: "bold",
    title: "Bold",
    before: "**",
    after: "**",
    placeholder: "bold text",
    icon: <Icon path={<path d="M6 4h8a4 4 0 010 8H6zM6 12h9a4 4 0 010 8H6z" />} />,
  },
  {
    id: "italic",
    title: "Italic",
    before: "*",
    after: "*",
    placeholder: "italic text",
    icon: <Icon path={<path d="M19 4h-9M14 20H5M15 4L9 20" />} />,
  },
  {
    id: "strikethrough",
    title: "Strikethrough",
    before: "~~",
    after: "~~",
    placeholder: "text",
    icon: <Icon path={<path d="M5 12h14M16 7a4 4 0 00-8 0M8 17a4 4 0 008 0" />} />,
  },
  { divider: true },
  {
    id: "inlineCode",
    title: "Code",
    before: "`",
    after: "`",
    placeholder: "code",
    icon: <Icon path={<path d="M16 18l4-6-4-6M8 6l-4 6 4 6" />} />,
  },
  {
    id: "link",
    title: "Link",
    before: "[",
    after: "](https://)",
    placeholder: "link text",
    icon: (
      <Icon
        path={
          <path d="M10 13a5 5 0 007 0l2-2a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-2 2a5 5 0 007 7l1-1" />
        }
      />
    ),
  },
  {
    id: "image",
    title: "Image",
    before: "![",
    after: "](url)",
    placeholder: "alt text",
    icon: (
      <Icon
        path={
          <>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </>
        }
      />
    ),
  },
  { divider: true },
  {
    id: "h1",
    title: "Heading 1",
    before: "# ",
    after: "",
    placeholder: "Heading",
    icon: (
      <span className="text-[12px] font-semibold leading-none">
        H<sub className="text-[8px]">1</sub>
      </span>
    ),
  },
  {
    id: "h2",
    title: "Heading 2",
    before: "## ",
    after: "",
    placeholder: "Heading",
    icon: (
      <span className="text-[12px] font-semibold leading-none">
        H<sub className="text-[8px]">2</sub>
      </span>
    ),
  },
  {
    id: "h3",
    title: "Heading 3",
    before: "### ",
    after: "",
    placeholder: "Heading",
    icon: (
      <span className="text-[12px] font-semibold leading-none">
        H<sub className="text-[8px]">3</sub>
      </span>
    ),
  },
  { divider: true },
  {
    id: "bulletList",
    title: "Bullet list",
    before: "- ",
    after: "",
    placeholder: "item",
    icon: <Icon path={<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />} />,
  },
  {
    id: "numberedList",
    title: "Numbered list",
    before: "1. ",
    after: "",
    placeholder: "item",
    icon: (
      <Icon
        path={
          <path
            d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 14H4v.5a2 2 0 002 2H4"
            strokeWidth={1.8}
          />
        }
      />
    ),
  },
  {
    id: "quote",
    title: "Quote",
    before: "> ",
    after: "",
    placeholder: "Quote",
    icon: <Icon path={<path d="M6 17h3l2-4V7H5v6h2zM14 17h3l2-4V7h-6v6h2z" />} />,
  },
];

const GAP = 10;

const SelectionToolbar = ({ selection, onInsert }) => {
  const keymaps = useSettingsStore((state) => state.keymaps);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(420); // measured after mount
  const barRef = useRef(null);
  const hideTimer = useRef(null);

  // Measure the real toolbar width so we can clamp it inside the viewport
  // without clipping any buttons.
  useEffect(() => {
    if (barRef.current) setWidth(barRef.current.offsetWidth);
  });

  const active = selection && !selection.empty && selection.rect;

  // Keep the element mounted through the exit transition.
  useEffect(() => {
    if (active) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setMounted(true);
      // Next frame so the enter transition runs.
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    hideTimer.current = setTimeout(() => setMounted(false), 180);
    return () => hideTimer.current && clearTimeout(hideTimer.current);
  }, [active]);

  if (!mounted || !selection?.rect) return null;

  const rect = selection.rect;
  const centerX = (rect.left + rect.right) / 2;
  const half = width / 2;
  const left = Math.min(Math.max(centerX, half + 8), window.innerWidth - half - 8);
  // Prefer above the selection; flip below if there isn't room.
  const above = rect.top > 96;
  const top = above ? rect.top - GAP : rect.bottom + GAP;

  const getTitle = (a) => {
    const km = a.id && keymaps[a.id];
    return km ? `${a.title} — ${formatKeymap(km).join("+")}` : a.title;
  };

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label="Text formatting"
      className="fixed z-40 flex items-center gap-px rounded-[10px] border border-border bg-bg-editor p-[3px]"
      style={{
        left,
        top,
        transform: `translate(-50%, ${above ? "-100%" : "0"}) translateY(${
          visible ? "0" : above ? "6px" : "-6px"
        }) scale(${visible ? 1 : 0.97})`,
        opacity: visible ? 1 : 0,
        boxShadow: "0 10px 30px rgba(20,20,15,.16)",
        transition: "transform .2s cubic-bezier(.3,1.4,.5,1), opacity .16s ease",
        pointerEvents: visible ? "auto" : "none",
      }}
      // Keep the editor selection while clicking toolbar buttons.
      onMouseDown={(e) => e.preventDefault()}
    >
      {ACTIONS.map((a, i) =>
        a.divider ? (
          <span key={`d${i}`} className="mx-[5px] h-4 w-px bg-border" aria-hidden="true" />
        ) : (
          <button
            key={a.id}
            type="button"
            title={getTitle(a)}
            aria-label={a.title}
            onClick={() => onInsert(a.before, a.after, a.placeholder)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-overlay-subtle hover:text-text-primary"
          >
            {a.icon}
          </button>
        )
      )}
    </div>
  );
};

export default SelectionToolbar;
