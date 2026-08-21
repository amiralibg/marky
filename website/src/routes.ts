/**
 * The site's pages, in one list.
 *
 * Deliberately free of React imports: vite.config.ts reads this to build the
 * sitemap, so it has to stay plain data. The path → component mapping lives in
 * src/pages/index.ts.
 *
 * Adding a page — say the feedback board — is three edits: a component in
 * src/pages, an entry here, and a line in the PAGES map.
 */
export type Route = {
  path: string;
  /** Shown in the primary nav and the command palette. Omit to keep it out. */
  nav?: string;
  title: string;
  description: string;
  /** Sitemap hints. */
  priority: string;
  changefreq: string;
};

export const ROUTES: Route[] = [
  {
    path: "/",
    title: "Marky — Offline-first Markdown notes for macOS, Windows and Linux",
    description:
      "A desktop Markdown editor that keeps your notes as plain files in a folder you choose. Wiki links, backlinks, graph view and MCP support. Free and open source.",
    priority: "1.0",
    changefreq: "weekly",
  },
  {
    path: "/changelog",
    nav: "Changelog",
    title: "Changelog — every Marky release",
    description:
      "What changed in each version of Marky, newest first: new features, fixes, and the MCP server's own releases. Read straight from the GitHub releases.",
    priority: "0.8",
    changefreq: "weekly",
  },
  {
    path: "/feedback",
    nav: "Feedback",
    title: "Feedback board — shape what Marky becomes",
    description:
      "Request features, report bugs, and vote on what matters. Every idea lands in front of the person who builds Marky.",
    priority: "0.7",
    changefreq: "daily",
  },
];

/**
 * Pages that exist but stay out of the sitemap and the nav — the moderation
 * panel. findRoute still resolves them so they get proper titles instead of
 * the not-found fallback.
 */
const UNLISTED_ROUTES: Route[] = [
  {
    path: "/admin",
    title: "Feedback admin — Marky",
    description: "Moderation panel for the Marky feedback board.",
    priority: "0.0",
    changefreq: "yearly",
  },
];

export const HOME = ROUTES[0];

export function findRoute(path: string): Route | null {
  return [...ROUTES, ...UNLISTED_ROUTES].find((route) => route.path === path) ?? null;
}
