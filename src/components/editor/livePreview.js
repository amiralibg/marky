import { EditorView, Decoration, WidgetType } from "@codemirror/view";
import { StateField } from "@codemirror/state";
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
    const wrap = document.createElement("span");
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

// A rendered block (fenced code, table) that replaces its source until the
// cursor enters it. Wrapped in `.markdown-preview` so preview CSS styles it.
class RenderedBlockWidget extends WidgetType {
  constructor(source) {
    super();
    this.source = source;
  }

  eq(other) {
    return other.source === this.source;
  }

  toDOM() {
    const wrap = document.createElement("div");
    wrap.className = "markdown-preview cm-lp-render";
    wrap.setAttribute("dir", "auto");
    wrap.innerHTML = renderFragment(this.source, false);
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

  toDOM() {
    const wrap = document.createElement("span");
    wrap.className = "markdown-preview cm-lp-inline-render";
    wrap.innerHTML = renderFragment(this.source, true);
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
  constructor(source) {
    super();
    this.source = source;
  }

  eq(other) {
    return other.source === this.source;
  }

  toDOM(view) {
    const wrap = document.createElement("div");
    wrap.className = "cm-lp-mermaid";
    wrap.setAttribute("dir", "ltr");
    wrap.textContent = "Rendering diagram…";
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
  constructor(tex) {
    super();
    this.tex = tex;
  }

  eq(other) {
    return other.tex === this.tex;
  }

  toDOM() {
    const wrap = document.createElement("div");
    wrap.className = "cm-lp-math markdown-preview";
    wrap.setAttribute("dir", "ltr");
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
  };
  const mark = (from, to, spec) => {
    if (to > from) ranges.push(Decoration.mark(spec).range(from, to));
  };
  // Rendered widgets (code/table/image) are NOT atomic: a click lands at the
  // block edge, which counts as "touching" and reveals the source to edit.
  const render = (from, to, deco) => {
    if (to >= from) ranges.push(deco.range(from, to));
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
        ranges.push(
          Decoration.line({
            class: `cm-lp-line cm-lp-h${headingLevel}`,
          }).range(line.from)
        );
        const marker = node.node.getChild("HeaderMark");
        if (marker && !touchesLine(node.from, node.to)) {
          // Also swallow the single space after the `#`s.
          let end = marker.to;
          if (doc.sliceString(end, end + 1) === " ") end += 1;
          hide(marker.from, end);
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
        if (!touches(fromLine.from, toLine.to)) {
          if (lang === "mermaid") {
            const codeText = node.node.getChild("CodeText");
            const diagram = codeText ? doc.sliceString(codeText.from, codeText.to) : "";
            if (diagram.trim()) {
              render(
                fromLine.from,
                toLine.to,
                Decoration.replace({
                  widget: new MermaidWidget(diagram.trim()),
                  block: true,
                })
              );
            }
          } else {
            render(
              fromLine.from,
              toLine.to,
              Decoration.replace({
                widget: new RenderedBlockWidget(doc.sliceString(fromLine.from, toLine.to)),
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
        if (!touches(fromLine.from, toLine.to)) {
          render(
            fromLine.from,
            toLine.to,
            Decoration.replace({
              widget: new RenderedBlockWidget(doc.sliceString(fromLine.from, toLine.to)),
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
            widget: new MathWidget(single[1].trim()),
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
              widget: new MathWidget(inner.trim()),
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
  };
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

// Inline styling for the decorated content. Sizes are relative (em) so they
// track the editor's base font size and the app's theme variables.
const livePreviewTheme = EditorView.baseTheme({
  // Live mode reads as prose — sans body, not the mono source font.
  ".cm-content": { fontFamily: "var(--font-family-sans)" },
  ".cm-lp-h1": { fontSize: "1.9em", fontWeight: "700", lineHeight: "1.3" },
  ".cm-lp-h2": { fontSize: "1.55em", fontWeight: "700", lineHeight: "1.3" },
  ".cm-lp-h3": { fontSize: "1.3em", fontWeight: "600", lineHeight: "1.35" },
  ".cm-lp-h4": { fontSize: "1.15em", fontWeight: "600" },
  ".cm-lp-h5": { fontSize: "1.05em", fontWeight: "600" },
  ".cm-lp-h6": { fontSize: "1em", fontWeight: "600", opacity: "0.85" },
  ".cm-lp-code": {
    backgroundColor: "var(--color-item-hover)",
    borderRadius: "4px",
    padding: "0.1em 0.35em",
    fontSize: "0.92em",
    fontFamily: "var(--font-family-mono)",
  },
  ".cm-lp-quote": {
    borderInlineStart: "3px solid var(--color-border)",
    paddingInlineStart: "0.9em",
    color: "var(--color-text-secondary)",
    fontStyle: "italic",
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
  ".cm-lp-hr-wrap": {
    display: "inline-block",
    width: "100%",
    verticalAlign: "middle",
  },
  ".cm-lp-hr": {
    border: "none",
    borderTop: "1px solid var(--color-border)",
    margin: "0.35em 0",
  },
  // Rendered code/table blocks sit inline in the flow; trim the preview CSS's
  // outer block margins so they don't add double spacing between lines.
  ".cm-lp-render": { margin: "0.4em 0" },
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
  return [livePreviewField, livePreviewTheme];
}
