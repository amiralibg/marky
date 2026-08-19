import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView, Decoration } from "@codemirror/view";
import { dropIndicator, setDropCaretPos } from "./dropIndicator";

const makeView = (doc) => {
  const state = EditorState.create({ doc, extensions: [dropIndicator()] });
  return new EditorView({ state, parent: document.body });
};

const decorationsIn = (view) => {
  const found = [];
  for (const source of view.state.facet(EditorView.decorations)) {
    const set = typeof source === "function" ? source(view) : source;
    if (!set || set === Decoration.none) continue;
    const cursor = set.iter();
    while (cursor.value) {
      found.push({ from: cursor.from, to: cursor.to, spec: cursor.value.spec });
      cursor.next();
    }
  }
  return found;
};

describe("dropIndicator", () => {
  it("draws nothing until a position is set", () => {
    const view = makeView("one\ntwo\n");
    expect(decorationsIn(view)).toEqual([]);
    view.destroy();
  });

  it("marks the caret offset and the line it falls on", () => {
    const view = makeView("one\ntwo\n");
    setDropCaretPos(view, 5); // second line, one character in

    const decorations = decorationsIn(view);
    const caret = decorations.find((d) => d.spec.widget);
    const line = decorations.find((d) => d.spec.class === "cm-marky-drop-line");

    expect(caret?.from).toBe(5);
    expect(line?.from).toBe(4); // start of "two"
    view.destroy();
  });

  it("takes the caret away again", () => {
    const view = makeView("one\ntwo\n");
    setDropCaretPos(view, 5);
    setDropCaretPos(view, null);
    expect(decorationsIn(view)).toEqual([]);
    view.destroy();
  });

  // The caret can be up while text is inserted — an earlier file in the same
  // multi-file drop finishing, or an autosave landing.
  it("follows the text when the document changes under it", () => {
    const view = makeView("one\ntwo\n");
    setDropCaretPos(view, 5);
    view.dispatch({ changes: { from: 0, insert: "XX" } });

    const caret = decorationsIn(view).find((d) => d.spec.widget);
    expect(caret?.from).toBe(7);
    view.destroy();
  });

  it("clamps a position left past the end of a shortened document", () => {
    const view = makeView("one\ntwo\n");
    setDropCaretPos(view, 8);
    view.dispatch({ changes: { from: 0, to: 8 } });

    const caret = decorationsIn(view).find((d) => d.spec.widget);
    expect(caret?.from).toBe(0);
    view.destroy();
  });
});
