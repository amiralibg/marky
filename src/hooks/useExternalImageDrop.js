import { useEffect, useRef } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { dropPosAt, setDropCaretPos } from "../components/editor/dropIndicator";
import { imagePathsIn } from "../utils/attachmentSaver";
import {
  clearDraggedPaths,
  editorAcceptsDrop,
  rememberDraggedPaths,
  setEditorDropResolver,
  toLogicalPosition,
} from "../utils/externalDrop";

/**
 * Drag an image file from Finder (or Explorer, or Files) straight into a note.
 *
 * This cannot be done with the DOM's own drag events. `dragDropEnabled` lets
 * Tauri intercept OS file drags before the webview sees them, so `dragover` and
 * `drop` never fire for a dragged file — the editor looked inert while the
 * sidebar, the one component listening to Tauri's stream, lit up instead.
 *
 * So the editor listens to the same stream, claims the drops that land over its
 * own text, and draws its own drop caret (see dropIndicator.js) because the
 * built-in one is driven by the DOM events that never arrive.
 */

/** The nearest ancestor that actually scrolls, or null when the page does. */
const scrollingAncestor = (element) => {
  for (let node = element?.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === "auto" || overflow === "scroll" || overflow === "overlay") return node;
  }
  return null;
};

/**
 * The part of the editor the user can actually see.
 *
 * Not simply the scroller's rect: in auto-height mode the editor grows to fit
 * its content and an outer container does the scrolling, so `.cm-scroller` is
 * as tall as the whole note and its box runs off the top of the window, behind
 * the tab bar. Hit-testing against that claimed drags over the tabs and put the
 * caret at whatever line happened to sit at that height — well outside view.
 */
const visibleEditorRect = (view) => {
  const rect = view.scrollDOM.getBoundingClientRect();
  const clip = scrollingAncestor(view.scrollDOM)?.getBoundingClientRect();

  return {
    left: Math.max(rect.left, clip?.left ?? 0, 0),
    right: Math.min(rect.right, clip?.right ?? window.innerWidth, window.innerWidth),
    top: Math.max(rect.top, clip?.top ?? 0, 0),
    bottom: Math.min(rect.bottom, clip?.bottom ?? window.innerHeight, window.innerHeight),
  };
};

const pointerIsOverEditor = (view, position) => {
  if (!view || !position) return false;
  const rect = visibleEditorRect(view);
  return (
    position.x >= rect.left &&
    position.x <= rect.right &&
    position.y >= rect.top &&
    position.y <= rect.bottom
  );
};

/**
 * @param {object} options
 * @param {() => import("@codemirror/view").EditorView | null} options.getView
 * @param {(paths: string[], pos: number) => Promise<void>} options.onDropImages
 * @param {boolean} [options.enabled] - False while the editor isn't on screen
 */
export const useExternalImageDrop = ({ getView, onDropImages, enabled = true }) => {
  const getViewRef = useRef(getView);
  const onDropRef = useRef(onDropImages);

  useEffect(() => {
    getViewRef.current = getView;
  }, [getView]);

  useEffect(() => {
    onDropRef.current = onDropImages;
  }, [onDropImages]);

  useEffect(() => {
    if (!enabled) return undefined;

    let unlisten = null;
    let cancelled = false;

    // The sidebar asks this before handling a drop of its own, so the two never
    // both act on one event — and both get the same answer for a given payload,
    // which is what makes the ordering between the two listeners irrelevant.
    const accepts = (position, paths) => {
      const view = getViewRef.current?.();
      if (!view || view.state.readOnly) return false;
      if (imagePathsIn(paths).length === 0) return false;
      return pointerIsOverEditor(view, position);
    };

    setEditorDropResolver(accepts);

    const clearCaret = () => setDropCaretPos(getViewRef.current?.() ?? null, null);

    const setup = async () => {
      try {
        const webview = getCurrentWebview();
        if (!webview) return;

        const off = await webview.onDragDropEvent((event) => {
          const { type, position, paths } = event.payload;
          const logical = toLogicalPosition(position);

          // `enter` is the only event before the drop that names the files, so
          // it is where the rest of the drag learns what is being carried.
          if (type === "enter") rememberDraggedPaths(paths);

          if (type === "enter" || type === "over") {
            const view = getViewRef.current?.();
            if (!view || !editorAcceptsDrop(logical, paths)) {
              clearCaret();
              return;
            }
            setDropCaretPos(view, dropPosAt(view, logical.x, logical.y));
            return;
          }

          if (type === "drop") {
            const view = getViewRef.current?.();
            const claimed = Boolean(view) && editorAcceptsDrop(logical, paths);
            // Read the position before the caret is taken away — the drop lands
            // where the caret was, not at the text cursor.
            const pos = claimed
              ? (dropPosAt(view, logical.x, logical.y) ?? view.state.doc.length)
              : null;
            clearCaret();
            clearDraggedPaths();
            if (!claimed) return;
            void onDropRef.current?.(imagePathsIn(paths), pos);
            return;
          }

          // "leave", and anything else that ends the drag.
          clearCaret();
          clearDraggedPaths();
        });

        if (cancelled) off();
        else unlisten = off;
      } catch (error) {
        // Not running under Tauri (a plain browser preview) — drag and drop of
        // OS files isn't a thing there, and nothing else here depends on it.
        console.error("Failed to listen for dropped files:", error);
      }
    };

    setup();

    return () => {
      cancelled = true;
      setEditorDropResolver(null);
      clearDraggedPaths();
      clearCaret();
      if (unlisten) unlisten();
    };
  }, [enabled]);
};
