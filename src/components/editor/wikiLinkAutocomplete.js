import { autocompletion } from "@codemirror/autocomplete";

// "/" slash commands — insert markdown blocks by name, so users who don't know
// the syntax can still add headings, lists, code, etc. Each row shows an icon,
// a name + one-line description, and the underlying markdown as a syntax hint.
// `md` is the text inserted; `caret` is where the cursor lands (defaults to end).
const SLASH_BLOCKS = [
  { key: "h1", label: "Heading 1", desc: "Big section title", md: "# ", detail: "#" },
  { key: "h2", label: "Heading 2", desc: "Medium section title", md: "## ", detail: "##" },
  { key: "h3", label: "Heading 3", desc: "Small section title", md: "### ", detail: "###" },
  {
    key: "bullet",
    label: "Bullet list",
    desc: "A simple bulleted list",
    md: "- ",
    detail: "-",
    aliases: ["ul", "list"],
  },
  {
    key: "number",
    label: "Numbered list",
    desc: "An ordered list",
    md: "1. ",
    detail: "1.",
    aliases: ["ol", "ordered"],
  },
  {
    key: "task",
    label: "To-do list",
    desc: "Track tasks with checkboxes",
    md: "- [ ] ",
    detail: "- [ ]",
    aliases: ["todo", "check"],
  },
  {
    key: "quote",
    label: "Quote",
    desc: "Capture a quotation",
    md: "> ",
    detail: ">",
    aliases: ["blockquote"],
  },
  {
    key: "code",
    label: "Code block",
    desc: "A fenced code snippet",
    md: "```\n\n```",
    caret: 4, // inside the fences
    detail: "```",
    aliases: ["codeblock", "fence"],
  },
  {
    key: "divider",
    label: "Divider",
    desc: "A horizontal rule",
    md: "---\n",
    detail: "---",
    aliases: ["hr", "rule"],
  },
  {
    key: "table",
    label: "Table",
    desc: "A simple 2×2 table",
    md: "| Column | Column |\n| --- | --- |\n| Cell | Cell |\n",
    detail: "| … |",
  },
];

