import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App.jsx";
import NoteWindow from "./components/NoteWindow.jsx";
import { applyPlatformAttribute } from "./utils/platform.js";
import useSettingsStore, { applyReadingFont } from "./store/settingsStore.js";
import { applyWindowTranslucency } from "./utils/windowTranslucency.js";
import { renderAndRevealWindow } from "./utils/windowStartup.js";
import "./index.css";

// Set before the first render so platform-specific chrome (the Linux window
// edge) paints with the rest of the app rather than a frame later.
const platform = applyPlatformAttribute();
// Same reason: notes should paint in the chosen typeface on the first frame.
// The store rehydrates from localStorage synchronously, so this is the saved value.
applyReadingFont(useSettingsStore.getState().readingFont);
// And the desk is see-through from the first frame when the window is
// translucent, rather than flashing opaque until settings initialise.
applyWindowTranslucency(
  useSettingsStore.getState().translucentWindow,
  useSettingsStore.getState().translucencyAmount
);

// GTK packs the app menu bar inside the window, over Marky's own title bar.
// The main window is dealt with in Rust at startup; every window created after
// that — a note opened in its own window — asks for the same treatment here,
// because the JS window API has no `removeMenu`.
if (platform === "linux") {
  invoke("remove_window_menu").catch(() => {});
}

// A `?note=` parameter means this window was opened to edit one specific file
// (see `openNoteInNewWindow`). It renders a focused editor rather than a second
// copy of the app — every window shares one localStorage, and two instances of
// the notes store would overwrite each other's persisted vault.
const noteParam = new URLSearchParams(window.location.search).get("note");

// getCurrentWindow throws when the Tauri runtime is absent (e.g. a plain
// browser). Degrade gracefully so the UI can still mount for previews.
let appWindow = null;
try {
  appWindow = getCurrentWindow();
} catch {
  appWindow = null;
}

// The WebView's own right-click menu (Reload, Inspect Element, AutoFill…) is
// browser chrome that has no business in a desktop app — it offers to reload
// the "page" and to autofill notes. Suppressed everywhere except dev builds,
// where Inspect Element is worth keeping.
if (!import.meta.env.DEV) {
  window.addEventListener("contextmenu", (event) => event.preventDefault());
}

// Use createRoot without StrictMode in production for better performance
const root = createRoot(document.getElementById("root"));

const Root = noteParam ? <NoteWindow filePath={noteParam} /> : <App />;
const initialUI = import.meta.env.DEV ? <React.StrictMode>{Root}</React.StrictMode> : Root;

// Every window is created hidden. Rust has already put the remembered
// material (or the opaque desk colour) on it as this page started loading
// (`dress_window` in main.rs), so whatever the first native frame holds, the
// desktop never shows through it unblurred. A hidden WebView may throttle
// requestAnimationFrame, so waiting for a frame before calling `show()` can
// leave the app invisible; commit the initial React tree synchronously, then
// reveal immediately. Rust shows the window anyway if this never runs.
renderAndRevealWindow(root, initialUI, appWindow, flushSync);
