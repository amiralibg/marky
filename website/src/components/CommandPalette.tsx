import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FEATURES, type FeatureId } from "./featureData";
import { FALLBACK_RELEASE_URL, GITHUB_REPO_URL } from "../lib/releases";
import type { Theme } from "../lib/theme";
import { scrollItemIntoView } from "../lib/scrollItemIntoView";

type Item = {
  id: string;
  label: string;
  hint: string;
  run: () => void;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSelectFeature: (id: FeatureId) => void;
  onToggleTheme: () => void;
  theme: Theme;
};

const scrollToId = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

export default function CommandPalette({
  open,
  onClose,
  onSelectFeature,
  onToggleTheme,
  theme,
}: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Where focus came from, so it can be handed back when the dialog closes.
  const restoreRef = useRef<HTMLElement | null>(null);
  const [index, setIndex] = useState(0);

  const items = useMemo<Item[]>(() => {
    const base: Item[] = [
      {
        id: "download",
        label: "Download Marky",
        hint: "Installers",
        run: () => scrollToId("download"),
      },
      {
        id: "graph-view",
        label: "See the vault as a graph",
        hint: "Graph",
        run: () => onSelectFeature("graph"),
      },
      {
        id: "mcp",
        label: "Connect Claude, Cursor, or ChatGPT",
        hint: "MCP",
        run: () => scrollToId("mcp"),
      },
      {
        id: "theme",
        label: theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
        hint: "Theme",
        run: () => onToggleTheme(),
      },
      {
        id: "github",
        label: "Open GitHub",
        hint: "Source",
        run: () => window.open(GITHUB_REPO_URL, "_blank", "noreferrer"),
      },
      {
        id: "releases",
        label: "Latest GitHub release",
        hint: "Assets",
        run: () => window.open(FALLBACK_RELEASE_URL, "_blank", "noreferrer"),
      },
      ...FEATURES.map((feature) => ({
        id: feature.id,
        label: feature.title,
        hint: "Feature",
        run: () => onSelectFeature(feature.id),
      })),
    ];
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((item) => `${item.label} ${item.hint}`.toLowerCase().includes(q));
  }, [onSelectFeature, onToggleTheme, query, theme]);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setIndex(0);
    // preventScroll: html has scroll-behavior: smooth, so focusing an input
    // inside a fixed overlay otherwise glides the page behind it.
    const t = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 20);
    // The page behind a modal should not be reachable by screen readers or Tab.
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");
    // Freeze the page underneath. body is the element whose overflow the UA
    // propagates to the viewport here, so overflow-y on it is the page lock;
    // overflow-x stays on the stylesheet's `clip`, which the sticky header
    // needs. Pad for the scrollbar the lock removes so the layout does not jump
    // sideways as the palette opens.
    const { body } = document;
    const previousOverflowY = body.style.overflowY;
    const previousPadding = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflowY = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    return () => {
      window.clearTimeout(t);
      root?.removeAttribute("inert");
      body.style.overflowY = previousOverflowY;
      body.style.paddingRight = previousPadding;
      restoreRef.current?.focus?.({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  // Keep the highlighted row visible when arrowing past the fold, scrolling the
  // list itself rather than every scrollable ancestor up to the document.
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    scrollItemIntoView(list, list?.querySelector(`[data-index="${index}"]`) ?? null);
  }, [index, open]);

  if (!open) return null;

  const run = (item: Item) => {
    item.run();
    onClose();
  };

  const activeId = items[index] ? `command-option-${items[index].id}` : undefined;

  // Rendered into <body> rather than in place: the effect above marks #root
  // inert while the palette is open, and the palette lives inside #root, so
  // in place it would make *itself* inert — unfocusable and unclickable.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pb-6 pt-[15vh]">
      {/* Not a <button>: a full-screen button lands in the tab order and is
          announced ahead of the dialog. Escape and the close handler cover
          keyboard users. */}
      <div className="absolute inset-0 bg-[rgb(28_27_24/0.38)]" onClick={onClose} aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative flex max-h-full w-full max-w-[560px] flex-col overflow-hidden rounded-md border border-line bg-surface"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setIndex((i) => (items.length ? (i + 1) % items.length : 0));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setIndex((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
          }
          if (event.key === "Enter" && items[index]) run(items[index]);
          // Only the input and the close affordance are focusable, so keep Tab
          // inside the dialog rather than letting it escape to the page.
          if (event.key === "Tab") {
            event.preventDefault();
            inputRef.current?.focus({ preventScroll: true });
          }
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Jump to a feature, download, GitHub…"
          className="w-full shrink-0 border-b border-line bg-transparent px-5 py-4 text-[16px] outline-none placeholder:text-ink-faint"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-listbox"
          aria-activedescendant={activeId}
          aria-autocomplete="list"
        />
        <ul
          ref={listRef}
          id="command-listbox"
          role="listbox"
          aria-label="Commands"
          className="max-h-[320px] flex-1 overflow-auto overscroll-contain p-2"
        >
          {items.length === 0 && (
            <li className="px-3 py-4 text-[14px] text-ink-faint">Nothing matches.</li>
          )}
          {items.map((item, i) => (
            <li
              key={item.id}
              id={`command-option-${item.id}`}
              role="option"
              aria-selected={i === index}
              data-index={i}
              onMouseEnter={() => setIndex(i)}
              onClick={() => run(item)}
              className={`flex w-full cursor-pointer items-center justify-between rounded-sm px-3 py-2.5 text-left text-[14px] ${
                i === index ? "bg-ink/[0.06]" : ""
              }`}
            >
              <span className="font-medium">{item.label}</span>
              <span className="font-mono text-[11px] text-ink-faint">{item.hint}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body
  );
}
