import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App.jsx";
import "./index.css";

// getCurrentWindow throws when the Tauri runtime is absent (e.g. a plain
// browser). Degrade gracefully so the UI can still mount for previews.
let appWindow = null;
try {
  appWindow = getCurrentWindow();
} catch {
  appWindow = null;
}

// Use createRoot without StrictMode in production for better performance
const root = ReactDOM.createRoot(document.getElementById("root"));

// StrictMode causes double-renders in development which slows initial load
if (import.meta.env.DEV) {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  root.render(<App />);
}

// Show window after paint
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    appWindow?.show().catch(console.error);
  });
});
