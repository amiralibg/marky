import { ViewPlugin } from "@codemirror/view";

/**
 * Selection highlighting inside Live-preview rendered blocks.
 *
 * Rendered tables and code fences are non-editable widget DOM. WebKit does not
 * paint custom `::selection` *backgrounds* on non-editable content inside a
 * contenteditable host (the text color applies, the background never does), so
 * dragging a selection across a rendered block showed recolored text with no
 * highlight at all.
 *
 * The Custom Highlight API paints over arbitrary DOM regardless of editability,
 * so we rebuild a named highlight from the parts of the native selection that
 * fall inside rendered-block widgets. Browsers without the API simply keep the
 * old behavior.
 */
export const LIVE_SELECTION_HIGHLIGHT = "marky-live-selection";

const WIDGET_SELECTOR = ".cm-lp-render, .cm-lp-inline-render";

const supportsHighlightAPI =
  typeof window !== "undefined" &&
  typeof window.Highlight !== "undefined" &&
  typeof window.CSS !== "undefined" &&
  !!window.CSS.highlights;

/**
 * The part of `range` that falls inside `element`'s contents, or null.
 * Pure boundary-point math so it stays trivially correct on partial overlaps
 * in either direction.
 */
export const intersectRange = (range, element) => {
  const elRange = document.createRange();
  elRange.selectNodeContents(element);

  // Whichever boundary starts later wins...
  const startsLater =
    range.compareBoundaryPoints(window.Range.START_TO_START, elRange) >= 0 ? range : elRange;
  // ...and whichever ends earlier.
  const endsEarlier =
    range.compareBoundaryPoints(window.Range.END_TO_END, elRange) <= 0 ? range : elRange;

  // An empty intersection (one ends before the other begins).
  if (startsLater.compareBoundaryPoints(window.Range.START_TO_END, endsEarlier) >= 0) {
    return null;
  }

  const out = document.createRange();
  out.setStart(startsLater.startContainer, startsLater.startOffset);
  out.setEnd(endsEarlier.endContainer, endsEarlier.endOffset);
  return out;
};

const collectRanges = (view, selection) => {
  const ranges = [];
  for (let i = 0; i < selection.rangeCount; i += 1) {
    const range = selection.getRangeAt(i);
    view.dom.querySelectorAll(WIDGET_SELECTOR).forEach((widget) => {
      const intersection = intersectRange(range, widget);
      if (intersection) ranges.push(intersection);
    });
  }
  return ranges;
};

export function widgetSelectionHighlight() {
  const plugin = ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view;
        this.frame = null;
        this.onSelectionChange = () => {
          if (this.frame !== null) return;
          this.frame = requestAnimationFrame(() => {
            this.frame = null;
            this.sync();
          });
        };
        document.addEventListener("selectionchange", this.onSelectionChange);
        this.sync();
      }

      sync() {
        const selection = document.getSelection();
        const usable =
          selection &&
          !selection.isCollapsed &&
          selection.rangeCount > 0 &&
          this.view.dom.contains(selection.anchorNode);

        const widgets = this.view.dom.querySelectorAll(WIDGET_SELECTOR);

        if (!supportsHighlightAPI) {
          // Fallback for WebViews without the Custom Highlight API (older
          // WKWebView): tint every rendered block the selection touches. A
          // whole-block wash instead of per-range precision, but it keeps the
          // "selection covers code/tables" contract everywhere.
          widgets.forEach((widget) => {
            const hit =
              usable &&
              selection.rangeCount > 0 &&
              [...Array(selection.rangeCount)].some((_, i) =>
                intersectRange(selection.getRangeAt(i), widget)
              );
            widget.classList.toggle("cm-lp-sel", !!hit);
          });
          return;
        }

        const ranges = usable ? collectRanges(this.view, selection) : [];
        if (ranges.length > 0) {
          window.CSS.highlights.set(LIVE_SELECTION_HIGHLIGHT, new window.Highlight(...ranges));
        } else {
          window.CSS.highlights.delete(LIVE_SELECTION_HIGHLIGHT);
        }
      }

      destroy() {
        document.removeEventListener("selectionchange", this.onSelectionChange);
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        if (supportsHighlightAPI) window.CSS.highlights.delete(LIVE_SELECTION_HIGHLIGHT);
        this.view.dom
          .querySelectorAll(`${WIDGET_SELECTOR}.cm-lp-sel`)
          .forEach((widget) => widget.classList.remove("cm-lp-sel"));
      }
    }
  );

  return [plugin];
}
