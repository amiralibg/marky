import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const writeTextMock = vi.fn();
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: (...args) => writeTextMock(...args),
}));

const { copyText } = await import("./clipboard");

describe("copyText", () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    writeTextMock.mockReset();
    writeTextMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    delete document.execCommand;
  });

  const setClipboard = (value) =>
    Object.defineProperty(navigator, "clipboard", { value, configurable: true });

  it("writes through the Tauri plugin first", async () => {
    setClipboard(undefined);
    await expect(copyText("const a = 1;")).resolves.toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith("const a = 1;");
  });

  it("falls back to the WebView clipboard when the plugin is unavailable", async () => {
    writeTextMock.mockRejectedValue(new Error("no tauri"));
    const webviewWrite = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText: webviewWrite });

    await expect(copyText("hello")).resolves.toBe(true);
    expect(webviewWrite).toHaveBeenCalledWith("hello");
  });

  // The regression the code-block button hit: `navigator.clipboard?.writeText`
  // short-circuits to `undefined` instead of throwing, so the caller thought it
  // had copied when nothing had happened.
  it("reports failure rather than silently doing nothing", async () => {
    writeTextMock.mockRejectedValue(new Error("no tauri"));
    setClipboard(undefined);
    await expect(copyText("hello")).resolves.toBe(false);
  });

  it("uses execCommand when neither async clipboard is there", async () => {
    writeTextMock.mockRejectedValue(new Error("no tauri"));
    setClipboard(undefined);
    document.execCommand = vi.fn(() => true);

    await expect(copyText("hello")).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    // The off-screen textarea must not be left behind.
    expect(document.querySelectorAll("textarea").length).toBe(0);
  });
});
