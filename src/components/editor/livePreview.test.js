import { describe, it, expect, afterEach } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView, Decoration } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { livePreview } from "./livePreview";

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

let view;
afterEach(() => {
  view?.destroy();
  view = undefined;
});

describe("livePreview decorations", () => {
  it("hides heading markers when the cursor is elsewhere", () => {
    view = makeView("# Hello world\n\nbody text", 20); // cursor in body
    const decos = collectDecorations(view);
    // A replace (hidden) decoration should cover the "# " marker at 0..2.
    const hidesMarker = decos.some(
      (d) => d.from === 0 && d.to === 2 && d.deco.spec?.widget === undefined
    );
    expect(hidesMarker).toBe(true);
    // And a line decoration marks it as a heading.
    const hasHeadingLine = decos.some((d) => d.deco.spec?.class?.includes?.("cm-lp-h1"));
    expect(hasHeadingLine).toBe(true);
  });

  it("reveals heading markers when the cursor is on that line", () => {
    view = makeView("# Hello world", 3); // cursor inside the heading line
    const decos = collectDecorations(view);
    const hidesMarker = decos.some(
      (d) => d.from === 0 && d.to === 2 && d.deco.spec?.widget === undefined
    );
    expect(hidesMarker).toBe(false);
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
