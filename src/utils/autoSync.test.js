import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createAutoSyncScheduler,
  retryDelayMs,
  AUTO_SYNC_REASONS,
  SAVE_DEBOUNCE_MS,
  RETRY_BASE_MS,
  RETRY_CEILING_MS,
  MAX_FAILURES,
} from "./autoSync";

// A deferred promise, so a test can hold a sync open and prove what happens to
// requests that arrive while one is in flight.
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const setup = (overrides = {}) => {
  const run = overrides.run ?? vi.fn().mockResolvedValue({ pushed: 1 });
  const scheduler = createAutoSyncScheduler({
    run,
    isEnabled: () => true,
    intervalMs: () => 15 * 60_000,
    ...overrides,
  });
  return { run, scheduler };
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("retryDelayMs", () => {
  it("doubles per consecutive failure", () => {
    expect(retryDelayMs(1)).toBe(RETRY_BASE_MS);
    expect(retryDelayMs(2)).toBe(RETRY_BASE_MS * 2);
    expect(retryDelayMs(3)).toBe(RETRY_BASE_MS * 4);
  });

  it("never exceeds the ceiling, however long the failure runs", () => {
    expect(retryDelayMs(99)).toBe(RETRY_CEILING_MS);
  });

  it("is zero when nothing has failed", () => {
    expect(retryDelayMs(0)).toBe(0);
  });
});

describe("createAutoSyncScheduler", () => {
  it("runs on the configured interval once started", async () => {
    const { run, scheduler } = setup();
    scheduler.start();
    expect(run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(AUTO_SYNC_REASONS.interval);
  });

  it("does nothing until started, and stops when stopped", async () => {
    const { run, scheduler } = setup();
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(run).not.toHaveBeenCalled();

    scheduler.start();
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(run).not.toHaveBeenCalled();
  });

  // The invariant the whole scheduler exists to protect: two syncs against one
  // working tree will fight each other.
  it("never runs two syncs at once", async () => {
    const gate = deferred();
    const run = vi.fn().mockReturnValue(gate.promise);
    const { scheduler } = setup({ run });
    scheduler.start();

    void scheduler.request(AUTO_SYNC_REASONS.focus);
    void scheduler.request(AUTO_SYNC_REASONS.focus);
    void scheduler.request(AUTO_SYNC_REASONS.focus);
    expect(run).toHaveBeenCalledTimes(1);
    expect(scheduler.getStatus().running).toBe(true);

    gate.resolve({});
    await vi.advanceTimersByTimeAsync(0);
    // The three overlapping requests collapse into exactly one follow-up.
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("keeps a manual request from being downgraded by a background one", async () => {
    const gate = deferred();
    const run = vi.fn().mockReturnValue(gate.promise);
    const { scheduler } = setup({ run });
    scheduler.start();

    void scheduler.request(AUTO_SYNC_REASONS.focus);
    void scheduler.syncNow();
    void scheduler.request(AUTO_SYNC_REASONS.focus);

    gate.resolve({});
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenLastCalledWith(AUTO_SYNC_REASONS.manual);
  });

  it("debounces a burst of saves into one sync", async () => {
    const { run, scheduler } = setup();
    scheduler.start();

    for (let i = 0; i < 10; i += 1) {
      scheduler.request(AUTO_SYNC_REASONS.save);
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(AUTO_SYNC_REASONS.save);
  });

  it("backs off after a failure instead of retrying on the normal interval", async () => {
    const run = vi.fn().mockRejectedValue(new Error("network is down"));
    const { scheduler } = setup({ run });
    scheduler.start();

    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(scheduler.getStatus().state).toBe("error");
    expect(scheduler.getStatus().lastError).toBe("network is down");

    // The retry comes on the backoff ladder, well before the next interval.
    await vi.advanceTimersByTimeAsync(RETRY_BASE_MS);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("parks itself after too many consecutive failures", async () => {
    const run = vi.fn().mockRejectedValue(new Error("bad token"));
    const { scheduler } = setup({ run });
    scheduler.start();

    await vi.advanceTimersByTimeAsync(15 * 60_000);
    for (let i = 1; i < MAX_FAILURES; i += 1) {
      await vi.advanceTimersByTimeAsync(retryDelayMs(i));
    }
    expect(run).toHaveBeenCalledTimes(MAX_FAILURES);
    expect(scheduler.getStatus().state).toBe("paused");

    // Parked means parked: no amount of waiting retries a bad token.
    await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
    expect(run).toHaveBeenCalledTimes(MAX_FAILURES);
  });

  it("resumes after settings change, which is what reset is for", async () => {
    const run = vi.fn().mockRejectedValue(new Error("bad token"));
    const { scheduler } = setup({ run });
    scheduler.start();

    await vi.advanceTimersByTimeAsync(15 * 60_000);
    for (let i = 1; i < MAX_FAILURES; i += 1) {
      await vi.advanceTimersByTimeAsync(retryDelayMs(i));
    }
    expect(scheduler.getStatus().state).toBe("paused");

    run.mockResolvedValue({ pushed: 1 });
    scheduler.reset();
    expect(scheduler.getStatus().state).toBe("idle");

    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(run).toHaveBeenCalledTimes(MAX_FAILURES + 1);
  });

  it("clears the failure count as soon as one sync succeeds", async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error("blip")).mockResolvedValue({ pushed: 1 });
    const { scheduler } = setup({ run });
    scheduler.start();

    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(scheduler.getStatus().failures).toBe(1);

    await vi.advanceTimersByTimeAsync(RETRY_BASE_MS);
    expect(scheduler.getStatus().failures).toBe(0);
    expect(scheduler.getStatus().state).toBe("idle");
  });

  // Being on a plane is not a failure — it must not burn the failure budget,
  // because doing so would park auto-sync by the time you landed.
  it("waits out an offline stretch without recording failures", async () => {
    let online = false;
    const { run, scheduler } = setup({ isOnline: () => online });
    scheduler.start();

    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(run).not.toHaveBeenCalled();
    expect(scheduler.getStatus().failures).toBe(0);
    expect(scheduler.getStatus().state).toBe("offline");

    online = true;
    await scheduler.request(AUTO_SYNC_REASONS.focus);
    expect(run).toHaveBeenCalledTimes(1);
    expect(scheduler.getStatus().state).toBe("idle");
  });

  it("still syncs offline when the user asks explicitly", async () => {
    const { run, scheduler } = setup({ isOnline: () => false });
    scheduler.start();
    await scheduler.syncNow();
    expect(run).toHaveBeenCalledWith(AUTO_SYNC_REASONS.manual);
  });

  it("ignores background triggers while auto-sync is switched off", async () => {
    const { run, scheduler } = setup({ isEnabled: () => false });
    scheduler.start();

    scheduler.request(AUTO_SYNC_REASONS.save);
    await scheduler.request(AUTO_SYNC_REASONS.focus);
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(run).not.toHaveBeenCalled();

    // …but the manual button still works, which is how it stays useful.
    await scheduler.syncNow();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("never schedules an interval tighter than a minute", async () => {
    const { run, scheduler } = setup({ intervalMs: () => 1 });
    scheduler.start();

    await vi.advanceTimersByTimeAsync(59_000);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("reports the last successful report and timestamp", async () => {
    const { scheduler } = setup({
      run: vi.fn().mockResolvedValue({ pushed: 3 }),
      now: () => 1234,
    });
    scheduler.start();
    await scheduler.syncNow();

    const status = scheduler.getStatus();
    expect(status.lastReport).toEqual({ pushed: 3 });
    expect(status.lastSyncAt).toBe(1234);
  });
});
