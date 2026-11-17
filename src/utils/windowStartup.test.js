import { readFileSync } from "node:fs";
import process from "node:process";
import { describe, expect, it, vi } from "vitest";
import { renderAndRevealWindow } from "./windowStartup.js";

const read = (path) => readFileSync(new URL(path, `file://${process.cwd()}/`), "utf8");

describe("startup window visibility", () => {
  it("creates the main window hidden on every platform, for the page to show", () => {
    // Hidden until Rust has put the window's material (or opaque desk
    // colour) on and the page has committed its first UI: no frame of the
    // bare, see-through window is ever drawn.
    expect(JSON.parse(read("src-tauri/tauri.conf.json")).app.windows[0].visible).toBe(false);
    expect(JSON.parse(read("src-tauri/tauri.linux.conf.json")).app.windows[0].visible).toBe(false);
  });

  it("has a native fallback that shows a window its page never showed", () => {
    // A hidden webview may throttle requestAnimationFrame and timers, so the
    // page is never the only thing that can reveal the window.
    const rust = read("src-tauri/src/main.rs");
    expect(rust).toMatch(/const REVEAL_FALLBACK: Duration = Duration::from_secs\(\d+\)/);
    expect(rust).toMatch(
      /if !window\.is_visible\(\)\.unwrap_or\(true\) \{[\s\S]*?window\.show\(\)/
    );
    expect(rust).toContain("dress_window(webview)");
  });

  it("reveals immediately after the initial UI is committed", () => {
    const calls = [];
    const root = { render: vi.fn(() => calls.push("render")) };
    const show = vi.fn(() => {
      calls.push("show");
      return Promise.resolve();
    });
    const flushSync = vi.fn((commit) => {
      calls.push("commit-start");
      commit();
      calls.push("commit-end");
    });

    renderAndRevealWindow(root, "ui", { show }, flushSync);

    expect(flushSync).toHaveBeenCalledOnce();
    expect(root.render).toHaveBeenCalledWith("ui");
    expect(show).toHaveBeenCalledOnce();
    expect(calls).toEqual(["commit-start", "render", "commit-end", "show"]);
  });
});
