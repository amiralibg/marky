import { useSyncExternalStore } from "react";
import useSettingsStore from "../store/settingsStore";
import useNotesStore from "../store/notesStore";
import useUIStore from "../store/uiStore";
import { createAutoSyncScheduler, AUTO_SYNC_REASONS } from "./autoSync";
import { syncWorkspaceToGit, isGitConfigured, describeSyncReport } from "./gitSync";
import { syncWorkspaceToS3, isS3Configured } from "./s3Sync";

/**
 * The one live auto-sync scheduler, wired to the app's stores.
 *
 * `autoSync.js` is deliberately pure and injectable so it can be tested; this
 * is the impure half that knows about settings, the vault, notifications, and
 * the window. Keeping the split means the scheduling rules are testable without
 * mounting the app, and this file stays small enough to read in one go.
 */

const s3ConfigFrom = (settings) => ({
  endpoint: settings.s3Endpoint,
  region: settings.s3Region,
  bucket: settings.s3Bucket,
  prefix: settings.s3Prefix,
  accessKeyId: settings.s3AccessKeyId,
  secretAccessKey: settings.s3SecretAccessKey,
});

/** Backends switched on *and* configured. Order matters: git is transactional,
 *  so it goes first and S3 uploads whatever state git settled on. */
const activeBackends = (settings) => {
  const chosen = settings.autoSyncBackends || [];
  const active = [];
  if (chosen.includes("git") && isGitConfigured(settings)) active.push("git");
  if (chosen.includes("s3") && isS3Configured(s3ConfigFrom(settings))) active.push("s3");
  return active;
};

/**
 * Run every active backend once.
 *
 * A failing backend does not stop the others — a broken S3 key should not cost
 * you your git history. Errors are collected and rethrown together so the
 * scheduler still counts the run as failed.
 */
const runBackends = async (reason) => {
  const settings = useSettingsStore.getState();
  const { rootFolderPath } = useNotesStore.getState();

  // Nothing to sync is a success, not a failure: failing here would burn the
  // scheduler's retry budget every interval on a vault-less window.
  if (!rootFolderPath) return null;

  const backends = activeBackends(settings);
  if (backends.length === 0) return null;

  const ignorePatterns = (settings.ignorePatterns || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const errors = [];
  const reports = {};
  let touchedDisk = false;

  for (const backend of backends) {
    try {
      if (backend === "git") {
        const report = await syncWorkspaceToGit(rootFolderPath, settings, {
          changedCount: 1,
          // A background pass with no network still commits, so the history is
          // there to push the moment the connection returns.
          offline: !navigator.onLine,
        });
        reports.git = report;
        touchedDisk = touchedDisk || Boolean(report?.changedWorkingTree);
        announceConflicts(report);
      } else {
        const report = await syncWorkspaceToS3(s3ConfigFrom(settings), {
          rootFolderPath,
          ignorePatterns,
        });
        reports.s3 = report;
        touchedDisk = touchedDisk || (report?.pulled ?? 0) > 0;
      }
    } catch (error) {
      errors.push(`${backend}: ${error?.message || error}`);
    }
  }

  // Only reload the vault when something actually landed on disk — a refresh
  // rebuilds the tree and would be a visible hitch on every idle pass.
  //
  // Note that git writes its merge results from Rust, so the folder watcher
  // sees them and debounce-refreshes too. That redundancy is deliberate: the
  // obvious "fix" is to suppress watcher echoes for the duration of a sync
  // (`selfWrite.js`), but a merge can rewrite a note the user has open and
  // unsaved, and that is a genuine external change they must be told about.
  // One extra scan is the cheaper mistake.
  if (touchedDisk) {
    await useNotesStore.getState().refreshRootFromDisk({ preserveSelection: true });
  }

  if (errors.length > 0) throw new Error(errors.join(" • "));

  return { reason, ...reports };
};

/** A conflict is the one outcome the user has to be told about. */
const announceConflicts = (report) => {
  const conflicts = report?.conflicts?.length ?? 0;
  if (conflicts === 0) return;
  useUIStore.getState().addNotification(describeSyncReport(report), "info", 9000);
};

const listeners = new Set();
let snapshot = { state: "idle", running: false, failures: 0, lastError: null, lastSyncAt: null };

const scheduler = createAutoSyncScheduler({
  run: runBackends,
  isEnabled: () => {
    const settings = useSettingsStore.getState();
    return Boolean(settings.autoSyncEnabled) && activeBackends(settings).length > 0;
  },
  intervalMs: () => (useSettingsStore.getState().autoSyncIntervalMinutes || 15) * 60_000,
  isOnline: () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
  onStatus: (next) => {
    snapshot = next;
    for (const listener of listeners) listener();
  },
});

/** The first failure is worth a toast; the retries after it are not. */
let notifiedFailure = false;
const watchForFirstFailure = () => {
  if (snapshot.failures === 0) {
    notifiedFailure = false;
    return;
  }
  if (notifiedFailure || !snapshot.lastError) return;
  notifiedFailure = true;
  useUIStore.getState().addNotification(`Auto-sync failed — ${snapshot.lastError}`, "error", 8000);
};
listeners.add(watchForFirstFailure);

/** Everything that should re-arm the scheduler when it changes. */
const settingsKey = () => {
  const s = useSettingsStore.getState();
  return [
    s.autoSyncEnabled,
    (s.autoSyncBackends || []).join(","),
    s.autoSyncIntervalMinutes,
    s.gitRemoteUrl,
    s.gitAuthMode,
    s.gitToken,
    s.gitSshKeyPath,
    s.s3Endpoint,
    s.s3Bucket,
    s.s3AccessKeyId,
  ].join("|");
};

let teardown = null;

/**
 * Start the scheduler and attach its triggers. Safe to call repeatedly; the
 * second call is a no-op until `stopAutoSync` runs.
 */
export const startAutoSync = () => {
  if (teardown) return;

  const unsubscribers = [];

  // Saves: the store stamps `lastSavedAt` on every successful write, so this
  // needs no hook inside the save path itself.
  let lastSeenSave = useNotesStore.getState().lastSavedAt;
  unsubscribers.push(
    useNotesStore.subscribe((state) => {
      if (state.lastSavedAt === lastSeenSave) return;
      lastSeenSave = state.lastSavedAt;
      if (useSettingsStore.getState().autoSyncOnSave) {
        scheduler.request(AUTO_SYNC_REASONS.save);
      }
    })
  );

  // Settings edits clear a parked failure — changing a bad token should not
  // require restarting the app to get auto-sync going again.
  let lastSettingsKey = settingsKey();
  unsubscribers.push(
    useSettingsStore.subscribe(() => {
      const next = settingsKey();
      if (next === lastSettingsKey) return;
      lastSettingsKey = next;
      scheduler.reset();
    })
  );

  if (typeof window !== "undefined") {
    const onFocus = () => {
      if (useSettingsStore.getState().autoSyncOnFocus) {
        scheduler.request(AUTO_SYNC_REASONS.focus);
      }
    };
    // Back online after a gap: catch up now rather than at the next interval.
    const onOnline = () => scheduler.request(AUTO_SYNC_REASONS.focus);

    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    unsubscribers.push(() => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    });
  }

  scheduler.start();
  teardown = () => {
    scheduler.stop();
    for (const off of unsubscribers) off();
  };
};

export const stopAutoSync = () => {
  teardown?.();
  teardown = null;
};

/** Run a sync right now, whatever the schedule is doing. */
export const syncNow = () => scheduler.syncNow();

/** Subscribe a component to scheduler status. */
export const useAutoSyncStatus = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
    () => snapshot
  );
