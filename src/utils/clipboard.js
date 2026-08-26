/**
 * One way to put text on the clipboard.
 *
 * `navigator.clipboard` alone is not dependable inside the WebView: it is
 * undefined on some builds, and it rejects outright when the document is not
 * the focused one. The code block copy button used it on its own and so did
 * nothing at all on those platforms, silently — `navigator.clipboard?.write…`
 * short-circuits to `undefined` rather than throwing.
 *
 * Tauri's clipboard plugin talks to the OS directly and is the primary path;
 * the browser API is the fallback for `pnpm dev` in a plain browser, and the
 * hidden-textarea trick is the last resort for a WebView with neither.
 *
 * The plugin is imported lazily so that pulling this module into a test (or
 * into the web build) does not drag the Tauri bridge in with it.
 */
export const copyText = async (text) => {
  const value = String(text ?? "");

  try {
    const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
    await writeText(value);
    return true;
  } catch {
    // Not running under Tauri, or the plugin is unavailable — try the WebView.
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Denied, or the document is not focused.
  }

  return legacyCopy(value);
};

/**
 * `document.execCommand("copy")` against an off-screen textarea. Deprecated,
 * but it is synchronous, needs no permission prompt, and is the only thing
 * that works in a WebView where the async clipboard API is missing.
 */
const legacyCopy = (value) => {
  if (typeof document === "undefined" || !document.execCommand) return false;
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "-1000px";
  area.style.opacity = "0";
  document.body.appendChild(area);
  const previous = document.activeElement;
  try {
    area.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
    if (previous instanceof HTMLElement) previous.focus();
  }
};
