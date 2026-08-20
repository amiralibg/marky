import { beforeEach, describe, expect, it, vi } from "vitest";

const check = vi.fn();

vi.mock("@tauri-apps/plugin-updater", () => ({ check: (...args) => check(...args) }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));

const loadModule = async () => {
  vi.resetModules();
  const [{ checkForAppUpdate }, uiStore] = await Promise.all([
    import("./appUpdater"),
    import("../store/uiStore"),
  ]);
  return { checkForAppUpdate, useUIStore: uiStore.default };
};

beforeEach(() => {
  check.mockReset();
  // The updater no-ops outside Tauri, so stand in for the runtime.
  window.__TAURI_INTERNALS__ = {};
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("checkForAppUpdate", () => {
  it("keeps a failed background check to itself", async () => {
    // The launch check runs seconds after start, often before the network is
    // up. Reporting that failure put an "Update issue" card in the sidebar of
    // every offline start.
    check.mockRejectedValue(new Error("error sending request for url (https://github.com/…)"));

    const { checkForAppUpdate, useUIStore } = await loadModule();
    await checkForAppUpdate({ silent: true });

    const { appUpdate, notifications } = useUIStore.getState();
    expect(appUpdate.status).toBe("idle");
    expect(appUpdate.error).toBeNull();
    expect(notifications).toHaveLength(0);
  });

  it("reports a failed check the user asked for", async () => {
    check.mockRejectedValue(new Error("error sending request for url (https://github.com/…)"));

    const { checkForAppUpdate, useUIStore } = await loadModule();
    await checkForAppUpdate({ silent: false });

    const { appUpdate, notifications } = useUIStore.getState();
    expect(appUpdate.status).toBe("error");
    expect(appUpdate.message).toMatch(/Couldn't reach GitHub/);
    expect(notifications).toHaveLength(1);
  });

  it("stays quiet when a background check finds nothing new", async () => {
    check.mockResolvedValue(null);

    const { checkForAppUpdate, useUIStore } = await loadModule();
    await checkForAppUpdate({ silent: true });

    expect(useUIStore.getState().notifications).toHaveLength(0);
  });

  it("announces an available update even from a background check", async () => {
    check.mockResolvedValue({ version: "9.9.9" });

    const { checkForAppUpdate, useUIStore } = await loadModule();
    await checkForAppUpdate({ silent: true });

    const { appUpdate, notifications } = useUIStore.getState();
    expect(appUpdate.status).toBe("available");
    expect(notifications).toHaveLength(1);
  });
});
