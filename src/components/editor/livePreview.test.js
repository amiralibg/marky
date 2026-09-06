import { describe, it, expect, afterEach, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView, Decoration } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";

// The copy button writes through `utils/clipboard`, which reaches for the Tauri
// plugin; capture what it is handed instead.
const copied = [];
vi.mock("../../utils/clipboard", () => ({
  copyText: async (text) => {
    copied.push(text);
    return true;
  },
}));

const { livePreview, blockStepTarget } = await import("./livePreview");

// Build a real EditorView (jsdom) with the markdown language + livePreview,
// then inspect the decoration set the plugin produces for given content and
// cursor position.
function makeView(doc, cursor = 0) {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [markdown({ base: markdownLanguage }), livePreview()],
  });
  const view = new EditorView({ state, parent: document.body });
  return view;
}

// Collect decorations from every ViewPlugin that provides a decoration field.
function collectDecorations(view) {
  const found = [];
  // The livePreview plugin is the only decoration-providing plugin here.
  const iterAll = (set) => {
    const cursor = set.iter();
    while (cursor.value) {
      found.push({ from: cursor.from, to: cursor.to, deco: cursor.value });
      cursor.next();
    }
  };
  // Access the plugin's decoration set via the facet the view exposes.
  const field = view.state.facet(EditorView.decorations);
  for (const source of field) {
    const set = typeof source === "function" ? source(view) : source;
    if (set && set !== Decoration.none) iterAll(set);
  }
  return found;
}

// True when [from, to) is covered by an atomic range — what makes cursor
// motion skip over a marker without removing it from the document.
function isAtomic(view, from, to) {
  for (const source of view.state.facet(EditorView.atomicRanges)) {
    const set = typeof source === "function" ? source(view) : source;
    if (!set) continue;
    let hit = false;
    set.between(from, to, (f, t) => {
      if (f === from && t === to) hit = true;
    });
    if (hit) return true;
  }
  return false;
}

// The class list of the line decoration covering position `pos`.
function lineClassAt(decos, pos) {
  const line = decos.find(
    (d) => d.from === pos && d.to === pos && typeof d.deco.spec?.class === "string"
  );
  return line?.deco.spec.class ?? "";
}

let view;
afterEach(() => {
  view?.destroy();
  view = undefined;
});

