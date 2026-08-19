import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * Attachment resolution — turning the image paths written by other markdown
 * editors into something the webview can actually load.
 *
 * A vault imported from Obsidian is full of links like `![](attachments/a.png)`,
 * `![](../assets/b%20c.png)` and `![[d.png]]`. All of them are *file system*
 * paths, relative to either the note or the vault root; none of them mean
 * anything to a webview served from `tauri://localhost`, which is why every
 * image in an imported vault rendered as a broken icon.
 *
 * Resolving one needs three things: the note being rendered (for note-relative
 * paths), the vault root (for vault-relative ones), and — for Obsidian's
 * `![[name.png]]` shorthand, which carries no path at all — an index of the
 * media files actually present in the vault. The first two are set per render;
 * the index is refreshed with the workspace.
 */

// The extensions worth indexing. Deliberately media-only: the index exists to
// resolve embeds, and walking a vault's worth of every other file to answer
// "where is logo.png" would cost more than it buys.
export const MEDIA_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "avif",
  "apng",
  "pdf",
  "mp4",
  "webm",
  "mov",
  "mp3",
  "wav",
  "ogg",
  "m4a",
  "flac",
];

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "avif",
  "apng",
]);

/**
 * Where a pasted image lands by default, relative to the workspace root.
 * `attachments` rather than the root itself: a vault whose top level is notes
 * stays readable, and it is the convention most Obsidian vaults already use.
 */
export const DEFAULT_ATTACHMENT_FOLDER = "attachments";

export const normalizeSlashes = (value) => (value || "").replace(/\\/g, "/");

export const extensionOf = (value) => {
  const name = normalizeSlashes(value).split("/").pop() || "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

export const isImagePath = (value) => IMAGE_EXTENSIONS.has(extensionOf(value));

export const baseNameOf = (value) => normalizeSlashes(value).split("/").pop() || "";

export const dirNameOf = (value) => {
  const normalized = normalizeSlashes(value);
  const slash = normalized.lastIndexOf("/");
  if (slash < 0) return "";
  if (slash === 0) return "/";
  return normalized.slice(0, slash);
};

// `C:\foo`, `C:/foo` — a drive-letter path, not a URL with a one-letter scheme.
const WINDOWS_ABSOLUTE = /^[a-zA-Z]:[\\/]/;

export const isAbsolutePath = (value) => {
  const normalized = normalizeSlashes(value);
  return normalized.startsWith("/") || WINDOWS_ABSOLUTE.test(normalized);
};

/**
 * True for anything the webview can already load by itself — a remote URL, a
 * data URI, an already-converted asset URL. These are passed through untouched.
 */
export const isExternalSrc = (value) => {
  const trimmed = (value || "").trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("//")) return true;
  if (WINDOWS_ABSOLUTE.test(trimmed)) return false;
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
};

/** Join `rel` onto `base`, collapsing `.` and `..` segments. */
export const joinPath = (base, rel) => {
  const segments = normalizeSlashes(base).split("/");
  for (const segment of normalizeSlashes(rel).split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length > 1) segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/") || "/";
};

/** Percent-decoding that never throws on a path containing a bare `%`. */
const safeDecode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

// ── Vault media index ──────────────────────────────────────────────────────

let indexRoot = null;
let byAbsolute = new Map(); // lowercased absolute path → real absolute path
let byRelative = new Map(); // lowercased vault-relative path → absolute path
let byName = new Map(); // lowercased file name → absolute path

const relativeToRoot = (absolutePath, root) => {
  if (!root) return null;
  const normalizedPath = normalizeSlashes(absolutePath);
  const normalizedRoot = normalizeSlashes(root).replace(/\/+$/, "");
  if (!normalizedPath.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)) return null;
  return normalizedPath.slice(normalizedRoot.length + 1);
};

/**
 * Replace the media index.
 *
 * @param {Array<{path: string}>} files - Absolute paths to the vault's media
 * @param {string|null} root - Workspace root the paths were scanned under
 */
export const setAttachmentIndex = (files = [], root = null) => {
  indexRoot = root ? normalizeSlashes(root).replace(/\/+$/, "") : null;
  byAbsolute = new Map();
  byRelative = new Map();
  byName = new Map();
  for (const file of files) {
    addIndexedAttachment(typeof file === "string" ? file : file?.path);
  }
};

/**
 * Add one file to the index, so an image pasted a moment ago renders without
 * waiting for the next workspace refresh.
 */
export const addIndexedAttachment = (absolutePath) => {
  const normalized = normalizeSlashes(absolutePath);
  if (!normalized) return;
  byAbsolute.set(normalized.toLowerCase(), normalized);

  const relative = relativeToRoot(normalized, indexRoot);
  if (relative) byRelative.set(relative.toLowerCase(), normalized);

  const name = baseNameOf(normalized).toLowerCase();
  if (!name) return;
  // Two files can share a name in different folders. Obsidian resolves the
  // ambiguity by proximity; without a note to measure from at index time, the
  // shallowest path is the closest thing to a stable answer.
  const existing = byName.get(name);
  if (!existing || normalized.split("/").length < existing.split("/").length) {
    byName.set(name, normalized);
  }
};

