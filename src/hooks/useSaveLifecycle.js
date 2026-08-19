import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import useNotesStore from "../store/notesStore";

/** How long a flush gets before the app closes or quits anyway. */
const FLUSH_TIMEOUT_MS = 1500;

/**
 * Writes pending edits on the ways out of the app.
 *
 * Auto-save handles the common case — you stop typing, the note lands on disk a
 * couple of seconds later. This covers the cases where you never stop typing:
 * you alt-tab away, or close the window, or quit, in the middle of a sentence.
 * Without it the text is safe (the draft cache holds it) but the Markdown file
 * on disk is behind, which anything reading the vault directly — git, a sync
 * client, Marky's own MCP server — would see.
 *
 * Closing and quitting are separate events, and both matter. Closing a window
 * is `onCloseRequested`: the window's X, Cmd/Ctrl+W, Alt+F4. Quitting is not a
 * window event at all — macOS Cmd+Q and the Quit menu item go straight to the
 * application, which is why the Rust side holds the exit and asks here first
 * (see `ExitState` in main.rs).
 *
 * Note switching and tab closing are handled in the store instead, since they
 * happen through `selectNote` / `closeNote` rather than a window event.
 */
export function useSaveLifecycle() {
  useEffect(() => {
    const store = () => useNotesStore.getState();

    // Never let a wedged write — a full disk, a sleeping network volume — leave
    // the user with a window that will not close or an app that will not quit.
    const flushWithTimeout = async () => {
      try {
        await Promise.race([
          store().flushAllPendingSaves(),
          new Promise((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS)),
        ]);
      } catch (error) {
        console.error("Failed to save before exiting:", error);
      }
    };

    // Leaving the window is the same signal Obsidian uses.
    const onBlur = () => {
      void store().flushAllPendingSaves();
    };
    window.addEventListener("blur", onBlur);

    let unlistenClose = null;
    let unlistenExit = null;
    let closing = false;
    let exiting = false;

    const appWindow = (() => {
      try {
        // Absent outside the Tauri runtime (tests, a plain browser preview).
        return getCurrentWindow();
      } catch {
        return null;
      }
    })();

    if (appWindow) {
      appWindow
        .onCloseRequested?.(async (event) => {
          // Re-entrancy guard: `destroy()` below does not re-run this handler,
          // but a second close click while the flush is in flight would.
          if (closing) return;
          closing = true;
          event.preventDefault();

          await flushWithTimeout();
          await appWindow.destroy();
        })
        ?.then((unlisten) => {
          unlistenClose = unlisten;
        })
        ?.catch(() => {});
    }

    // Rust has held the exit and is waiting on us. It gives up after its own
    // timeout, so a missed `confirm_exit` delays the quit rather than blocking it.
    listen("app-exit-requested", async () => {
      if (exiting) return;
      exiting = true;
      await flushWithTimeout();
      try {
        await invoke("confirm_exit");
      } catch (error) {
        console.error("Failed to confirm exit:", error);
      }
    })
      .then((unlisten) => {
        unlistenExit = unlisten;
      })
      .catch(() => {});

    return () => {
      window.removeEventListener("blur", onBlur);
      unlistenClose?.();
      unlistenExit?.();
    };
  }, []);
}

export default useSaveLifecycle;
