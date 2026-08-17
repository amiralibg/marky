import { useEffect, useMemo, useRef, useState } from "react";
import { FEATURES, type FeatureId } from "./featureData";
import { FALLBACK_RELEASE_URL, GITHUB_REPO_URL } from "../lib/releases";
import type { Theme } from "../lib/theme";

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

export default function CommandPalette({
  open,
  onClose,
  onSelectFeature,
  onToggleTheme,
  theme,
}: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [index, setIndex] = useState(0);

  const items = useMemo<Item[]>(() => {
    const base: Item[] = [
      {
        id: "download",
        label: "Download Marky",
        hint: "Installers",
        run: () => document.getElementById("download")?.scrollIntoView({ behavior: "smooth" }),
      },
      {
        id: "graph-view",
        label: "See the vault as a graph",
        hint: "Graph",
        run: () => onSelectFeature("graph"),
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
    setQuery("");
    setIndex(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  if (!open) return null;

  const run = (item: Item) => {
    item.run();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[15vh]">
      <button
        type="button"
        className="absolute inset-0 bg-[rgb(28_27_24/0.38)]"
        aria-label="Close command palette"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-[560px] overflow-hidden rounded-md border border-line bg-surface"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setIndex((i) => Math.min(items.length - 1, i + 1));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setIndex((i) => Math.max(0, i - 1));
          }
          if (event.key === "Enter" && items[index]) run(items[index]);
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Jump to a feature, download, GitHub…"
          className="w-full border-b border-line bg-transparent px-5 py-4 text-[16px] outline-none placeholder:text-ink-faint"
        />
        <ul className="max-h-[320px] overflow-auto p-2">
          {items.length === 0 && (
            <li className="px-3 py-4 text-[14px] text-ink-faint">Nothing matches.</li>
          )}
          {items.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                onMouseEnter={() => setIndex(i)}
                onClick={() => run(item)}
                className={`flex w-full items-center justify-between rounded-sm px-3 py-2.5 text-left text-[14px] ${
                  i === index ? "bg-ink/[0.06]" : ""
                }`}
              >
                <span className="font-medium">{item.label}</span>
                <span className="font-mono text-[11px] text-ink-faint">{item.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
