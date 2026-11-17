/**
 * What kind of document a vault file is.
 *
 * Every item in the tree is still `type: "note"` — that is what keeps tabs,
 * pins, recents, drafts, history and auto-save working for HTML documents
 * without a parallel set of code paths. `kind` is the one place that says
 * which renderer and which metadata extractors apply. It is derived from the
 * file extension and nothing else, so it can be recomputed from a persisted
 * item (or a bare path) at any time.
 */

export const MARKDOWN_EXTENSIONS = ["md", "markdown", "mdx", "txt", "text"];
export const HTML_EXTENSIONS = ["html", "htm"];

/** Extensions Marky opens at all (keep in sync with `is_supported_file` in main.rs). */
export const DOCUMENT_EXTENSIONS = [...MARKDOWN_EXTENSIONS, ...HTML_EXTENSIONS];

const extensionOf = (pathOrName) => {
  if (!pathOrName || typeof pathOrName !== "string") return "";
  const base = pathOrName.replace(/\\/g, "/").split("/").pop() || "";
  const dot = base.lastIndexOf(".");
  // A leading dot is a hidden file, not an extension.
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
};

/** "html" for `.html` / `.htm` (any case), otherwise "markdown". */
export const documentKindFromPath = (pathOrName) =>
  HTML_EXTENSIONS.includes(extensionOf(pathOrName)) ? "html" : "markdown";

export const isHtmlPath = (pathOrName) => documentKindFromPath(pathOrName) === "html";

export const isDocumentPath = (pathOrName) => DOCUMENT_EXTENSIONS.includes(extensionOf(pathOrName));

/**
 * The kind of a store item. Items built since HTML support carry `kind`; older
 * persisted items (loose files, recents) only have a path, so fall back to it.
 */
export const documentKindOf = (item) => {
  if (!item) return "markdown";
  if (item.kind === "html" || item.kind === "markdown") return item.kind;
  return documentKindFromPath(item.filePath || item.path || "");
};

export const isHtmlDocument = (item) => documentKindOf(item) === "html";

/**
 * The display name for a file: the extension dropped for every document kind,
 * so `Q3 report.html` reads as "Q3 report" beside "Weekly review". Two files
 * that differ only by kind keep distinct ids (ids are path based) and the UI
 * marks the HTML one with its badge, so the shared name never collides.
 */
export const stripDocumentExtension = (name = "") =>
  (name || "").replace(/\.(md|markdown|mdx|txt|text|html|htm)$/i, "") || name;

/** The extension (with dot) a new file of `kind` gets. */
export const extensionForKind = (kind) => (kind === "html" ? ".html" : ".md");
