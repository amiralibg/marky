/**
 * Checks on what crosses the boundary between the app and a document frame.
 *
 * Every message out of a frame is untrusted input: each field is checked for
 * type, range and allowed values here before the app acts on it, and nothing
 * from a message is ever evaluated or put into the app's DOM as HTML.
 */
import { BLOCK_STYLE_TAGS, INLINE_CONTAINER_TAGS, TEXT_BLOCK_TAGS } from "./htmlSourceMap";

// The only sandbox token a document frame may ever carry. Anything else asked
// for — `allow-same-origin` above all, which would hand the page the app's
// origin — is dropped, whatever the caller passed.
const ALLOWED_SANDBOX_TOKENS = new Set(["allow-scripts"]);

export const safeSandbox = (value) =>
  String(value || "")
    .split(/\s+/)
    .filter((token) => ALLOWED_SANDBOX_TOKENS.has(token))
    .join(" ");

const MAX_HTML = 4 * 1024 * 1024;
export const EDITABLE_TAGS = new Set([...TEXT_BLOCK_TAGS, ...INLINE_CONTAINER_TAGS]);

const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

export const sanitizeRect = (rect) =>
  rect &&
  typeof rect === "object" &&
  isNumber(rect.top) &&
  isNumber(rect.left) &&
  isNumber(rect.right) &&
  isNumber(rect.bottom)
    ? { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom }
    : null;

/** An edit message from the frame, checked field by field, or null. */
export const sanitizeEditMessage = (data) => {
  if (!data || !Number.isInteger(data.id) || data.id < 0) return null;
  if (typeof data.tag !== "string" || !EDITABLE_TAGS.has(data.tag)) return null;
  if (typeof data.html !== "string" || typeof data.originalHtml !== "string") return null;
  if (data.html.length > MAX_HTML || data.originalHtml.length > MAX_HTML) return null;
  const edit = { id: data.id, tag: data.tag, html: data.html, originalHtml: data.originalHtml };
  if (data.newTag !== undefined) {
    if (typeof data.newTag !== "string" || !BLOCK_STYLE_TAGS.includes(data.newTag)) return null;
    edit.newTag = data.newTag;
  }
  return edit;
};

/** A selection report from the edit frame, or null. */
export const sanitizeSelectionMessage = (data) => {
  if (!data || data.active !== true) return null;
  const rect = sanitizeRect(data.rect);
  if (!rect) return null;
  return {
    active: true,
    collapsed: data.collapsed === true,
    rect,
    blockRect: sanitizeRect(data.blockRect) || rect,
    tag: EDITABLE_TAGS.has(data.tag) || BLOCK_STYLE_TAGS.includes(data.tag) ? data.tag : "p",
    styleable: data.styleable === true,
    bold: data.bold === true,
    italic: data.italic === true,
    link: typeof data.link === "string" ? data.link.slice(0, 2048) : null,
  };
};

// ── Shortcuts typed inside a frame ─────────────────────────────────────────
//
// While focus is inside a document's frame the app's own key handling never
// sees a key press, so the frame's agent forwards the app's shortcuts as plain
// descriptions (a key name and four modifier flags) and the app replays them
// on its window. Only these shapes are accepted: one printable ASCII
// character or one of the named keys below, with ⌘ or Ctrl held — Escape is
// the one key that travels bare (it leaves focus mode, as it does over a note).
const NAMED_KEYS = new Set([
  "Enter",
  "Escape",
  "Tab",
  "Backspace",
  "Delete",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
]);

const isAllowedKeyName = (key) =>
  typeof key === "string" && (/^[\x21-\x7e]$/.test(key) || NAMED_KEYS.has(key));

/** A forwarded shortcut, or null. */
export const sanitizeKeyMessage = (data) => {
  if (!data || !isAllowedKeyName(data.key)) return null;
  const key = {
    key: data.key,
    metaKey: data.metaKey === true,
    ctrlKey: data.ctrlKey === true,
    shiftKey: data.shiftKey === true,
    altKey: data.altKey === true,
  };
  if (!key.metaKey && !key.ctrlKey && key.key !== "Escape") return null;
  return key;
};

