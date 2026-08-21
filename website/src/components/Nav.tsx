import { Command, Menu, Moon, Sun, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GITHUB_REPO_URL } from "../lib/releases";
import { Link } from "../lib/router";
import type { Theme } from "../lib/theme";
import { ROUTES } from "../routes";

type Props = {
  onOpenPalette: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  /** Current route, so the page you are on is marked in the bar. */
  path: string;
};

type NavLink = {
  href: string;
  label: string;
  /** Hidden below lg, where the bar plus the search button runs out of room. */
  wide?: boolean;
  external?: boolean;
  /** A page of its own rather than a section of the home page. */
  page?: boolean;
};

/**
 * Section links are written against `/` rather than as bare fragments, so they
 * work from the changelog — and from any page added later — by taking you home
 * and then to the section. The Download button on the right is the only
 * download affordance the bar needs, so there is no text link for it.
 */
const LINKS: NavLink[] = [
  { href: "/#features", label: "Features" },
  { href: "/#screenshots", label: "Screens", wide: true },
  { href: "/#graph", label: "Graph", wide: true },
  { href: "/#mcp", label: "MCP" },
  { href: "/#faq", label: "FAQ", wide: true },
  ...ROUTES.filter((route) => route.nav).map((route) => ({
    href: route.path,
    label: route.nav!,
    page: true,
  })),
  { href: GITHUB_REPO_URL, label: "GitHub", external: true, wide: true },
];

export default function Nav({ onOpenPalette, theme, onToggleTheme, path }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Rotating the phone into landscape crosses the sm breakpoint and reveals the
  // full bar; the panel has to stand down with it or it hangs over the page.
  useEffect(() => {
    if (!menuOpen) return;
    const wide = window.matchMedia("(min-width: 640px)");
    const close = () => setMenuOpen(false);
    wide.addEventListener("change", close);

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);

    // Freeze the page under the panel. overflow-Y only — the stylesheet's
    // `overflow-x: clip` on body is what keeps this header sticky.
    const { body } = document;
    const previous = body.style.overflowY;
    body.style.overflowY = "hidden";
    return () => {
      wide.removeEventListener("change", close);
      document.removeEventListener("keydown", onKey);
      body.style.overflowY = previous;
    };
  }, [menuOpen]);

  const active = (link: NavLink) => link.page && link.href === path;

  const linkClass = (link: NavLink) =>
    `rounded-sm px-3 py-2 text-[14px] font-medium transition-colors duration-200 hover:text-ink xl:px-4 ${
      active(link) ? "text-ink" : "text-ink/70"
    } ${link.wide ? "hidden lg:inline" : ""}`;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-6 md:px-10">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/icon.png" alt="" width={28} height={28} className="rounded-sm" />
          <span className="text-[15px] font-semibold tracking-[-0.02em]">Marky</span>
        </Link>

        <nav className="hidden items-center gap-1 sm:flex" aria-label="Primary">
          {LINKS.map((link) =>
            link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className={linkClass(link)}
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href}
                to={link.href}
                aria-current={active(link) ? "page" : undefined}
                className={linkClass(link)}
              >
                {link.label}
              </Link>
            )
          )}
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
          <Link
            to="/#download"
            className="btn-accent inline-flex h-9 items-center rounded-sm px-4 text-[14px] font-medium"
          >
            Download
          </Link>
          {/* Below sm the primary nav is hidden entirely, so this is the only
              way to reach anything but the home page. */}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-line bg-surface text-ink/70 transition-colors duration-200 hover:text-ink sm:hidden"
          >
            {menuOpen ? (
              <X size={17} strokeWidth={2} aria-hidden />
            ) : (
              <Menu size={17} strokeWidth={2} aria-hidden />
            )}
          </button>
        </div>
      </div>

      {menuOpen && (
        <>
          {/* Portalled to <body> on purpose. The header carries backdrop-blur,
              which makes it a containing block for fixed-position descendants —
              a `fixed` backdrop rendered inside it resolves against the 64px
              bar instead of the viewport and collapses to nothing. */}
          {createPortal(
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              onClick={() => setMenuOpen(false)}
              className="menu-backdrop fixed inset-x-0 bottom-0 top-16 z-30 cursor-default bg-dusk/40 backdrop-blur-[2px] sm:hidden"
            />,
            document.body
          )}
          {/* The panel itself stays in the header: `absolute` resolves against
              it correctly, and Tab order runs button → panel for free. */}
          <nav
            id="mobile-menu"
            aria-label="Primary"
            className="menu-drop absolute inset-x-0 top-full z-40 max-h-[calc(100vh-4rem)] overflow-y-auto overscroll-contain border-b border-line bg-canvas px-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_16px_32px_-16px_rgb(28_27_24/0.35)] sm:hidden"
          >
            <ul className="divide-y divide-line">
              {LINKS.map((link) => (
                <li key={link.href}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setMenuOpen(false)}
                      className="flex min-h-12 items-center justify-between py-3 text-[16px] font-medium text-ink/80"
                    >
                      {link.label}
                      <span aria-hidden className="font-mono text-[12px] text-ink-faint">
                        ↗
                      </span>
                    </a>
                  ) : (
                    <Link
                      to={link.href}
                      onClick={() => setMenuOpen(false)}
                      aria-current={active(link) ? "page" : undefined}
                      className={`flex min-h-12 items-center py-3 text-[16px] font-medium ${
                        active(link) ? "text-ink" : "text-ink/80"
                      }`}
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}
    </header>
  );
}
