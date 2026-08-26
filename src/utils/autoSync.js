/**
 * The auto-sync scheduler.
 *
 * One scheduler drives every sync backend the user has switched on. It exists
 * because "sync automatically" is four different problems that all have to be
 * solved at once, and solving them separately per backend produced races:
 *
 * 1. **Never two at once.** A sync is a commit/merge/push against the same
 *    working tree. Two in flight will fight each other, so requests that arrive
 *    during a run are *coalesced* into exactly one follow-up rather than
 *    queued — five saves during a push should cause one more sync, not five.
 * 2. **Bursts are not events.** Saving is the most common trigger and the one
 *    that fires most often. Save requests are debounced, so a writing session
 *    produces one commit at the end of a pause, not one per keystroke-save.
 * 3. **Failure must decay.** A dead network retries soon; a bad token must not
 *    hammer the remote forever. Failures back off exponentially and, after
 *    `MAX_FAILURES`, park the scheduler until something changes — a manual
 *    sync, or the settings being edited.
 * 4. **Offline is not failure.** Being on a plane should cost nothing: the
 *    scheduler waits rather than burning its failure budget, and syncs as soon
 *    as the connection returns.
 *
 * Every timer and clock is injected, which is what makes the whole thing
 * testable without waiting real minutes for a backoff to elapse.
 */

/** A save burst settles into one sync after this long with no further saves. */
export const SAVE_DEBOUNCE_MS = 5_000;

/** First retry delay after a failure; doubles from here. */
export const RETRY_BASE_MS = 30_000;

/** However bad it gets, retry at least this often. */
export const RETRY_CEILING_MS = 30 * 60_000;

/** Consecutive failures before the scheduler parks itself and asks for help. */
export const MAX_FAILURES = 5;

export const AUTO_SYNC_REASONS = Object.freeze({
  interval: "interval",
  save: "save",
  focus: "focus",
  manual: "manual",
  startup: "startup",
});

/**
 * Backoff delay for the nth consecutive failure (1-based), capped.
 * Pure and exported so the ladder can be asserted directly.
 */
export const retryDelayMs = (failures) => {
  if (failures <= 0) return 0;
  const raw = RETRY_BASE_MS * 2 ** (failures - 1);
  return Math.min(raw, RETRY_CEILING_MS);
};

/**
 * @param {object} deps
 * @param {(reason: string) => Promise<any>} deps.run  Performs one sync.
 * @param {() => boolean} deps.isEnabled   Auto-sync switched on right now.
 * @param {() => number}  deps.intervalMs  Configured idle interval.
 * @param {() => boolean} [deps.isOnline]  Network reachable.
 * @param {(status: object) => void} [deps.onStatus] Notified on every change.
 */
export const createAutoSyncScheduler = ({
  run,
  isEnabled,
  intervalMs,
  isOnline = () => true,
  onStatus = () => {},
  timers = { setTimeout, clearTimeout },
  now = () => Date.now(),
}) => {
  let timer = null;
  let running = false;
  /** A request arrived mid-run; honour it once the current run finishes. */
  let coalesced = null;
  let failures = 0;
  let lastError = null;
  let lastSyncAt = null;
  let lastReport = null;
  let started = false;

  const status = () => ({
    running,
    failures,
    lastError,
    lastSyncAt,
    lastReport,
    paused: failures >= MAX_FAILURES,
    state: running
      ? "syncing"
      : failures >= MAX_FAILURES
        ? "paused"
        : !isOnline()
          ? "offline"
          : failures > 0
            ? "error"
            : "idle",
  });

  const emit = () => onStatus(status());

  const clearTimer = () => {
    if (timer !== null) {
      timers.clearTimeout(timer);
      timer = null;
    }
  };

  /** Arm the next idle pass. Backoff wins over the configured interval. */
  const rearm = () => {
    clearTimer();
    if (!started || !isEnabled()) return;
    if (failures >= MAX_FAILURES) return; // parked until something changes

    const delay = failures > 0 ? retryDelayMs(failures) : Math.max(60_000, intervalMs());
    timer = timers.setTimeout(() => {
      timer = null;
      void execute(AUTO_SYNC_REASONS.interval);
    }, delay);
  };

  const execute = async (reason) => {
    if (!started && reason !== AUTO_SYNC_REASONS.manual) return null;
    if (!isEnabled() && reason !== AUTO_SYNC_REASONS.manual) return null;

    // A run is already in flight: remember that more work arrived and let the
    // current run's tail pick it up. Manual wins, so an explicit click is never
    // downgraded to a background reason.
    if (running) {
      coalesced = coalesced === AUTO_SYNC_REASONS.manual ? coalesced : reason;
      return null;
    }

    // Offline costs nothing — no failure recorded, just a later look.
    if (!isOnline() && reason !== AUTO_SYNC_REASONS.manual) {
      emit();
      rearm();
      return null;
    }

    clearTimer();
    running = true;
    emit();

    let report = null;
    try {
      report = await run(reason);
      failures = 0;
      lastError = null;
      lastSyncAt = now();
      lastReport = report;
    } catch (error) {
      failures += 1;
      lastError = error?.message || String(error);
    } finally {
      running = false;
      const pending = coalesced;
      coalesced = null;
      emit();

      if (pending && failures === 0) {
        // Work arrived mid-run; do it now rather than waiting a full interval.
        void execute(pending);
      } else {
        rearm();
      }
    }

    return report;
  };

  /** Debounce state for save bursts. */
  let saveTimer = null;
  const requestAfterSave = () => {
    if (!started || !isEnabled()) return;
    if (saveTimer !== null) timers.clearTimeout(saveTimer);
    saveTimer = timers.setTimeout(() => {
      saveTimer = null;
      void execute(AUTO_SYNC_REASONS.save);
    }, SAVE_DEBOUNCE_MS);
  };

  return {
    start() {
      if (started) return;
      started = true;
      failures = 0;
      lastError = null;
      rearm();
      emit();
    },

    stop() {
      started = false;
      clearTimer();
      if (saveTimer !== null) {
        timers.clearTimeout(saveTimer);
        saveTimer = null;
      }
      coalesced = null;
      emit();
    },

    /** Settings changed: clear any parked failure state and re-arm. */
    reset() {
      failures = 0;
      lastError = null;
      rearm();
      emit();
    },

    request(reason = AUTO_SYNC_REASONS.interval) {
      if (reason === AUTO_SYNC_REASONS.save) return requestAfterSave();
      return execute(reason);
    },

    /** Bypasses enabled/offline checks — the user asked for it explicitly. */
    syncNow() {
      return execute(AUTO_SYNC_REASONS.manual);
    },

    getStatus: status,
  };
};
