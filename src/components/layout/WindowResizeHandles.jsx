import { useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Drag zones along the window edge, for Linux.
 *
 * The window is undecorated there, so the window manager draws no resize border
 * of its own. GTK offers one for undecorated windows, but it only sees pointer
 * events the window itself receives — and the WebKit webview covers the whole
 * window and swallows them, which left the window resizable only by keyboard or
 * a WM shortcut. These strips sit above the content at the very edge and hand
 * the drag straight to the compositor.
 *
 * macOS keeps its native frame and Windows gets its border from DWM, so neither
 * renders this.
 */
const EDGES = [
  { dir: "North", className: "top-0 left-0 right-0 h-1 cursor-ns-resize" },
  { dir: "South", className: "bottom-0 left-0 right-0 h-1 cursor-ns-resize" },
  { dir: "West", className: "top-0 bottom-0 left-0 w-1 cursor-ew-resize" },
  { dir: "East", className: "top-0 bottom-0 right-0 w-1 cursor-ew-resize" },
  // Corners stay small on purpose: the window buttons live within a dozen
  // pixels of the top-right one, and a grip that reached them would resize the
  // window on a mis-aimed click at Close.
  { dir: "NorthWest", className: "top-0 left-0 size-2 cursor-nwse-resize" },
  { dir: "NorthEast", className: "top-0 right-0 size-2 cursor-nesw-resize" },
  { dir: "SouthWest", className: "bottom-0 left-0 size-2 cursor-nesw-resize" },
  { dir: "SouthEast", className: "bottom-0 right-0 size-2 cursor-nwse-resize" },
];

const WindowResizeHandles = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  // Same guard the title bar uses: `getCurrentWindow` throws outright without
  // the Tauri runtime.
  const appWindow = useMemo(() => {
    try {
      return getCurrentWindow();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!appWindow) return undefined;

    let unlisten;
    const sync = () =>
      appWindow
        .isMaximized()
        .then(setIsMaximized)
        .catch(() => {});

    sync();
    appWindow
      .onResized(sync)
      .then((off) => {
        unlisten = off;
      })
      .catch(() => {});

    return () => unlisten?.();
  }, [appWindow]);

  // A maximized window has no edge to pull, and starting a drag on one only
  // confuses the compositor.
  if (!appWindow || isMaximized) return null;

  return (
    <>
      {EDGES.map(({ dir, className }) => (
        <div
          key={dir}
          className={`window-resize-handle ${className}`}
          onMouseDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            appWindow.startResizeDragging(dir).catch(() => {});
          }}
        />
      ))}
    </>
  );
};

export default WindowResizeHandles;
