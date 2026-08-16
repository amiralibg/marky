import { beforeEach, describe, expect, it, vi } from "vitest";

const getByLabel = vi.fn();
const setFocus = vi.fn();
const unminimize = vi.fn();
const constructed = [];

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: class {
    static getByLabel = (...args) => getByLabel(...args);

    constructor(label, options) {
      this.label = label;
      this.options = options;
      constructed.push({ label, options });
      this.handlers = {};
    }

    once(event, handler) {
      this.handlers[event] = handler;
      // Windows are created asynchronously; resolve on the next tick.
      if (event === "tauri://created") queueMicrotask(() => handler());
    }
  },
}));

const loadModule = async () => {
  vi.resetModules();
  return import("./noteWindows");
};

beforeEach(() => {
  vi.restoreAllMocks();
  getByLabel.mockReset();
  getByLabel.mockResolvedValue(null);
  setFocus.mockReset();
  unminimize.mockReset();
  unminimize.mockResolvedValue(undefined);
  constructed.length = 0;
});

describe("openNoteInNewWindow", () => {
  it("passes the note path through as a query parameter", async () => {
    const { openNoteInNewWindow } = await loadModule();
    await openNoteInNewWindow("/vault/My Note.md");

    expect(constructed).toHaveLength(1);
    expect(constructed[0].options.url).toBe("index.html?note=%2Fvault%2FMy%20Note.md");
  });

  it("removes native decorations when creating a Linux window", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Marky Linux");

    const { openNoteInNewWindow } = await loadModule();
    await openNoteInNewWindow("/vault/A.md");

    expect(constructed[0].options.decorations).toBe(false);
  });

  it("builds a label from characters Tauri accepts", async () => {
    const { openNoteInNewWindow } = await loadModule();
    // Spaces, slashes and unicode in the path must not reach the label.
    await openNoteInNewWindow("/vault/سلام دنیا.md");

    expect(constructed[0].label).toMatch(/^note-[0-9a-f]+$/);
  });

  it("gives different notes different labels", async () => {
    const { openNoteInNewWindow } = await loadModule();
    await openNoteInNewWindow("/vault/A.md");
    await openNoteInNewWindow("/vault/B.md");

    expect(constructed[0].label).not.toBe(constructed[1].label);
  });

  it("treats Windows and POSIX separators as the same note", async () => {
    const { openNoteInNewWindow } = await loadModule();
    await openNoteInNewWindow("C:\\vault\\A.md");
    await openNoteInNewWindow("C:/vault/A.md");

    expect(constructed[0].label).toBe(constructed[1].label);
  });

  it("focuses the existing window instead of opening a duplicate", async () => {
    getByLabel.mockResolvedValue({ setFocus, unminimize });

    const { openNoteInNewWindow } = await loadModule();
    await openNoteInNewWindow("/vault/A.md");

    expect(constructed).toHaveLength(0);
    expect(setFocus).toHaveBeenCalled();
  });

  it("ignores an empty path", async () => {
    const { openNoteInNewWindow } = await loadModule();
    await expect(openNoteInNewWindow("")).resolves.toBeNull();
    expect(constructed).toHaveLength(0);
  });
});
