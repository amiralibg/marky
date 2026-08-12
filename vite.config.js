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

/**
 * Ship only KaTeX's woff2 fonts.
 *
 * `katex.min.css` lists woff2, woff and ttf for every face, so Vite emitted all
 * three — 1.17 MB of fonts where the WebView only ever loads the first, woff2.
 * Rewriting the `src` before Vite resolves those URLs means the other two are
 * never referenced and never emitted, saving ~876 KB.
 *
 * woff2 has been supported since Safari 10 / Chrome 36, so the WebView this app
 * runs in never needs the fallbacks.
 */
const katexWoff2Only = () => ({
  name: "katex-woff2-only",
  enforce: "pre",
  transform(code, id) {
    if (!id.replace(/\\/g, "/").includes("/node_modules/katex/dist/katex")) return null;
    if (!code.includes("@font-face")) return null;

    // `src:url(a.woff2) format("woff2"),url(a.woff) format("woff"),…` → woff2 only.
    const trimmed = code.replace(
      /src:\s*(url\([^)]*\.woff2\)\s*format\(["']woff2["']\))[^;}]*/g,
      "src:$1"
    );
    return trimmed === code ? null : { code: trimmed, map: null };
  },
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), katexWoff2Only()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
    css: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: getManualChunk,
      },
    },
  },
});
