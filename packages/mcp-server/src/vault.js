import fs from "node:fs";
import path from "node:path";
import Fuse from "fuse.js";

const DEFAULT_IGNORE_PATTERNS = [
  ".git",
  "node_modules",
  ".trash",
  ".obsidian",
  ".marky",
  ".DS_Store",
];

const FRONTMATTER_BOUNDARY = "---";

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
  return name
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export class Vault {
  constructor(vaultPath, options = {}) {
    this.vaultPath = path.resolve(vaultPath);
    this.ignorePatterns = options.ignorePatterns || DEFAULT_IGNORE_PATTERNS;
    if (!fs.existsSync(this.vaultPath)) {
      throw new Error(`Vault path does not exist: ${this.vaultPath}`);
    }
    if (!fs.statSync(this.vaultPath).isDirectory()) {
      throw new Error(`Vault path is not a directory: ${this.vaultPath}`);
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
    const walk = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(this.vaultPath, fullPath);

        if (this.shouldIgnore(relPath)) continue;

        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && /\.(md|markdown|txt)$/i.test(entry.name)) {
          const stats = fs.statSync(fullPath);
          const rawContent = fs.readFileSync(fullPath, "utf-8");
          const parsed = parseFrontmatter(rawContent);
          const frontmatterTags = normalizeList(parsed.attributes.tags);
          const inlineTags = extractInlineTags(parsed.body);
          const allTags = Array.from(
            new Set([...frontmatterTags.map((t) => t.toLowerCase()), ...inlineTags])
          ).sort();

          const outgoingLinks = extractWikiLinks(parsed.body);
          const title = normalizeNoteTitle(entry.name);

          notes.push({
            title,
            fileName: entry.name,
            relativePath: relPath.replace(/\\/g, "/"),
            fullPath,
            folder:
              path.dirname(relPath).replace(/\\/g, "/") === "."
                ? ""
                : path.dirname(relPath).replace(/\\/g, "/"),
            size: stats.size,
            mtime: stats.mtimeMs,
            created: stats.birthtimeMs,
            hasFrontmatter: parsed.hasFrontmatter,
            attributes: parsed.attributes,
            tags: allTags,
            outgoingLinks,
            rawContent,
            body: parsed.body,
          });
        }
      }
    };

    walk(this.vaultPath);
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

  listNotes({ folder = null, tag = null } = {}) {
    const { notes } = this.buildIndex();
    return notes
      .filter((n) => {
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
      })
      .map((n) => ({
        title: n.title,
        relativePath: n.relativePath,
        folder: n.folder,
        tags: n.tags,
        size: n.size,
        modified: new Date(n.mtime).toISOString(),
        outgoingLinksCount: n.outgoingLinks.length,
      }));
  }

  findNote(pathOrTitle) {
    const { notes, noteByTitle, noteByPath } = this.buildIndex();
    if (!pathOrTitle) return null;

    const normalized = pathOrTitle.replace(/\\/g, "/").toLowerCase();
    if (noteByPath.has(normalized)) return noteByPath.get(normalized);

    const titleKey = normalizeNoteTitle(pathOrTitle).toLowerCase();
    if (noteByTitle.has(titleKey)) return noteByTitle.get(titleKey);

    return (
      notes.find(
        (n) =>
          n.relativePath.toLowerCase().endsWith(normalized) || n.title.toLowerCase() === titleKey
      ) || null
    );
  }

  readNote(pathOrTitle) {
    const index = this.buildIndex();
    const note = this.findNote(pathOrTitle);
    if (!note) {
      throw new Error(`Note not found: "${pathOrTitle}"`);
    }

    const backlinks = index.backlinksMap.get(note.title.toLowerCase()) || [];

    return {
      title: note.title,
      relativePath: note.relativePath,
      folder: note.folder,
      tags: note.tags,
      attributes: note.attributes,
      rawContent: note.rawContent,
      body: note.body,
      outgoingLinks: note.outgoingLinks,
      backlinks,
      modified: new Date(note.mtime).toISOString(),
      created: new Date(note.created).toISOString(),
    };
  }

  createNote({ title, folder = "", content = "", tags = [], attributes = {} }) {
    if (!title || !title.trim()) {
      throw new Error("Note title is required");
    }

    const safeTitle = sanitizeFileName(title.trim());
    const fileName = safeTitle.endsWith(".md") ? safeTitle : `${safeTitle}.md`;

    const targetDir = folder ? path.join(this.vaultPath, folder) : this.vaultPath;

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const fullPath = path.join(targetDir, fileName);
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

  updateNote({ relativePath, content, attributes = null }) {
    const note = this.findNote(relativePath);
    if (!note) {
      throw new Error(`Note not found: "${relativePath}"`);
    }

    let fileContent = content;
    if (attributes !== null) {
      fileContent = writeFrontmatter(content !== undefined ? content : note.body, attributes);
    }

    fs.writeFileSync(note.fullPath, fileContent, "utf-8");

    return {
      success: true,
      relativePath: note.relativePath,
      modified: new Date().toISOString(),
    };
  }

  appendToNote({ relativePath, content }) {
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

  searchNotes(query, { tag = null, folder = null, limit = 20 } = {}) {
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
      return candidates.slice(0, limit).map((n) => ({
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
    return results.slice(0, limit).map((res) => {
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

  createOrAppendDailyNote(dateStr = null, content = "") {
    const date = dateStr ? new Date(dateStr) : new Date();
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date format: "${dateStr}". Use YYYY-MM-DD.`);
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dailyTitle = `${year}-${month}-${day}`;
    const dailyFolder = "Daily";

    const dailyDir = path.join(this.vaultPath, dailyFolder);
    if (!fs.existsSync(dailyDir)) {
      fs.mkdirSync(dailyDir, { recursive: true });
    }

    const dailyPath = path.join(dailyDir, `${dailyTitle}.md`);
    const relPath = `${dailyFolder}/${dailyTitle}.md`;

    if (fs.existsSync(dailyPath)) {
      if (content && content.trim()) {
        this.appendToNote({ relativePath: relPath, content });
      }
      return {
        created: false,
        updated: true,
        title: dailyTitle,
        relativePath: relPath,
      };
    } else {
      const initialBody = content ? `# ${dailyTitle}\n\n${content}\n` : `# ${dailyTitle}\n\n`;
      const frontmatter = {
        type: "daily-note",
        date: dailyTitle,
        tags: ["daily-notes"],
      };
      this.createNote({
        title: dailyTitle,
        folder: dailyFolder,
        content: initialBody,
        attributes: frontmatter,
      });
      return {
        created: true,
        updated: false,
        title: dailyTitle,
        relativePath: relPath,
      };
    }
  }
}
