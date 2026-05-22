import { describe, expect, it } from "vitest";
import { buildDailyNoteContent, formatDailyNoteTitle } from "./dailyNotes";

describe("dailyNotes", () => {
  it("formats daily note titles as ISO dates", () => {
    expect(formatDailyNoteTitle(new Date("2026-05-21T12:00:00.000Z"))).toBe("2026-05-21");
  });

  it("builds the standard daily note template", () => {
    const content = buildDailyNoteContent(new Date("2026-05-21T12:00:00.000Z"));

    expect(content).toContain("# Thursday, May 21, 2026");
    expect(content).toContain("## Morning Reflection");
    expect(content).toContain("## Evening Reflection");
    expect(content).toContain("#journal");
  });
});
