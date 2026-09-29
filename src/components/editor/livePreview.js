import { EditorView, Decoration, WidgetType } from "@codemirror/view";
import { StateField, StateEffect, EditorState, EditorSelection } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { marked } from "marked";
import katex from "katex";
import { detectBaseDirection } from "../../utils/bidi";
import { widgetSelectionHighlight } from "./widgetSelectionHighlight";
import {
  parsePipeTable,
  serializePipeTable,
  insertRow,
  insertColumn,
  removeRow,
  removeColumn,
  setColumnAlign,
} from "./tableEdit";
import { parseFrontmatter, stringifyFrontmatter } from "../../utils/frontmatter";
import { copyText } from "../../utils/clipboard";
import { highlightCode, detectCodeLanguage } from "./markdownPreview";

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
    return other.checked === this.checked;
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
      const pos = view.posAtDOM(box) ?? this.from;
      const len = this.to - this.from;
      view.dispatch({ changes: { from: pos, to: pos + len, insert } });
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
    const targetPos =
      typeof pos === "function" ? pos() : typeof pos === "number" ? pos : view.posAtDOM(dom);
    if (targetPos != null) revealAt(view, targetPos);
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

/**
 * Wrap preference for rendered code blocks, keyed by block source. A re-render
 * (any edit above the block) would otherwise reset the toggle; the map is
 * bounded because a document only ever holds so many distinct blocks.
 */
const codeWrapState = new Map();
const CODE_WRAP_LIMIT = 64;

const COMMON_LANGUAGES = [
  "javascript",
  "typescript",
  "python",
  "rust",
  "go",
  "bash",
  "json",
  "yaml",
  "html",
  "css",
  "sql",
];

/**
 * Hover chrome for a rendered fenced-code block: click the language label to
 * change it (rewrites the fence's info string in the source), copy with one
 * click, toggle soft wrapping. Everything else about the block is untouched.
 */
function attachCodeChrome(wrap, view, source, from) {
  const getFrom = () => view.posAtDOM(wrap) ?? from;
  const header = wrap.querySelector(".code-block-header");
  const copyBtn = wrap.querySelector(".code-copy-btn");
  if (!header) return;

  // ── Copy ────────────────────────────────────────────────────────────────
  if (copyBtn) {
    // The code inside the block is contenteditable, so a mousedown that runs
    // its default action drops the caret into it and the block flips into edit
    // mode — the reported "copy button edits instead of copying". The wrap
    // toggle and the frontmatter `</>` chip already guard this the same way.
    copyBtn.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    copyBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      // `textContent` of the rendered `pre` is the live text while the block is
      // being edited; `data-code` is what it was rendered from.
      const text = wrap.querySelector("pre")?.textContent || copyBtn.dataset.code || "";
      copyText(text).then((ok) => {
        if (!ok) return;
        const copied = copyBtn.querySelector(".copy-icon");
        const check = copyBtn.querySelector(".check-icon");
        if (copied) copied.style.display = "none";
        if (check) check.style.display = "";
        setTimeout(() => {
          if (copied) copied.style.display = "";
          if (check) check.style.display = "none";
        }, 1400);
      });
    });
  }

  const closeMenu = () => {
    wrap.querySelector(".cm-lp-langmenu")?.remove();
  };

  // ── Language picker ────────────────────────────────────────────────────
  const langLabel = header.querySelector(".code-block-lang");
  if (langLabel) {
    langLabel.classList.add("cm-lp-langpick");
    langLabel.title = "Change language";

    langLabel.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (wrap.querySelector(".cm-lp-langmenu")) {
        closeMenu();
        return;
      }

      const menu = document.createElement("div");
      menu.className = "cm-lp-langmenu";
      menu.setAttribute("role", "listbox");
      menu.setAttribute("aria-label", "Code language");

      const current = langLabel.textContent.trim().toLowerCase();
      for (const lang of ["text", ...COMMON_LANGUAGES]) {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "cm-lp-langopt";
        option.textContent = lang;
        option.setAttribute("role", "option");
        if (lang === current || (lang === "text" && !current)) {
          option.setAttribute("aria-selected", "true");
          option.classList.add("cm-lp-langopt-active");
        }
        option.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          closeMenu();

          // Rewrite the opening fence's info string in place.
          const fence = source.match(/^(`{3,})[^\n`]*/);
          const liveFrom = getFrom();
          if (
            !fence ||
            liveFrom == null ||
            view.state.doc.sliceString(liveFrom, liveFrom + source.length) !== source
          )
            return;
          const insert = lang === "text" ? "" : lang;
          view.dispatch({
            changes: {
              from: liveFrom + fence[1].length,
              to: liveFrom + fence[0].length,
              insert,
            },
          });
          view.focus();
        });
        menu.appendChild(option);
      }

      langLabel.appendChild(menu);
      const dismiss = (e) => {
        if (menu.contains(e.target)) return;
        closeMenu();
        document.removeEventListener("mousedown", dismiss);
      };
      document.addEventListener("mousedown", dismiss);
    });
  }

  // ── In-place editing ─────────────────────────────────────────────────────
  // The rendered code is directly editable, same contract as the table widget:
  // click in and type. Editing happens against plain text (typing inside
  // highlight spans would mangle them), but every keystroke re-highlights the
  // block and restores the caret, so colour tracks the text as you go.
  // Committing rewrites the block source, which rebuilds the widget with a
  // fresh render.
  const codeEl = wrap.querySelector("pre > code");
  if (codeEl) {
    try {
      codeEl.contentEditable = "plaintext-only";
    } catch {
      codeEl.contentEditable = "true";
    }
    codeEl.spellcheck = false;

    const fenceLine = () => {
      const first = source.split("\n")[0] || "```";
      const ticks = first.match(/^`{3,}/)?.[0] ?? "```";
      return { opening: first, closing: ticks };
    };
    const fenceLang = () =>
      (source.split("\n")[0] || "").match(/^`{3,}\s*([^\s`]+)/)?.[1]?.toLowerCase() ?? "";
    // An unlabelled block is rendered with a detected language, so editing it
    // has to keep using that language rather than dropping to plain text. It is
    // detected once and then held: re-detecting per keystroke makes a block
    // strobe between colour schemes as the guess changes.
    let detectedLang = null;
    const activeLang = () => {
      const explicit = fenceLang();
      if (explicit) return explicit;
      if (detectedLang === null) detectedLang = detectCodeLanguage(rawCode());
      return detectedLang;
    };
    const rawCode = () => {
      const lines = source.split("\n");
      return lines.slice(1, -1).join("\n");
    };

    let editing = false;
    let highlightedHTML = null;
    let rehighlightTimer = null;
    let composing = false;

    // Caret position as a character offset within the code text. Highlighting
    // only wraps text in spans (the text itself never changes), so a plain
    // character offset survives the re-render round trip.
    const caretTextOffset = () => {
      const sel = window.getSelection();
      if (!sel.rangeCount || !codeEl.contains(sel.anchorNode)) return null;
      const range = document.createRange();
      range.selectNodeContents(codeEl);
      range.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
      return range.toString().length;
    };
    const setCaretAtTextOffset = (offset) => {
      const walker = document.createTreeWalker(codeEl, NodeFilter.SHOW_TEXT);
      let remaining = offset;
      let node = walker.nextNode();
      while (node) {
        if (remaining <= node.nodeValue.length) break;
        remaining -= node.nodeValue.length;
        node = walker.nextNode();
      }
      const range = document.createRange();
      if (node) range.setStart(node, Math.min(remaining, node.nodeValue.length));
      else {
        // Offset past every text node (empty block): park at the end.
        range.selectNodeContents(codeEl);
        range.collapse(false);
      }
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    };

    const rehighlight = () => {
      const caret = caretTextOffset();
      if (caret === null) return;
      const scrollTop = codeEl.scrollTop;
      const scrollLeft = codeEl.scrollLeft;
      codeEl.innerHTML = highlightCode(codeEl.textContent, activeLang(), {
        detectLanguage: false,
      });
      setCaretAtTextOffset(caret);
      codeEl.scrollTop = scrollTop;
      codeEl.scrollLeft = scrollLeft;
    };
    const scheduleRehighlight = () => {
      clearTimeout(rehighlightTimer);
      rehighlightTimer = setTimeout(rehighlight, 120);
    };

    codeEl.addEventListener("compositionstart", () => {
      composing = true;
    });
    codeEl.addEventListener("compositionend", () => {
      composing = false;
      rehighlight();
    });

    codeEl.addEventListener("focus", () => {
      if (editing) return;
      editing = true;
      // The highlighted spans stay in the DOM. Flattening to `textContent`
      // here turned every block white the instant it was clicked into, and it
      // bought nothing: highlighting only wraps text, so the caret offsets
      // this widget works in are the same either way.
      highlightedHTML = codeEl.innerHTML;
    });

    codeEl.addEventListener("input", () => {
      // Replacing the DOM mid-composition would cancel the IME session.
      if (!composing) scheduleRehighlight();
    });

    const commit = () => {
      if (!editing) return;
      clearTimeout(rehighlightTimer);
      editing = false;

      const text = codeEl.textContent.replace(/\n$/, "");
      const { opening, closing } = fenceLine();
      const next = `${opening}\n${text}\n${closing}`;

      const liveFrom = getFrom();
      if (
        next !== source &&
        view &&
        liveFrom != null &&
        view.state.doc.sliceString(liveFrom, liveFrom + source.length) === source
      ) {
        // The dispatch rebuilds this widget; the fresh render re-highlights.
        view.dispatch({ changes: { from: liveFrom, to: liveFrom + source.length, insert: next } });
        return;
      }

      // Nothing changed (a stray click): put the highlighting back.
      if (highlightedHTML !== null && !composing) codeEl.innerHTML = highlightedHTML;
    };

    codeEl.addEventListener("blur", commit);
    codeEl.addEventListener("keydown", (event) => {
      // Escape is the "done" key: commit and leave the block rendered.
      if (event.key === "Escape") {
        event.preventDefault();
        codeEl.blur();
      }
    });
  }

  // ── Wrap toggle ─────────────────────────────────────────────────────────
  const wrapper = wrap.querySelector(".code-block-wrapper");
  if (wrapper && codeEl) {
    let wrapped = codeWrapState.get(source) ?? false;
    const paint = () => wrapper.classList.toggle("cm-lp-code-wrap", wrapped);
    paint();

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "cm-lp-wrapbtn";
    toggle.title = wrapped ? "Disable soft wrap" : "Soft-wrap long lines";
    toggle.setAttribute("aria-label", "Toggle soft wrap");
    toggle.setAttribute("aria-pressed", String(wrapped));
    toggle.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 12h13a3 3 0 1 1 0 6h-4l2-2m-2 2 2 2M3 18h4"/></svg>';
    toggle.addEventListener("mousedown", (e) => e.preventDefault());
    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      wrapped = !wrapped;
      if (codeWrapState.size >= CODE_WRAP_LIMIT) codeWrapState.clear();
      codeWrapState.set(source, wrapped);
      paint();
      toggle.setAttribute("aria-pressed", String(wrapped));
      view?.requestMeasure?.();
    });
    header.insertBefore(toggle, copyBtn);
  }
}

