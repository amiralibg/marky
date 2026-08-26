import { describe, it, expect, vi } from "vitest";

// The module reaches for Tauri's invoke at import time; the pure helpers under
// test never call it.
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const { conflictLabel, commitMessage, isGitConfigured, buildGitAuth, describeSyncReport } =
  await import("./gitSync");

describe("conflictLabel", () => {
  it("produces a stamp that is legal in a filename on every platform", () => {
    const label = conflictLabel(new Date(2026, 7, 25, 15, 42));
    expect(label).toBe("conflict 2026-08-25 15-42");
    // Colons and slashes are illegal or awkward somewhere we ship.
    expect(label).not.toMatch(/[:/\\]/);
  });

  it("pads single-digit parts so labels sort", () => {
    expect(conflictLabel(new Date(2026, 0, 2, 3, 4))).toBe("conflict 2026-01-02 03-04");
  });
});

describe("commitMessage", () => {
  it("agrees in number", () => {
    expect(commitMessage(1)).toMatch(/^Update 1 note — /);
    expect(commitMessage(4)).toMatch(/^Update 4 notes — /);
  });
});

describe("isGitConfigured", () => {
  it("needs a remote before anything else", () => {
    expect(isGitConfigured({ gitAuthMode: "token", gitToken: "t" })).toBe(false);
  });

  it("wants a token in token mode", () => {
    const base = { gitRemoteUrl: "https://example.com/v.git", gitAuthMode: "token" };
    expect(isGitConfigured(base)).toBe(false);
    expect(isGitConfigured({ ...base, gitToken: "ghp_x" })).toBe(true);
  });

  it("wants a key path in ssh-key mode", () => {
    const base = { gitRemoteUrl: "git@example.com:v.git", gitAuthMode: "ssh-key" };
    expect(isGitConfigured(base)).toBe(false);
    expect(isGitConfigured({ ...base, gitSshKeyPath: "~/.ssh/id_ed25519" })).toBe(true);
  });

  it("needs nothing beyond a remote for ssh-agent", () => {
    expect(
      isGitConfigured({ gitRemoteUrl: "git@example.com:v.git", gitAuthMode: "ssh-agent" })
    ).toBe(true);
  });

  it("rejects an unknown mode rather than assuming one", () => {
    expect(isGitConfigured({ gitRemoteUrl: "x", gitAuthMode: "carrier-pigeon" })).toBe(false);
  });
});

describe("buildGitAuth", () => {
  it("defaults to token mode and never emits undefined fields", () => {
    expect(buildGitAuth({})).toEqual({
      mode: "token",
      username: "",
      token: "",
      sshKeyPath: "",
      sshPassphrase: "",
    });
  });
});

describe("describeSyncReport", () => {
  it("leads with conflicts, because they are the only thing to act on", () => {
    expect(
      describeSyncReport({ committed: 2, pulled: 1, pushed: 1, conflicts: ["A (conflict).md"] })
    ).toBe(
      "1 note changed on both devices — both versions kept (2 committed, 1 pulled, 1 commit pushed)"
    );
  });

  it("says so plainly when there was nothing to do", () => {
    expect(describeSyncReport({ committed: 0, pulled: 0, pushed: 0, conflicts: [] })).toBe(
      "Already up to date"
    );
  });

  it("summarises a normal sync", () => {
    expect(describeSyncReport({ committed: 3, pulled: 0, pushed: 2, conflicts: [] })).toBe(
      "Synced — 3 committed, 2 commits pushed"
    );
  });

  it("survives a missing report", () => {
    expect(describeSyncReport(null)).toBe("Nothing to sync");
  });
});
