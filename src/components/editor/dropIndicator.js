import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { StateEffect, StateField } from "@codemirror/state";

/**
 * A caret showing where a dragged file will land.
 *
 * CodeMirror ships `dropCursor()`, but it listens for the DOM's `dragover` —
 * and Tauri intercepts OS file drags before the webview ever fires one. So the
 * position arrives from the Tauri event stream instead, and this draws it.
 *
 * The caret is a zero-width inline widget whose visible bar is an absolutely
 * positioned pseudo-element, so showing it never reflows a single character of
 * the text underneath.
 */

const setDropCaret = StateEffect.define();

class DropCaretWidget extends WidgetType {
  eq() {
    // Every instance draws the same thing; position lives in the decoration.
    return true;
  }

  toDOM() {
    const caret = document.createElement("span");
    caret.className = "cm-marky-drop-caret";
    caret.setAttribute("aria-hidden", "true");
    return caret;
  }

  ignoreEvent() {
    return true;
  }
}

const caretDeco = Decoration.widget({ widget: new DropCaretWidget(), side: 1 });
const activeLineDeco = Decoration.line({ class: "cm-marky-drop-line" });

const dropCaretField = StateField.define({
  create: () => null,

  update(pos, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setDropCaret)) return effect.value;
    }
    if (pos == null) return null;
    // A document change while the caret is up (a concurrent save, an earlier
    // file in the same drop finishing) must carry it along, or it points at
    // text that has moved.
    return tr.docChanged ? tr.changes.mapPos(pos) : pos;
  },
});

// The line decoration anchors to the line start while the caret sits at the
// exact drop offset, so the two are built together from the stored position.
const buildDecorations = (state) => {
  const pos = state.field(dropCaretField, false);
  if (pos == null) return Decoration.none;
  const clamped = Math.max(0, Math.min(pos, state.doc.length));
  const line = state.doc.lineAt(clamped);
  return Decoration.set([activeLineDeco.range(line.from), caretDeco.range(clamped)], true);
};

const dropDecorations = EditorView.decorations.compute([dropCaretField], buildDecorations);

/** Move the caret to `pos`, or pass `null` to take it away. */
export const setDropCaretPos = (view, pos) => {
  if (!view) return;
  if (view.state.field(dropCaretField, false) === pos) return;
  view.dispatch({ effects: setDropCaret.of(pos) });
};

/** The document offset under a point. */
export const dropPosAt = (view, x, y) => {
  if (!view) return null;
  // `precise: false` still resolves exactly wherever the DOM can answer, and
  // falls back to an estimate from the height map rather than returning null
  // where it can't — below the last line, or over a collapsed range. A drop
  // always has to land somewhere, so "no position" is not a useful answer.
  const pos = view.posAtCoords({ x, y }, false);
  return typeof pos === "number" ? pos : null;
};

const dropCaretTheme = EditorView.baseTheme({
  ".cm-marky-drop-caret": {
    display: "inline-block",
    position: "relative",
    width: "0",
    verticalAlign: "text-bottom",
  },
  ".cm-marky-drop-caret::before": {
    content: '""',
    position: "absolute",
    left: "-1px",
    top: "0",
    bottom: "0",
    width: "2px",
    borderRadius: "1px",
    background: "var(--color-accent, #6d5ce0)",
    animation: "cm-marky-drop-caret-pulse 1s ease-in-out infinite",
  },
  "@keyframes cm-marky-drop-caret-pulse": {
    "0%, 100%": { opacity: 1 },
    "50%": { opacity: 0.35 },
  },
  // A wash on the target line, so the destination reads at a glance even when
  // the caret itself falls in the middle of a dense paragraph.
  ".cm-marky-drop-line": {
    background: "color-mix(in srgb, var(--color-accent, #6d5ce0) 10%, transparent)",
    borderRadius: "4px",
  },
});

export const dropIndicator = () => [dropCaretField, dropDecorations, dropCaretTheme];
