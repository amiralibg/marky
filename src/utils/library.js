/**
 * Home's Library: browsing the vault folder by folder, plus the Recent and
 * Pinned lists beside it.
 *
 * Pure functions over the notes store's flat `items` array, kept out of the
 * component so the listing, ordering and breadcrumb rules are unit-testable.
 * The vault can hold thousands of notes, so everything here works from a
 * parent → children index built once per `items` change, and asks only for
 * one folder's children at a time.
 */
import { parseFrontmatter } from "./frontmatter";
import { sortSidebarItems } from "./sidebarSort";

/**
 * The vault's own folder: the scan's root item. Loose files (opened from
 * outside the vault) also sit at `parentId: null`, so the path decides.
 */
export const findVaultRoot = (items = [], rootFolderPath = null) => {
  const roots = items.filter((item) => item.type === "folder" && item.parentId == null);
  if (rootFolderPath) {
    const exact = roots.find(
      (item) => item.filePath === rootFolderPath || item.normalizedPath === rootFolderPath
    );
    if (exact) return exact;
  }
  return roots.find((item) => !item.isLoose) || null;
};

/**
 * parentId → children, vault items only. Loose files are not part of the
 * vault and never appear in the Library.
 */
export const buildChildrenIndex = (items = []) => {
  const index = new Map();
  for (const item of items) {
    if (item.isLoose || item.parentId == null) continue;
    const bucket = index.get(item.parentId);
    if (bucket) bucket.push(item);
    else index.set(item.parentId, [item]);
  }
  return index;
};

/**
 * One folder's children in the order the sidebar shows them: manual drag
 * order where there is one, otherwise folders first and then by name. Below
 * the root the sidebar never applies its root-level sort, and the vault
 * folder itself is the sidebar's only root-level row, so its children take
 * the same non-root ordering.
 */
export const libraryChildren = (index, folderId) =>
  sortSidebarItems(index?.get(folderId) || [], "name-asc", false);

/**
 * The crumbs from the vault root down to `folderId`, each `{ id, name }`.
 * A folder that has gone (deleted, or renamed — ids follow paths) yields
 * just the root, so the caller can fall back there.
 */
export const libraryBreadcrumb = (itemsById, rootId, folderId) => {
  const root = itemsById?.get(rootId);
  if (!root) return [];
  const trail = [];
  let current = folderId != null ? itemsById.get(folderId) : null;
  const seen = new Set();
  while (current && current.id !== rootId && !seen.has(current.id)) {
    seen.add(current.id);
    trail.unshift({ id: current.id, name: current.name });
    current = current.parentId != null ? itemsById.get(current.parentId) : null;
  }
  // Walked off the top without meeting the root: not a vault folder.
  if (!current || current.id !== rootId) return [{ id: root.id, name: root.name }];
  return [{ id: root.id, name: root.name }, ...trail];
};

const timeOf = (item) => {
  const value = new Date(item?.updatedAt || item?.createdAt || 0).getTime();
  return Number.isNaN(value) ? 0 : value;
};

/**
 * The folder's most recently updated document: its own notes first, and only
 * when it holds none, the newest anywhere below it (breadth-first, so a deep
 * tree is walked only as far as it takes). `null` for a folder without notes.
 */
export const newestNoteIn = (index, folderId) => {
  const direct = (index?.get(folderId) || []).filter((item) => item.type === "note");
  if (direct.length > 0) {
    return direct.reduce((best, item) => (timeOf(item) > timeOf(best) ? item : best));
  }
  let best = null;
  const queue = (index?.get(folderId) || []).filter((item) => item.type === "folder");
  while (queue.length > 0) {
    const folder = queue.shift();
    for (const child of index.get(folder.id) || []) {
      if (child.type === "note") {
        if (!best || timeOf(child) > timeOf(best)) best = child;
      } else if (child.type === "folder") {
        queue.push(child);
      }
    }
  }
  return best;
};

/**
 * Recent: the notes last opened (the store keeps ten), topped up with the
 * notes most recently changed, so a fresh vault's Home is not half empty.
 */
export const recentLibraryNotes = (recentNotes = [], items = [], limit = 12) => {
  const notesById = new Map();
  for (const item of items) {
    if (item.type === "note") notesById.set(item.id, item);
  }
  const result = [];
  const seen = new Set();
  for (const recent of recentNotes) {
    const note = notesById.get(recent.id);
    if (!note || seen.has(note.id)) continue;
    seen.add(note.id);
    result.push(note);
    if (result.length >= limit) return result;
  }
  const byUpdate = [...notesById.values()]
    .filter((note) => !seen.has(note.id) && !note.isLoose)
    .sort((a, b) => timeOf(b) - timeOf(a));
  for (const note of byUpdate) {
    if (result.length >= limit) break;
    result.push(note);
  }
  return result;
};

/** Pinned notes that still exist, by name — what `getPinnedNotes` returns. */
export const pinnedLibraryNotes = (pinnedIds = [], items = []) => {
  const pinned = new Set(pinnedIds);
  return items
    .filter((item) => item.type === "note" && pinned.has(item.id))
    .sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * "2 min ago", "3 h ago", "yesterday", a weekday within the week, then a
 * short date. Card metadata, so it favours brevity over precision.
 */
export const relativeDate = (value, now = new Date()) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = now.getTime() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)} min ago`;

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / (24 * hour));
  if (days <= 0) return `${Math.floor(diff / hour)} h ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: "long" });
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
};

export const MINIATURE_SOURCE_LIMIT = 1500;

// Front matter is read from a bounded head of the file: a miniature needs
// only the first screenful, and splitting a megabyte note into lines to find
// a closing `---` would cost more than the rest of the card.
const FRONTMATTER_SCAN_LIMIT = 8000;

/**
 * The markdown a miniature renders: the body without its front matter (the
 * properties panel is chrome, not the page), cut to about `limit` characters
 * at a line or word boundary, with any code fence or display-math block the
 * cut left open closed again — otherwise the renderer would read the rest of
 * the excerpt, and nothing else, as code.
 */
export const miniatureSource = (content, limit = MINIATURE_SOURCE_LIMIT) => {
  if (!content) return "";
  const head = String(content).slice(0, FRONTMATTER_SCAN_LIMIT);
  let body = parseFrontmatter(head).body.replace(/^\n+/, "");

  if (body.length > limit) {
    let cut = body.lastIndexOf("\n", limit);
    if (cut < limit * 0.6) {
      // One very long line: end on a word instead.
      const space = body.lastIndexOf(" ", limit);
      cut = space > limit * 0.6 ? space : limit;
    }
    body = body.slice(0, cut).replace(/\s+$/, "");
  }

  let openFence = null;
  let openMath = false;
  for (const line of body.split("\n")) {
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (!openFence) openFence = fence[1];
      else if (fence[1][0] === openFence[0] && fence[1].length >= openFence.length) {
        openFence = null;
      }
      continue;
    }
    if (!openFence && line.trim() === "$$") openMath = !openMath;
  }
  if (openFence) body += `\n${openFence}`;
  if (openMath) body += "\n$$";
  return body;
};
