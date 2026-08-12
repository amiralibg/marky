import { EditorView, Decoration, WidgetType } from "@codemirror/view";
import { StateField, StateEffect, EditorState, EditorSelection } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { marked } from "marked";
import katex from "katex";

// ────────────────────────────────────────────────────────────────────────────
// Live Preview
//
// Obsidian-style inline rendering that stays inside CodeMirror. The document is
// always raw markdown (the single source of truth); we only *decorate* it:
//   • syntax markers (`#`, `**`, `` ` ``, `>` …) are hidden and the content is
//     styled inline, so the text reads like formatted prose;
//   • the moment the cursor/selection enters an element, its raw markdown is
//     revealed so you can edit it.
//
// This is a decoration layer only — no second render pane, no scroll sync.
// Heavy blocks (fenced code, mermaid, KaTeX, tables) are intentionally left as
// source here and handled by later phases / the read-only Read view.
// ────────────────────────────────────────────────────────────────────────────

const HEADING_NAMES = {
  ATXHeading1: 1,
  ATXHeading2: 2,
  ATXHeading3: 3,
  ATXHeading4: 4,
  ATXHeading5: 5,
  ATXHeading6: 6,
};

// A checkbox that reflects a `- [ ]` / `- [x]` task marker and toggles the
// underlying markdown when clicked.
class TaskCheckboxWidget extends WidgetType {
  constructor(checked, from, to) {
    super();
    this.checked = checked;
    this.from = from;
    this.to = to;
  }

  eq(other) {
    return other.checked === this.checked && other.from === this.from;
  }

  toDOM(view) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.checked;
    box.className = "cm-lp-task";
    box.setAttribute("aria-label", this.checked ? "Completed task" : "Task");
    // Prevent the click from also moving the cursor into the marker (which
    // would reveal the raw source and feel jumpy).
    box.addEventListener("mousedown", (e) => e.preventDefault());
    box.addEventListener("click", (e) => {
      e.preventDefault();
      const insert = this.checked ? "[ ]" : "[x]";
      view.dispatch({ changes: { from: this.from, to: this.to, insert } });
    });
    return box;
  }

  ignoreEvent() {
    return false;
  }
}

// A rendered horizontal rule replacing `---` / `***` / `___`.
class HorizontalRuleWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    // Block-level, not an inline-block: see `remeasureOnImageLoad`.
    const wrap = document.createElement("div");
    wrap.className = "cm-lp-hr-wrap";
    const hr = document.createElement("hr");
    hr.className = "cm-lp-hr";
    wrap.appendChild(hr);
    return wrap;
  }

  ignoreEvent() {
    return true;
  }
}

// Render a markdown fragment through the app's shared `marked` singleton (the
// same one MarkdownEditor configures — code highlighting via hljs, KaTeX,
// wiki-links all apply), so a Live-mode block looks identical to Read mode.
const renderFragment = (source, inline) => {
  try {
    return inline ? marked.parseInline(source) : marked.parse(source);
  } catch {
    return "";
  }
};

/**
 * Keep CodeMirror's height map in step with a rendered widget.
 *
 * CodeMirror measures a widget by calling `getBoundingClientRect()` on the
 * element `toDOM` returned, and files that height in its height map. Anything
 * the element occupies *outside* its border box is space the map never learns
 * about: a `margin`, or the half-leading of the line box an `inline-block` is
 * dropped into. Every line below the widget then sits lower on screen than the
 * map believes, and the error accumulates widget by widget.
 *
 * Vertical motion is where that surfaces, and it is why `j` used to feel fine
 * while `k` did not. `posAtCoords` searches downward from a line's bottom edge,
 * which the drift only pads out; searching upward it compares the line's top
 * against its first character's real position, decides it has landed in the
 * line's top padding, and skips the line entirely — then repeats, so a single
 * `k` under a couple of rendered blocks could clear twenty lines at once.
 *
 * Hence the two rules every widget below follows: be block-level and space
 * yourself with padding, never margin; and if you contain an image — which
 * measures as zero-height until it loads, well after CodeMirror looked — ask
 * for a re-measure once it arrives.
 */
function remeasureOnImageLoad(dom, view) {
  for (const img of dom.querySelectorAll("img")) {
    if (img.complete) continue;
    const remeasure = () => view?.requestMeasure?.();
    img.addEventListener("load", remeasure, { once: true });
    img.addEventListener("error", remeasure, { once: true });
  }
}

