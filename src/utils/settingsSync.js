import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import useSettingsStore from "../store/settingsStore";
import useNotesStore from "../store/notesStore";

/**
 * Keeps settings consistent across windows.
 *
 * Settings are one `localStorage` blob shared by every window, and each window
 * writes the whole blob from its own in-memory copy. With a second vault open
 * in its own window that loses data: change the theme for vault B, then change
 * anything at all in the window on vault A, and A writes back the profile map
 * as it looked before B's change.
 *
 * So a window that writes settings says so, and the others re-read the blob and
 * then re-apply their own vault's profile on top — the shared parts converge,
 * and each window keeps the look of the vault it is actually showing. The
 * side benefit is that changing a shared setting is visible everywhere at once
 * instead of after a restart.
 */
const EVENT = "settings-changed";

/** How long to gather rapid writes (dragging the font-size slider) into one. */
const EMIT_DEBOUNCE_MS = 150;

const currentWindowLabel = () => {
  try {
    return getCurrentWindow().label;
  } catch {
    return null;
  }
};

export function startSettingsSync() {
  const label = currentWindowLabel();
  // No Tauri runtime (tests, a browser preview) means no other windows either.
  if (!label) return () => {};

  // Set while another window's change is being applied here, so re-reading the
  // blob does not look like a local edit and bounce back out again.
  let applyingRemote = false;
  let emitTimer = null;
  let disposed = false;
  let unlisten = null;

  const unsubscribe = useSettingsStore.subscribe(() => {
    if (applyingRemote || disposed) return;
    if (emitTimer) clearTimeout(emitTimer);
    emitTimer = setTimeout(() => {
      emitTimer = null;
      // The payload is only the sender's identity: the settings themselves
      // travel through `localStorage`, which every window already shares.
      emit(EVENT, { source: label }).catch(() => {});
    }, EMIT_DEBOUNCE_MS);
  });

  listen(EVENT, async (event) => {
    if (disposed || event.payload?.source === label) return;

    applyingRemote = true;
    try {
      await useSettingsStore.persist.rehydrate();
      // The blob's top-level values are whichever vault the sender was showing.
      // This window's vault has the last word here.
      const { rootFolderPath } = useNotesStore.getState();
      useSettingsStore.getState().syncWorkspaceSettings(rootFolderPath);
    } catch (error) {
      console.error("Failed to apply settings from another window:", error);
    } finally {
      applyingRemote = false;
    }
  })
    .then((off) => {
      if (disposed) off();
      else unlisten = off;
    })
    .catch(() => {});

  return () => {
    disposed = true;
    if (emitTimer) clearTimeout(emitTimer);
    unsubscribe();
    unlisten?.();
  };
}
