export type FeatureId =
  | "local"
  | "wiki"
  | "editor"
  | "typeface"
  | "search"
  | "math"
  | "themes"
  | "templates"
  | "quiet"
  | "graph";

export type NoteTone = "butter" | "mint" | "sky" | "blush" | "lilac" | "cream";

export type Feature = {
  id: FeatureId;
  kicker: string;
  title: string;
  body: string;
  tone: NoteTone;
  /** Hand-pinned tilt in degrees. Fixed per note so it never jitters on rerender. */
  tilt: number;
};

export const FEATURES: Feature[] = [
  {
    id: "local",
    kicker: "01",
    title: "Open a folder, get a vault.",
    body: "Any directory on your machine will do. What lands in it are ordinary .md files, so you can keep them in git, in Dropbox, or on a USB stick and Marky will not mind either way.",
    tone: "cream",
    tilt: -1.8,
  },
  {
    id: "wiki",
    kicker: "02",
    title: "Link notes with [[brackets]].",
    body: "Type two brackets and pick from autocomplete. Every note lists what points back at it, with a line of surrounding text, and a link to a note you have not written yet will offer to create it.",
    tone: "butter",
    tilt: 1.4,
  },
  {
    id: "editor",
    kicker: "03",
    title: "Source, Live, Read.",
    body: "Three views of one note, and the next note opens in whichever you used last. Live and Read share a typeface, size and measure, so switching does not move the page. Vim keys, focus mode and RTL are all in there.",
    tone: "sky",
    tilt: -1.1,
  },
  {
    id: "typeface",
    kicker: "04",
    title: "Sans, serif or mixed.",
    body: "Hanken Grotesk, Newsreader, or sans body with serif headings. One setting covers Live and Read together, and Source always stays monospaced.",
    tone: "lilac",
    tilt: 1.6,
  },
  {
    id: "quiet",
    kicker: "05",
    title: "One bar, and then your note.",
    body: "Tabs, the view switch and the menu share the title bar. Scrollbars stay hidden until a pane is actually scrolling, and word count and reading time sit in a quiet status line.",
    tone: "mint",
    tilt: -1.4,
  },
  {
    id: "search",
    kicker: "06",
    title: "Fuzzy search that forgives you.",
    body: "Search runs over note names and note contents at once, so a half-remembered phrase is enough. Everything else in the app has a command palette entry.",
    tone: "blush",
    tilt: 2.0,
  },
  {
    id: "math",
    kicker: "07",
    title: "Mermaid, KaTeX, footnotes.",
    body: "Diagrams render, maths renders, code gets highlighted and footnotes number themselves. There is no plugin to go and install first.",
    tone: "mint",
    tilt: -1.5,
  },
  {
    id: "themes",
    kicker: "08",
    title: "Fifteen themes, nine accents.",
    body: "Vault, Paper, Slate, Nord, Gruvbox, Rosé Pine and more, each of them pairable with an accent colour. Keyboard shortcuts are yours to remap as well.",
    tone: "lilac",
    tilt: 1.7,
  },
  {
    id: "templates",
    kicker: "09",
    title: "Daily notes on a schedule.",
    body: "Write a template once and Marky opens the next note already filled in, daily, weekly or monthly. Today’s page is always one shortcut away.",
    tone: "butter",
    tilt: -2.1,
  },
];