/**
 * Move the cursor into a rendered block on click.
 *
 * Left to CodeMirror, a click on a block widget resolves to whichever edge of
 * the block is nearer, and that position can land *outside* it — the block then
 * stays rendered and the click looks like it did nothing. Every block widget
 * dispatches its own position instead, so "click it to edit it" always holds.
 */
function revealAt(view, pos) {
  view.dispatch({ selection: { anchor: Math.max(0, Math.min(pos, view.state.doc.length)) } });
  view.focus();
}

function revealOnClick(dom, view, pos) {
  dom.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    revealAt(view, pos);
  });
}

/**
 * Where in the markdown source a click inside a rendered table landed.
 *
 * Rendered rows map to source lines one-for-one, except that the source has a
 * delimiter row (`| --- |`) after the header which the table never shows — so
 * every body row is one line further down than its visual index suggests.
 * Returns `{ line, column }` as offsets from the block's first line, or null.
 */
function tablePositionAt(target, lines) {
  const cell = target.closest?.("th, td");
  const row = cell?.closest("tr");
  const table = row?.closest("table");
  if (!cell || !row || !table) return null;

  const rows = Array.from(table.querySelectorAll("tr"));
  const rowIndex = rows.indexOf(row);
  if (rowIndex < 0) return null;
  const line = rowIndex === 0 ? 0 : rowIndex + 1;
  if (line >= lines.length) return null;

  // Land just inside the cell you clicked: after its opening pipe, past one
  // padding space. Escaped pipes (`\|`) are content, not separators.
  const cellIndex = Array.from(row.children).indexOf(cell);
  const text = lines[line];
  let pipes = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\\") {
      i += 1;
      continue;
    }
    if (text[i] !== "|") continue;
    pipes += 1;
    if (pipes === cellIndex + 1) {
      const column = text[i + 1] === " " ? i + 2 : i + 1;
      return { line, column: Math.min(column, text.length) };
    }
  }
  return { line, column: 0 };
}

/**
 * Which source line a click inside a rendered code block landed on. Code lines
 * never wrap (`white-space: pre` in the preview sheet), so they are uniform
 * height and the offset from the top of the <code> element gives the line
 * directly. `+ 1` skips the opening fence, which the rendered block hides.
 */
function codeLineAt(target, event, lineCount) {
  const code = target.closest?.("pre")?.querySelector("code");
  if (!code) return null;
  const rect = code.getBoundingClientRect();
  const lineHeight = parseFloat(getComputedStyle(code).lineHeight);
  if (!lineHeight) return null;
  const index = Math.floor((event.clientY - rect.top) / lineHeight);
  return { line: Math.min(Math.max(index, 0) + 1, lineCount - 1), column: 0 };
}

// A rendered block (fenced code, table) that replaces its source until the
// cursor enters it. Wrapped in `.markdown-preview` so preview CSS styles it.
class RenderedBlockWidget extends WidgetType {
  constructor(source, from) {
    super();
    this.source = source;
    // Document offset of the block's first line, so a click can be mapped back
    // to a source position. Part of `eq` — an edit above the block moves it
    // without changing its text, and a stale offset would misplace the cursor.
    this.from = from;
  }

  eq(other) {
    return other.source === this.source && other.from === this.from;
  }

  toDOM(view) {
    const wrap = document.createElement("div");
    wrap.className = "markdown-preview cm-lp-render";
    wrap.setAttribute("dir", "auto");
    wrap.innerHTML = renderFragment(this.source, false);

    // Put the cursor where you actually clicked. Without this every click on a
    // rendered block dropped the cursor at the block's edge, so revealing a
    // table meant hunting for the row again — worse under Vim, where you then
    // have to travel there in normal mode.
    wrap.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || event.target.closest?.(".code-copy-btn")) return;
      const lines = this.source.split("\n");
      const hit = tablePositionAt(event.target, lines) ||
        codeLineAt(event.target, event, lines.length) ||
          // Anywhere else in the block (padding, the language label): still open
          // it, at its first line.
          { line: 0, column: 0 };

      let pos = this.from;
      for (let i = 0; i < hit.line; i += 1) pos += lines[i].length + 1;
      pos += Math.min(hit.column, lines[hit.line].length);

      event.preventDefault();
      revealAt(view, pos);
    });

    remeasureOnImageLoad(wrap, view);
    return wrap;
  }

  // Let clicks through so placing the cursor at the block edge reveals source.
  ignoreEvent() {
    return false;
  }
}

// A rendered inline fragment (e.g. an image) that replaces its source.
class RenderedInlineWidget extends WidgetType {
  constructor(source) {
    super();
    this.source = source;
  }

  eq(other) {
    return other.source === this.source;
  }

