import { describe, expect, it } from "vitest";
import { calculateWorkspaceStats, countWords } from "./workspaceStats";

describe("countWords", () => {
  it("counts words while ignoring extra whitespace", () => {
    expect(countWords("  one   two\nthree  ")).toBe(3);
    expect(countWords("")).toBe(0);
  });
});

describe("calculateWorkspaceStats", () => {
  it("summarizes links, tags, orphan notes, and recent activity", () => {
    const referenceDate = new Date("2026-05-21T12:00:00.000Z");
    const notes = [
      {
        name: "Home",
        content: "#project [[Project]] [[Missing]]",
        updatedAt: "2026-05-21T10:00:00.000Z",
      },
      {
        name: "Project",
        content: "#project #idea",
        updatedAt: "2026-05-15T10:00:00.000Z",
      },
      {
        name: "Archive",
        content: "#old",
        updatedAt: "2026-04-01T10:00:00.000Z",
      },
    ];

    expect(calculateWorkspaceStats(notes, referenceDate)).toEqual({
      brokenLinkCount: 1,
      latestUpdatedAt: "2026-05-21T10:00:00.000Z",
      orphanCount: 1,
      recentlyUpdatedCount: 2,
      topTags: [
        { tag: "project", count: 2 },
        { tag: "idea", count: 1 },
        { tag: "old", count: 1 },
      ],
      wikiLinkCount: 2,
    });
  });

  it("uses precomputed metadata when available", () => {
    const notes = [
      {
        name: "Source",
        content: "#ignored [[Ignored]]",
        tags: ["stored"],
        links: [{ key: "target" }],
      },
      {
        name: "Target",
        content: "",
      },
    ];

    const stats = calculateWorkspaceStats(notes, new Date("2026-05-21T12:00:00.000Z"));

    expect(stats.brokenLinkCount).toBe(0);
    expect(stats.topTags).toEqual([{ tag: "stored", count: 1 }]);
    expect(stats.wikiLinkCount).toBe(1);
  });
});
