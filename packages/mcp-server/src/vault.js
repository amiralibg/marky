import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Fuse from "fuse.js";

/** Short content digest used for optimistic concurrency on update_note. */
export function hashContent(content = "") {
  return crypto.createHash("sha256").update(String(content), "utf8").digest("hex").slice(0, 16);
}

const DEFAULT_IGNORE_PATTERNS = [
  ".git",
  "node_modules",
  ".trash",
  ".obsidian",
  ".marky",
  ".DS_Store",
];

const FRONTMATTER_BOUNDARY = "---";

/** Files above this size are indexed by metadata only, never read into memory. */
const MAX_FILE_SIZE = 2 * 1024 * 1024;

/** Daily notes are named YYYY-MM-DD, matching the app's formatDailyNoteTitle(). */
const DAILY_TITLE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Where this server used to put daily notes; still read for existing vaults. */
const LEGACY_DAILY_FOLDER = "Daily";

/** Parse YYYY-MM-DD in local time (`new Date(str)` would treat it as UTC). */
export function parseLocalDate(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function isBoundary(line) {
  return line.trim() === FRONTMATTER_BOUNDARY;
}

export function normalizeKey(key) {
  return (key || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
}

export function escapeQuotedValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function parseScalar(rawValue) {
  const value = (rawValue || "").trim();
  if (!value) return "";
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return value;
}

export function parseInlineList(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  return inner
    .split(",")
    .map((item) => parseScalar(item.trim()))
    .filter(Boolean);
}

export function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function stringifyScalar(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/[:#[\]{},&*!|>'"%@`\n]/.test(text) || /^\s|\s$/.test(text)) {
    return `"${escapeQuotedValue(text)}"`;
  }
  return text;
}

export function parseFrontmatter(content = "") {
  const normalized = String(content || "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  if (!isBoundary(lines[0] || "")) {
    return {
      attributes: {},
      body: normalized,
      hasFrontmatter: false,
      raw: "",
    };
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && isBoundary(line));
  if (endIndex === -1) {
    return {
      attributes: {},
      body: normalized,
      hasFrontmatter: false,
      raw: "",
    };
  }

  const frontmatterLines = lines.slice(1, endIndex);
  const attributes = {};
  let currentKey = null;

  frontmatterLines.forEach((line) => {
    const listItem = /^\s*-\s+(.+)$/.exec(line);
    if (listItem && currentKey) {
      if (!Array.isArray(attributes[currentKey])) {
        attributes[currentKey] = attributes[currentKey] ? [attributes[currentKey]] : [];
      }
      attributes[currentKey].push(parseScalar(listItem[1]));
      return;
    }

    const pair = /^([A-Za-z0-9_-][A-Za-z0-9_\s-]*):\s*(.*)$/.exec(line);
    if (!pair) return;

    currentKey = normalizeKey(pair[1]);
    if (!currentKey) return;

    const rawValue = pair[2] || "";
    const inlineList = parseInlineList(rawValue);
    attributes[currentKey] = inlineList !== null ? inlineList : parseScalar(rawValue);
  });

  return {
    attributes,
    body: lines.slice(endIndex + 1).join("\n"),
    hasFrontmatter: true,
    raw: frontmatterLines.join("\n"),
  };
}

export function stringifyFrontmatter(attributes = {}) {
  const lines = [];

  Object.entries(attributes).forEach(([rawKey, value]) => {
    const key = normalizeKey(rawKey);
    if (!key) return;

    if (Array.isArray(value)) {
      const list = normalizeList(value);
      if (list.length === 0) return;
      lines.push(`${key}:`);
      list.forEach((item) => {
        lines.push(`  - ${stringifyScalar(item)}`);
      });
      return;
    }

    const scalar = stringifyScalar(value);
    if (!scalar) return;
    lines.push(`${key}: ${scalar}`);
  });

  return lines.join("\n");
}

export function writeFrontmatter(content = "", attributes = {}) {
  const parsed = parseFrontmatter(content);
  const serialized = stringifyFrontmatter(attributes);
  const body = parsed.body || "";

  if (!serialized) {
    return body.replace(/^\n+/, "");
  }

  return `${FRONTMATTER_BOUNDARY}\n${serialized}\n${FRONTMATTER_BOUNDARY}\n${body.replace(/^\n*/, "")}`;
}

export function stripCodeBlocks(content = "") {
  return content.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]+`/g, "");
}

export function extractInlineTags(content = "") {
  const clean = stripCodeBlocks(content);
  const tagRegex = /(?:^|[\s])#([a-zA-Z0-9_-]+)(?=[\s.,;!?)]|$)/g;
  const tags = new Set();
  let match;
  while ((match = tagRegex.exec(clean)) !== null) {
    tags.add(match[1].toLowerCase());
  }
  return Array.from(tags);
}

export function extractWikiLinks(content = "") {
  const clean = stripCodeBlocks(content);
  const linkRegex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  const links = new Set();
  let match;
  while ((match = linkRegex.exec(clean)) !== null) {
    const target = match[1].trim();
    if (target) {
      links.add(target);
    }
  }
  return Array.from(links);
}

export function normalizeNoteTitle(title = "") {
  return title.replace(/\.(md|markdown|txt)$/i, "").trim();
}

export function sanitizeFileName(name = "") {
  return (
    name
      .replace(/[\\/:*?"<>|]/g, " ")
      // Control characters are legal in POSIX filenames but never intended here.
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f\x7f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      // Leading dots would hide the note from the indexer (shouldIgnore) or
      // produce traversal-shaped names like ".. .. up".
      .replace(/^[.\s]+/, "")
      .trim()
  );
}

export class Vault {
  constructor(vaultPath, options = {}) {
    this.vaultPath = path.resolve(vaultPath);
    this.ignorePatterns = options.ignorePatterns || DEFAULT_IGNORE_PATTERNS;
    this.readOnly = options.readOnly === true;
    this.maxFileSize = options.maxFileSize ?? MAX_FILE_SIZE;
    // relativePath -> { mtimeMs, size, note }. Lets scanVault skip re-reading
    // and re-parsing files that have not changed since the last call.
    this.parseCache = new Map();
    if (!fs.existsSync(this.vaultPath)) {
      throw new Error(`Vault path does not exist: ${this.vaultPath}`);
    }
    if (!fs.statSync(this.vaultPath).isDirectory()) {
      throw new Error(`Vault path is not a directory: ${this.vaultPath}`);
    }
  }

  /**
   * Resolve a vault-relative path and refuse anything that escapes the vault.
   * Every write and every caller-supplied path must go through this — tool
   * arguments are chosen by a model and may be steered by note contents.
   */
  resolveInVault(relativePath = "") {
    const cleaned = String(relativePath).replace(/\\/g, "/").replace(/^\/+/, "");
    const full = path.resolve(this.vaultPath, cleaned);
    if (full !== this.vaultPath && !full.startsWith(this.vaultPath + path.sep)) {
      throw new Error(`Path escapes the vault: "${relativePath}"`);
    }
    return full;
  }

  assertWritable() {
    if (this.readOnly) {
      throw new Error("This Marky MCP server is running in read-only mode; writes are disabled.");
    }
  }

  shouldIgnore(relativePath) {
    const parts = relativePath.split(path.sep);
    return parts.some((part) => {
      if (part.startsWith(".") && part !== ".") return true;
      return this.ignorePatterns.includes(part);
    });
  }

  scanVault() {
    const notes = [];
    const seen = new Set();

    const walk = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(this.vaultPath, fullPath);

        if (this.shouldIgnore(relPath)) continue;

        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && /\.(md|markdown|txt)$/i.test(entry.name)) {
          const key = relPath.replace(/\\/g, "/");
          const stats = fs.statSync(fullPath);
          seen.add(key);

          const cached = this.parseCache.get(key);
          if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
            notes.push(cached.note);
            continue;
          }

          const oversized = stats.size > this.maxFileSize;
          const rawContent = oversized ? "" : fs.readFileSync(fullPath, "utf-8");
          const parsed = parseFrontmatter(rawContent);
          const frontmatterTags = normalizeList(parsed.attributes.tags);
          const inlineTags = extractInlineTags(parsed.body);
          const allTags = Array.from(
            new Set([...frontmatterTags.map((t) => t.toLowerCase()), ...inlineTags])
          ).sort();

          const outgoingLinks = extractWikiLinks(parsed.body);
          const title = normalizeNoteTitle(entry.name);

          const note = {
            title,
            fileName: entry.name,
            relativePath: key,
            fullPath,
            folder:
              path.dirname(relPath).replace(/\\/g, "/") === "."
                ? ""
                : path.dirname(relPath).replace(/\\/g, "/"),
            size: stats.size,
            mtime: stats.mtimeMs,
            created: stats.birthtimeMs,
            oversized,
            hasFrontmatter: parsed.hasFrontmatter,
            attributes: parsed.attributes,
            tags: allTags,
            outgoingLinks,
            rawContent,
            body: parsed.body,
          };

          this.parseCache.set(key, { mtimeMs: stats.mtimeMs, size: stats.size, note });
          notes.push(note);
        }
      }
    };

    walk(this.vaultPath);

    for (const key of this.parseCache.keys()) {
      if (!seen.has(key)) this.parseCache.delete(key);
    }

    return notes;
  }

  buildIndex() {
    const notes = this.scanVault();
    const noteByTitle = new Map();
    const noteByPath = new Map();
    const backlinksMap = new Map();
    const tagMap = new Map();

    for (const note of notes) {
      noteByTitle.set(note.title.toLowerCase(), note);
      noteByPath.set(note.relativePath.toLowerCase(), note);

      for (const tag of note.tags) {
        if (!tagMap.has(tag)) tagMap.set(tag, []);
        tagMap.get(tag).push(note.relativePath);
      }
    }

    for (const note of notes) {
      for (const linkTarget of note.outgoingLinks) {
        const lowerTarget = linkTarget.toLowerCase();
        if (!backlinksMap.has(lowerTarget)) {
          backlinksMap.set(lowerTarget, []);
        }
        backlinksMap.get(lowerTarget).push({
          sourceTitle: note.title,
          sourcePath: note.relativePath,
        });
      }
    }

    return {
      notes,
      noteByTitle,
      noteByPath,
      backlinksMap,
      tagMap,
    };
  }

  listNotes({ folder = null, tag = null, limit = null, offset = 0 } = {}) {
    const { notes } = this.buildIndex();
    const matched = notes.filter((n) => {
      if (folder !== null && folder !== undefined && folder !== "") {
        const normFolder = folder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
        if (n.folder !== normFolder && !n.folder.startsWith(normFolder + "/")) {
          return false;
        }
      }
      if (tag) {
        const normTag = tag.toLowerCase().replace(/^#/, "");
        if (!n.tags.includes(normTag)) return false;
      }
      return true;
    });

    const start = Math.max(0, offset);
    const page =
      limit === null || limit === undefined ? matched : matched.slice(start, start + limit);

    return {
      total: matched.length,
      offset: start,
      returned: page.length,
      notes: page.map((n) => ({
        title: n.title,
        relativePath: n.relativePath,
        folder: n.folder,
        tags: n.tags,
        size: n.size,
        modified: new Date(n.mtime).toISOString(),
      })),
    };
  }

  findNote(pathOrTitle, index = this.buildIndex()) {
    const { notes, noteByTitle, noteByPath } = index;
    if (!pathOrTitle) return null;

    const normalized = pathOrTitle.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
    if (noteByPath.has(normalized)) return noteByPath.get(normalized);

    const titleKey = normalizeNoteTitle(pathOrTitle).toLowerCase();
    if (noteByTitle.has(titleKey)) return noteByTitle.get(titleKey);

    // Suffix match only on a path boundary, so "Note.md" cannot match "MyNote.md".
    return (
      notes.find(
        (n) =>
          n.relativePath.toLowerCase().endsWith(`/${normalized}`) ||
          n.title.toLowerCase() === titleKey
      ) || null
    );
  }

  readNote(pathOrTitle) {
    const index = this.buildIndex();
    const note = this.findNote(pathOrTitle, index);
    if (!note) {
      throw new Error(`Note not found: "${pathOrTitle}"`);
    }

    const backlinks = index.backlinksMap.get(note.title.toLowerCase()) || [];

    // Oversized notes are skipped by the indexer, but an explicit read of one
    // file is bounded work — parse it on demand rather than returning nothing.
    let { rawContent, body, attributes } = note;
    if (note.oversized) {
      rawContent = fs.readFileSync(note.fullPath, "utf-8");
      const parsed = parseFrontmatter(rawContent);
      body = parsed.body;
      attributes = parsed.attributes;
    }

    return {
      title: note.title,
      relativePath: note.relativePath,
      folder: note.folder,
      tags: note.tags,
      attributes,
      rawContent,
      body,
      outgoingLinks: note.outgoingLinks,
      backlinks,
      size: note.size,
      // Pass back to update_note as expected_hash to make the write conditional.
      hash: hashContent(rawContent),
      modified: new Date(note.mtime).toISOString(),
      created: new Date(note.created).toISOString(),
    };
  }

  createNote({ title, folder = "", content = "", tags = [], attributes = {} }) {
    if (!title || !title.trim()) {
      throw new Error("Note title is required");
    }

    this.assertWritable();

    const safeTitle = sanitizeFileName(title.trim());
    if (!safeTitle) {
      throw new Error(`Note title contains no usable characters: "${title}"`);
    }
    const fileName = safeTitle.endsWith(".md") ? safeTitle : `${safeTitle}.md`;

    const targetDir = folder ? this.resolveInVault(folder) : this.vaultPath;

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const fullPath = this.resolveInVault(
      path.join(path.relative(this.vaultPath, targetDir), fileName)
    );
    if (fs.existsSync(fullPath)) {
      throw new Error(`A note already exists at: "${path.relative(this.vaultPath, fullPath)}"`);
    }

    let finalAttributes = { ...attributes };
    if (tags && tags.length > 0) {
      finalAttributes.tags = Array.from(
        new Set([...(finalAttributes.tags ? normalizeList(finalAttributes.tags) : []), ...tags])
      );
    }

    const fileContent =
      Object.keys(finalAttributes).length > 0
        ? writeFrontmatter(content, finalAttributes)
        : content;

    fs.writeFileSync(fullPath, fileContent, "utf-8");

    const relPath = path.relative(this.vaultPath, fullPath).replace(/\\/g, "/");
    return {
      success: true,
      title: normalizeNoteTitle(fileName),
      relativePath: relPath,
      fullPath,
    };
  }

  updateNote({ relativePath, content, attributes = null, expectedHash = null }) {
    this.assertWritable();

    const note = this.findNote(relativePath);
    if (!note) {
      throw new Error(`Note not found: "${relativePath}"`);
    }

    // update_note replaces the whole file. If the caller tells us what it
    // believed the note contained, refuse the write when that no longer holds
    // so edits made in the app between read and write are not silently lost.
    const currentRaw = fs.readFileSync(note.fullPath, "utf-8");
    if (expectedHash) {
      const actual = hashContent(currentRaw);
      if (actual !== expectedHash) {
        throw new Error(
          `Note "${note.relativePath}" changed since it was read ` +
            `(expected ${expectedHash}, found ${actual}). Re-read the note and retry.`
        );
      }
    }

    let fileContent = content;
    if (attributes !== null) {
      fileContent = writeFrontmatter(content !== undefined ? content : note.body, attributes);
    }

    fs.writeFileSync(note.fullPath, fileContent, "utf-8");

    return {
      success: true,
      relativePath: note.relativePath,
      hash: hashContent(fileContent),
      modified: new Date().toISOString(),
    };
  }

  appendToNote({ relativePath, content }) {
    this.assertWritable();

    const note = this.findNote(relativePath);
    if (!note) {
      throw new Error(`Note not found: "${relativePath}"`);
    }

    const currentRaw = fs.readFileSync(note.fullPath, "utf-8");
    const separator = currentRaw.endsWith("\n\n") ? "" : currentRaw.endsWith("\n") ? "\n" : "\n\n";
    const updated = `${currentRaw}${separator}${content}\n`;

    fs.writeFileSync(note.fullPath, updated, "utf-8");

    return {
      success: true,
      relativePath: note.relativePath,
      appendedLength: content.length,
    };
  }

  getBacklinks(title) {
    const index = this.buildIndex();
    const lowerTitle = normalizeNoteTitle(title).toLowerCase();
    const backlinks = index.backlinksMap.get(lowerTitle) || [];
    return {
      title,
      backlinksCount: backlinks.length,
      backlinks,
    };
  }

  getTags() {
    const index = this.buildIndex();
    const tagsList = [];
    for (const [tag, notePaths] of index.tagMap.entries()) {
      tagsList.push({
        tag: `#${tag}`,
        count: notePaths.length,
        notes: notePaths,
      });
    }
    return tagsList.sort((a, b) => b.count - a.count);
  }

  searchNotes(query, { tag = null, folder = null, limit } = {}) {
    const cap = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : 20;
    const { notes } = this.buildIndex();
    let candidates = notes;

    if (folder) {
      const normFolder = folder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
      candidates = candidates.filter(
        (n) => n.folder === normFolder || n.folder.startsWith(normFolder + "/")
      );
    }

    if (tag) {
      const normTag = tag.toLowerCase().replace(/^#/, "");
      candidates = candidates.filter((n) => n.tags.includes(normTag));
    }

    if (!query || !query.trim()) {
      return candidates.slice(0, cap).map((n) => ({
        title: n.title,
        relativePath: n.relativePath,
        folder: n.folder,
        tags: n.tags,
        snippet: n.body.slice(0, 150),
      }));
    }

    const fuse = new Fuse(candidates, {
      keys: [
        { name: "title", weight: 0.6 },
        { name: "tags", weight: 0.3 },
        { name: "body", weight: 0.2 },
      ],
      threshold: 0.4,
      includeScore: true,
    });

    const results = fuse.search(query.trim());
    return results.slice(0, cap).map((res) => {
      const note = res.item;
      return {
        title: note.title,
        relativePath: note.relativePath,
        folder: note.folder,
        tags: note.tags,
        score: res.score,
        snippet: note.body.slice(0, 200),
      };
    });
  }

  getVaultStructure() {
    const structure = {
      name: path.basename(this.vaultPath),
      type: "folder",
      path: "",
      children: [],
    };

    const buildTree = (dir, parentNode) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(this.vaultPath, fullPath).replace(/\\/g, "/");

        if (this.shouldIgnore(relPath)) continue;

        if (entry.isDirectory()) {
          const folderNode = {
            name: entry.name,
            type: "folder",
            path: relPath,
            children: [],
          };
          parentNode.children.push(folderNode);
          buildTree(fullPath, folderNode);
        } else if (entry.isFile() && /\.(md|markdown|txt)$/i.test(entry.name)) {
          parentNode.children.push({
            name: entry.name,
            title: normalizeNoteTitle(entry.name),
            type: "file",
            path: relPath,
          });
        }
      }
    };

    buildTree(this.vaultPath, structure);
    return structure;
  }

  /**
   * Daily notes live at the vault root as YYYY-MM-DD.md, matching what the
   * Marky app's createDailyNote() writes, so the app and an AI client share one
   * note per day. Earlier versions of this server wrote to Daily/ — those are
   * still found and appended to, so existing vaults keep working.
   */
  findDailyNote(dailyTitle, index = this.buildIndex()) {
    const candidates = [`${dailyTitle}.md`, `${LEGACY_DAILY_FOLDER}/${dailyTitle}.md`];
    for (const candidate of candidates) {
      const hit = index.noteByPath.get(candidate.toLowerCase());
      if (hit) return hit;
    }
    return null;
  }

  /** Every note whose filename is a plain ISO date, newest first. */
  listDailyNotes({ limit = null } = {}) {
    const { notes } = this.buildIndex();
    const daily = notes
      .filter((n) => DAILY_TITLE_PATTERN.test(n.title))
      .filter((n) => n.folder === "" || n.folder === LEGACY_DAILY_FOLDER)
      .sort((a, b) => b.title.localeCompare(a.title));
    return limit ? daily.slice(0, limit) : daily;
  }

  createOrAppendDailyNote(dateStr = null, content = "") {
    this.assertWritable();

    if (dateStr && !DAILY_TITLE_PATTERN.test(dateStr.trim())) {
      throw new Error(`Invalid date format: "${dateStr}". Use YYYY-MM-DD.`);
    }

    // Parse as local time. `new Date("2026-08-18")` is parsed as UTC and can
    // land on the previous day for anyone west of Greenwich.
    const date = dateStr ? parseLocalDate(dateStr.trim()) : new Date();
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date format: "${dateStr}". Use YYYY-MM-DD.`);
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dailyTitle = `${year}-${month}-${day}`;

    const existing = this.findDailyNote(dailyTitle);

    if (existing) {
      if (content && content.trim()) {
        this.appendToNote({ relativePath: existing.relativePath, content });
      }
      return {
        created: false,
        updated: Boolean(content && content.trim()),
        title: dailyTitle,
        relativePath: existing.relativePath,
      };
    }

    const initialBody = content ? `# ${dailyTitle}\n\n${content}\n` : `# ${dailyTitle}\n\n`;
    const result = this.createNote({ title: dailyTitle, content: initialBody });

    return {
      created: true,
      updated: false,
      title: dailyTitle,
      relativePath: result.relativePath,
    };
  }
}