// Native editing keys stay with the frame whatever a keymap says: copy, paste,
// cut, select all, undo and redo belong to the text under the caret.
const NATIVE_EDIT_KEYS = new Set(["a", "c", "v", "x", "z", "y"]);

/** A keymap entry (`{ key, modifiers }`) as a chord the agents match, or null. */
export const chordOf = (keymap) => {
  if (!keymap || typeof keymap.key !== "string" || !Array.isArray(keymap.modifiers)) return null;
  if (!keymap.modifiers.includes("mod") || !isAllowedKeyName(keymap.key)) return null;
  return {
    key: keymap.key.toLowerCase(),
    shift: keymap.modifiers.includes("shift"),
    alt: keymap.modifiers.includes("alt"),
  };
};

// Every app-level action the main window's key handlers act on (App.jsx and
// the editors' window listeners), by keymap id.
const APP_SHORTCUT_ACTIONS = [
  "commandPalette",
  "search",
  "increaseFontSize",
  "decreaseFontSize",
  "resetFontSize",
  "closeTab",
  "showShortcuts",
  "toggleSidebar",
  "newNote",
  "newFolder",
  "openFolder",
  "toggleFocusMode",
  "save",
];

// Bound in App.jsx outside the keymaps: focus mode on ⌘⇧Enter, and "+" / "_"
// as the shifted faces of the zoom keys (with or without Shift reported, as
// keyboard layouts differ).
const FIXED_APP_CHORDS = [
  { key: "enter", shift: true, alt: false },
  { key: "+", shift: true, alt: false },
  { key: "+", shift: false, alt: false },
  { key: "_", shift: true, alt: false },
  { key: "_", shift: false, alt: false },
];

/**
 * The chords a frame hands to the app: the app's shortcuts under the user's
 * keymaps. The agent cancels these in the frame (so the native menu does not
 * act on the same press a second time) and forwards them; every other chord
 * is left to the frame and the system.
 */
export const frameShortcuts = (keymaps = {}) => {
  const seen = new Set();
  const chords = [];
  const add = (chord) => {
    if (!chord || NATIVE_EDIT_KEYS.has(chord.key)) return;
    const id = `${chord.key}:${chord.shift}:${chord.alt}`;
    if (seen.has(id)) return;
    seen.add(id);
    chords.push(chord);
  };
  for (const action of APP_SHORTCUT_ACTIONS) add(chordOf(keymaps?.[action]));
  for (const chord of FIXED_APP_CHORDS) add(chord);
  return chords;
};

/** Edit's formatting keys, the same keymaps the markdown editor uses. */
export const formatShortcuts = (keymaps = {}) => ({
  bold: chordOf(keymaps?.bold),
  italic: chordOf(keymaps?.italic),
  link: chordOf(keymaps?.link),
});

export const BLOCK_STYLES = [
  { tag: "p", label: "Paragraph" },
  { tag: "h1", label: "Heading 1" },
  { tag: "h2", label: "Heading 2" },
  { tag: "h3", label: "Heading 3" },
  { tag: "h4", label: "Heading 4" },
];

const TAG_LABELS = {
  p: "Paragraph",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  h4: "Heading 4",
  h5: "Heading 5",
  h6: "Heading 6",
  li: "List item",
  td: "Cell",
  th: "Header cell",
  blockquote: "Quote",
  figcaption: "Caption",
  caption: "Caption",
  dt: "Term",
  dd: "Description",
  summary: "Summary",
};

export const blockLabel = (tag) => TAG_LABELS[tag] || "Text";

/** Links the edit toolbar may write. Everything else is refused before it reaches the page. */
export const isAcceptableHref = (value) => {
  const href = String(value || "").trim();
  if (!href || href.length > 2048) return false;
  if (/^\s*(javascript|data|vbscript|file):/i.test(href)) return false;
  return /^(https?:|mailto:|#|\.{0,2}\/|[^:/?#]+(?:[/?#]|$))/i.test(href);
};