describe("livePreview decorations", () => {
  // The `#` markers are never removed from the flow — they are always marked
  // with `cm-lp-hash` and hung in the gutter, so the heading text keeps the
  // same left edge whether or not the caret is on the line. Visibility rides on
  // the line's `cm-lp-h-open` class, and cursor motion on the atomic range.
  it("hangs heading markers in the gutter and skips them when the cursor is elsewhere", () => {
    view = makeView("# Hello world\n\nbody text", 20); // cursor in body
    const decos = collectDecorations(view);

    const hash = decos.find((d) => d.from === 0 && d.to === 2);
    expect(hash?.deco.spec?.class).toBe("cm-lp-hash");

    const lineClass = lineClassAt(decos, 0);
    expect(lineClass).toContain("cm-lp-h1");
    expect(lineClass).not.toContain("cm-lp-h-open");

    // Cursor motion still steps over the marker.
    expect(isAtomic(view, 0, 2)).toBe(true);
  });

  it("reveals heading markers when the cursor is on that line", () => {
    view = makeView("# Hello world", 3); // cursor inside the heading line
    const decos = collectDecorations(view);

    // Same decoration as when closed — only the line state changes, which is
    // exactly what keeps the heading text from shifting on click.
    const hash = decos.find((d) => d.from === 0 && d.to === 2);
    expect(hash?.deco.spec?.class).toBe("cm-lp-hash");

    expect(lineClassAt(decos, 0)).toContain("cm-lp-h-open");
    expect(isAtomic(view, 0, 2)).toBe(false);
  });

  it("renders a fenced code block as a widget when inactive", () => {
    const doc = "text\n\n```js\nconst a = 1;\n```\n\nmore";
    view = makeView(doc, 0); // cursor at very start, away from the block
    const decos = collectDecorations(view);
    const hasCodeWidget = decos.some(
      (d) => d.deco.spec?.widget?.constructor?.name === "RenderedBlockWidget"
    );
    expect(hasCodeWidget).toBe(true);
  });

  // The reported bug: clicking copy dropped the caret into the contenteditable
  // code (mousedown's default action), so the block flipped into edit mode and
  // nothing was copied.
  it("copies from the code block header without opening the block for editing", () => {
    const doc = "text\n\n```js\nconst a = 1;\n```\n\nmore";
    view = makeView(doc, 0);
    const btn = view.dom.querySelector(".cm-lp-render .code-copy-btn");
    expect(btn).not.toBeNull();

    const down = new window.MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    btn.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    // The rendered widget is still there and the caret never moved.
    expect(view.state.selection.main.head).toBe(0);

    btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(copied).toEqual(["const a = 1;"]);
  });

  // Reported: clicking into a rendered block to edit it made the whole block
  // white. The focus handler used to flatten the highlighted spans to plain
  // text before a single keystroke had happened.
  it("keeps syntax colour when a code block is edited in place", () => {
    const doc = "text\n\n```js\nconst a = 1;\n```\n\nmore";
    view = makeView(doc, 0);
    const codeEl = view.dom.querySelector(".cm-lp-render pre > code");
    const painted = codeEl.querySelectorAll("span.hljs-keyword").length;
    expect(painted).toBeGreaterThan(0);

    codeEl.dispatchEvent(new window.FocusEvent("focus"));
    expect(codeEl.querySelectorAll("span.hljs-keyword").length).toBe(painted);
    expect(codeEl.textContent).toBe("const a = 1;");
  });

  // An unlabelled block is rendered with a detected language; editing it used
  // to re-highlight with `detectLanguage: false`, which is plain escaped text.
  it("keeps highlighting an unlabelled block while it is typed into", async () => {
    vi.useFakeTimers();
    try {
      const doc = "text\n\n```\nconst a = 1;\n```\n\nmore";
      view = makeView(doc, 0);
      const codeEl = view.dom.querySelector(".cm-lp-render pre > code");
      codeEl.dispatchEvent(new window.FocusEvent("focus"));

      // Put the caret in the block, then type: the rehighlight is debounced.
      const range = document.createRange();
      range.selectNodeContents(codeEl);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);

      codeEl.textContent = "const a = 12;";
      codeEl.dispatchEvent(new window.InputEvent("input", { bubbles: true }));
      vi.advanceTimersByTime(200);

      expect(codeEl.querySelectorAll('span[class^="hljs-"]').length).toBeGreaterThan(0);
      expect(codeEl.textContent).toBe("const a = 12;");
    } finally {
      vi.useRealTimers();
    }
  });

  it("frames a fenced code block as source when the cursor is inside it", () => {
    const doc = "text\n\n```js\nconst a = 1;\n```\n\nmore";
    view = makeView(doc, doc.indexOf("const a") + 2);
    const decos = collectDecorations(view);
    expect(
      decos.some((d) => d.deco.spec?.widget?.constructor?.name === "RenderedBlockWidget")
    ).toBe(false);
    // One framed line per source line, with rounded ends on the fences.
    const framed = decos.filter((d) => d.deco.spec?.class?.includes?.("cm-lp-src"));
    expect(framed.length).toBe(3);
    expect(framed.some((d) => d.deco.spec.class.includes("cm-lp-src-first"))).toBe(true);
    expect(framed.some((d) => d.deco.spec.class.includes("cm-lp-src-last"))).toBe(true);
  });

  it("frames a table as source when the cursor is inside it", () => {
    const doc = "intro\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nend";
    view = makeView(doc, doc.indexOf("| 1 | 2 |") + 3);
    const decos = collectDecorations(view);
    const framed = decos.filter((d) => d.deco.spec?.class?.includes?.("cm-lp-src"));
    expect(framed.length).toBe(3);
  });

  it("renders tables as live editable cells instead of revealing pipes", () => {
    const doc = "intro\n\n| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n\nend";
    view = makeView(doc, 0); // cursor away, so the table renders
    const cells = view.dom.querySelectorAll(".cm-lp-render tbody tr:last-child td");
    expect(cells.length).toBe(2);
    // Cells are directly editable — that is the point of the widget.
    // (jsdom does not reflect the contenteditable attribute; read the IDL property.)
    expect(cells[1].contentEditable).toBe("plaintext-only");

    // Clicking a cell edits it in place: the document selection must stay
    // where it was rather than jumping into the raw pipe syntax.
    cells[1].dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, button: 0 }));
    expect(view.state.selection.main.head).toBe(0);
  });

  // A pipe row is one line, so a newline in a cell splits the row and rewrites
  // the table. Enter has to move instead of typing.
  //
  // (jsdom will not focus a contenteditable cell, so these assert the two
  // things that are observable without a real focus ring: that the key never
  // reaches the cell as text, and that stepping off the end grows the source.)
  const tableDoc = "intro\n\n| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n\nend";
  // A committed table is re-serialized, so the delimiter row normalizes to
  // `---` regardless of how it was written by hand.
  const grownTable = tableDoc
    .replace("| - | - |", "| --- | --- |")
    .replace("| 3 | 4 |", "| 3 | 4 |\n|  |  |");
  const pressIn = (cell, key, shiftKey = false) => {
    const event = new window.KeyboardEvent("keydown", {
      key,
      shiftKey,
      bubbles: true,
      cancelable: true,
    });
    cell.dispatchEvent(event);
    return event;
  };

  it("swallows Enter in a cell rather than breaking the pipe row", () => {
    view = makeView(tableDoc, 0); // cursor away, so the table renders
    const cell = view.dom.querySelector('[data-row="1"][data-col="0"]');
    expect(pressIn(cell, "Enter").defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe(tableDoc);
  });

  it("swallows Tab and Shift-Tab so focus never escapes the table", () => {
    view = makeView(tableDoc, 0);
    const cell = view.dom.querySelector('[data-row="1"][data-col="0"]');
    expect(pressIn(cell, "Tab").defaultPrevented).toBe(true);
    expect(pressIn(cell, "Tab", true).defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe(tableDoc);
  });

  it("grows the table when you step past the last cell", () => {
    view = makeView(tableDoc, 0);
    const last = view.dom.querySelector('[data-row="2"][data-col="1"]');
    pressIn(last, "Tab");
    expect(view.state.doc.toString()).toBe(grownTable);
  });

  it("appends a row when Enter is pressed on the last one", () => {
    view = makeView(tableDoc, 0);
    const last = view.dom.querySelector('[data-row="2"][data-col="0"]');
    pressIn(last, "Enter");
    expect(view.state.doc.toString()).toBe(grownTable);
  });

  it("offers column alignment and marks the active one", () => {
    const doc = "intro\n\n| a | b |\n| - | ---: |\n| 1 | 2 |\n\nend";
    view = makeView(doc, 0); // cursor away, so the table renders
    const aligns = [...view.dom.querySelectorAll(".cm-lp-tablebtn[data-align]")];
    expect(aligns.map((b) => b.dataset.align)).toEqual(["left", "center", "right"]);

    // The default active cell is column 0, which carries no alignment.
    expect(aligns.every((b) => b.getAttribute("aria-pressed") === "false")).toBe(true);

    view.dom
      .querySelector('[data-row="1"][data-col="1"]')
      .dispatchEvent(new window.FocusEvent("focusin", { bubbles: true }));
    expect(aligns.find((b) => b.dataset.align === "right").getAttribute("aria-pressed")).toBe(
      "true"
    );
  });

  // The toolbar floats over the widget, so the only thing keeping it off the
  // header row is the gutter reserved above the table. That gutter was silently
  // lost once already: `.cm-lp-tablewrap` and `.cm-lp-render` both set padding
  // at equal specificity on the same element, so whichever came last in the
  // theme won. Assert the relationship rather than the number, so the guard
  // survives a resize of either piece.
  it("reserves enough room above the table for the toolbar to clear the header", () => {
    view = makeView(tableDoc, 0);
    const px = (el, prop) => parseFloat(window.getComputedStyle(el)[prop]) || 0;

    const wrap = view.dom.querySelector(".cm-lp-tablewrap");
    const bar = view.dom.querySelector(".cm-lp-tablebar");
    const button = view.dom.querySelector(".cm-lp-tablebtn");

    // jsdom does no layout, so the bar's height is summed from its own parts.
    const barHeight =
      px(bar, "paddingTop") +
      px(bar, "paddingBottom") +
      px(bar, "borderTopWidth") +
      px(bar, "borderBottomWidth") +
      px(button, "height");

    expect(barHeight).toBeGreaterThan(0); // the styles resolved at all
    expect(px(wrap, "paddingTop")).toBeGreaterThanOrEqual(barHeight);
  });

  it("shows a checkbox widget for a task item", () => {
    // Cursor on a separate line so the task line renders (not revealed).
    const doc = "intro line\n\n- [ ] do the thing";
    view = makeView(doc, 0);
    const decos = collectDecorations(view);
    const hasCheckbox = decos.some(
      (d) => d.deco.spec?.widget?.constructor?.name === "TaskCheckboxWidget"
    );
    expect(hasCheckbox).toBe(true);
  });

  it("keeps every line of a Persian quote ruled on the RTL side", () => {
    const doc = ["intro", "", "> ۱/", ">", "> متن فارسی", ">", "> 🧵"].join("\n");
    view = makeView(doc, 0);
    const quoteLines = collectDecorations(view).filter((d) =>
      d.deco.spec?.class?.includes?.("cm-lp-quote")
    );

    expect(quoteLines).toHaveLength(5);
    expect(quoteLines.every((d) => d.deco.spec.class.includes("cm-lp-quote-rtl"))).toBe(true);
  });

  it("renders a mermaid fence as a mermaid widget when inactive", () => {
    const doc = "intro\n\n```mermaid\ngraph TD; A-->B;\n```\n\nend";
    view = makeView(doc, 0);
    const decos = collectDecorations(view);
    const hasMermaid = decos.some(
      (d) => d.deco.spec?.widget?.constructor?.name === "MermaidWidget"
    );
    expect(hasMermaid).toBe(true);
  });

  it("renders a block math region ($$) as a math widget when inactive", () => {
    const doc = "intro\n\n$$\nE = mc^2\n$$\n\nend";
    view = makeView(doc, 0);
    const decos = collectDecorations(view);
    const hasMath = decos.some((d) => d.deco.spec?.widget?.constructor?.name === "MathWidget");
    expect(hasMath).toBe(true);
  });

  it("does not treat $$ inside a code block as math", () => {
    const doc = "```\n$$\nnot math\n$$\n```";
    view = makeView(doc, doc.length); // anywhere: the code block is always protected
    const decos = collectDecorations(view);
    const hasMath = decos.some((d) => d.deco.spec?.widget?.constructor?.name === "MathWidget");
    expect(hasMath).toBe(false);
  });

  it("hides emphasis markers around bold text when inactive", () => {
    view = makeView("a **bold** word", 14); // cursor after the bold
    const decos = collectDecorations(view);
    // "**" at 2..4 and 8..10 should be hidden.
    const hiddenOpens = decos.filter(
      (d) => (d.from === 2 && d.to === 4) || (d.from === 8 && d.to === 10)
    );
    expect(hiddenOpens.length).toBe(2);
  });
});

