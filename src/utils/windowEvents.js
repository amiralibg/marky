import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Listen for an event that concerns one window.
 *
 * Some events from Rust are meant for a single window: menu actions follow
 * focus, and a `file-change` belongs to the window that asked for that watch.
 * They are broadcast anyway, with the window they are meant for named in the
 * payload, and dropped here if that is not this window.
 *
 * The alternative — Tauri's addressed `emit_to` — only reaches listeners that
 * registered under the same label, while a plain `listen(event, handler)`
 * registers for the `Any` target, which does not count as a match. An addressed
 * event can therefore arrive nowhere at all, with nothing to show for it.
 * Broadcasting always arrives; the filtering lives here, where it is testable.
 *
 * An event with no window named in its payload is for everyone, so events that
 * are genuinely app-wide keep working through this helper unchanged.
 */
export const listenForWindow = (event, handler) => {
  let label = null;
  try {
    label = getCurrentWindow().label;
  } catch {
    // No Tauri runtime (tests, a browser preview) — nothing addresses us anyway.
    label = null;
  }

  return listen(event, (payload) => {
    const target = payload?.payload?.window;
    if (target && label && target !== label) return;
    handler(payload);
  });
};

export default listenForWindow;