/**
 * The YAML frontmatter as a live properties card.
 *
 * Same contract as the table: keys are labels, values are editable fields.
 * Lists render comma-separated and go back that way. Committing rewrites the
 * whole `--- … ---` region; emptying every field removes the frontmatter.
 * The `</>` chip drops to raw YAML.
 */
class FrontMatterWidget extends WidgetType {
  constructor(source, from, to) {
    super();
    this.source = source;
    this.from = from;
    this.to = to;
  }

  eq(other) {
    return other.source === this.source;
  }

  parse() {
    const parsed = parseFrontmatter(this.source);
    return parsed.hasFrontmatter ? parsed.attributes : {};
  }

  commit(view, attributes) {
    if (!view) return;
    const from = this.dom ? (view.posAtDOM(this.dom) ?? this.from) : this.from;
    const to = from + this.source.length;
    if (view.state.doc.sliceString(from, to) !== this.source) return;
    const serialized = stringifyFrontmatter(attributes);
    // An empty card means the user cleared every field: drop the frontmatter.
    const insert = serialized ? `---\n${serialized}\n---` : "";
    if (insert === this.source) return;
    view.dispatch({ changes: { from, to, insert } });
  }

  toDOM(view) {
    let attributes = this.parse();

    const wrap = document.createElement("div");
    this.dom = wrap;
    wrap.className = "markdown-preview cm-lp-render cm-lp-fmwrap";
    wrap.setAttribute("dir", "auto");

    // Same structure and classes as `renderFrontmatterCard` in
    // markdownPreview.js, so the card is pixel-identical to Read mode — the
    // only difference is that values are editable fields.
    const card = document.createElement("section");
    card.className = "frontmatter-card";
    card.setAttribute("aria-label", "Note properties");

    const header = document.createElement("header");
    header.className = "frontmatter-header";
    header.innerHTML =
      '<svg class="frontmatter-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>' +
      "<span>Properties</span>";
    const count = document.createElement("span");
    count.className = "frontmatter-count";
    header.appendChild(count);

    const sourceBtn = document.createElement("button");
    sourceBtn.type = "button";
    sourceBtn.className = "cm-lp-fmsource";
    sourceBtn.textContent = "</>";
    sourceBtn.title = "Edit YAML source";
    sourceBtn.setAttribute("aria-label", "Edit frontmatter as YAML");
    sourceBtn.addEventListener("mousedown", (e) => e.preventDefault());
    sourceBtn.addEventListener("click", (e) => {
      e.preventDefault();
      revealAt(view, this.from);
    });
    header.appendChild(sourceBtn);
    card.appendChild(header);

    const grid = document.createElement("dl");
    grid.className = "frontmatter-grid";
    card.appendChild(grid);
    wrap.appendChild(card);

    const makeEditable = (el) => {
      try {
        el.contentEditable = "plaintext-only";
      } catch {
        el.contentEditable = "true";
      }
      el.spellcheck = false;
    };

    // ── Chip editing ─────────────────────────────────────────────────────
    // A chip is one editable span. Typing a comma or Enter at the caret splits
    // it into two chips; Backspace at the start merges into the previous one;
    // an emptied chip disappears on blur. The chip list is the value.
    const chipKeyDown = (event, chip) => {
      if (event.key !== "," && event.key !== "Enter" && event.key !== "Backspace") return;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      if (event.key === "Backspace") {
        // Empty chip: remove it and step back into the previous one.
        if (chip.textContent === "") {
          event.preventDefault();
          const prev = chip.previousElementSibling;
          chip.remove();
          if (prev instanceof HTMLElement) {
            prev.focus();
            // Caret to the end of the previous chip's text.
            const range = document.createRange();
            range.selectNodeContents(prev);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
        return;
      }

      // Comma / Enter: split the chip at the caret. Text after the caret
      // becomes a new chip; at the end of the chip this just starts one.
      event.preventDefault();
      const caret = selection.getRangeAt(0);
      const tailRange = caret.cloneRange();
      tailRange.selectNodeContents(chip);
      tailRange.setStart(caret.endContainer, caret.endOffset);
      const tail = tailRange.toString();
      caret.deleteContents();
      chip.textContent = caret.toString().trim().replace(/,\s*$/, "");

      const next = document.createElement("span");
      next.className = "frontmatter-chip";
      makeEditable(next);
      next.setAttribute("dir", "auto");
      next.textContent = tail.trim();
      chip.after(next);
      next.focus();
    };

    const buildRow = (key, value) => {
      const row = document.createElement("div");
      row.className = "frontmatter-row";
      row.dataset.key = key;

      const keyEl = document.createElement("dt");
      keyEl.className = "frontmatter-key";
      keyEl.textContent = key;
      row.appendChild(keyEl);

      const val = document.createElement("dd");
      val.className = "frontmatter-val";

      if (Array.isArray(value)) {
        const chips = document.createElement("div");
        chips.className = "frontmatter-chips";
        value.forEach((item) => {
          const chip = document.createElement("span");
          chip.className = "frontmatter-chip";
          makeEditable(chip);
          chip.setAttribute("dir", "auto");
          chip.textContent = String(item);
          chip.addEventListener("keydown", (event) => chipKeyDown(event, chip));
          chips.appendChild(chip);
        });
        val.appendChild(chips);
      } else {
        const text = document.createElement("span");
        text.className = "frontmatter-value";
        makeEditable(text);
        text.setAttribute("dir", "auto");
        text.textContent = String(value ?? "");
        val.appendChild(text);
      }

      row.appendChild(val);
      return row;
    };

    const renderRows = () => {
      grid.textContent = "";
      Object.entries(attributes).forEach(([key, value]) => {
        grid.appendChild(buildRow(key, value));
      });
      count.textContent = String(Object.keys(attributes).length);
    };
    renderRows();

    // Collect whatever is on screen back into the attributes object.
    const collect = () => {
      const next = {};
      grid.querySelectorAll(".frontmatter-row").forEach((row) => {
        const key = row.dataset.key;
        const chips = [...row.querySelectorAll(".frontmatter-chip")]
          .map((chip) => chip.textContent.trim())
          .filter(Boolean);
        if (chips.length > 0) {
          next[key] = chips;
          return;
        }
        const text = row.querySelector(".frontmatter-value")?.textContent.trim() ?? "";
        if (text) next[key] = text;
      });
      return next;
    };

    wrap.addEventListener("focusout", (event) => {
      if (wrap.contains(event.relatedTarget)) return;
      // An emptied scalar or a chip row stripped of its chips drops the
      // property — the card is the whole truth, there is no separate
      // "delete key" affordance to learn.
      attributes = collect();
      this.commit(view, attributes);
    });

    return wrap;
  }

  ignoreEvent() {
    return true;
  }
}

/**
 * The `--- … ---` region at the very top of the document, if there is one.
 * Checked textually rather than via the syntax tree: the markdown parser reads
 * a leading `---` as a heading underline or rule, not as frontmatter.
 */
function frontmatterRange(doc) {
  const first = doc.line(1);
  if (first.text.trim() !== "---") return null;
  for (let n = 2; n <= Math.min(doc.lines, 200); n += 1) {
    const line = doc.line(n);
    if (line.text.trim() === "---") {
      return { from: first.from, to: line.to };
    }
  }
  return null;
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
    return other.source === this.source;
  }

  toDOM(view) {
    const wrap = document.createElement("div");
    wrap.className = "markdown-preview cm-lp-render";
    wrap.setAttribute("dir", "auto");
    wrap.innerHTML = renderFragment(this.source, false);
    attachCodeChrome(wrap, view, this.source, this.from);

    // Put the cursor where you actually clicked. Without this every click on a
    // rendered block dropped the cursor at the block's edge, so revealing a
    // table meant hunting for the row again — worse under Vim, where you then
    // have to travel there in normal mode.
    wrap.addEventListener("mousedown", (event) => {
      // The code block's header is chrome (copy, language, wrap), not content:
      // clicking it must not drop the cursor into the raw source.
      if (event.button !== 0 || event.target.closest?.(".code-block-header")) return;
      // Code is edited in place now (see `attachCodeChrome`): a click inside
      // the pre focuses the contenteditable code instead of revealing pipes.
      if (event.target.closest?.("pre")) return;
      const lines = this.source.split("\n");
      const hit = tablePositionAt(event.target, lines) ||
        codeLineAt(event.target, event, lines.length) ||
          // Anywhere else in the block (padding, the language label): still open
          // it, at its first line.
          { line: 0, column: 0 };

      let pos = view.posAtDOM(wrap);
      if (pos == null) pos = this.from;
      for (let i = 0; i < hit.line; i += 1) pos += lines[i].length + 1;
      pos += Math.min(hit.column, lines[hit.line].length);

      event.preventDefault();
      revealAt(view, pos);
    });

    remeasureOnImageLoad(wrap, view);
    return wrap;
  }

  // Events are handled by the widget itself — the header chrome and the
  // contenteditable code. If CodeMirror observed these clicks it would place
  // the cursor at the block edge and reveal the source mid-edit.
  ignoreEvent() {
    return true;
  }
}

// A structural table edit replaces the source, which destroys and rebuilds the
// widget. This carries "put the caret back in this cell" across that rebuild;
// it is read and cleared by the very next `toDOM` for the same table.
let pendingTableFocus = null;

/**
 * A live, editable table.
 *
 * Cells are plain contenteditable text: click in and type, exactly like the
 * rendered preview suggested you could. Edits stay local to the widget while
 * you type and are committed back to the markdown source when the table loses
 * focus or you use the toolbar — committing on every keystroke would rebuild
 * this DOM under the caret and steal focus mid-word.
 *
 * The toolbar (visible on hover/focus) adds/removes rows and columns around
 * the cell you are in, and sets the column's alignment; the `</>` button drops
 * to raw pipe syntax at the same spot the arrow keys would reach, so power
 * users never lose access.
 *
 * Tab/Shift-Tab, Enter and the arrow keys move between cells like a spreadsheet.
 * Enter never inserts a line break: a pipe row is one line, so a newline in a
 * cell splits the row and rewrites the table (see `escapeCell` in tableEdit).
 */
class InteractiveTableWidget extends WidgetType {
  constructor(source, from, to) {
    super();
    this.source = source;
    this.from = from;
    this.to = to;
  }

