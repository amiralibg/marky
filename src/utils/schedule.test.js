import { describe, expect, it } from "vitest";
import { calculateNextRun, parseTimeString } from "./schedule";

describe("parseTimeString", () => {
  it("parses valid time strings and falls back to 09:00", () => {
    expect(parseTimeString("14:30")).toEqual({ hours: 14, minutes: 30 });
    expect(parseTimeString("bad")).toEqual({ hours: 9, minutes: 0 });
  });
});

describe("calculateNextRun", () => {
  it("calculates the next daily run", () => {
    const next = calculateNextRun(
      { frequency: "daily", timeOfDay: "09:00" },
      new Date("2026-05-21T10:00:00")
    );

    expect(next.toISOString()).toBe(new Date("2026-05-22T09:00:00").toISOString());
  });

  it("calculates the next weekly run for selected days", () => {
    const next = calculateNextRun(
      { frequency: "weekly", daysOfWeek: [1, 5], timeOfDay: "08:15" },
      new Date("2026-05-21T10:00:00")
    );

    expect(next.toISOString()).toBe(new Date("2026-05-22T08:15:00").toISOString());
  });

  it("clamps monthly runs to the end of shorter months", () => {
    const next = calculateNextRun(
      { frequency: "monthly", dayOfMonth: 31, timeOfDay: "09:00" },
      new Date("2026-02-01T10:00:00")
    );

    expect(next.toISOString()).toBe(new Date("2026-02-28T09:00:00").toISOString());
  });
});
