import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args) => invoke(...args) }));

// The module keeps process-wide state (the draft mirror, the hydration latch),
// so each test gets a fresh copy.
const loadModule = async () => {
  vi.resetModules();
  return import("./sideStore");
};

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
  window.localStorage.clear();
  // The module talks to the backend only when the desktop shell is present.
  window.__TAURI_INTERNALS__ = {};
});

afterEach(() => {
  window.localStorage.clear();
  delete window.__TAURI_INTERNALS__;
});

describe("draft mirror", () => {
  it("serves reads synchronously once hydrated", async () => {
    invoke.mockImplementation((cmd) =>
      cmd === "read_all_drafts"
        ? Promise.resolve([{ path: "/w/a.md", content: "draft", updatedAt: "2026-01-01" }])
        : Promise.resolve()
    );

    const store = await loadModule();
    await store.ensureDraftsHydrated();

    expect(store.getDraftCacheEntry("/w/a.md")).toEqual({
      content: "draft",
      updatedAt: "2026-01-01",
    });
  });

  it("normalizes Windows separators on both write and read", async () => {
    const store = await loadModule();
    await store.ensureDraftsHydrated();

    store.setDraftCacheEntry("C:\\notes\\a.md", "text", "2026-01-01");

    expect(store.getDraftCacheEntry("C:/notes/a.md")?.content).toBe("text");
    expect(invoke).toHaveBeenCalledWith(
      "write_draft",
      expect.objectContaining({ filePath: "C:/notes/a.md" })
    );
  });

  it("reflects a write in the same tick, before the disk write resolves", async () => {
    let release;
    invoke.mockImplementation((cmd) =>
      cmd === "write_draft"
        ? new Promise((resolve) => {
            release = resolve;
          })
        : Promise.resolve([])
    );

    const store = await loadModule();
    await store.ensureDraftsHydrated();

    store.setDraftCacheEntry("/w/a.md", "typed");
    expect(store.getDraftCacheEntry("/w/a.md")?.content).toBe("typed");
    release?.();
  });

  it("hydrates once even when called concurrently", async () => {
    invoke.mockResolvedValue([]);
    const store = await loadModule();

    await Promise.all([
      store.ensureDraftsHydrated(),
      store.ensureDraftsHydrated(),
      store.ensureDraftsHydrated(),
    ]);

    expect(invoke.mock.calls.filter(([cmd]) => cmd === "read_all_drafts")).toHaveLength(1);
  });

  it("stays unhydrated after a failed read so a later call retries", async () => {
    invoke.mockRejectedValueOnce(new Error("disk gone"));
    const store = await loadModule();

    await store.ensureDraftsHydrated();
    expect(store.draftsHydrated()).toBe(false);

    invoke.mockResolvedValue([]);
    await store.ensureDraftsHydrated();
    expect(store.draftsHydrated()).toBe(true);
  });

  it("moves an entry to the new path", async () => {
    const store = await loadModule();
    await store.ensureDraftsHydrated();

    store.setDraftCacheEntry("/w/old.md", "body", "2026-01-01");
    store.moveDraftCacheEntry("/w/old.md", "/w/new.md");

    expect(store.getDraftCacheEntry("/w/old.md")).toBeNull();
    expect(store.getDraftCacheEntry("/w/new.md")?.content).toBe("body");
  });
});

describe("error reporting", () => {
  // The whole point of the move off localStorage: a failed write is surfaced
  // rather than swallowed.
  it("reports a failed draft write to the handler", async () => {
    const store = await loadModule();
    await store.ensureDraftsHydrated();

    const onError = vi.fn();
    store.setSideStoreErrorHandler(onError);

    invoke.mockRejectedValueOnce(new Error("quota"));
    store.setDraftCacheEntry("/w/a.md", "text");
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());

    expect(onError.mock.calls[0][0]).toMatch(/draft/i);
  });
});

describe("without a desktop backend", () => {
  // A plain browser preview has no Tauri runtime. Writes should degrade to
  // in-memory rather than firing an error toast on every keystroke.
  beforeEach(() => {
    delete window.__TAURI_INTERNALS__;
  });

  it("keeps drafts in memory and stays quiet", async () => {
    const store = await loadModule();
    const onError = vi.fn();
    store.setSideStoreErrorHandler(onError);

    await store.ensureDraftsHydrated();
    store.setDraftCacheEntry("/w/a.md", "typed");

    expect(store.getDraftCacheEntry("/w/a.md")?.content).toBe("typed");
    expect(invoke).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(onError).not.toHaveBeenCalled());
  });

  it("returns an empty history rather than throwing", async () => {
    const store = await loadModule();
    await expect(store.getNoteHistorySnapshots("/w/a.md")).resolves.toEqual([]);
  });
});

describe("migrateLegacyStorage", () => {
  it("replays history oldest-first so disk order matches localStorage order", async () => {
    window.localStorage.setItem(
      "marky-note-history",
      JSON.stringify({
        "/w/a.md": [
          { content: "newest", savedAt: "2026-01-03" },
          { content: "middle", savedAt: "2026-01-02" },
          { content: "oldest", savedAt: "2026-01-01" },
        ],
      })
    );

    const store = await loadModule();
    const moved = await store.migrateLegacyStorage();

    expect(moved.history).toBe(3);
    // `append_note_history` unshifts, so replaying in reverse leaves the newest
    // back at index 0.
    const appended = invoke.mock.calls
      .filter(([cmd]) => cmd === "append_note_history")
      .map(([, args]) => args.content);
    expect(appended).toEqual(["oldest", "middle", "newest"]);
  });

  it("clears the legacy keys after a successful migration", async () => {
    window.localStorage.setItem(
      "marky-draft-cache",
      JSON.stringify({ "/w/a.md": { content: "draft", updatedAt: "2026-01-01" } })
    );
    window.localStorage.setItem(
      "marky-note-history",
      JSON.stringify({ "/w/a.md": [{ content: "x", savedAt: "2026-01-01" }] })
    );

    const store = await loadModule();
    await store.migrateLegacyStorage();

    expect(window.localStorage.getItem("marky-draft-cache")).toBeNull();
    expect(window.localStorage.getItem("marky-note-history")).toBeNull();
  });

  it("keeps the legacy data when the migration write fails", async () => {
    window.localStorage.setItem(
      "marky-draft-cache",
      JSON.stringify({ "/w/a.md": { content: "draft", updatedAt: "2026-01-01" } })
    );
    invoke.mockRejectedValue(new Error("disk full"));

    const store = await loadModule();
    await store.migrateLegacyStorage();

    // Retried next launch rather than dropped on the floor.
    expect(window.localStorage.getItem("marky-draft-cache")).not.toBeNull();
  });

  it("is a no-op when there is nothing to migrate", async () => {
    const store = await loadModule();
    const moved = await store.migrateLegacyStorage();

    expect(moved).toEqual({ drafts: 0, history: 0 });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("skips malformed legacy entries", async () => {
    window.localStorage.setItem(
      "marky-note-history",
      JSON.stringify({ "/w/a.md": "not-an-array" })
    );
    window.localStorage.setItem(
      "marky-draft-cache",
      JSON.stringify({ "/w/a.md": { updatedAt: "2026-01-01" } })
    );

    const store = await loadModule();
    const moved = await store.migrateLegacyStorage();

    expect(moved).toEqual({ drafts: 0, history: 0 });
  });
});
