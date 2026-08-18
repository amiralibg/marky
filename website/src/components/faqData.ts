/**
 * The one source of truth for the FAQ.
 *
 * Three things are generated from this list: the visible <details> section, the
 * FAQPage JSON-LD, and the noscript mirror — the last two injected at build time
 * by the seo() plugin in vite.config.ts. Google requires the schema answer to
 * match the answer a visitor actually sees, and the only reliable way to keep
 * two copies identical is to not have two copies.
 *
 * Answers are plain prose. A `backticked` span renders as <code> on the page and
 * is flattened back to bare text for the schema, so the markup never leaks into
 * a search result.
 */
export type FaqItem = {
  q: string;
  a: string;
};

export const FAQ: FaqItem[] = [
  {
    q: "Where are my notes actually stored?",
    a: "In whichever folder you point Marky at. They stay ordinary `.md` files with ordinary names — nothing is copied into an app database or a proprietary format, so the same folder opens in any other editor, and it is still readable if Marky disappears tomorrow.",
  },
  {
    q: "Do I need an account or a subscription?",
    a: "Neither. There is no sign-up, no licence key and no paid tier. Marky is free and MIT licensed, and the full source is on GitHub.",
  },
  {
    q: "Can Marky sync between my machines?",
    a: "There is no sync service built into Marky. Because a vault is only a folder, the usual answer is to put it somewhere that already syncs — git, Dropbox, iCloud Drive or Syncthing all work. Marky watches the folder while it runs, so a note changed by another editor or pulled down by git appears without a restart.",
  },
  {
    q: "Do my notes ever leave my machine?",
    a: "The notes themselves, no. There is no account, no sync server and no analytics or telemetry of any kind in the app. Two things do reach the network, and both are worth being precise about: Marky asks GitHub whether a newer release exists so it can offer you the update, and the download buttons on this page read the GitHub releases API. Neither one sends anything about your notes.",
  },
  {
    q: "Which platforms does it run on?",
    a: "macOS, Windows and Linux, each on both ARM64 and AMD64 — so Apple Silicon and Intel Macs are both native. Linux gets `.deb` and `.rpm` packages plus a portable AppImage. Every installer comes in under 10 MB.",
  },
  {
    q: "How do AI assistants read my notes?",
    a: "Marky ships an MCP server, so Claude Code, Claude Desktop, Cursor, Zed and ChatGPT can search the vault, read a note with its tags and backlinks, write new notes and append to daily logs. It runs locally over stdio rather than through a hosted API, and starting it with `--read-only` limits the assistant to reading.",
  },
  {
    q: "Can I open notes I wrote in another Markdown app?",
    a: "Yes — point Marky at the folder. It reads plain Markdown and uses the ordinary `[[Note]]` wiki-link syntax, so vaults from other wiki-style editors generally open as they are. What it will not pick up is another app's plugins or its private settings folder.",
  },
  {
    q: "What renders beyond plain Markdown?",
    a: "Mermaid diagrams, KaTeX maths, footnotes and syntax-highlighted code blocks, none of which need a plugin installed first. A note exports as Markdown or HTML, and the whole workspace exports as a ZIP with its settings.",
  },
];

/** Strips the backtick spans for anywhere that needs bare prose (schema, noscript). */
export const plainAnswer = (a: string) => a.replace(/`/g, "");
