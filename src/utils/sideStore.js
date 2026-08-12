import { invoke } from "@tauri-apps/api/core";

/**
 * Note history and unsaved drafts, kept on disk instead of in `localStorage`.
 *
 * `localStorage` gave the WebView's ~5 MB quota to twenty full copies of every
 * note plus every unsaved draft, and both writers swallowed the resulting
 * `QuotaExceededError` — so version history stopped recording while still
 * looking like it worked, and a draft write could fail with nothing on screen.
 * The Rust side now owns these as one file per note under the app data dir.
 *
 * Drafts keep a synchronous in-memory mirror because the vault loader reads
 * them inside a synchronous `map()` over every item. Call `hydrateDrafts()`
 * before loading a workspace; reads then hit the mirror and writes go to disk
 * in the background.
 */

const NOTE_HISTORY_MAX_SNAPSHOTS = 50;

const normalizePath = (value) => (value ? value.replace(/\\/g, "/") : "");

// Outside the desktop shell — a plain browser preview, or a unit test — there
// is no backend to talk to. Degrade to in-memory only rather than reporting a
// failed write for every keystroke, matching how main.jsx handles the absent
// runtime. Checked lazily so a test can install a mock before first use.
let tauriAvailable = null;
const hasTauri = () => {
  if (tauriAvailable === null) {
    tauriAvailable = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  }
  return tauriAvailable;
};

const call = (command, args) =>
  hasTauri() ? invoke(command, args) : Promise.reject(new Error("NO_BACKEND"));

const isMissingBackend = (error) => error?.message === "NO_BACKEND";

// Reported to the user via the notification store — a failed write here means
// history or an unsaved draft did not persist, which is exactly the class of
// failure the old code hid.
let onError = null;
export const setSideStoreErrorHandler = (handler) => {
  onError = handler;
};

const reportError = (action, error) => {
  if (isMissingBackend(error)) return; // no desktop backend; nothing to report
  console.error(`sideStore: failed to ${action}`, error);
  onError?.(action, error);
};

// ── Drafts ────────────────────────────────────────────────────────

const draftMirror = new Map();
let hydrated = false;
let hydrating = null;

/**
 * Fill the mirror from disk. Memoized on the in-flight promise so the boot
 * path and every vault load share one read instead of racing. Awaiting this
 * before a vault load is what lets `getDraftCacheEntry` stay synchronous.
 */
export const ensureDraftsHydrated = () => {
  if (hydrated) return Promise.resolve();
  if (hydrating) return hydrating;

  hydrating = call("read_all_drafts")
    .then((drafts) => {
      draftMirror.clear();
      for (const draft of drafts) {
        draftMirror.set(normalizePath(draft.path), {
          content: draft.content,
          updatedAt: draft.updatedAt,
        });
      }
      hydrated = true;
    })
    .catch((error) => {
      // `hydrated` stays false so a later call retries, and callers read an
      // empty mirror rather than a half-filled one.
      reportError("load unsaved drafts", error);
    })
    .finally(() => {
      hydrating = null;
    });

  return hydrating;
};

export const draftsHydrated = () => hydrated;

export const getDraftCacheEntry = (filePath) => {
  if (!filePath) return null;
  return draftMirror.get(normalizePath(filePath)) || null;
};

export const setDraftCacheEntry = (filePath, content, updatedAt = new Date().toISOString()) => {
  if (!filePath) return;
  const key = normalizePath(filePath);
  // Mirror first so a read in the same tick sees the new value regardless of
  // how the disk write resolves.
  draftMirror.set(key, { content, updatedAt });
  call("write_draft", { filePath: key, content, updatedAt }).catch((error) =>
    reportError("save your unsaved draft", error)
  );
};

export const removeDraftCacheEntry = (filePath) => {
  if (!filePath) return;
  const key = normalizePath(filePath);
  draftMirror.delete(key);
  call("remove_draft", { filePath: key }).catch((error) =>
    reportError("clear a saved draft", error)
  );
};

