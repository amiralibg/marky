/**
 * Self-write echo suppression.
 *
 * The folder watcher cannot tell Marky's own saves apart from an edit made in
 * another editor, so every save comes back as a "file changed" event and used to
 * trigger a full workspace rescan — which replaced the sidebar with a spinner.
 * Each save stamps its path here, and the watcher drops events that land inside
 * the window below.
 *
 * A genuine external write during that window is not lost: it produces its own
 * watcher event once the stamp expires, and the rescan that follows re-reads
 * anything whose size or mtime moved.
 */

const normalizePath = (value) => (value ? value.replace(/\\/g, "/") : "");

/** How long after a save an event for that path is assumed to be our own echo. */
export const SELF_WRITE_ECHO_MS = 1500;

const expiries = new Map();

const prune = (now) => {
  for (const [path, expiry] of expiries) {
    if (expiry <= now) expiries.delete(path);
  }
};

/** Record that Marky is about to write `filePath`, so the watcher ignores the echo. */
export const markSelfWrite = (filePath) => {
  if (!filePath) return;
  const now = Date.now();
  prune(now);
  expiries.set(normalizePath(filePath), now + SELF_WRITE_ECHO_MS);
};

/** True when a watcher event for `filePath` is an echo of a write we just made. */
export const isSelfWriteEcho = (filePath) => {
  if (!filePath) return false;
  const key = normalizePath(filePath);
  const expiry = expiries.get(key);
  if (expiry === undefined) return false;
  if (expiry <= Date.now()) {
    expiries.delete(key);
    return false;
  }
  return true;
};

/** Drop every stamp. Used when the workspace changes, and by tests. */
export const clearSelfWrites = () => {
  expiries.clear();
};
