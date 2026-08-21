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
];

export const HOME = ROUTES[0];

export function findRoute(path: string): Route | null {
  return ROUTES.find((route) => route.path === path) ?? null;
}
