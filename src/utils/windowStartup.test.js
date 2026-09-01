import { readFileSync } from "node:fs";
import process from "node:process";
import { describe, expect, it, vi } from "vitest";
import { renderAndRevealWindow } from "./windowStartup.js";

describe("startup window visibility", () => {
  it("keeps the native window visible while the UI initializes", () => {
    const config = JSON.parse(
      readFileSync(new URL("src-tauri/tauri.conf.json", `file://${process.cwd()}/`))
    );
    expect(config.app.windows[0].visible).not.toBe(false);
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
