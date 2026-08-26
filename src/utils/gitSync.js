import { invoke } from "@tauri-apps/api/core";

/**
 * Git sync — the frontend half of `src-tauri/src/git_sync.rs`.
 *
 * Everything that touches a repository happens in Rust, shelling out to the
 * system `git` binary (no bundled implementation — machines without git
 * installed simply don't show this feature). This file only shapes settings
 * into the argument structs those commands expect, and turns their reports
 * into sentences a person can read.
 *
 * The one piece of real logic here is the conflict label: Rust has no date
 * formatting in std, so the timestamp that ends up in
 * `Note (conflict …).md` is built here, in the user's own locale.
 */

/** Credentials in the shape `GitAuth` deserializes. */
export const buildGitAuth = (settings = {}) => ({
  mode: settings.gitAuthMode || "token",
  username: settings.gitUsername || "",
  token: settings.gitToken || "",
  sshKeyPath: settings.gitSshKeyPath || "",
  sshPassphrase: settings.gitSshPassphrase || "",
});

/**
 * True when the settings could plausibly reach a remote. Deliberately shallow:
 * proving credentials work needs a round trip, which is what "Test" is for.
 */
export const isGitConfigured = (settings = {}) => {
  if (!settings.gitRemoteUrl) return false;
  if (settings.gitAuthMode === "token") return Boolean(settings.gitToken);
  if (settings.gitAuthMode === "ssh-key") return Boolean(settings.gitSshKeyPath);
  // ssh-agent carries no configuration of its own.
  return settings.gitAuthMode === "ssh-agent";
};

/**
 * A stamp for conflict sidecars: `conflict 2026-08-25 15-42`.
 *
 * Colons and slashes are illegal or awkward in filenames on at least one
 * supported platform, so the format is built by hand rather than taken from
 * `toLocaleString`.
 */
export const conflictLabel = (date = new Date()) => {
  const pad = (n) => String(n).padStart(2, "0");
  return [
    "conflict ",
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    " ",
    pad(date.getHours()),
    "-",
    pad(date.getMinutes()),
  ].join("");
};

/** A commit subject that says what happened without being noise in a log. */
export const commitMessage = (changed, date = new Date()) => {
  const when = date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const noun = changed === 1 ? "note" : "notes";
  return `Update ${changed} ${noun} — ${when}`;
};

export const getGitStatus = (rootFolderPath) => {
  if (!rootFolderPath) return Promise.resolve(null);
  return invoke("git_repo_status", { path: rootFolderPath });
};

/**
 * The version line of the system git binary, or null when none is on PATH.
 * Null hides the whole git section — there is nothing to configure without it.
 */
export const getGitAvailability = () => invoke("git_available");

export const initGitRepo = (rootFolderPath, remoteUrl, branch) =>
  invoke("git_init_repo", { path: rootFolderPath, remoteUrl, branch: branch || null });

export const cloneGitRepo = (url, path, settings) =>
  invoke("git_clone_repo", { url, path, auth: buildGitAuth(settings) });

export const testGitRemote = (url, settings) =>
  invoke("git_test_remote", { url, auth: buildGitAuth(settings) });

export const resetToRemote = (rootFolderPath, settings) =>
  invoke("git_reset_to_remote", { path: rootFolderPath, auth: buildGitAuth(settings) });

/**
 * Run one sync. `offline: true` commits locally without contacting the remote —
 * what the auto-sync scheduler falls back to when the network is gone, so a
 * laptop on a plane still builds history worth pushing later.
 */
export const syncWorkspaceToGit = async (
  rootFolderPath,
  settings = {},
  { offline = false, changedCount = 0 } = {}
) => {
  if (!rootFolderPath) throw new Error("Open a workspace before syncing");

  const now = new Date();
  return invoke("git_sync", {
    path: rootFolderPath,
    auth: buildGitAuth(settings),
    options: {
      authorName: settings.gitAuthorName || "",
      authorEmail: settings.gitAuthorEmail || "",
      commitMessage: commitMessage(changedCount || 1, now),
      conflictLabel: conflictLabel(now),
      offline,
    },
  });
};

/**
 * One line describing what a sync did.
 *
 * Conflicts lead, because they are the only outcome that leaves the user with
 * something to look at.
 */
export const describeSyncReport = (report) => {
  if (!report) return "Nothing to sync";

  const parts = [];
  if (report.committed > 0) parts.push(`${report.committed} committed`);
  if (report.pulled > 0) parts.push(`${report.pulled} pulled`);
  if (report.pushed > 0) {
    parts.push(`${report.pushed} commit${report.pushed === 1 ? "" : "s"} pushed`);
  }

  const conflicts = report.conflicts?.length ?? 0;
  if (conflicts > 0) {
    const noun = conflicts === 1 ? "note" : "notes";
    const summary = parts.length > 0 ? ` (${parts.join(", ")})` : "";
    return `${conflicts} ${noun} changed on both devices — both versions kept${summary}`;
  }

  return parts.length > 0 ? `Synced — ${parts.join(", ")}` : "Already up to date";
};
