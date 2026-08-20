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
      if (event === "tauri://created") queueMicrotask(() => handler());
    }
  },
}));

const loadModule = async () => {
  vi.resetModules();
  return import("./vaultWindows");
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

describe("openVaultInNewWindow", () => {
  it("passes the vault path through as a query parameter", async () => {
    const { openVaultInNewWindow } = await loadModule();
    await openVaultInNewWindow("/Users/me/My Vault");

    expect(constructed).toHaveLength(1);
    expect(constructed[0].options.url).toBe("index.html?vault=%2FUsers%2Fme%2FMy%20Vault");
  });

  it("leaves the frame to Marky's own title bar off macOS", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Marky Windows");

    const { openVaultInNewWindow } = await loadModule();
    await openVaultInNewWindow("/Users/me/A");

    expect(constructed[0].options.decorations).toBe(false);
  });

  it("titles the window after the folder when no name is given", async () => {
    const { openVaultInNewWindow } = await loadModule();
    await openVaultInNewWindow("/Users/me/Work Notes");

    expect(constructed[0].options.title).toBe("Work Notes");
  });

  it("builds a label from characters Tauri accepts", async () => {
    const { openVaultInNewWindow } = await loadModule();
    await openVaultInNewWindow("/Users/me/یادداشت‌ها");

    expect(constructed[0].label).toMatch(/^vault-[0-9a-f]+$/);
  });

  it("gives different vaults different labels", async () => {
    const { openVaultInNewWindow } = await loadModule();
    await openVaultInNewWindow("/Users/me/A");
    await openVaultInNewWindow("/Users/me/B");

    expect(constructed[0].label).not.toBe(constructed[1].label);
  });

  it("never labels a vault window like a note window", async () => {
    const { openVaultInNewWindow } = await loadModule();
    const { openNoteInNewWindow } = await import("./noteWindows");
    await openVaultInNewWindow("/Users/me/A");
    await openNoteInNewWindow("/Users/me/A");

    expect(constructed[0].label).not.toBe(constructed[1].label);
  });

  it("focuses the window a vault already has instead of opening a second one", async () => {
    getByLabel.mockResolvedValue({ setFocus, unminimize });

    const { openVaultInNewWindow } = await loadModule();
    await openVaultInNewWindow("/Users/me/A");

    expect(constructed).toHaveLength(0);
    expect(setFocus).toHaveBeenCalled();
  });

  it("ignores an empty path", async () => {
    const { openVaultInNewWindow } = await loadModule();
    await expect(openVaultInNewWindow("")).resolves.toBeNull();
    expect(constructed).toHaveLength(0);
  });
});

describe("openEmptyWindow", () => {
  it("opens the full app with no vault bound to it", async () => {
    const { openEmptyWindow } = await loadModule();
    await openEmptyWindow();

    expect(constructed).toHaveLength(1);
    expect(constructed[0].options.url).toMatch(/^index\.html\?win=[a-z0-9]+$/);
    expect(constructed[0].label).toMatch(/^window-[a-z0-9]+$/);
  });

  it("gives each empty window its own identity", async () => {
    const { openEmptyWindow } = await loadModule();
    await openEmptyWindow();
    await openEmptyWindow();

    expect(constructed[0].label).not.toBe(constructed[1].label);
  });
});