// lucide-style icons rendered inside each block row's tile.
const svg = (inner) =>
  `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const heading = (n) =>
  `<svg viewBox="0 0 24 24" width="16" height="16"><text x="12" y="16.5" font-size="12" font-weight="700" fill="currentColor" text-anchor="middle" font-family="'Hanken Grotesk',sans-serif">H${n}</text></svg>`;

const SLASH_ICONS = {
  h1: heading(1),
  h2: heading(2),
  h3: heading(3),
  bullet: svg('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'),
  number: svg(
    '<path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 14H4v.5a1.5 1.5 0 0 0 1.5 1.5H4"/>'
  ),
  task: svg(
    '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12l2.2 2.2L15.5 9.5"/>'
  ),
  quote: svg('<path d="M6 17h3l2-4V7H5v6h2zM14 17h3l2-4V7h-6v6h2z"/>'),
  code: svg('<path d="M16 18l4-6-4-6M8 6l-4 6 4 6"/>'),
  divider: svg('<path d="M4 12h16"/><path d="M8 7h8M8 17h8" opacity=".4"/>'),
  table: svg(
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>'
  ),
};

// Builds the leading icon tile for a block row. Returns null for non-block
// completions (wiki links / tags) so their rows stay plain.
export function renderSlashIcon(completion) {
  if (!completion.iconKey) return null;
  const tile = document.createElement("span");
  tile.className = "cm-slash-tile";
  tile.innerHTML = SLASH_ICONS[completion.iconKey] || "";
  return tile;
}

// Adds the one-line description next to a block name.
export function renderSlashDesc(completion) {
  if (!completion.blockDesc) return null;
  const el = document.createElement("span");
  el.className = "cm-slash-desc";
  el.textContent = completion.blockDesc;
  return el;
}

export function slashCommands(context) {
  const { state, pos } = context;
  const line = state.doc.lineAt(pos);
  const before = state.sliceDoc(line.from, pos);
  // Only when "/" begins the line (optionally after whitespace) and nothing else yet.
  const match = /^(\s*)\/(\w*)$/.exec(before);
  if (!match) return null;

  // Anchor completion AFTER the "/" so the query (e.g. "he" in "/he") is what
  // CodeMirror filters on — anchoring at the "/" would filter labels by "/"
  // and match nothing. `apply` deletes the leading "/" for us.
  const from = line.from + match[1].length + 1;

  const options = SLASH_BLOCKS.map((b) => ({
    label: b.label,
    detail: b.detail,
    // Carried through to the custom renderers / CSS.
    iconKey: b.key,
    blockDesc: b.desc,
    boost: 0,
    apply: (view, completion, applyFrom, applyTo) => {
      const slashPos = applyFrom - 1; // the "/" sits right before the query
      const caret = b.caret !== undefined ? slashPos + b.caret : slashPos + b.md.length;
      view.dispatch({
        changes: { from: slashPos, to: applyTo, insert: b.md },
        selection: { anchor: caret },
        scrollIntoView: true,
      });
      view.focus();
    },
  }));

  return { from, options, validFor: /^\w*$/ };
}

/**
 * Creates a wiki link autocomplete extension for CodeMirror
 * Triggers when typing [[ and shows available notes as completions
 *
 * @param {Function} getNotes - Function that returns array of notes with {id, name} properties
 * @param {Function} getTags - Function that returns tags (array of strings or {tag} objects)
 * @returns {Extension} CodeMirror extension
 */
export function createWikiLinkAutocomplete(getNotes, getTags = () => []) {
  const wikiLinkCompletions = (context) => {
    const { state, pos } = context;
    const textBefore = state.sliceDoc(Math.max(0, pos - 100), pos);

    // Check if we're inside a wiki link by looking for [[
    const openBracketMatch = /\[\[([^\]]*)$/.exec(textBefore);

    if (!openBracketMatch) {
      return null;
    }

    // Get the partial text after [[
    const searchText = openBracketMatch[1];
    const from = pos - searchText.length;

    // Get all available notes
    const notes = getNotes();

    if (!notes || notes.length === 0) {
      return null;
    }

    // Filter and create completion options
    const options = notes
      .filter((note) => {
        if (!searchText) return true;
        return note.name.toLowerCase().includes(searchText.toLowerCase());
      })
      .map((note) => ({
        label: note.name,
        type: "text",
        apply: (view, completion, from, to) => {
          // Check if we need to add closing brackets
          const textAfter = view.state.sliceDoc(to, to + 2);
          const needsClosing = !textAfter.startsWith("]]");

          const insertText = note.name + (needsClosing ? "]]" : "");

          view.dispatch({
            changes: { from, to, insert: insertText },
            selection: { anchor: from + insertText.length },
          });
        },
        detail: note.filePath ? "Note" : "New",
        info: note.filePath || "Press Enter to insert",
      }))
      .slice(0, 20); // Limit to 20 results for performance

    if (options.length === 0) {
      return null;
    }

    return {
      from,
      options,
      validFor: /^[^\]]*$/,
    };
  };

  const tagCompletions = (context) => {
    const { state, pos } = context;
    const textBefore = state.sliceDoc(Math.max(0, pos - 80), pos);

    // Trigger on hashtags but avoid markdown headings (line start # / ## ...)
    const tagMatch = /(?:^|[\s(])#([a-zA-Z0-9_-]*)$/.exec(textBefore);
    if (!tagMatch) return null;

    const searchText = tagMatch[1] || "";
    const from = pos - searchText.length;

    const rawTags = getTags() || [];
    const tags = rawTags
      .map((entry) => (typeof entry === "string" ? entry : entry?.tag))
      .filter(Boolean);

    if (tags.length === 0) return null;

    const uniqueSortedTags = Array.from(new Set(tags.map((t) => t.toLowerCase()))).sort((a, b) =>
      a.localeCompare(b)
    );

    const options = uniqueSortedTags
      .filter((tag) => !searchText || tag.includes(searchText.toLowerCase()))
      .slice(0, 20)
      .map((tag) => ({
        label: tag,
        type: "keyword",
        detail: "Tag",
        apply: (view, completion, applyFrom, applyTo) => {
          view.dispatch({
            changes: { from: applyFrom, to: applyTo, insert: tag },
            selection: { anchor: applyFrom + tag.length },
          });
        },
      }));

    if (options.length === 0) return null;

    return {
      from,
      options,
      validFor: /^[a-zA-Z0-9_-]*$/,
    };
  };

  return autocompletion({
    override: [slashCommands, wikiLinkCompletions, tagCompletions],
    activateOnTyping: true,
    closeOnBlur: true,
    defaultKeymap: true,
    maxRenderedOptions: 20,
    // Tag block rows so they can get the richer icon/description layout.
    optionClass: (completion) => (completion.iconKey ? "cm-slash-option" : ""),
    addToOptions: [
      { render: renderSlashIcon, position: 10 },
      { render: renderSlashDesc, position: 60 }, // between label (50) and detail (80)
    ],
  });
}
