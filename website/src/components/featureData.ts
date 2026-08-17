export type FeatureId =
  | "local"
  | "wiki"
  | "editor"
  | "search"
  | "math"
  | "themes"
  | "templates"
  | "graph";

export type Feature = {
  id: FeatureId;
  kicker: string;
  title: string;
  body: string;
  tone: "paper" | "marigold" | "moss" | "dusk" | "sky";
};

export const FEATURES: Feature[] = [
  {
    id: "local",
    kicker: "01",
    title: "Your folder is the database.",
    body: "Open any local directory. Notes are ordinary Markdown files — git them, sync them, or leave them on a USB stick.",
    tone: "paper",
  },
  {
    id: "wiki",
    kicker: "02",
    title: "[[Wiki links]] that actually go somewhere.",
    body: "Autocomplete, backlinks with context, and a flow to create the missing note without leaving the editor.",
    tone: "marigold",
  },
  {
    id: "editor",
    kicker: "03",
    title: "Write, or read. One page.",
    body: "CodeMirror 6 with a live editor and a reading view — not a split pane. Vim mode, focus mode, RTL, and a table of contents.",
    tone: "sky",
  },
  {
    id: "search",
    kicker: "04",
    title: "Find it before you remember the title.",
    body: "Global fuzzy search across names and contents, plus a command palette for every action.",
    tone: "paper",
  },
  {
    id: "math",
    kicker: "05",
    title: "Mermaid, KaTeX, footnotes.",
    body: "Diagrams, math, highlighted code, and the Markdown extras you already write in other tools.",
    tone: "moss",
  },
  {
    id: "themes",
    kicker: "06",
    title: "Quiet chrome. Loud ink.",
    body: "Vault, Paper, Slate, Midnight, Gruvbox — plus accent colors and remappable shortcuts.",
    tone: "paper",
  },
  {
    id: "templates",
    kicker: "07",
    title: "Daily notes on a schedule.",
    body: "Templates and recurring notes (daily, weekly, monthly) so the next page is already waiting.",
    tone: "marigold",
  },
];