export const moveDraftCacheEntry = (oldPath, newPath) => {
  if (!oldPath || !newPath) return;
  const entry = getDraftCacheEntry(oldPath);
  removeDraftCacheEntry(oldPath);
  if (entry) setDraftCacheEntry(newPath, entry.content, entry.updatedAt);
};

export const clearDraftCache = () => {
  draftMirror.clear();
  call("clear_all_drafts").catch((error) => reportError("clear saved drafts", error));
};

// ── Note history ──────────────────────────────────────────────────
// No mirror: only the history modal reads these, and it can await.

export const getNoteHistorySnapshots = async (filePath) => {
  if (!filePath) return [];
  try {
    return await call("read_note_history", { filePath: normalizePath(filePath) });
  } catch (error) {
    reportError("read note history", error);
    return [];
  }
};

export const addNoteHistorySnapshot = (filePath, content) => {
  if (!filePath || content == null) return;
  call("append_note_history", {
    filePath: normalizePath(filePath),
    content,
    savedAt: new Date().toISOString(),
    maxSnapshots: NOTE_HISTORY_MAX_SNAPSHOTS,
  }).catch((error) => reportError("record a history snapshot", error));
};

export const removeNoteHistory = (filePath) => {
  if (!filePath) return;
  call("remove_note_history", { filePath: normalizePath(filePath) }).catch((error) =>
    reportError("remove note history", error)
  );
};

/** Drop every note's history — used by the full-reset action. */
export const clearNoteHistory = () => {
  call("clear_all_history").catch((error) => reportError("clear note history", error));
};

export const moveNoteHistory = (oldPath, newPath) => {
  if (!oldPath || !newPath) return;
  call("move_note_history", {
    oldPath: normalizePath(oldPath),
    newPath: normalizePath(newPath),
  }).catch((error) => reportError("move note history", error));
};

// ── Migration off localStorage ────────────────────────────────────

const LEGACY_DRAFT_KEY = "marky-draft-cache";
const LEGACY_HISTORY_KEY = "marky-note-history";

const readLegacy = (key) => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * Move anything still in `localStorage` onto disk, once. The legacy keys are
 * only removed after their writes resolve — a failed migration is retried on
 * the next launch rather than dropping the user's history on the floor.
 */
export const migrateLegacyStorage = async () => {
  if (typeof window === "undefined") return { drafts: 0, history: 0 };

  let drafts = 0;
  let history = 0;

  const legacyDrafts = readLegacy(LEGACY_DRAFT_KEY);
  if (legacyDrafts) {
    try {
      await Promise.all(
        Object.entries(legacyDrafts).map(([path, entry]) => {
          if (!entry?.content) return Promise.resolve();
          drafts += 1;
          return call("write_draft", {
            filePath: normalizePath(path),
            content: entry.content,
            updatedAt: entry.updatedAt || new Date().toISOString(),
          });
        })
      );
      window.localStorage.removeItem(LEGACY_DRAFT_KEY);
    } catch (error) {
      reportError("migrate unsaved drafts to disk", error);
    }
  }

  const legacyHistory = readLegacy(LEGACY_HISTORY_KEY);
  if (legacyHistory) {
    try {
      for (const [path, snapshots] of Object.entries(legacyHistory)) {
        if (!Array.isArray(snapshots)) continue;
        // Oldest first: `append_note_history` unshifts, so replaying in reverse
        // preserves the original newest-first order on disk.
        for (const snapshot of [...snapshots].reverse()) {
          if (snapshot?.content == null) continue;
          await call("append_note_history", {
            filePath: normalizePath(path),
            content: snapshot.content,
            savedAt: snapshot.savedAt || new Date().toISOString(),
            maxSnapshots: NOTE_HISTORY_MAX_SNAPSHOTS,
          });
          history += 1;
        }
      }
      window.localStorage.removeItem(LEGACY_HISTORY_KEY);
    } catch (error) {
      reportError("migrate note history to disk", error);
    }
  }

  return { drafts, history };
};
