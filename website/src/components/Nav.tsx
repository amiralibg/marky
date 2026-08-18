import { Command, Moon, Sun } from "lucide-react";
import { GITHUB_REPO_URL } from "../lib/releases";
import type { Theme } from "../lib/theme";

type Props = {
  onOpenPalette: () => void;
  theme: Theme;
  onToggleTheme: () => void;
};

type NavLink = {
  href: string;
  label: string;
  /** Hidden below lg, where the bar plus the search button runs out of room. */
  wide?: boolean;
  external?: boolean;
};

const LINKS: NavLink[] = [
  { href: "#features", label: "Features" },
  { href: "#screenshots", label: "Screens", wide: true },
  { href: "#graph", label: "Graph", wide: true },
  { href: "#mcp", label: "MCP" },
  { href: "#download", label: "Download" },
  { href: "#faq", label: "FAQ", wide: true },
  { href: GITHUB_REPO_URL, label: "GitHub", external: true, wide: true },
];

export default function Nav({ onOpenPalette, theme, onToggleTheme }: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-6 md:px-10">
        <a href="#top" className="flex items-center gap-2.5">
          <img src="/icon.png" alt="" width={28} height={28} className="rounded-sm" />
          <span className="text-[15px] font-semibold tracking-[-0.02em]">Marky</span>
        </a>

        <nav className="hidden items-center gap-1 sm:flex" aria-label="Primary">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              {...(link.external ? { target: "_blank", rel: "noreferrer" } : {})}
              className={`rounded-sm px-3 py-2 text-[14px] font-medium text-ink/70 transition-colors duration-200 hover:text-ink sm:px-4 ${
                link.wide ? "hidden lg:inline" : ""
              }`}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-line bg-surface text-ink/70 transition-colors duration-200 hover:text-ink"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? (
              <Sun size={16} strokeWidth={2} />
            ) : (
              <Moon size={16} strokeWidth={2} />
            )}
          </button>
          {/* Keyboard-only affordance: hidden below sm, where there is no ⌘K to
              press and the extra control pushed the header past the viewport. */}
          <button
            type="button"
            onClick={onOpenPalette}
            className="hidden h-9 items-center gap-2 rounded-sm border border-line bg-surface px-2.5 text-[12px] text-ink/70 transition-colors duration-200 hover:text-ink sm:inline-flex"
            aria-label="Open command palette"
          >
            <Command size={13} strokeWidth={2} />
            <span>Search</span>
            <kbd className="rounded-sm bg-ink/[0.06] px-1.5 py-0.5 font-mono text-[11px]">⌘K</kbd>
          </button>
          <a
            href="#download"
            className="btn-accent inline-flex h-9 items-center rounded-sm px-4 text-[14px] font-medium"
          >
            Download
          </a>
        </div>
      </div>
    </header>
  );
}
