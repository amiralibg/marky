import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const chunkGroups = [
  {
    name: "react-vendor",
    packages: ["react", "react-dom", "scheduler"],
  },
  {
    name: "codemirror-view",
    packages: ["crelt", "style-mod", "w3c-keyname", "@codemirror/view"],
  },
  {
    name: "codemirror-extensions",
    packages: [
      "@codemirror/autocomplete",
      "@codemirror/commands",
      "@codemirror/language",
      "@codemirror/lang-markdown",
      "@codemirror/lint",
      "@codemirror/search",
      "@lezer",
      "@replit/codemirror-vim",
    ],
  },
  {
    name: "codemirror-state",
    packages: ["@codemirror/state"],
  },
  {
    name: "markdown",
    packages: ["marked", "marked-footnote", "marked-katex-extension"],
  },
  {
    name: "markdown-highlight",
    packages: ["highlight.js"],
  },
  {
    name: "math-rendering",
    packages: ["katex"],
  },
  {
    name: "mermaid-vendor",
    packages: [
      "@braintree/sanitize-url",
      "dayjs",
      "dompurify",
      "khroma",
      "stylis",
      "ts-dedent",
      "uuid",
    ],
  },
  {
    name: "mermaid-parser",
    packages: ["@mermaid-js/parser"],
  },
  {
    name: "mermaid-drawing",
    packages: ["@iconify/utils", "roughjs"],
  },
  {
    name: "lodash",
    packages: ["lodash-es"],
  },
  {
    name: "tauri",
    packages: ["@tauri-apps"],
  },
  {
    name: "export-pdf",
    packages: ["pdf-lib", "@pdf-lib"],
  },
  {
    name: "archive",
    packages: ["jszip", "lie", "pako", "readable-stream", "setimmediate"],
  },
  {
    name: "search",
    packages: ["fuse.js"],
  },
  {
    name: "state",
    packages: ["zustand", "use-sync-external-store"],
  },
];

const getManualChunk = (id) => {
  if (!id.includes("node_modules")) return undefined;

  const normalizedId = id.replace(/\\/g, "/");
  const group = chunkGroups.find(({ packages }) =>
    packages.some((packageName) => normalizedId.includes(`/node_modules/${packageName}`))
  );

  return group?.name;
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: getManualChunk,
      },
    },
  },
});