export const getAttachmentIndexSize = () => byAbsolute.size;

const indexHas = (absolutePath) => byAbsolute.has(normalizeSlashes(absolutePath).toLowerCase());

// ── Per-render context ─────────────────────────────────────────────────────

// Which note is being rendered, and which vault it belongs to. Module-level
// because `marked` renderers are registered once and take no context argument —
// and safe to keep module-level because every Marky window is its own webview,
// so no two notes are ever rendering into the same module instance.
let context = { notePath: null, vaultRoot: null };

export const setAttachmentContext = ({ notePath = null, vaultRoot = null } = {}) => {
  context = {
    notePath: notePath ? normalizeSlashes(notePath) : null,
    vaultRoot: vaultRoot ? normalizeSlashes(vaultRoot).replace(/\/+$/, "") : null,
  };
};

export const getAttachmentContext = () => context;

/**
 * Resolve a markdown link target to an absolute file path.
 *
 * Tried in the order another editor would have written them: next to the note,
 * then from the vault root, then — for a bare name, which is all an Obsidian
 * `![[…]]` embed gives you — by looking the name up in the vault index.
 *
 * @returns {string|null} An absolute path, or null when there is nothing to try
 */
export const resolveAttachmentPath = (target, ctx = context) => {
  const raw = (target || "").trim();
  if (!raw) return null;

  // `![[image.png|300]]` sizing and `#page=2` fragments are addressing, not path.
  const withoutFragment = raw.split("#")[0].split("|")[0].trim();
  if (!withoutFragment) return null;

  const decoded = safeDecode(withoutFragment);
  const noteDir = ctx.notePath ? dirNameOf(ctx.notePath) : null;
  const vaultRoot = ctx.vaultRoot || null;

  if (isAbsolutePath(decoded)) {
    return normalizeSlashes(decoded);
  }

  const candidates = [];
  if (noteDir) candidates.push(joinPath(noteDir, decoded));
  if (vaultRoot) candidates.push(joinPath(vaultRoot, decoded));

  // With no index there is nothing to verify against, so the first guess — the
  // path relative to the note, which is what most editors write — has to do.
  if (byAbsolute.size === 0) return candidates[0] || null;

  for (const candidate of candidates) {
    if (indexHas(candidate)) return candidate;
  }

  const relativeHit = byRelative.get(decoded.replace(/^\/+/, "").toLowerCase());
  if (relativeHit) return relativeHit;

  const nameHit = byName.get(baseNameOf(decoded).toLowerCase());
  if (nameHit) return nameHit;

  return candidates[0] || null;
};

/**
 * Absolute path → a URL the webview will load.
 *
 * `convertFileSrc` produces the `asset://` (or `http://asset.localhost`) URL
 * the Tauri asset protocol serves; it throws outside Tauri, where a plain
 * `file://` URL is the best a browser preview can do.
 */
export const toAssetUrl = (absolutePath) => {
  const normalized = normalizeSlashes(absolutePath);
  if (!normalized) return "";
  try {
    return convertFileSrc(normalized);
  } catch {
    return `file://${normalized.startsWith("/") ? "" : "/"}${normalized}`;
  }
};

// An `asset://` URL only means something inside this app's webview, so anything
// rendered to leave it — an exported HTML file — keeps the author's own paths.
let passthrough = false;

/**
 * Run `render` with image paths left exactly as the note wrote them.
 * Synchronous by contract: the flag is global, and `marked` is synchronous.
 */
export const withRawMediaSrc = (render) => {
  passthrough = true;
  try {
    return render();
  } finally {
    passthrough = false;
  }
};

/**
 * The whole job in one call: a markdown image target in, a loadable URL out.
 * Anything already loadable (http, data, …) comes back untouched.
 */
export const resolveMediaSrc = (src, ctx = context) => {
  const raw = (src || "").trim();
  if (passthrough || !raw || isExternalSrc(raw)) return raw;
  const absolute = resolveAttachmentPath(raw, ctx);
  return absolute ? toAssetUrl(absolute) : raw;
};

/**
 * The display size an Obsidian embed asks for: `![[a.png|300]]` or
 * `![[a.png|300x200]]`.
 *
 * @returns {{width: string, height: string}|null}
 */
export const parseEmbedSize = (target) => {
  const pipe = (target || "").split("|");
  if (pipe.length < 2) return null;
  const spec = pipe[pipe.length - 1].trim();
  const match = /^(\d+)(?:x(\d+))?$/.exec(spec);
  if (!match) return null;
  return { width: match[1], height: match[2] || "" };
};

