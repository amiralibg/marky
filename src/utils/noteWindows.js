import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { detectPlatform } from "./platform";
import { supportsWindowTranslucency } from "./windowTranslucency";
import { hashPath } from "./windowVault";

/**
 * Open a note in its own window.
 *
 * The window loads the same bundle with `?note=<path>`, which `main.jsx` routes
 * to a single-file editor instead of the full app: this window is a view onto
 * one file in the vault its opener already has open, so it deliberately has no
 * sidebar and no store of its own. A window that owns a whole second vault is
 * `openVaultInNewWindow` instead.
 *
 * Window labels must be unique and may only contain `[a-zA-Z0-9-/:_]`, so the
 * path is hashed rather than embedded. Reopening the same note focuses the
 * window that already has it instead of stacking duplicates.
 */
const labelFor = (filePath) => `note-${hashPath(filePath)}`;

const fileNameOf = (path) => (path || "").replace(/\\/g, "/").split("/").pop() || "Note";

export async function openNoteInNewWindow(filePath) {
  if (!filePath) return null;

  const label = labelFor(filePath);
  const isLinux = detectPlatform() === "linux";

  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.unminimize().catch(() => {});
    await existing.setFocus();
    return existing;
  }

  const win = new WebviewWindow(label, {
    url: `index.html?note=${encodeURIComponent(filePath)}`,
    title: fileNameOf(filePath),
    width: 720,
    height: 820,
    minWidth: 420,
    minHeight: 320,
    titleBarStyle: "Overlay",
    hiddenTitle: true,
    // Traffic lights placed natively by the empty toolbar main.rs installs.
    decorations: !isLinux,
    // Translucent window support; see the same flag in vaultWindows.js.
    transparent: supportsWindowTranslucency(),
    // Hidden until its page shows it: Rust puts the remembered material or
    // desk colour on as the page starts loading, and the page shows the window
    // once its first UI is committed (see windowStartup.js), so the desktop
    // never shows through unblurred. Rust shows it anyway after a timeout.
    visible: false,
    dragDropEnabled: true,
  });

  await new Promise((resolve, reject) => {
    win.once("tauri://created", () => resolve());
    win.once("tauri://error", (event) => reject(new Error(event?.payload || "window failed")));
  });

  return win;
}