  eq(other) {
    return other.source === this.source;
  }

  parse() {
    const grid = parsePipeTable(this.source);
    if (!grid) return { rows: [[""]], aligns: [null] };
    return grid;
  }

  /** Commit the grid to the document, unless the source moved underneath us. */
  commit(view, grid) {
    if (!view) return;
    const from = this.dom ? (view.posAtDOM(this.dom) ?? this.from) : this.from;
    const to = from + this.source.length;
    if (view.state.doc.sliceString(from, to) !== this.source) return;
    const insert = serializePipeTable(grid);
    if (insert === this.source) return;
    view.dispatch({ changes: { from, to, insert } });
  }

  toDOM(view) {
    let grid = this.parse();

    const wrap = document.createElement("div");
    this.dom = wrap;
    const getRange = () => {
      const from = view.posAtDOM(wrap) ?? this.from;
      return { from, to: from + this.source.length };
    };
    wrap.className = "markdown-preview cm-lp-render cm-lp-tablewrap";
    wrap.setAttribute("dir", "auto");

    // ── Toolbar ──────────────────────────────────────────────────────────
    const bar = document.createElement("div");
    bar.className = "cm-lp-tablebar";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Table actions");

    let active = { row: 1, col: 0 }; // sensible default: first body cell

    const icon = (path) =>
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

    const button = (iconPath, title, onClick) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cm-lp-tablebtn";
      btn.innerHTML = icon(iconPath);
      btn.title = title;
      btn.setAttribute("aria-label", title);
      btn.addEventListener("mousedown", (e) => e.preventDefault()); // keep cell focus
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        onClick();
      });
      bar.appendChild(btn);
      return btn;
    };

    const separator = () => {
      const line = document.createElement("span");
      line.className = "cm-lp-tablesep";
      line.setAttribute("role", "separator");
      bar.appendChild(line);
    };

    const clampedActive = () => ({
      row: Math.min(active.row, grid.rows.length - 1),
      col: Math.min(active.col, (grid.rows[0]?.length ?? 1) - 1),
    });

    /**
     * Run a structural edit and rebuild the widget from the new source.
     *
     * `focusAt` says which cell should hold the caret afterwards. The dispatch
     * destroys this DOM, so the request is parked on the module-level
     * `pendingTableFocus` and picked up by the next `toDOM` — without it every
     * toolbar click would drop the writer back into the document.
     */
    const apply = (operation, focusAt) => {
      const at = clampedActive();
      // One dispatch carries both any pending typing and the structural
      // change — committing them separately would race the rebuild.
      const next = operation(at);
      const { from, to } = getRange();
      if (view && view.state.doc.sliceString(from, to) === this.source) {
        pendingTableFocus = focusAt ? { from, ...focusAt(at, next) } : null;
        view.dispatch({
          changes: { from, to, insert: serializePipeTable(next) },
        });
      }
      grid = next;
    };

    button(
      '<rect x="3" y="3.5" width="18" height="7" rx="1.5"/><path d="M12 14.5v6M9 17.5h6"/>',
      "Insert row below",
      () =>
        apply(
          (at) => insertRow(grid, at.row + 1),
          (at) => ({ row: at.row + 1, col: at.col })
        )
    );
    button(
      '<rect x="3.5" y="3" width="7" height="18" rx="1.5"/><path d="M17.5 9v6M14.5 12h6"/>',
      "Insert column right",
      () =>
        apply(
          (at) => insertColumn(grid, at.col + 1),
          (at) => ({ row: at.row, col: at.col + 1 })
        )
    );
    const deleteRowBtn = button(
      '<rect x="3" y="3.5" width="18" height="7" rx="1.5"/><path d="M9 17.5h6"/>',
      "Delete current row",
      () =>
        apply(
          (at) => removeRow(grid, at.row),
          (at, next) => ({ row: Math.min(at.row, next.rows.length - 1), col: at.col })
        )
    );
    const deleteColBtn = button(
      '<rect x="3.5" y="3" width="7" height="18" rx="1.5"/><path d="M14.5 12h6"/>',
      "Delete current column",
      () =>
        apply(
          (at) => removeColumn(grid, at.col),
          (at, next) => ({
            row: at.row,
            col: Math.min(at.col, (next.rows[0]?.length ?? 1) - 1),
          })
        )
    );

    separator();

    // Column alignment. Each button toggles: pressing the alignment a column
    // already has clears it back to the default.
    const alignButtons = [
      ["left", '<path d="M4 6h16M4 12h9M4 18h13"/>', "Align column left"],
      ["center", '<path d="M4 6h16M7.5 12h9M6 18h12"/>', "Align column center"],
      ["right", '<path d="M4 6h16M11 12h9M7 18h13"/>', "Align column right"],
    ].map(([align, path, title]) => {
      const btn = button(path, title, () =>
        apply(
          (at) => setColumnAlign(grid, at.col, align),
          (at) => ({ row: at.row, col: at.col })
        )
      );
      btn.dataset.align = align;
      return btn;
    });

    separator();

    const sourceBtn = button("", "Edit table as markdown", () => revealAt(view, this.from));
    sourceBtn.classList.add("cm-lp-tablesource");
    sourceBtn.textContent = "</>";

    const syncToolbar = () => {
      const at = clampedActive();
      deleteRowBtn.disabled = grid.rows.length <= 2;
      deleteColBtn.disabled = (grid.rows[0]?.length ?? 0) <= 1;
      const current = grid.aligns[at.col] ?? null;
      for (const btn of alignButtons) {
        btn.setAttribute("aria-pressed", String(btn.dataset.align === current));
      }
    };

    // ── Table ────────────────────────────────────────────────────────────
    const sheet = document.createElement("div");
    sheet.className = "table-wrap";
    const table = document.createElement("table");

    const width = () => grid.rows[0]?.length ?? 0;
    const cellAt = (row, col) =>
      table.querySelector(`[data-row="${row}"][data-col="${col}"]`) ?? null;

    /** Move the caret into a cell, selecting nothing and landing at the end. */
    const focusCell = (row, col) => {
      const cell = cellAt(row, col);
      if (!cell) return false;
      cell.focus();
      const range = document.createRange();
      range.selectNodeContents(cell);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return true;
    };

    /**
     * Spreadsheet-style movement. Stepping past the last cell appends a row so
     * a table grows by typing, the way every other table editor behaves.
     */
    const step = (row, col, delta) => {
      const flat = row * width() + col + delta;
      if (flat < 0) return;
      if (flat >= grid.rows.length * width()) {
        apply(
          () => insertRow(grid, grid.rows.length),
          () => ({ row: grid.rows.length, col: 0 })
        );
        return;
      }
      focusCell(Math.floor(flat / width()), flat % width());
    };

    /** True when the caret sits at the very start/end of the cell's text. */
    const caretAtEdge = (cell, edge) => {
      const selection = window.getSelection();
      if (!selection || !selection.isCollapsed || !cell.contains(selection.anchorNode)) return true;
      const range = selection.getRangeAt(0).cloneRange();
      range.selectNodeContents(cell);
      range.setEnd(selection.anchorNode, selection.anchorOffset);
      const before = range.toString().length;
      return edge === "start" ? before === 0 : before === (cell.textContent ?? "").length;
    };

    const onCellKeyDown = (event, row, col) => {
      const cell = event.currentTarget;

      if (event.key === "Tab") {
        event.preventDefault();
        step(row, col, event.shiftKey ? -1 : 1);
        return;
      }

      // A newline would split the pipe row, so Enter moves instead of typing.
      if (event.key === "Enter") {
        event.preventDefault();
        if (row >= grid.rows.length - 1) {
          apply(
            () => insertRow(grid, grid.rows.length),
            () => ({ row: grid.rows.length, col })
          );
        } else {
          focusCell(row + 1, col);
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        this.commit(view, grid);
        view?.focus();
        return;
      }

      // Arrows leave the cell only from its edges, so a long wrapped cell can
      // still be navigated internally.
      if (event.key === "ArrowUp" && caretAtEdge(cell, "start")) {
        if (focusCell(row - 1, col)) event.preventDefault();
      } else if (event.key === "ArrowDown" && caretAtEdge(cell, "end")) {
        if (focusCell(row + 1, col)) event.preventDefault();
      }
    };

    const renderTable = () => {
      table.textContent = "";
      const head = document.createElement("thead");
      const body = document.createElement("tbody");
      grid.rows.forEach((row, rowIndex) => {
        const tr = document.createElement("tr");
        row.forEach((value, colIndex) => {
          const cell = document.createElement(rowIndex === 0 ? "th" : "td");
          const align = grid.aligns[colIndex];
          if (align) cell.style.textAlign = align;
          // `plaintext-only` keeps paste from smuggling formatting in; Firefox
          // does not support it (and throws on assignment), so fall back.
          try {
            cell.contentEditable = "plaintext-only";
          } catch {
            cell.contentEditable = "true";
          }
          cell.textContent = value;
          cell.dataset.row = String(rowIndex);
          cell.dataset.col = String(colIndex);
          cell.addEventListener("focusin", () => {
            active = { row: rowIndex, col: colIndex };
            syncToolbar();
          });
          cell.addEventListener("input", () => {
            grid.rows[rowIndex][colIndex] = cell.textContent;
          });
          cell.addEventListener("keydown", (event) => onCellKeyDown(event, rowIndex, colIndex));
          // Multi-line paste would render a cell taller than its row and read
          // as a break the source cannot hold; flatten it on the way in.
          cell.addEventListener("paste", (event) => {
            const text = event.clipboardData?.getData("text/plain");
            if (!text || !/\r?\n/.test(text)) return;
            event.preventDefault();
            document.execCommand("insertText", false, text.replace(/\s*\r?\n\s*/g, " "));
          });
          tr.appendChild(cell);
        });

        (rowIndex === 0 ? head : body).appendChild(tr);
      });
      table.appendChild(head);
      table.appendChild(body);
      syncToolbar();
    };
    renderTable();

    sheet.appendChild(table);
    wrap.appendChild(bar);
    wrap.appendChild(sheet);

    // Commit whatever is on screen when editing stops for any reason — blur,
    // clicking another part of the document, switching notes.
    wrap.addEventListener("focusout", (event) => {
      if (!wrap.contains(event.relatedTarget)) this.commit(view, grid);
    });

    // Pick up a caret position parked by the toolbar edit that rebuilt us.
    if (pendingTableFocus && pendingTableFocus.from === this.from) {
      const { row, col } = pendingTableFocus;
      pendingTableFocus = null;
      active = { row, col };
      // The widget is not in the document yet, so focusing has to wait a tick.
      requestAnimationFrame(() => focusCell(row, col));
    }

    remeasureOnImageLoad(wrap, view);
    return wrap;
  }

  // Events must reach the contenteditable cells; without this CodeMirror would
  // turn every click into cursor placement and reveal the raw pipes instead.
  ignoreEvent() {
    return true;
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
    return other.source === this.source;
  }

  toDOM(view) {
    const wrap = document.createElement("div");
    wrap.className = "cm-lp-mermaid";
    wrap.setAttribute("dir", "ltr");
    wrap.textContent = "Rendering diagram…";
    revealOnClick(wrap, view, () => view.posAtDOM(wrap) ?? this.from);
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
    return other.tex === this.tex;
  }

  toDOM(view) {
    const wrap = document.createElement("div");
    wrap.className = "cm-lp-math markdown-preview";
    wrap.setAttribute("dir", "ltr");
    revealOnClick(wrap, view, () => view.posAtDOM(wrap) ?? this.from);
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

  // The frontmatter card replaces the whole `--- … ---` region when the
  // cursor is elsewhere in the document; entering the region reveals YAML.
  const fm = frontmatterRange(doc);
  if (fm) {
    if (touches(fm.from, fm.to)) {
      revealSource(doc.lineAt(fm.from), doc.lineAt(fm.to));
    } else {
      render(
        fm.from,
        fm.to,
        Decoration.replace({
          widget: new FrontMatterWidget(doc.sliceString(fm.from, fm.to), fm.from, fm.to),
          block: true,
        })
      );
    }
  }

  syntaxTree(state).iterate({
    from: 0,
    to: doc.length,
    enter: (node) => {
      // The frontmatter region is spoken for; anything the grammar thinks is
      // in there (a `---` reads as a rule) must not get decorated too.
      if (fm && node.from < fm.to && node.to <= fm.to) return false;
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

      // ── Tables → live editable table ───────────────────────────
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
              widget: new InteractiveTableWidget(
                doc.sliceString(fromLine.from, toLine.to),
                fromLine.from,
                toLine.to
              ),
              block: true,
            })
          );
        }
        return false;
      }

      // ── Images → rendered inline image ─────────────────────────
      // `WikiEmbed` is the `![[…]]` form (see wikiEmbedSyntax.js); both render
      // through the same `marked` pipeline Read mode uses.
      if (name === "Image" || name === "WikiEmbed") {
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
        // A quote is one directional block in Read mode. Keep its rule on that
        // same physical side in Live mode, including source lines that contain
        // only `>` or emoji and therefore have no strong character of their own.
        // Text direction remains per-line; only the quote chrome is block-wide.
        const quoteDir = detectBaseDirection(doc.sliceString(node.from, node.to));
        protectedRanges.push({
          from: doc.line(startLine).from,
          to: doc.line(endLine).to,
        });
        for (let n = startLine; n <= endLine; n += 1) {
          const line = doc.line(n);
          ranges.push(
            Decoration.line({
              class: `cm-lp-line cm-lp-quote cm-lp-quote-${quoteDir}`,
            }).range(line.from)
          );
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
  let protIdx = 0;
  const isProtected = (pos) => {
    while (protIdx < protectedRanges.length && protectedRanges[protIdx].to < pos) {
      protIdx++;
    }
    if (protIdx < protectedRanges.length) {
      const r = protectedRanges[protIdx];
      return pos >= r.from && pos <= r.to;
    }
    return false;
  };
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
// It rebuilds on doc or selection change (selection drives the reveal logic),
// and when the syntax tree grows: the parser only gets a few milliseconds up
// front and finishes a long note in the background, so the first build can
// see just its top part.
const livePreviewField = StateField.define({
  create(state) {
    return buildDecorations(state);
  },
  update(value, tr) {
    if (tr.docChanged || tr.selection || syntaxTree(tr.state) !== syntaxTree(tr.startState)) {
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
  // Mirrored from `.markdown-preview h1…h6` in MarkdownPreview.css so a
  // heading reads identically in Live and Read. Bottom padding carries the
  // preview sheet's `margin-bottom` (padding, not margin — see the note on
  // widget measurement above).
  ".cm-lp-h1, .cm-lp-h2, .cm-lp-h3, .cm-lp-h4, .cm-lp-h5, .cm-lp-h6": {
    paddingTop: "0.5rem",
    paddingBottom: "0.8rem",
    fontFamily: "var(--font-family-serif)",
    fontWeight: "600",
    letterSpacing: "-0.015em",
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
  ".cm-lp-h1": { fontSize: "2em", letterSpacing: "-0.022em", lineHeight: "1.25" },
  ".cm-lp-h2": { fontSize: "1.55em", letterSpacing: "-0.018em", lineHeight: "1.25" },
  ".cm-lp-h3": { fontSize: "1.26em", lineHeight: "1.25" },
  ".cm-lp-h4": { fontSize: "1.1em" },
  ".cm-lp-h5": { fontSize: "1em" },
  ".cm-lp-h6": {
    fontFamily: "var(--font-family-sans)",
    fontSize: "0.78em",
    color: "var(--color-text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.07em",
  },
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
    color: "var(--color-text-secondary)",
  },
  // Physical sides are intentional. Every source line gets its own CodeMirror
  // element and may resolve to a different direction (especially a bare `>`
  // separator), while the quote rule must remain continuous on one side.
  ".cm-lp-quote-ltr": {
    borderLeft: "3px solid color-mix(in srgb, var(--color-accent) 45%, transparent)",
    paddingLeft: "1.1em",
  },
  ".cm-lp-quote-rtl": {
    borderRight: "3px solid color-mix(in srgb, var(--color-accent) 45%, transparent)",
    paddingRight: "1.1em",
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
  // Keep the wrap toggle beside the copy button: the header spreads its
  // children with space-between, so without this the toggle drifts to the
  // middle and reads as unrelated to the copy action next to it.
  ".cm-lp-render .code-block-header .cm-lp-wrapbtn": {
    marginLeft: "auto",
  },
  ".cm-lp-render .code-block-header .code-copy-btn": {
    marginLeft: "4px",
  },
  // In-place code editing: the rendered code is directly editable, so it needs
  // a quiet focus cue and no editor chrome fighting the caret.
  ".cm-lp-render pre code[contenteditable]": {
    cursor: "text",
    outline: "none",
  },
  // One object lights up, not two. The ring lives on the card — putting it on
  // the inner `pre` drew a second rounded frame inside the first at a smaller
  // radius, which read as a box inside a box rather than "this block is live".
  ".cm-lp-render .code-block-wrapper:focus-within": {
    borderColor: "color-mix(in srgb, var(--color-accent) 55%, transparent)",
    boxShadow: "0 0 0 3px color-mix(in srgb, var(--color-accent) 12%, transparent)",
  },
  // ── Live frontmatter card ─────────────────────────────────────────────────
  // Structure and look come from the Read-mode `.frontmatter-*` styles via the
  // `.markdown-preview` wrapper; only the editing affordances live here.
  ".cm-lp-fmwrap": { position: "relative" },
  ".cm-lp-fmwrap .frontmatter-card": { marginBottom: "0" },
  ".cm-lp-fmwrap .frontmatter-row": { transition: "background-color 100ms ease" },
  ".cm-lp-fmwrap .frontmatter-row:hover": {
    backgroundColor: "color-mix(in srgb, var(--color-text-primary) 3%, transparent)",
  },
  ".cm-lp-fmwrap .frontmatter-value, .cm-lp-fmwrap .frontmatter-chip": {
    cursor: "text",
    outline: "none",
    borderRadius: "4px",
    transition: "background-color 120ms ease",
  },
  ".cm-lp-fmwrap .frontmatter-value:focus, .cm-lp-fmwrap .frontmatter-chip:focus": {
    backgroundColor: "color-mix(in srgb, var(--color-accent) 7%, transparent)",
  },
  ".cm-lp-fmwrap .frontmatter-value:empty::before": {
    content: '"empty — clears the field on blur"',
    color: "var(--color-text-muted)",
    opacity: "0.55",
    fontStyle: "italic",
    fontSize: "0.85em",
  },
  ".cm-lp-fmwrap .frontmatter-chip:empty::before": {
    content: '"tag"',
    color: "var(--color-accent)",
    opacity: "0.5",
    fontStyle: "italic",
  },
  ".cm-lp-fmsource": {
    marginLeft: "0.4rem",
    border: "none",
    background: "transparent",
    color: "var(--color-text-muted)",
    font: "700 11px var(--font-family-mono)",
    padding: "2px 6px",
    borderRadius: "5px",
    cursor: "pointer",
    opacity: "0",
    transition: "opacity 120ms ease, color 120ms ease",
  },
  ".cm-lp-fmwrap:hover .cm-lp-fmsource, .cm-lp-fmsource:focus-visible": {
    opacity: "1",
  },
  ".cm-lp-fmsource:hover": {
    color: "var(--color-accent)",
    backgroundColor: "color-mix(in srgb, var(--color-accent) 14%, transparent)",
  },
  // ── Code block chrome ─────────────────────────────────────────────────────
  // The wrapper clips (`overflow: hidden` in Read CSS, for its rounded frame),
  // which would cut off the language dropdown. Live blocks show the menu, so
  // the clip moves down to the `pre` itself, which keeps the rounded corners.
  ".cm-lp-render .code-block-wrapper": {
    overflow: "visible",
  },
  // `auto`, not `hidden`: the clip is only here to keep the rounded corners now
  // that the wrapper cannot clip. `hidden` also swallowed the horizontal
  // scrollbar, which made any line wider than the editor unreachable unless you
  // turned soft wrap on.
  ".cm-lp-render .code-block-wrapper pre": {
    overflow: "auto",
    borderRadius: "calc(var(--md-radius, 10px) - 1px)",
  },
  // The language label doubles as the picker trigger; the wrap toggle sits
  // beside the copy button. All three only surface on hover, like Read mode.
  ".cm-lp-render .code-block-wrapper:focus-within .code-copy-btn": {
    opacity: "1",
  },
  // Nothing said the language label was a button. It now takes a chip shape on
  // hover, which is the only affordance a 0.68em label can carry without
  // shouting.
  ".cm-lp-render .code-block-lang.cm-lp-langpick": {
    cursor: "pointer",
    textTransform: "lowercase",
    position: "relative",
    padding: "2px 6px",
    margin: "-2px -6px",
    borderRadius: "5px",
    transition: "background-color 140ms ease, color 140ms ease",
  },
  ".cm-lp-render .code-block-lang.cm-lp-langpick:hover": {
    color: "var(--color-accent)",
    backgroundColor: "color-mix(in srgb, var(--color-accent) 12%, transparent)",
  },
  ".cm-lp-langmenu": {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: "0",
    zIndex: "14",
    display: "flex",
    flexDirection: "column",
    minWidth: "110px",
    maxHeight: "240px",
    overflowY: "auto",
    padding: "4px",
    borderRadius: "8px",
    backgroundColor: "var(--color-bg-editor)",
    border: "1px solid var(--color-border)",
    boxShadow: "0 6px 20px color-mix(in srgb, black 22%, transparent)",
  },
  ".cm-lp-langopt": {
    border: "none",
    background: "transparent",
    color: "var(--color-text-secondary)",
    font: "500 12px var(--font-family-mono)",
    textAlign: "left",
    padding: "5px 9px",
    borderRadius: "5px",
    cursor: "pointer",
  },
  ".cm-lp-langopt:hover": {
    backgroundColor: "color-mix(in srgb, var(--color-accent) 14%, transparent)",
    color: "var(--color-accent)",
  },
  ".cm-lp-langopt-active": {
    color: "var(--color-accent)",
    fontWeight: "700",
  },
  // Chrome, so it behaves like the copy button beside it: invisible until you
  // are on the block. Two always-lit icons on every code block was the loudest
  // thing on the page.
  ".cm-lp-render .cm-lp-wrapbtn": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "24px",
    height: "24px",
    padding: "0",
    border: "none",
    borderRadius: "5px",
    background: "transparent",
    color: "var(--color-text-muted)",
    cursor: "pointer",
    opacity: "0",
    transition: "opacity 140ms ease, background-color 140ms ease, color 140ms ease",
  },
  ".cm-lp-render .code-block-wrapper:hover .cm-lp-wrapbtn, .cm-lp-render .code-block-wrapper:focus-within .cm-lp-wrapbtn, .cm-lp-render .cm-lp-wrapbtn:focus-visible":
    {
      opacity: "1",
    },
  ".cm-lp-render .cm-lp-wrapbtn:hover": {
    color: "var(--color-text-primary)",
    backgroundColor: "color-mix(in srgb, var(--color-text-primary) 10%, transparent)",
  },
  ".cm-lp-render .cm-lp-wrapbtn[aria-pressed='true']": {
    color: "var(--color-accent)",
  },
  ".cm-lp-render .code-block-wrapper.cm-lp-code-wrap pre": {
    whiteSpace: "pre-wrap",
  },
  ".cm-lp-render .code-block-wrapper.cm-lp-code-wrap pre code": {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },
  // ── Interactive table editor ──────────────────────────────────────────────
  // The table sits in a quiet card: hairline frame, rounded corners, header
  // band. The toolbar is a compact icon pill floating above the card, visible
  // only while you are on the table.
  // The top padding is a reserved gutter for the toolbar, not decoration. The
  // bar used to float at `top: -15px`, straddling the frame and covering the
  // header row it was meant to act on. Reserving the strip costs a little
  // height on every table but means the controls never sit on content — and it
  // has to be padding, not margin (see `remeasureOnImageLoad`).
  //
  // Both classes are on the same element, and the bare `.cm-lp-render` padding
  // rule below is declared later in this object — equal specificity, so source
  // order would win and silently drop the gutter. Qualifying with both classes
  // is what makes this stick.
  //
  // The gutter is px, not em, because what has to fit is the toolbar, and every
  // part of it is sized in px: 24px buttons + 3px padding each side + 1px
  // borders = 32px, plus clearance.
  ".cm-lp-render.cm-lp-tablewrap": { position: "relative", padding: "38px 0 0.55em" },
  ".cm-lp-tablewrap .table-wrap": {
    border: "1px solid color-mix(in srgb, var(--color-text-primary) 12%, transparent)",
    borderRadius: "10px",
    overflow: "auto",
    backgroundColor: "color-mix(in srgb, var(--color-text-primary) 2%, transparent)",
    transition: "border-color 140ms ease, box-shadow 140ms ease",
  },
  // Same contract as the code card: the table is one object, and it is the
  // object that lights up while you are editing inside it.
  ".cm-lp-tablewrap .table-wrap:focus-within": {
    borderColor: "color-mix(in srgb, var(--color-accent) 50%, transparent)",
    boxShadow: "0 0 0 3px color-mix(in srgb, var(--color-accent) 11%, transparent)",
  },
  ".cm-lp-tablewrap th": {
    backgroundColor: "color-mix(in srgb, var(--color-text-primary) 6%, transparent)",
    fontWeight: "600",
    fontSize: "0.86em",
    letterSpacing: "0.01em",
    color: "var(--color-text-secondary)",
  },
  ".cm-lp-tablewrap tbody tr": {
    transition: "background-color 100ms ease",
  },
  ".cm-lp-tablewrap tbody tr:hover": {
    backgroundColor: "color-mix(in srgb, var(--color-text-primary) 4%, transparent)",
  },
  ".cm-lp-tablewrap tbody tr + tr td": {
    borderTop: "1px solid color-mix(in srgb, var(--color-text-primary) 8%, transparent)",
  },
  ".cm-lp-tablebar": {
    display: "flex",
    alignItems: "center",
    gap: "2px",
    position: "absolute",
    top: "0",
    insetInlineStart: "0",
    zIndex: "12",
    padding: "3px 4px",
    borderRadius: "8px",
    backgroundColor: "var(--color-bg-editor)",
    border: "1px solid var(--color-border)",
    boxShadow:
      "0 1px 2px color-mix(in srgb, black 12%, transparent), 0 4px 14px color-mix(in srgb, black 16%, transparent)",
    opacity: "0",
    visibility: "hidden",
    transition: "opacity 120ms ease, visibility 120ms ease",
  },
  ".cm-lp-tablewrap:hover .cm-lp-tablebar, .cm-lp-tablewrap:focus-within .cm-lp-tablebar": {
    opacity: "1",
    visibility: "visible",
  },
  ".cm-lp-tablebtn": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "26px",
    height: "24px",
    padding: "0",
    border: "none",
    borderRadius: "6px",
    background: "transparent",
    color: "var(--color-text-secondary)",
    cursor: "pointer",
  },
  ".cm-lp-tablebtn:hover": {
    backgroundColor: "color-mix(in srgb, var(--color-accent) 14%, transparent)",
    color: "var(--color-accent)",
  },
  ".cm-lp-tablebtn:disabled": {
    opacity: "0.3",
    cursor: "default",
  },
  ".cm-lp-tablebtn:disabled:hover": {
    backgroundColor: "transparent",
    color: "var(--color-text-secondary)",
  },
  // Alignment is a state, not an action, so the active one stays lit.
  ".cm-lp-tablebtn[aria-pressed='true']": {
    backgroundColor: "color-mix(in srgb, var(--color-accent) 16%, transparent)",
    color: "var(--color-accent)",
  },
  // Seven undifferentiated icons read as a wall. The rules group them into
  // structure / alignment / escape-hatch.
  ".cm-lp-tablesep": {
    width: "1px",
    alignSelf: "stretch",
    margin: "3px 3px",
    backgroundColor: "color-mix(in srgb, var(--color-text-primary) 14%, transparent)",
  },
  ".cm-lp-tablesource": {
    font: "700 11px var(--font-family-mono)",
  },
  // Editable cells get a quiet affordance instead of an outline: a soft accent
  // wash on focus keeps the writing surface calm but always findable. An underline
  // rather than a side bar, so it lands on the same edge in an RTL table. The ring
  // lives on the card (above), so the cell only tints — a rounded ring inset in
  // a square cell never lined up with the grid it sat in.
  ".cm-lp-tablewrap th[contenteditable], .cm-lp-tablewrap td[contenteditable]": {
    padding: "0.55em 0.9em",
    cursor: "text",
    outline: "none",
    transition: "background-color 120ms ease, box-shadow 120ms ease",
  },
  ".cm-lp-tablewrap th[contenteditable]:focus, .cm-lp-tablewrap td[contenteditable]:focus": {
    backgroundColor: "color-mix(in srgb, var(--color-accent) 12%, transparent)",
    boxShadow: "inset 0 -2px 0 0 var(--color-accent)",
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
  // it. Same frame as the rendered card, so the block doesn't visually vanish
  // the moment you click into it — you keep seeing its extent.
  //
  // The interior is a TRANSLUCENT tint on purpose, in two senses:
  //
  // 1. drawSelection paints its selection rectangles in a layer at z-index -1,
  //    underneath every line's own background — an opaque fill here would hide
  //    the accent wash whenever you select text inside the block, which is
  //    exactly what the old fill did.
  // 2. The tint mixes toward `transparent`, not toward the editor background,
  //    so at rest it reads as the same raised surface as the rendered card
  //    while staying ~95% see-through — the wash survives it almost intact.
  ".cm-lp-src": {
    fontFamily: "var(--font-family-mono)",
    backgroundColor: "color-mix(in srgb, var(--color-text-primary) 4.5%, transparent)",
    boxShadow:
      "inset 1px 0 0 color-mix(in srgb, var(--color-text-primary) 9%, transparent)," +
      "inset -1px 0 0 color-mix(in srgb, var(--color-text-primary) 9%, transparent)",
  },
  // The top and bottom insets are drawn with box-shadows, not padding: padding
  // would make these lines taller than every other line, and Vim's `j`/`k`
  // (and `gj`/`gk`) resolve vertical motion through screen coordinates —
  // uneven line heights are exactly what makes those misfire. Unlike the old
  // offset bands, these shadows hug the box (no 6px displacement), so the
  // frame reads as one rounded card rather than three floating strips.
  ".cm-lp-src-first": {
    borderTopLeftRadius: "10px",
    borderTopRightRadius: "10px",
    boxShadow:
      "inset 1px 1px 0 color-mix(in srgb, var(--color-text-primary) 9%, transparent)," +
      "inset -1px 0 0 color-mix(in srgb, var(--color-text-primary) 9%, transparent)",
    paddingTop: "8px",
  },
  ".cm-lp-src-last": {
    borderBottomLeftRadius: "10px",
    borderBottomRightRadius: "10px",
    boxShadow:
      "inset 1px 0 0 color-mix(in srgb, var(--color-text-primary) 9%, transparent)," +
      "inset -1px -1px 0 color-mix(in srgb, var(--color-text-primary) 9%, transparent)",
  },
  // A one-line block carries both edges, so it needs the full frame.
  ".cm-lp-src-first.cm-lp-src-last": {
    boxShadow:
      "inset 1px 1px 0 color-mix(in srgb, var(--color-text-primary) 9%, transparent)," +
      "inset -1px -1px 0 color-mix(in srgb, var(--color-text-primary) 9%, transparent)",
  },
  // Rendered code/table blocks sit inline in the flow; trim the preview CSS's
  // outer block margins so they don't add double spacing between lines. The
  // block's own breathing room is padding — a margin would fall outside the
  // rect CodeMirror measures and desync its height map.
  ".cm-lp-render": { padding: "0.4em 0" },
  ".cm-lp-render > *:first-child": { marginTop: "0" },
  ".cm-lp-render > *:last-child": { marginBottom: "0" },
  ".cm-lp-inline-render": { display: "inline-block", verticalAlign: "middle" },
  // Fallback selection tint for WebViews without the Custom Highlight API
  // (see widgetSelectionHighlight.js) — a whole-block wash while the native
  // selection touches the rendered block.
  ".cm-lp-render.cm-lp-sel, .cm-lp-inline-render.cm-lp-sel": {
    backgroundColor: "var(--color-accent-selection, rgba(109, 92, 224, 0.3))",
  },
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
  return [livePreviewField, blockStepFilter, livePreviewTheme, ...widgetSelectionHighlight()];
}
