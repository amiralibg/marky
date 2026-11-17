export type FeatureId =
  | "local"
  | "wiki"
  | "editor"
  | "home"
  | "html"
  | "typeface"
  | "search"
  | "math"
  | "themes"
  | "templates"
  | "quiet"
  | "translucent"
  | "graph";

export type Feature = {
  id: FeatureId;
  kicker: string;
  title: string;
  body: string;
  /** Shipped in the current release, so the card carries a "New" badge. */
  isNew?: boolean;
};

export const FEATURES: Feature[] = [
  {
    id: "local",
    kicker: "01",
    title: "Open a folder, get a vault.",
    body: "Any directory on your machine will do. What lands in it are ordinary .md files, so you can keep them in git, in Dropbox, or on a USB stick and Marky will not mind either way.",
  },
  {
    id: "wiki",
    kicker: "02",
    title: "Link notes with [[brackets]].",
    body: "Type two brackets and pick from autocomplete. Every note lists what points back at it, with a line of surrounding text, and a link to a note you have not written yet will offer to create it.",
  },
  {
    id: "editor",
    kicker: "03",
    title: "Source, Live, Read.",
    body: "Three views of one note, and the next note opens in whichever you used last. Live and Read share a typeface, size and measure, so switching does not move the page. Vim keys, focus mode and RTL are all in there.",
  },
  {
    id: "home",
    kicker: "04",
    title: "A Home for the vault.",
    body: "Your vault opens on a library of folders and notes, each drawn as a small preview of what is inside. Recent and pinned notes sit beside it, with upcoming and recurring notes below.",
    isNew: true,
  },
  {
    id: "html",
    kicker: "05",
    title: "HTML beside your Markdown.",
    body: "An .html file in the vault opens in a tab like any note. Read it as it renders, edit its text in place, or edit the source. It runs sandboxed and can only load the files next to it.",
    isNew: true,
  },
  {
    id: "typeface",
    kicker: "06",
    title: "Sans, serif or mixed.",
    body: "Hanken Grotesk, Newsreader, or sans body with serif headings. One setting covers Live and Read together, and Source always stays monospaced.",
  },
  {
    id: "quiet",
    kicker: "07",
    title: "One bar, and then your note.",
    body: "Tabs, the view switch and the menu share the title bar. There are no scrollbars anywhere, and word count and reading time sit in a quiet status line.",
  },
  {
    id: "translucent",
    kicker: "08",
    title: "Let the desktop show through.",
    body: "Turn on the translucent window and your wallpaper shows softly blurred behind the sidebar and title bar, on macOS and Windows. Notes always stay on an opaque page.",
    isNew: true,
  },
  {
    id: "search",
    kicker: "09",
    title: "Fuzzy search that forgives you.",
    body: "Search runs over note names and note contents at once, so a half-remembered phrase is enough. Everything else in the app has a command palette entry.",
  },
  {
    id: "math",
    kicker: "10",
    title: "Mermaid, KaTeX, footnotes.",
    body: "Diagrams render, maths renders, code gets highlighted and footnotes number themselves. There is no plugin to go and install first.",
  },
  {
    id: "themes",
    kicker: "11",
    title: "Sixteen themes, nine accents.",
    body: "Vault, Paper, Black, Nord, Gruvbox, Catppuccin, Rosé Pine and more, each of them pairable with an accent colour. Keyboard shortcuts are yours to remap as well.",
  },
  {
    id: "templates",
    kicker: "12",
    title: "Daily notes on a schedule.",
    body: "Write a template once and Marky opens the next note already filled in, daily, weekly or monthly. Today’s page is always one shortcut away.",
  },
];
