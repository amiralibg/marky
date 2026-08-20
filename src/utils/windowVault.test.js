import { afterEach, describe, expect, it, vi } from "vitest";

const loadWith = async (search) => {
  vi.resetModules();
  window.history.replaceState({}, "", search || "/");
  return import("./windowVault");
};

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("notesStorageKey", () => {
  it("keeps the original key in the main window, so existing state restores", async () => {
    const { notesStorageKey, windowVaultPath } = await loadWith("/");

    expect(windowVaultPath).toBeNull();
    expect(notesStorageKey()).toBe("marky-storage");
  });

  it("gives a vault window a key of its own", async () => {
    const { notesStorageKey } = await loadWith("/?vault=%2FUsers%2Fme%2FA");

    expect(notesStorageKey()).toMatch(/^marky-storage:[0-9a-f]+$/);
  });

  it("gives two vaults two different keys", async () => {
    const a = (await loadWith("/?vault=%2FUsers%2Fme%2FA")).notesStorageKey();
    const b = (await loadWith("/?vault=%2FUsers%2Fme%2FB")).notesStorageKey();

    expect(a).not.toBe(b);
  });

  it("reads the vault path back decoded", async () => {
    const { windowVaultPath } = await loadWith("/?vault=%2FUsers%2Fme%2FMy%20Vault");

    expect(windowVaultPath).toBe("/Users/me/My Vault");
  });
});

describe("empty windows", () => {
  it("gives an empty window a key of its own", async () => {
    const { notesStorageKey, windowSessionId, windowVaultPath } = await loadWith("/?win=abc123");

    expect(windowVaultPath).toBeNull();
    expect(windowSessionId).toBe("abc123");
    expect(notesStorageKey()).toBe("marky-storage:win-abc123");
  });

  it("gives two empty windows two different keys", async () => {
    const a = (await loadWith("/?win=aaa")).notesStorageKey();
    const b = (await loadWith("/?win=bbb")).notesStorageKey();

    expect(a).not.toBe(b);
  });
});

describe("hashPath", () => {
  it("treats Windows and POSIX separators as the same path", async () => {
    const { hashPath } = await loadWith("/");

    expect(hashPath("C:\\vault\\A")).toBe(hashPath("C:/vault/A"));
  });
});

describe("folderNameOf", () => {
  it("names a vault after its folder, trailing slash or not", async () => {
    const { folderNameOf } = await loadWith("/");

    expect(folderNameOf("/Users/me/Work Notes")).toBe("Work Notes");
    expect(folderNameOf("/Users/me/Work Notes/")).toBe("Work Notes");
  });
});