// The table is lines 3..6, with a blank line either side of it (2 and 7), so a
// single vertical step from line 2 or line 7 should stop inside the table.
const BLOCK_DOC = "intro\n\n| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n\noutro";

describe("blockStepTarget", () => {
  // A pure function over positions, so the doc needs no real markdown: lines
  // 2..4 stand in for a rendered block, with a text line either side of it.
  const doc = EditorState.create({
    doc: "a long intro line\n| a | b |\n| - | - |\n| 1 |\nanother long line",
  }).doc;
  const block = { from: doc.line(2).from, to: doc.line(4).to };
  const at = (n, col = 0) => doc.line(n).from + col;

  it("lands on the block's first line when stepping down into it", () => {
    const target = blockStepTarget(doc, [block], at(1), at(5));
    expect(doc.lineAt(target).number).toBe(2);
  });

  it("lands on the block's last line when stepping up into it", () => {
    const target = blockStepTarget(doc, [block], at(5), at(1));
    expect(doc.lineAt(target).number).toBe(4);
  });

  it("keeps the column the step started from", () => {
    const target = blockStepTarget(doc, [block], at(5, 4), at(1));
    expect(target - doc.line(4).from).toBe(4);
  });

  it("clamps the column to the target line", () => {
    // Line 4 is only 5 characters, so column 12 has to come back to its end.
    const target = blockStepTarget(doc, [block], at(5, 12), at(1));
    expect(target).toBe(doc.line(4).to);
  });

  it("stops at the near block when two blocks touch", () => {
    // Lines 2..3 and 4..5 render as separate blocks with no line between them,
    // so a single step from line 1 clears both at once.
    const doc2 = EditorState.create({
      doc: "intro\n| a | b |\n| 1 | 2 |\n```\ncode\n```\ntail",
    }).doc;
    const stacked = [
      { from: doc2.line(2).from, to: doc2.line(3).to },
      { from: doc2.line(4).from, to: doc2.line(6).to },
    ];
    const down = blockStepTarget(doc2, stacked, doc2.line(1).from, doc2.line(7).from);
    expect(doc2.lineAt(down).number).toBe(2);
    const up = blockStepTarget(doc2, stacked, doc2.line(7).from, doc2.line(1).from);
    expect(doc2.lineAt(up).number).toBe(6);
  });

  it("steps up into a block that starts the document", () => {
    // Nothing above the block to land on, so the motion clamps onto position 0
    // — still a step into the block, and it belongs on the block's last line.
    const doc2 = EditorState.create({ doc: "| a | b |\n| 1 | 2 |\nbelow" }).doc;
    const atTop = [{ from: 0, to: doc2.line(2).to }];
    const target = blockStepTarget(doc2, atTop, doc2.line(3).from, 0);
    expect(doc2.lineAt(target).number).toBe(2);
  });

  it("leaves a jump that started further away alone", () => {
    // Nothing wrong with clearing the block — only a *single step* over it is
    // a skip, and line 1 → past the block is not one when a line sits between.
    const far = { from: doc.line(3).from, to: doc.line(4).to };
    expect(blockStepTarget(doc, [far], at(1), at(5))).toBe(null);
  });

  it("leaves a step that stays outside the block alone", () => {
    expect(blockStepTarget(doc, [block], at(5), at(5, 4))).toBe(null);
  });

  it("returns null when nothing is rendered", () => {
    expect(blockStepTarget(doc, [], at(1), at(5))).toBe(null);
  });
});

