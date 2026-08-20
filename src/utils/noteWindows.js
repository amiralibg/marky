import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { detectPlatform } from "./platform";
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
    decorations: !isLinux,
    dragDropEnabled: true,
  });

  await new Promise((resolve, reject) => {
    win.once("tauri://created", () => resolve());
    win.once("tauri://error", (event) => reject(new Error(event?.payload || "window failed")));
  });

  return win;
}
