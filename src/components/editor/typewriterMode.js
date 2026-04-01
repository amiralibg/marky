import { EditorView, ViewPlugin } from '@codemirror/view';

/**
 * Typewriter mode: keeps the cursor line vertically centered in the editor
 * viewport by adding padding to the bottom of the scroll container.
 * On every cursor move or document change the view scrolls so the primary
 * cursor sits at ~50 % of the visible height.
 */
export function typewriterMode() {
  return [
    // Dynamic bottom padding so the last line can be scrolled to the center
    EditorView.theme({
      '&.cm-typewriter .cm-scroller': {
        paddingBottom: '50vh',
      },
    }),

    // Toggle the marker class on the editor root
    ViewPlugin.define((view) => {
      view.dom.classList.add('cm-typewriter');
      return {
        destroy() {
          view.dom.classList.remove('cm-typewriter');
        },
      };
    }),

    // Scroll to center on cursor / doc changes
    EditorView.updateListener.of((update) => {
      if (!update.selectionSet && !update.docChanged) return;
      const view = update.view;
      const { state } = view;
      const primaryHead = state.selection.main.head;

      // Defer one frame so layout has settled
      requestAnimationFrame(() => {
        try {
          const coords = view.coordsAtPos(primaryHead);
          if (!coords) return;
          const scroller = view.scrollDOM;
          const scrollerRect = scroller.getBoundingClientRect();
          const lineY = coords.top - scrollerRect.top + scroller.scrollTop;
          const target = lineY - scroller.clientHeight / 2;
          scroller.scrollTop = Math.max(0, target);
        } catch {
          // Ignore layout errors during rapid edits
        }
      });
    }),
  ];
}