describe("vertical motion into a rendered block", () => {
  const stateAt = (line) => {
    const doc = EditorState.create({ doc: BLOCK_DOC }).doc;
    return EditorState.create({
      doc: BLOCK_DOC,
      selection: { anchor: doc.line(line).from },
      extensions: [markdown({ base: markdownLanguage }), livePreview()],
    });
  };
  // Move the cursor the way CodeMirror's vertical motion would — straight past
  // the collapsed block — and see where the filter actually puts it.
  const headLineAfterStep = (fromLine, toLine, spec = {}) => {
    const state = stateAt(fromLine);
    const next = state.update({
      selection: { anchor: state.doc.line(toLine).from },
      ...spec,
    }).state;
    return next.doc.lineAt(next.selection.main.head).text;
  };

  it("steps into the table instead of over it going down", () => {
    expect(headLineAfterStep(2, 7)).toBe("| a | b |");
  });

  it("steps into the table instead of over it going up", () => {
    expect(headLineAfterStep(7, 2)).toBe("| 3 | 4 |");
  });

  it("leaves a click past the table where it was aimed", () => {
    expect(headLineAfterStep(2, 7, { userEvent: "select.pointer" })).toBe("");
  });

  it("leaves a jump that clears the table by more than a step alone", () => {
    expect(headLineAfterStep(1, 7)).toBe("");
  });
});

