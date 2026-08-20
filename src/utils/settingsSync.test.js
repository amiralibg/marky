import { beforeEach, describe, expect, it, vi } from "vitest";

const emit = vi.fn();
const listeners = new Map();
const unlisten = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  emit: (...args) => emit(...args),
  listen: (event, handler) => {
    listeners.set(event, handler);
    return Promise.resolve(unlisten);
  },
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ label: "vault-abc" }),
}));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const loadModule = async () => {
  vi.resetModules();
  listeners.clear();
  // A vault path left in storage would send the freshly imported notes store
  // off to read a folder from a disk this test has no Tauri runtime for.
  window.localStorage.clear();
  const [{ startSettingsSync }, settings, notes] = await Promise.all([
    import("./settingsSync"),
    import("../store/settingsStore"),
    import("../store/notesStore"),
  ]);
  return {
    startSettingsSync,
    useSettingsStore: settings.default,
    useNotesStore: notes.default,
  };
};

beforeEach(() => {
  vi.useRealTimers();
  emit.mockReset();
  emit.mockResolvedValue(undefined);
  unlisten.mockReset();
});

describe("startSettingsSync", () => {
  it("tells the other windows when settings change here", async () => {
    const { startSettingsSync, useSettingsStore } = await loadModule();
    const stop = startSettingsSync();

    useSettingsStore.setState({ fontScale: 1.2 });
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(emit).toHaveBeenCalledWith("settings-changed", { source: "vault-abc" });
    stop();
  });

  it("ignores the echo of its own change", async () => {
    const { startSettingsSync, useSettingsStore } = await loadModule();
    const stop = startSettingsSync();
    const rehydrate = vi.spyOn(useSettingsStore.persist, "rehydrate");

    await listeners.get("settings-changed")({ payload: { source: "vault-abc" } });

    expect(rehydrate).not.toHaveBeenCalled();
    stop();
  });

  it("re-reads the blob and re-applies this window's vault profile", async () => {
    const { startSettingsSync, useSettingsStore, useNotesStore } = await loadModule();
    const stop = startSettingsSync();

    useNotesStore.setState({ rootFolderPath: "/Users/me/A" });
    const rehydrate = vi.spyOn(useSettingsStore.persist, "rehydrate").mockResolvedValue(undefined);
    const sync = vi.spyOn(useSettingsStore.getState(), "syncWorkspaceSettings");

    await listeners.get("settings-changed")({ payload: { source: "main" } });

    expect(rehydrate).toHaveBeenCalled();
    expect(sync).toHaveBeenCalledWith("/Users/me/A");
    stop();
  });

  it("does not echo a change it only applied on another window's behalf", async () => {
    const { startSettingsSync, useSettingsStore } = await loadModule();
    const stop = startSettingsSync();
    vi.spyOn(useSettingsStore.persist, "rehydrate").mockImplementation(async () => {
      useSettingsStore.setState({ fontScale: 1.4 });
    });

    await listeners.get("settings-changed")({ payload: { source: "main" } });
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(emit).not.toHaveBeenCalled();
    stop();
  });

  it("stops listening and emitting once torn down", async () => {
    const { startSettingsSync, useSettingsStore } = await loadModule();
    const stop = startSettingsSync();
    await flush();
    stop();

    useSettingsStore.setState({ fontScale: 1.1 });
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(emit).not.toHaveBeenCalled();
    expect(unlisten).toHaveBeenCalled();
  });
});
