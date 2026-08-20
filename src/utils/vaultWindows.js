import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { detectPlatform } from "./platform";
import { folderNameOf, sessionWindowLabel, vaultWindowLabel, windowVaultPath } from "./windowVault";

/**
 * Open a vault in a window of its own.
 *
 * Unlike `openNoteInNewWindow`, this loads the whole app — sidebar, tabs,
 * search, graph — against a second vault. `?vault=<path>` tells the new window
 * which folder it owns; `windowVault.js` turns that into a separate
 * `localStorage` key so the two windows do not overwrite each other's state,
 * and the Rust side keeps one file watcher per window so both stay in sync with
 * their own folder.
 *
 * Reopening a vault that already has a window focuses it instead of stacking a
 * duplicate — two windows on one folder would be two stores writing the same
 * files.
 */
export async function openVaultInNewWindow(vaultPath, vaultName = null) {
  if (!vaultPath) return null;

  const label = vaultWindowLabel(vaultPath);
  // Same chrome as the main window: macOS keeps decorations for the overlay
  // title bar's traffic lights, everywhere else Marky draws its own title bar
  // and a native frame on top of it would be a second one.
  const isMac = detectPlatform() === "macos";

  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.unminimize().catch(() => {});
    await existing.setFocus();
    return existing;
  }

  const win = new WebviewWindow(label, {
    url: `index.html?vault=${encodeURIComponent(vaultPath)}`,
    title: vaultName || folderNameOf(vaultPath),
    width: 1200,
    height: 820,
    minWidth: 680,
    minHeight: 420,
    titleBarStyle: "Overlay",
    hiddenTitle: true,
    decorations: isMac,
    dragDropEnabled: true,
  });

  await new Promise((resolve, reject) => {
    win.once("tauri://created", () => resolve());
    win.once("tauri://error", (event) => reject(new Error(event?.payload || "window failed")));
  });

  return win;
}

/**
 * Open an empty window.
 *
 * The same full app with nothing loaded, so the user decides what goes in it —
 * a vault, a loose file, a scratch note. Each one gets its own id, and with it
 * its own slice of `localStorage`, so two empty windows do not share tabs.
 */
export async function openEmptyWindow() {
  const sessionId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const isMac = detectPlatform() === "macos";

  const win = new WebviewWindow(sessionWindowLabel(sessionId), {
    url: `index.html?win=${encodeURIComponent(sessionId)}`,
    title: "Marky",
    width: 1200,
    height: 820,
    minWidth: 680,
    minHeight: 420,
    titleBarStyle: "Overlay",
    hiddenTitle: true,
    decorations: isMac,
    dragDropEnabled: true,
  });

  await new Promise((resolve, reject) => {
    win.once("tauri://created", () => resolve());
    win.once("tauri://error", (event) => reject(new Error(event?.payload || "window failed")));
  });

  return win;
}

/** True when the given vault is the one this window already owns. */
export const isCurrentWindowVault = (vaultPath) =>
  Boolean(windowVaultPath) && windowVaultPath === vaultPath;