describe("live preview widget reconciliation (typing performance)", () => {
  it("reuses existing widget DOM nodes when typing shifts their document offset", () => {
    const doc = "hello\n\n```js\nconst x = 1;\n```\n\n$$\ny = 2\n$$\n\n- [ ] task";
    const view = makeView(doc, 0);

    // Grab the rendered DOM nodes for code block, math block, and task checkbox
    const initialCodeWidget = view.dom.querySelector(".cm-lp-render:not(.cm-lp-tablewrap)");
    const initialMathWidget = view.dom.querySelector(".cm-lp-math");
    const initialTaskCheckbox = view.dom.querySelector(".cm-lp-task");

    expect(initialCodeWidget).not.toBeNull();
    expect(initialMathWidget).not.toBeNull();
    expect(initialTaskCheckbox).not.toBeNull();

    // Type a character at the beginning of the document (offset 5, after "hello")
    view.dispatch({
      changes: { from: 5, insert: " world" },
    });

    // The document changed and shifted all widget positions by 6 chars,
    // but their source content is identical. They must NOT be recreated!
    const afterCodeWidget = view.dom.querySelector(".cm-lp-render:not(.cm-lp-tablewrap)");
    const afterMathWidget = view.dom.querySelector(".cm-lp-math");
    const afterTaskCheckbox = view.dom.querySelector(".cm-lp-task");

    expect(afterCodeWidget).toBe(initialCodeWidget);
    expect(afterMathWidget).toBe(initialMathWidget);
    expect(afterTaskCheckbox).toBe(initialTaskCheckbox);

    view.destroy();
  });
});
