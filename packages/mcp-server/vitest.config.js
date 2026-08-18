import { defineConfig } from "vitest/config";

// Without this the package inherits the repo-root vite.config.js, whose jsdom
// environment and app-specific setupFiles do not apply to this Node-only package.
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["test/**/*.test.js"],
  },
});
