import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App.jsx";
import NoteWindow from "./components/NoteWindow.jsx";
import "./index.css";

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
const root = ReactDOM.createRoot(document.getElementById("root"));

const Root = noteParam ? <NoteWindow filePath={noteParam} /> : <App />;

// StrictMode causes double-renders in development which slows initial load
if (import.meta.env.DEV) {
  root.render(<React.StrictMode>{Root}</React.StrictMode>);
} else {
  root.render(Root);
}

// Show window after paint
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    appWindow?.show().catch(console.error);
  });
});
