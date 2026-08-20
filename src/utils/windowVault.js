/**
 * Which vault this window belongs to, and where its state is persisted.
 *
 * Marky can have several full windows open at once, each on a different vault.
 * They share one WebView origin, so they share one `localStorage` — a single
 * `marky-storage` key would have them overwriting each other's open tabs,
 * expanded folders and vault path on every keystroke. Instead each vault window
 * persists under its own key, derived from the folder it was opened for, and
 * the main window keeps the original key so existing installs restore as before.
 */

/**
 * FNV-1a over the normalized path. Window labels accept only
 * `[a-zA-Z0-9-/:_]`, so paths are hashed rather than embedded; the storage key
 * uses the same hash so a window's label and its state key line up.
 */
export const hashPath = (path) => {
  const normalized = (path || "").replace(/\\/g, "/");
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16);
};

const readParam = (name) => {
  if (typeof window === "undefined") return null;
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
};

/** The vault this window was opened for, or `null` in the main window. */
export const windowVaultPath = readParam("vault");

/**
 * The id of a plain extra window (`?win=`), opened empty for whatever the user
 * wants to put in it. It has no vault to begin with, so it needs a key of its
 * own for the same reason a vault window does.
 */
export const windowSessionId = readParam("win");

/** True when this window is a note-only window (`?note=`), which has no vault. */
export const isNoteWindow = Boolean(readParam("note"));

export const vaultWindowLabel = (vaultPath) => `vault-${hashPath(vaultPath)}`;

export const sessionWindowLabel = (sessionId) => `window-${sessionId}`;

/** The `localStorage` key the notes store persists under, for this window. */
export const notesStorageKey = () => {
  if (windowVaultPath) return `marky-storage:${hashPath(windowVaultPath)}`;
  if (windowSessionId) return `marky-storage:win-${windowSessionId}`;
  return "marky-storage";
};

export const folderNameOf = (path) => {
  const normalized = (path || "").replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.split("/").pop() || normalized || "Vault";
};
