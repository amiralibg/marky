import { detectPlatform } from "./platform";

/**
 * Who takes a file dragged in from outside the app.
 *
 * With `dragDropEnabled`, Tauri swallows OS file drags before the webview sees
 * them and re-emits one `onDragDropEvent` stream to *every* listener in the
 * window. The sidebar and the editor both listen, so without a shared answer to
 * "is this drop mine?" a picture dropped on the editor was handled by the
 * sidebar — which highlighted itself, looked for a markdown file, found an
 * image, and refused it.
 *
 * A single resolver settles it. Both listeners ask the same question about the
 * same payload and get the same answer, so it doesn't matter which of them the
 * event reaches first.
 */

let resolver = null;

// Tauri's `over` event carries a position and nothing else — only `enter` and
// `drop` list the paths being dragged. Asking "is this an image?" during a hover
// therefore has to remember what `enter` said, or the answer is always no and
// the drop caret never appears.
let draggedPaths = [];

/**
 * Register the editor's claim test. Passing `null` unregisters it, which is
 * what an unmounted editor must do — a stale resolver would keep the sidebar
 * from handling drops it should own.
 *
 * @param {((position: {x: number, y: number}|null, paths: string[]) => boolean)|null} fn
 */
export const setEditorDropResolver = (fn) => {
  resolver = typeof fn === "function" ? fn : null;
};

/** Record the paths a drag is carrying, for the `over` events that omit them. */
export const rememberDraggedPaths = (paths) => {
  draggedPaths = Array.isArray(paths) ? paths : [];
};

/** Forget them again once the drag ends, however it ended. */
export const clearDraggedPaths = () => {
  draggedPaths = [];
};

/**
 * True when the editor will handle this drop itself.
 * @param {{x: number, y: number}|null} position - Logical (CSS) pixels
 * @param {string[]} [paths] - Paths from the payload; falls back to the drag's
 *   remembered paths, which is what an `over` event has to rely on.
 */
export const editorAcceptsDrop = (position, paths) => {
  if (!resolver) return false;
  const effective = paths?.length ? paths : draggedPaths;
  try {
    return Boolean(resolver(position, effective));
  } catch {
    return false;
  }
};

/**
 * Turn a drag position from Tauri into the CSS pixels the DOM measures in.
 *
 * Tauri types this as a `PhysicalPosition`, but on two of the three desktops it
 * isn't one — the runtime relabels whatever the platform handed it without ever
 * applying the scale factor (`PhysicalPosition::new(x as _, y as _)`):
 *
 *   - macOS  — an AppKit `NSPoint`, which is in points. Already logical.
 *   - Linux  — GTK widget coordinates, which are application pixels. Logical.
 *   - Windows — `ScreenToClient` on a DPI-aware window. Genuinely physical.
 *
 * Dividing by the device pixel ratio everywhere therefore halved the coordinate
 * on a Retina Mac, and the drop caret landed further from the pointer the
 * further down the note you dragged.
 */
const positionIsPhysical = () => detectPlatform() === "windows";

export const toLogicalPosition = (position) => {
  if (!position) return null;

  const scale = window.devicePixelRatio || 1;
  const raw = { x: position.x, y: position.y };
  if (scale === 1) return raw;

  const scaled = { x: position.x / scale, y: position.y / scale };
  const [preferred, fallback] = positionIsPhysical() ? [scaled, raw] : [raw, scaled];

  // The position is relative to the webview, so it has to land inside it. If the
  // platform rule above is ever wrong — wry normalising macOS, say — the wrong
  // reading lands off-screen while the right one doesn't, and this catches it
  // rather than quietly pointing the caret at nothing.
  if (isInsideViewport(preferred) || !isInsideViewport(fallback)) return preferred;
  return fallback;
};

const isInsideViewport = ({ x, y }) =>
  x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight;