  toDOM(view) {
    const wrap = document.createElement("span");
    wrap.className = "markdown-preview cm-lp-inline-render";
    wrap.innerHTML = renderFragment(this.source, true);
    remeasureOnImageLoad(wrap, view);
    return wrap;
  }

  ignoreEvent() {
    return false;
  }
}

// Lazy-load mermaid (large dependency) only when a diagram is actually shown.
let mermaidPromise = null;
const getMermaid = () => {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => m.default);
  }
  return mermaidPromise;
};
let mermaidSeq = 0;

// A mermaid diagram rendered from a ```mermaid fence. Rendering is async, so the
// widget shows a placeholder and swaps in the SVG when ready.
class MermaidWidget extends WidgetType {
  constructor(source, from) {
    super();
    this.source = source;
    this.from = from;
  }

  eq(other) {
    return other.source === this.source && other.from === this.from;
  }

  toDOM(view) {
    const wrap = document.createElement("div");
    wrap.className = "cm-lp-mermaid";
    wrap.setAttribute("dir", "ltr");
    wrap.textContent = "Rendering diagram…";
    revealOnClick(wrap, view, this.from);
    const id = `cm-lp-mermaid-${mermaidSeq++}`;
    getMermaid()
      .then((mermaid) => {
        const isDark = document.documentElement.getAttribute("data-theme") !== "light";
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? "dark" : "default",
          securityLevel: "strict",
          fontFamily: "inherit",
        });
        return mermaid.render(id, this.source);
      })
      .then(({ svg }) => {
        wrap.innerHTML = svg;
        view.requestMeasure?.();
      })
      .catch((err) => {
        wrap.classList.add("cm-lp-mermaid-error");
        wrap.textContent = `Diagram error: ${err?.message || err}`;
        view.requestMeasure?.();
      });
    return wrap;
  }

  ignoreEvent() {
    return false;
  }
}

// A KaTeX-rendered math block (`$$ … $$`). Rendering is synchronous.
class MathWidget extends WidgetType {
  constructor(tex, from) {
    super();
    this.tex = tex;
    this.from = from;
  }

  eq(other) {
    return other.tex === this.tex && other.from === this.from;
  }

  toDOM(view) {
    const wrap = document.createElement("div");
    wrap.className = "cm-lp-math markdown-preview";
    wrap.setAttribute("dir", "ltr");
    revealOnClick(wrap, view, this.from);
    try {
      wrap.innerHTML = katex.renderToString(this.tex, {
        throwOnError: false,
        displayMode: true,
      });
    } catch (err) {
      wrap.classList.add("cm-lp-math-error");
      wrap.textContent = `Math error: ${err?.message || err}`;
    }
    return wrap;
  }

  ignoreEvent() {
    return false;
  }
}

const hiddenDeco = Decoration.replace({});

