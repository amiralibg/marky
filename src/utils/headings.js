import { slugify } from "./slugify";

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;
const ATX_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const SETEXT_RE = /^(=+|-+)\s*$/;

/**
 * Extract the heading outline from a markdown document.
 *
 * Fenced code blocks are skipped (a `# comment` inside a fence is not a
 * heading) and so is a leading YAML frontmatter block (its closing `---` would
 * otherwise read as a setext underline for the last key/value line).
 *
 * @param {string} markdown
 * @returns {Array<{level: number, text: string, id: string, line: number}>}
 *   `line` is 1-based and points at the heading text.
 */
export const parseHeadings = (markdown) => {
  if (!markdown) return [];

  const lines = markdown.split("\n");
  const headings = [];

  let start = 0;
  if (lines[0]?.trim() === "---") {
    const close = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
    if (close > 0) start = close + 1;
  }

  let fence = null;

  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];

    const fenceMatch = FENCE_RE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence) continue;

    const atx = ATX_RE.exec(line);
    if (atx) {
      const text = atx[2].trim();
      headings.push({ level: atx[1].length, text, id: slugify(text), line: i + 1 });
      continue;
    }

    // Setext heading: the underline sits on this line, the text on the one
    // above. A `-` underline only counts when the line above is plain prose —
    // otherwise a list item followed by a horizontal rule would misfire.
    if (i > start && SETEXT_RE.test(line)) {
      const prev = (lines[i - 1] || "").trim();
      if (prev && !/^([#>]|[-*+]\s|\d+[.)]\s)/.test(prev)) {
        headings.push({
          level: line.trim()[0] === "=" ? 1 : 2,
          text: prev,
          id: slugify(prev),
          line: i,
        });
      }
    }
  }

  return headings;
};

/**
 * Index of the heading a given document line belongs to — the last heading at
 * or above it. Returns -1 when the line sits before the first heading.
 *
 * @param {Array<{line: number}>} headings
 * @param {number} line 1-based document line
 */
export const activeHeadingIndex = (headings, line) => {
  let active = -1;
  for (let i = 0; i < headings.length; i += 1) {
    if (headings[i].line <= line) active = i;
    else break;
  }
  return active;
};

/**
 * Every heading the cursor currently sits *under* — the active heading plus its
 * ancestors. Reading under "Key flows" inside "Architecture" lights up both, so
 * the outline shows where you are in the tree rather than a single orphaned
 * row.
 *
 * Walks backwards from the active heading, keeping each one that is shallower
 * than the shallowest kept so far. Levels may skip (an `h4` directly under an
 * `h2`) and may go *up* mid-document, which is why this is a running-minimum
 * walk and not a fixed `level - 1` lookup.
 *
 * @param {Array<{level: number, line: number}>} headings
 * @param {number} line 1-based document line
 * @returns {Set<number>} indices into `headings`; empty before the first one
 */
export const activeHeadingPath = (headings, line) => {
  const path = new Set();
  let i = activeHeadingIndex(headings, line);
  if (i < 0) return path;

  path.add(i);
  let depth = headings[i].level;
  for (i -= 1; i >= 0 && depth > 1; i -= 1) {
    if (headings[i].level < depth) {
      path.add(i);
      depth = headings[i].level;
    }
  }
  return path;
};
