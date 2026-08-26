/**
 * Pipe-table parsing and serialization for the visual table editor.
 *
 * Pure string/array work on purpose: the round-trip markdown → grid → markdown
 * is where tables corrupt themselves, and these are the parts worth testing
 * without a CodeMirror fixture.
 */

/** Split one source line into cell strings; `\|` is content, not a separator. */
const splitCells = (line) => {
  let inner = line.trim();
  if (inner.startsWith("|")) inner = inner.slice(1);
  if (inner.endsWith("|") && !inner.endsWith("\\|")) inner = inner.slice(0, -1);

  const cells = [];
  let current = "";
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch === "\\" && inner[i + 1] === "|") {
      current += "|";
      i += 1;
    } else if (ch === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
};

const isDelimiterRow = (cells) =>
  cells.length > 0 && cells.every((cell) => /^:?-{1,}:?$/.test(cell.replace(/\s+/g, "")));

/** Read alignment out of a delimiter cell: left / right / center / null. */
const alignOf = (cell) => {
  const compact = cell.replace(/\s+/g, "");
  const left = compact.startsWith(":");
  const right = compact.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
};

/** Build one delimiter cell for an alignment. */
const delimiterFor = (align) =>
  align === "center" ? ":---:" : align === "left" ? ":---" : align === "right" ? "---:" : "---";

/**
 * Parse a fenced table's source into an editable grid.
 *
 * @returns {{ rows: string[][], aligns: (string|null)[] } | null}
 *   `rows[0]` is the header; `aligns` preserves how each column was aligned.
 *   Null for anything that is not a well-formed GFM table (no delimiter row,
 *   ragged beyond repair) — callers fall back to the rendered-only widget.
 */
export const parsePipeTable = (source) => {
  if (!source || typeof source !== "string") return null;
  const lines = source.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length < 2) return null;

  const header = splitCells(lines[0]);
  const delimiter = splitCells(lines[1]);
  if (!isDelimiterRow(delimiter)) return null;
  // A delimiter column count that disagrees with the header would make any
  // round-trip lossy; treat it as not-a-table rather than guess.
  if (delimiter.length !== header.length) return null;

  const aligns = delimiter.map(alignOf);
  const body = lines.slice(2).map((line) => {
    const cells = splitCells(line);
    // Pad or trim to the header width so the grid stays rectangular; short
    // rows are legal markdown and must survive an edit untouched.
    while (cells.length < header.length) cells.push("");
    return cells.slice(0, header.length);
  });

  return { rows: [header, ...body], aligns };
};

// A pipe row is one line by definition, so a newline inside a cell is not
// escapable — it splits the row and silently rewrites the table. Contenteditable
// cells can produce one (a paste, or Enter on a browser that ignores our
// keydown), so they collapse to a space here rather than corrupting the source.
const escapeCell = (value) =>
  String(value)
    .replace(/\s*\r?\n\s*/g, " ")
    .replace(/\|/g, "\\|");

/**
 * Serialize a grid back to pipe-table source. Empty columns are dropped only
 * when asked for explicitly (column removal handles its own bookkeeping).
 */
export const serializePipeTable = ({ rows, aligns }) => {
  const width = rows[0]?.length ?? 0;
  const safeAligns = Array.from({ length: width }, (_, i) => aligns?.[i] ?? null);
  const renderRow = (cells) => `| ${cells.map(escapeCell).join(" | ")} |`;
  return [renderRow(rows[0]), renderRow(safeAligns.map(delimiterFor))]
    .concat(rows.slice(1).map(renderRow))
    .join("\n");
};

// ── Grid operations ─────────────────────────────────────────────────────────

/** Insert a row of empty cells before index `at` (rows.length appends). */
export const insertRow = ({ rows, aligns }, at) => {
  const width = rows[0]?.length ?? 0;
  const next = rows.slice();
  next.splice(
    Math.max(1, Math.min(at, next.length)),
    0,
    Array.from({ length: width }, () => "")
  );
  return { rows: next, aligns };
};

export const removeRow = ({ rows, aligns }, at) => {
  // The header row is never deletable — a table without a header is not a
  // table in GFM, so deleting it would silently rewrite the table's meaning.
  if (rows.length <= 1) return { rows, aligns };
  const clamped = Math.max(1, Math.min(at, rows.length - 1));
  const next = rows.slice();
  next.splice(clamped, 1);
  return { rows: next, aligns };
};

export const insertColumn = ({ rows, aligns }, at) => {
  const clamped = Math.max(0, Math.min(at, rows[0]?.length ?? 0));
  return {
    rows: rows.map((row) => {
      const next = row.slice();
      next.splice(clamped, 0, "");
      return next;
    }),
    aligns: (() => {
      const next = aligns.slice();
      next.splice(clamped, 0, null);
      return next;
    })(),
  };
};

/**
 * Set (or clear) a column's alignment. Re-applying the alignment a column
 * already has clears it back to the default, so the toolbar buttons toggle.
 */
export const setColumnAlign = ({ rows, aligns }, at, align) => {
  const width = rows[0]?.length ?? 0;
  if (at < 0 || at >= width) return { rows, aligns };
  const next = Array.from({ length: width }, (_, i) => aligns?.[i] ?? null);
  next[at] = next[at] === align ? null : align;
  return { rows, aligns: next };
};

export const removeColumn = ({ rows, aligns }, at) => {
  if ((rows[0]?.length ?? 0) <= 1) return { rows, aligns };
  const clamped = Math.max(0, Math.min(at, rows[0].length - 1));
  return {
    rows: rows.map((row) => {
      const next = row.slice();
      next.splice(clamped, 1);
      return next;
    }),
    aligns: aligns.filter((_, i) => i !== clamped),
  };
};