/** The path part of an embed target, with any `|size` suffix removed. */
export const stripEmbedSize = (target) => {
  const value = (target || "").trim();
  const pipe = value.lastIndexOf("|");
  if (pipe < 0) return value;
  return /^\d+(x\d+)?$/.test(value.slice(pipe + 1).trim()) ? value.slice(0, pipe).trim() : value;
};

// ── Naming and linking a saved file ────────────────────────────────────────

const MIME_EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/avif": "avif",
  "image/tiff": "tiff",
};

export const extensionForMime = (mime) => MIME_EXTENSIONS[(mime || "").toLowerCase()] || "png";

/** Strip anything that can't be part of a file name on any of the three platforms. */
export const sanitizeAttachmentName = (name) => {
  const cleaned = baseNameOf(name || "")
    .replace(/[<>:"/\\|?*]/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "")
    .trim();
  return cleaned || "attachment";
};

const twoDigits = (value) => String(value).padStart(2, "0");

/**
 * The name a pasted image gets. Deliberately the convention Obsidian uses, so a
 * vault that moves between the two apps keeps one naming scheme.
 */
export const buildPastedImageName = (mime, now = new Date()) => {
  const stamp =
    `${now.getFullYear()}${twoDigits(now.getMonth() + 1)}${twoDigits(now.getDate())}` +
    `${twoDigits(now.getHours())}${twoDigits(now.getMinutes())}${twoDigits(now.getSeconds())}`;
  return `Pasted image ${stamp}.${extensionForMime(mime)}`;
};

/** `name.png` → `name 1.png` → `name 2.png`, for a target that already exists. */
export const withNameSuffix = (fileName, counter) => {
  if (counter <= 0) return fileName;
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return `${fileName} ${counter}`;
  return `${fileName.slice(0, dot)} ${counter}${fileName.slice(dot)}`;
};

// `encodeURIComponent` leaves parentheses alone — they are unreserved in a URI
// — but an unescaped `)` ends a markdown link target, so they are spelled out.
const LINK_ESCAPES = {
  "(": "%28",
  ")": "%29",
  "'": "%27",
};

// Everything a markdown link target cannot carry literally.
//
// `\s` rather than a literal space, and this is the whole bug it fixes: macOS
// names a screenshot `Screenshot 2026-08-18 at 9.55.54\u202fPM.png`, with a
// NARROW NO-BREAK SPACE before the meridiem. That is not an ASCII space, so it
// survived encoding — but it *is* whitespace to the link tokenizer, which ended
// the URL there, failed to parse the image, and left the raw markdown on screen
// as text. Anything the tokenizer calls whitespace has to be encoded.
const UNSAFE_IN_LINK = /[\s()<>"'`[\]\\]/gu;

/** Percent-encode only what would break a markdown link target. */
export const encodeAttachmentPath = (value) =>
  normalizeSlashes(value)
    .split("/")
    .map((segment) =>
      segment.replace(UNSAFE_IN_LINK, (char) => LINK_ESCAPES[char] ?? encodeURIComponent(char))
    )
    .join("/");

/**
 * Escape the alt text of an image, which sits inside `![...]` and so cannot
 * carry a bare bracket without ending early.
 */
export const escapeMarkdownAlt = (value = "") => value.replace(/([[\]\\])/g, "\\$1");

/**
 * The markdown that embeds `targetPath` in the note at `notePath`.
 * One place, so the paste and the drag paths cannot drift apart on escaping.
 */
export const buildImageMarkdown = (targetPath, notePath, alt = "") =>
  `![${escapeMarkdownAlt(alt)}](${buildRelativeLink(targetPath, notePath)})`;

/**
 * The link text to write for a saved attachment: relative to the note when the
 * two share a folder tree, absolute otherwise. A relative link is what keeps
 * the vault portable — it survives the folder being moved or synced.
 */
export const buildRelativeLink = (targetPath, notePath) => {
  const target = normalizeSlashes(targetPath);
  const noteDir = notePath ? dirNameOf(normalizeSlashes(notePath)) : "";
  if (!noteDir) return encodeAttachmentPath(target);

  const targetParts = target.split("/");
  const dirParts = noteDir.split("/");
  let shared = 0;
  while (
    shared < dirParts.length &&
    shared < targetParts.length - 1 &&
    dirParts[shared].toLowerCase() === targetParts[shared].toLowerCase()
  ) {
    shared += 1;
  }
  // Nothing in common means different drives or roots, and only an absolute
  // path can address that.
  if (shared === 0) return encodeAttachmentPath(target);

  const up = dirParts.length - shared;
  const relative = [...Array(up).fill(".."), ...targetParts.slice(shared)].join("/");
  return encodeAttachmentPath(relative);
};
