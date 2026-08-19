import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SELF_WRITE_ECHO_MS, clearSelfWrites, isSelfWriteEcho, markSelfWrite } from "./selfWrite";

describe("self-write echo suppression", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearSelfWrites();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearSelfWrites();
  });

  it("treats an event for a path we just wrote as our own echo", () => {
    markSelfWrite("/workspace/Home.md");
    expect(isSelfWriteEcho("/workspace/Home.md")).toBe(true);
  });

  it("does not suppress events for paths we did not write", () => {
    markSelfWrite("/workspace/Home.md");
    expect(isSelfWriteEcho("/workspace/Project.md")).toBe(false);
  });

  it("stops suppressing once the echo window has passed", () => {
    markSelfWrite("/workspace/Home.md");
    vi.advanceTimersByTime(SELF_WRITE_ECHO_MS + 1);
    expect(isSelfWriteEcho("/workspace/Home.md")).toBe(false);
  });

  it("matches Windows-style paths against the POSIX form", () => {
    markSelfWrite("C:\\workspace\\Home.md");
    expect(isSelfWriteEcho("C:/workspace/Home.md")).toBe(true);
  });

  it("ignores empty paths rather than suppressing everything", () => {
    markSelfWrite("");
    markSelfWrite(null);
    expect(isSelfWriteEcho("")).toBe(false);
    expect(isSelfWriteEcho(null)).toBe(false);
    expect(isSelfWriteEcho(undefined)).toBe(false);
  });

  it("re-stamping extends the window from the later write", () => {
    markSelfWrite("/workspace/Home.md");
    vi.advanceTimersByTime(SELF_WRITE_ECHO_MS - 100);
    markSelfWrite("/workspace/Home.md");
    vi.advanceTimersByTime(200);
    expect(isSelfWriteEcho("/workspace/Home.md")).toBe(true);
  });
});