function buildDecorations(state) {
  const doc = state.doc;
  const ranges = [];
  // Only hidden markers and replace-widgets are atomic (cursor skips over them);
  // styled content (code, links) stays freely navigable/selectable.
  const atomic = [];
  // Source ranges currently standing in for a rendered *block* widget. Their
  // lines are collapsed into a single un-navigable block, which vertical motion
  // has to be taught to step into — see `blockStepTarget`.
  const blocks = [];
  // Line ranges the post-pass math scan must not touch (code blocks, quotes).
  const protectedRanges = [];

  // Any selection range touching a span reveals its raw markdown.
  const sel = state.selection;
  const touches = (from, to) => {
    for (const r of sel.ranges) {
      if (r.from <= to && r.to >= from) return true;
    }
    return false;
  };
  // Line-level reveal: cursor anywhere on the element's line(s) reveals it.
  const touchesLine = (from, to) => {
    const l1 = doc.lineAt(from);
    const l2 = doc.lineAt(to);
    return touches(l1.from, l2.to);
  };

  const hide = (from, to) => {
    if (to > from) {
      ranges.push(hiddenDeco.range(from, to));
      atomic.push(hiddenDeco.range(from, to));
    }
  };
  const replaceWidget = (from, to, deco) => {
    ranges.push(deco.range(from, to));
    atomic.push(deco.range(from, to));
    if (deco.spec.block) blocks.push({ from, to });
  };
  const mark = (from, to, spec) => {
    if (to > from) ranges.push(Decoration.mark(spec).range(from, to));
  };
  // Rendered widgets (code/table/image) are NOT atomic: a click lands at the
  // block edge, which counts as "touching" and reveals the source to edit.
  const render = (from, to, deco) => {
    if (to < from) return;
    ranges.push(deco.range(from, to));
    if (deco.spec.block) blocks.push({ from, to });
  };
  // A block that has dropped back to its markdown source keeps the frame the
  // rendered version had, so you can still see where it starts and ends while
  // typing in it — and gets the mono face, without which a table's pipes don't
  // line up and the source is miserable to edit.
  const revealSource = (fromLine, toLine) => {
    for (let n = fromLine.number; n <= toLine.number; n += 1) {
      const line = doc.line(n);
      const edges =
        (n === fromLine.number ? " cm-lp-src-first" : "") +
        (n === toLine.number ? " cm-lp-src-last" : "");
      ranges.push(Decoration.line({ class: `cm-lp-line cm-lp-src${edges}` }).range(line.from));
    }
  };

  syntaxTree(state).iterate({
    from: 0,
    to: doc.length,
    enter: (node) => {
      const name = node.name;

      // ── Headings ───────────────────────────────────────────────
      const headingLevel = HEADING_NAMES[name];
      if (headingLevel) {
        const line = doc.lineAt(node.from);
        const open = touchesLine(node.from, node.to);
        ranges.push(
          Decoration.line({
            class: `cm-lp-line cm-lp-h${headingLevel}${open ? " cm-lp-h-open" : ""}`,
          }).range(line.from)
        );
        const marker = node.node.getChild("HeaderMark");
        if (marker) {
          // Also swallow the single space after the `#`s.
          let end = marker.to;
          if (doc.sliceString(end, end + 1) === " ") end += 1;
          // The marker is never removed from the flow — it is pulled into the
          // left gutter by `.cm-lp-hash` and faded with `opacity` (see the
          // theme below). Replacing it, which is what this used to do, meant
          // the `#`s reappeared *inline* the moment the caret landed on the
          // line and shoved the heading text sideways on every click.
          mark(marker.from, end, { class: "cm-lp-hash" });
          // Caret-off still skips the invisible marker, exactly as the old
          // replace decoration did. Atomic ranges work on any decoration, so
          // this keeps Home/arrow behaviour while the text stays in the DOM.
          if (!open && end > marker.from) {
            atomic.push(hiddenDeco.range(marker.from, end));
          }
        }
        return;
      }

      // ── Fenced code blocks → rendered card (hljs) or mermaid ───
      if (name === "FencedCode") {
        const fromLine = doc.lineAt(node.from);
        const toLine = doc.lineAt(node.to);
        protectedRanges.push({ from: fromLine.from, to: toLine.to });
        const info = node.node.getChild("CodeInfo");
        const lang = info ? doc.sliceString(info.from, info.to).trim() : "";
        if (touches(fromLine.from, toLine.to)) {
          revealSource(fromLine, toLine);
        } else {
          if (lang === "mermaid") {
            const codeText = node.node.getChild("CodeText");
            const diagram = codeText ? doc.sliceString(codeText.from, codeText.to) : "";
            if (diagram.trim()) {
              render(
                fromLine.from,
                toLine.to,
                Decoration.replace({
                  widget: new MermaidWidget(diagram.trim(), codeText.from),
                  block: true,
                })
              );
            }
          } else {
            render(
              fromLine.from,
              toLine.to,
              Decoration.replace({
                widget: new RenderedBlockWidget(
                  doc.sliceString(fromLine.from, toLine.to),
                  fromLine.from
                ),
                block: true,
              })
            );
          }
        }
        return false; // don't decorate inside the code block
      }

      // ── Tables → rendered table ────────────────────────────────
      if (name === "Table") {
        const fromLine = doc.lineAt(node.from);
        const toLine = doc.lineAt(node.to);
        if (touches(fromLine.from, toLine.to)) {
          revealSource(fromLine, toLine);
        } else {
          render(
            fromLine.from,
            toLine.to,
            Decoration.replace({
              widget: new RenderedBlockWidget(
                doc.sliceString(fromLine.from, toLine.to),
                fromLine.from
              ),
              block: true,
            })
          );
        }
        return false;
      }

      // ── Images → rendered inline image ─────────────────────────
      if (name === "Image") {
        if (!touches(node.from, node.to)) {
          render(
            node.from,
            node.to,
            Decoration.replace({
              widget: new RenderedInlineWidget(doc.sliceString(node.from, node.to)),
            })
          );
        }
        return false;
      }

      // ── Emphasis / strong / strikethrough markers ──────────────
      if (name === "EmphasisMark" || name === "StrikethroughMark") {
        const parent = node.node.parent;
        if (parent && !touches(parent.from, parent.to)) {
          hide(node.from, node.to);
        }
        return;
      }

      // ── Inline code ────────────────────────────────────────────
      if (name === "InlineCode") {
        const active = touches(node.from, node.to);
        const marks = node.node.getChildren("CodeMark");
        if (marks.length >= 2) {
          const innerFrom = marks[0].to;
          const innerTo = marks[marks.length - 1].from;
          mark(innerFrom, innerTo, { class: "cm-lp-code" });
          if (!active) {
            hide(marks[0].from, marks[0].to);
            hide(marks[marks.length - 1].from, marks[marks.length - 1].to);
          }
        }
        return;
      }

      // ── Blockquotes ────────────────────────────────────────────
      if (name === "Blockquote") {
        const startLine = doc.lineAt(node.from).number;
        const endLine = doc.lineAt(node.to).number;
        protectedRanges.push({
          from: doc.line(startLine).from,
          to: doc.line(endLine).to,
        });
        for (let n = startLine; n <= endLine; n += 1) {
          const line = doc.line(n);
          ranges.push(Decoration.line({ class: "cm-lp-line cm-lp-quote" }).range(line.from));
        }
        return;
      }
      if (name === "QuoteMark") {
        if (!touchesLine(node.from, node.to)) {
          // Hide the `>` and a trailing space.
          let end = node.to;
          if (doc.sliceString(end, end + 1) === " ") end += 1;
          hide(node.from, end);
        }
        return;
      }

      // ── Task checkboxes ────────────────────────────────────────
      if (name === "TaskMarker") {
        if (!touchesLine(node.from, node.to)) {
          const text = doc.sliceString(node.from, node.to);
          const checked = /x/i.test(text);
          replaceWidget(
            node.from,
            node.to,
            Decoration.replace({
              widget: new TaskCheckboxWidget(checked, node.from, node.to),
            })
          );
        }
        return;
      }

      // ── Horizontal rule ────────────────────────────────────────
      if (name === "HorizontalRule") {
        const line = doc.lineAt(node.from);
        if (!touches(line.from, line.to) && line.to > line.from) {
          replaceWidget(
            line.from,
            line.to,
            Decoration.replace({
              widget: new HorizontalRuleWidget(),
              block: true,
            })
          );
        }
        return;
      }

      // ── Links: show only the text, hide `[`, `]`, `(url)` ──────
      if (name === "Link") {
        if (touches(node.from, node.to)) return; // editing → raw
        const linkMarks = node.node.getChildren("LinkMark");
        if (linkMarks.length < 2) return;
        const open = linkMarks[0]; // `[`
        const close = linkMarks.find((m) => doc.sliceString(m.from, m.to) === "]");
        if (!close) return;
        const textFrom = open.to;
        const textTo = close.from;
        hide(open.from, open.to); // `[`
        hide(close.from, node.to); // `](url)`
        mark(textFrom, textTo, {
          class: "cm-lp-link",
          attributes: { title: doc.sliceString(node.from, node.to) },
        });
        return;
      }
    },
  });

  // ── Block math (`$$ … $$`) — the markdown grammar doesn't tag it, so scan
  // lines directly. Single-line `$$x$$` or fenced across lines. Code blocks and
  // quotes are excluded via protectedRanges to avoid false positives.
  const isProtected = (pos) => protectedRanges.some((r) => pos >= r.from && pos <= r.to);
  const totalLines = doc.lines;
  let ln = 1;
  while (ln <= totalLines) {
    const line = doc.line(ln);
    const trimmed = line.text.trim();
    if (isProtected(line.from)) {
      ln += 1;
      continue;
    }
    const single = /^\$\$(.+?)\$\$$/.exec(trimmed);
    if (single) {
      if (!touches(line.from, line.to)) {
        render(
          line.from,
          line.to,
          Decoration.replace({
            widget: new MathWidget(single[1].trim(), line.from),
            block: true,
          })
        );
      }
      ln += 1;
      continue;
    }
    if (trimmed === "$$") {
      let close = ln + 1;
      while (close <= totalLines) {
        const l2 = doc.line(close);
        if (isProtected(l2.from) || l2.text.trim() === "$$") break;
        close += 1;
      }
      if (close <= totalLines && doc.line(close).text.trim() === "$$" && close > ln + 1) {
        const from = line.from;
        const to = doc.line(close).to;
        const inner = doc.sliceString(doc.line(ln + 1).from, doc.line(close - 1).to);
        if (inner.trim() && !touches(from, to)) {
          render(
            from,
            to,
            Decoration.replace({
              widget: new MathWidget(inner.trim(), doc.line(ln + 1).from),
              block: true,
            })
          );
        }
        ln = close + 1;
        continue;
      }
    }
    ln += 1;
  }

  return {
    decorations: Decoration.set(ranges, true),
    atomics: Decoration.set(atomic, true),
    blocks,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Vertical motion into a rendered block
//
// A rendered block replaces its source lines with one block widget, and a
// widget holds no text. CodeMirror resolves every vertical motion — `j`/`k`,
// vim's display-line `gj`/`gk`, the arrow keys — by mapping screen coordinates
// back to a document position, and a widget has no position to offer, so the
// search steps straight over it. One press then lands clean on the far side:
// the block never opens, and from the reader's side the table simply refuses
// to be entered — you press `k` inside it and end up above it, looking at the
// rendered table again.
//
// Nothing distinguishes that jump from a deliberate one at the transaction
// level, so the shape of the step is the test: it has to start on a block's
// doorstep and land no further than just past it. Travelling motions (`G`, a
// search hit, `}` from further off) don't have that shape and are left alone,
// and a click is excluded outright — it means the position it names.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Where a vertical step that jumped a rendered block should have landed: the
 * block's near edge, in the column the cursor came from.
 *
 * @param {import("@codemirror/state").Text} doc
 * @param {{from: number, to: number}[]} blocks source ranges of rendered blocks
 * @param {number} from head position the motion started at
 * @param {number} to head position it landed on
 * @returns {number|null} repaired position, or null if no block was jumped
 */
export function blockStepTarget(doc, blocks, from, to) {
  if (!blocks.length || from === to) return null;
  const forward = to > from;
  const fromLine = doc.lineAt(from);
  const toLine = doc.lineAt(to).number;

  const edges = blocks.map((b) => ({
    first: doc.lineAt(b.from).number,
    last: doc.lineAt(b.to).number,
  }));

  // Only a step that began on a block's doorstep can have skipped it.
  const near = edges.find((b) =>
    forward ? b.first === fromLine.number + 1 : b.last === fromLine.number - 1
  );
  if (!near) return null;

  // Blocks that touch — a table directly under a fence, with no line between —
  // are a single wall to vertical motion: the search clears the whole run in
  // one go. Follow the run to its far side so the landing test recognises the
  // step, while the cursor still belongs on the near block's edge.
  let far = near;
  for (;;) {
    const next = edges.find((b) => (forward ? b.first === far.last + 1 : b.last === far.first - 1));
    if (!next) break;
    far = next;
  }

  // A step, not a journey. It normally lands on the line past the wall; when
  // the wall runs to the edge of the document there is no such line and the
  // search clamps onto the wall itself, which counts too. Anything further is a
  // deliberate jump (`G`, a search hit, `}` from off in the distance).
  const past = forward ? far.last + 1 : far.first - 1;
  const stepped = forward
    ? toLine >= far.last && toLine <= past
    : toLine <= far.first && toLine >= past;
  if (!stepped) return null;

  const target = doc.line(forward ? near.first : near.last);
  return target.from + Math.min(from - fromLine.from, target.length);
}

// Block widgets (fenced code, tables) and any replacement that crosses a line
// break must be supplied by a StateField, not a ViewPlugin — hence a field.
// It rebuilds on doc or selection change (selection drives the reveal logic).
const livePreviewField = StateField.define({
  create(state) {
    return buildDecorations(state);
  },
  update(value, tr) {
    if (tr.docChanged || tr.selection) {
      return buildDecorations(tr.state);
    }
    return value;
  },
  provide: (field) => [
    EditorView.decorations.from(field, (v) => v.decorations),
    // Cursor motion skips over hidden markers / widgets, but not styled content.
    EditorView.atomicRanges.of(
      (view) => view.state.field(field, false)?.atomics || Decoration.none
    ),
  ],
});

/**
 * Marks a transaction whose selection the filter below rewrote.
 *
 * Vim keeps its own copy of the visual-mode selection and only re-reads
 * CodeMirror's when a selection change came from outside vim — a mouse drag,
 * say. This repair rides along inside vim's own transaction, so it doesn't look
 * like one, and vim's copy silently goes stale: the next `j` continues from
 * where the motion had wrongly landed rather than from the block it was pulled
 * into. `vimBlockStepSync` in `vimSetup` watches for this effect and puts vim
 * back in step. Normal mode needs no such help — it re-reads the cursor from
 * CodeMirror on every key.
 */
export const blockStepRepair = StateEffect.define();

// Redirect a vertical step that cleared a rendered block back into it. Runs as
// a transaction filter rather than a keymap so it covers every way the cursor
// moves a line — vim's `j`/`k` and `gj`/`gk` bypass CodeMirror's keymaps
// entirely, and the arrow keys reach it in insert mode and with vim off.
const blockStepFilter = EditorState.transactionFilter.of((tr) => {
  if (tr.docChanged || !tr.selection || tr.isUserEvent("select.pointer")) return tr;
  const before = tr.startState;
  const blocks = before.field(livePreviewField, false)?.blocks;
  if (!blocks?.length) return tr;
  // Vim moves one range; multi-cursor motion is left as CodeMirror computed it.
  if (before.selection.ranges.length !== 1 || tr.newSelection.ranges.length !== 1) return tr;

  const main = tr.newSelection.main;
  const target = blockStepTarget(before.doc, blocks, before.selection.main.head, main.head);
  if (target === null) return tr;

  // Keep the anchor so an in-progress visual selection still grows from where
  // it started; a plain cursor collapses onto the repaired position.
  const selection = main.empty
    ? EditorSelection.cursor(target)
    : EditorSelection.range(main.anchor, target);
  return [tr, { selection, effects: blockStepRepair.of(null) }];
});

// Inline styling for the decorated content. Sizes are relative (em) so they
// track the editor's base font size and the app's theme variables.
const livePreviewTheme = EditorView.baseTheme({
  // Live mode reads as prose — sans body, not the mono source font.
  //
  // The wider gutter is room for the hanging hashes below. `###### ` measures
  // 65px including its trailing pad — well past the 2.25rem the base editor
  // leaves, and past 3.5rem too, which clipped it against the pane edge. 4.5rem
  // clears the widest marker at every heading size.
  //
  // It is set as a custom property, which `markyTheme` reads in its own
  // `padding` shorthand — that rule comes from `EditorView.theme` and outranks
  // this base theme, so declaring `padding-inline` here would simply lose.
  ".cm-content": {
    fontFamily: "var(--font-family-sans)",
    "--marky-editor-gutter": "4.5rem",
  },
  // A flat top pad on every level, matching the preview sheet's heading
  // `margin-top`. Without it Read mode gave a heading room to breathe and Live
  // mode gave it none, so the same document had two different rhythms.
  //
  // Padding on a `.cm-line` is the thing `.cm-lp-src-first` below deliberately
  // avoids — but that case is about *uneven heights inside one block*, which is
  // what makes Vim's screen-coordinate `j`/`k` misfire mid-fence. A heading is
  // a single line that is already taller than its neighbours via `font-size`;
  // padding it keeps every heading line uniform, so stepping stays predictable.
  ".cm-lp-h1, .cm-lp-h2, .cm-lp-h3, .cm-lp-h4, .cm-lp-h5, .cm-lp-h6": {
    paddingTop: "0.5rem",
    // Positioning context for the hanging hash below.
    position: "relative",
  },
  // The ATX `#` markers, hung in the left gutter so heading *text* keeps the
  // same left edge as body copy whether or not the caret is on the line.
  //
  // `inset-inline-end`, not `right`: marky flips whole lines to `dir="rtl"`
  // (see the bidi plugin in extensions.js), and a physical offset would park
  // the hash on the wrong side of a Persian heading.
  //
  // Faded with `opacity`, never `font-size: 0`. A zero-size marker measures as
  // a collapsed rect on the baseline, and CodeMirror probes the line's first
  // character to decide whether a vertical-motion hit landed inside the line —
  // with the collapsed rect, ArrowUp from the line below overshoots and skips
  // the heading entirely.
  ".cm-lp-hash": {
    position: "absolute",
    insetInlineEnd: "100%",
    paddingInlineEnd: "0.4em",
    color: "var(--color-text-muted)",
    whiteSpace: "pre",
    opacity: "0",
    transition: "opacity 120ms ease",
  },
  ".cm-lp-h-open .cm-lp-hash": { opacity: "1" },
  ".cm-lp-h1": { fontSize: "1.9em", fontWeight: "700", lineHeight: "1.3" },
  ".cm-lp-h2": { fontSize: "1.55em", fontWeight: "700", lineHeight: "1.3" },
  ".cm-lp-h3": { fontSize: "1.3em", fontWeight: "600", lineHeight: "1.35" },
  ".cm-lp-h4": { fontSize: "1.15em", fontWeight: "600" },
  ".cm-lp-h5": { fontSize: "1.05em", fontWeight: "600" },
  ".cm-lp-h6": { fontSize: "1em", fontWeight: "600", opacity: "0.85" },
  // Kept in step with `.markdown-preview code` / `blockquote` in
  // MarkdownPreview.css so a block looks the same in Live and Read.
  ".cm-lp-code": {
    // Same mix as `--md-surface-strong` in MarkdownPreview.css; the variable
    // itself lives on `.markdown-preview`, which the editor content is not.
    backgroundColor: "color-mix(in srgb, var(--color-text-primary) 8%, var(--color-bg-editor))",
    borderRadius: "4px",
    padding: "0.14em 0.38em",
    fontSize: "0.9em",
    fontFamily: "var(--font-family-mono)",
    fontVariantLigatures: "none",
  },
  ".cm-lp-quote": {
    borderInlineStart: "3px solid color-mix(in srgb, var(--color-accent) 45%, transparent)",
    paddingInlineStart: "1.1em",
    color: "var(--color-text-secondary)",
  },
  ".cm-lp-link": {
    color: "var(--color-accent)",
    textDecoration: "underline",
    cursor: "pointer",
  },
  "input.cm-lp-task": {
    verticalAlign: "middle",
    marginInlineEnd: "0.45em",
    cursor: "pointer",
    accentColor: "var(--color-accent)",
  },
  // Padding, not margin, and the rule itself carries none — see
  // `remeasureOnImageLoad` for why nothing here may sit outside the border box.
  ".cm-lp-hr-wrap": { padding: "0.45em 0" },
  ".cm-lp-hr": {
    border: "none",
    borderTop: "1px solid var(--color-border)",
    margin: "0",
  },
  // A table or fenced block showing its source because the cursor is inside
  // it. Same surface as the rendered card, so the block doesn't visually
  // vanish the moment you click into it — you keep seeing its extent.
  ".cm-lp-src": {
    backgroundColor: "color-mix(in srgb, var(--color-text-primary) 4.5%, var(--color-bg-editor))",
    fontFamily: "var(--font-family-mono)",
  },
  // The box's top and bottom insets are drawn with a box-shadow, not padding.
  // A shadow repeats the element's rounded box offset by 6px and costs nothing
  // in layout; padding would make these two lines taller than every other line,
  // and Vim's `j`/`k` (and `gj`/`gk`) resolve vertical motion through screen
  // coordinates — uneven line heights are exactly what makes those misfire.
  ".cm-lp-src-first": {
    borderTopLeftRadius: "10px",
    borderTopRightRadius: "10px",
    boxShadow:
      "0 -6px 0 color-mix(in srgb, var(--color-text-primary) 4.5%, var(--color-bg-editor))",
  },
  ".cm-lp-src-last": {
    borderBottomLeftRadius: "10px",
    borderBottomRightRadius: "10px",
    boxShadow: "0 6px 0 color-mix(in srgb, var(--color-text-primary) 4.5%, var(--color-bg-editor))",
  },
  // A one-line block carries both edges, so it needs both shadows.
  ".cm-lp-src-first.cm-lp-src-last": {
    boxShadow:
      "0 -6px 0 color-mix(in srgb, var(--color-text-primary) 4.5%, var(--color-bg-editor))," +
      "0 6px 0 color-mix(in srgb, var(--color-text-primary) 4.5%, var(--color-bg-editor))",
  },
  // Rendered code/table blocks sit inline in the flow; trim the preview CSS's
  // outer block margins so they don't add double spacing between lines. The
  // block's own breathing room is padding — a margin would fall outside the
  // rect CodeMirror measures and desync its height map.
  ".cm-lp-render": { padding: "0.4em 0" },
  ".cm-lp-render > *:first-child": { marginTop: "0" },
  ".cm-lp-render > *:last-child": { marginBottom: "0" },
  ".cm-lp-inline-render": { display: "inline-block", verticalAlign: "middle" },
  ".cm-lp-inline-render img": { maxWidth: "100%", borderRadius: "6px" },
  ".cm-lp-mermaid": {
    display: "flex",
    justifyContent: "center",
    padding: "0.6em 0",
    color: "var(--color-text-muted)",
  },
  ".cm-lp-mermaid svg": { maxWidth: "100%", height: "auto" },
  ".cm-lp-mermaid-error, .cm-lp-math-error": {
    color: "var(--color-danger, #e5484d)",
    fontFamily: "var(--font-family-mono)",
    fontSize: "0.85em",
  },
  ".cm-lp-math": { padding: "0.3em 0", overflowX: "auto" },
});

export function livePreview() {
  return [livePreviewField, blockStepFilter, livePreviewTheme];
}
