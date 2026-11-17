import { describe, expect, it } from "vitest";
import {
  buildChildrenIndex,
  findVaultRoot,
  libraryBreadcrumb,
  libraryChildren,
  miniatureSource,
  newestNoteIn,
  pinnedLibraryNotes,
  recentLibraryNotes,
  relativeDate,
} from "./library";

const ROOT = "/vault";
const folder = (id, name, parentId, extra = {}) => ({
  id,
  name,
  parentId,
  type: "folder",
  filePath: `${ROOT}/${name}`,
  ...extra,
});
const note = (id, name, parentId, updatedAt, extra = {}) => ({
  id,
  name,
  parentId,
  type: "note",
  updatedAt,
  content: `# ${name}`,
  ...extra,
});

const items = [
  { id: "root", name: "Vault", parentId: null, type: "folder", filePath: ROOT },
  folder("journal", "Journal", "root"),
  folder("projects", "Projects", "root"),
  folder("archive", "Archive", "projects"),
  folder("deep", "Deep", "archive"),
  note("inbox", "Inbox", "root", "2026-11-10T10:00:00Z"),
  note("alpha", "alpha", "root", "2026-11-01T10:00:00Z"),
  note("week42", "Week 42", "journal", "2026-10-20T10:00:00Z"),
  note("week43", "Week 43", "journal", "2026-10-27T10:00:00Z"),
  note("old", "Old plan", "deep", "2025-01-01T10:00:00Z"),
  note("older", "Older plan", "deep", "2024-01-01T10:00:00Z"),
  note("loose", "Loose file", null, "2026-11-14T10:00:00Z", { isLoose: true }),
];

describe("findVaultRoot", () => {
  it("picks the root folder by path, not a loose file at the top level", () => {
    expect(findVaultRoot(items, ROOT).id).toBe("root");
  });

  it("falls back to the first non-loose top-level folder", () => {
    expect(findVaultRoot(items, "/somewhere/else").id).toBe("root");
    expect(findVaultRoot([], ROOT)).toBeNull();
  });
});

describe("libraryChildren", () => {
  const index = buildChildrenIndex(items);

  it("lists folders first, then documents, by name like the sidebar", () => {
    expect(libraryChildren(index, "root").map((item) => item.id)).toEqual([
      "journal",
      "projects",
      "alpha",
      "inbox",
    ]);
  });

  it("follows a manual drag order when the siblings have one", () => {
    const ordered = buildChildrenIndex([
      folder("a", "A", "root", { order: 2 }),
      note("b", "B", "root", null, { order: 0 }),
      note("c", "C", "root", null, { order: 1 }),
    ]);
    expect(libraryChildren(ordered, "root").map((item) => item.id)).toEqual(["b", "c", "a"]);
  });

  it("never lists loose files, and an unknown folder is empty", () => {
    expect(index.get(null)).toBeUndefined();
    expect(libraryChildren(index, "missing")).toEqual([]);
  });
});

describe("libraryBreadcrumb", () => {
  const byId = new Map(items.map((item) => [item.id, item]));

  it("walks from the vault root down to the folder", () => {
    expect(libraryBreadcrumb(byId, "root", "deep").map((crumb) => crumb.name)).toEqual([
      "Vault",
      "Projects",
      "Archive",
      "Deep",
    ]);
  });

  it("is just the root at the root, or for a folder that has gone", () => {
    expect(libraryBreadcrumb(byId, "root", "root")).toEqual([{ id: "root", name: "Vault" }]);
    expect(libraryBreadcrumb(byId, "root", "renamed")).toEqual([{ id: "root", name: "Vault" }]);
  });

  it("does not loop on a cycle in the parent chain", () => {
    const cyclic = new Map([
      ["root", { id: "root", name: "Vault", parentId: null }],
      ["a", { id: "a", name: "A", parentId: "b" }],
      ["b", { id: "b", name: "B", parentId: "a" }],
    ]);
    expect(libraryBreadcrumb(cyclic, "root", "a")).toEqual([{ id: "root", name: "Vault" }]);
  });
});

describe("newestNoteIn", () => {
  const index = buildChildrenIndex(items);

  it("prefers the folder's own newest note", () => {
    expect(newestNoteIn(index, "journal").id).toBe("week43");
  });

  it("looks below when the folder holds only folders", () => {
    expect(newestNoteIn(index, "projects").id).toBe("old");
  });

  it("is null for a folder without notes", () => {
    expect(newestNoteIn(buildChildrenIndex([folder("e", "E", "root")]), "e")).toBeNull();
  });
});

describe("recentLibraryNotes", () => {
  it("keeps the opened order, then tops up with recently changed notes", () => {
    const recent = recentLibraryNotes([{ id: "week42" }, { id: "gone" }], items, 4);
    expect(recent.map((item) => item.id)).toEqual(["week42", "inbox", "alpha", "week43"]);
  });

  it("does not top up with loose files", () => {
    const recent = recentLibraryNotes([], items, 20);
    expect(recent.some((item) => item.isLoose)).toBe(false);
  });
});

describe("pinnedLibraryNotes", () => {
  it("returns the pinned notes that still exist, by name", () => {
    expect(pinnedLibraryNotes(["inbox", "alpha", "gone"], items).map((n) => n.id)).toEqual([
      "alpha",
      "inbox",
    ]);
  });
});

describe("relativeDate", () => {
  const now = new Date(2026, 10, 15, 18, 0);
  const at = (...args) => new Date(...args).toISOString();

  it("reads minutes and hours today", () => {
    expect(relativeDate(at(2026, 10, 15, 17, 59, 30), now)).toBe("just now");
    expect(relativeDate(at(2026, 10, 15, 17, 58), now)).toBe("2 min ago");
    expect(relativeDate(at(2026, 10, 15, 15, 0), now)).toBe("3 h ago");
  });

  it("names yesterday, then the weekday", () => {
    expect(relativeDate(at(2026, 10, 14, 9, 0), now)).toBe("yesterday");
    const weekday = new Date(2026, 10, 11).toLocaleDateString(undefined, { weekday: "long" });
    expect(relativeDate(at(2026, 10, 11, 9, 0), now)).toBe(weekday);
  });

  it("is empty for missing or broken dates", () => {
    expect(relativeDate(null, now)).toBe("");
    expect(relativeDate("not a date", now)).toBe("");
  });
});

describe("miniatureSource", () => {
  it("drops the front matter and leading blank lines", () => {
    expect(miniatureSource("---\ntags: [a]\n---\n\n# Title\n\nBody")).toBe("# Title\n\nBody");
  });

  it("keeps a short note whole", () => {
    expect(miniatureSource("# Hi\n\nShort.")).toBe("# Hi\n\nShort.");
    expect(miniatureSource(null)).toBe("");
  });

  it("cuts a long note at a line boundary near the limit", () => {
    const lines = Array.from({ length: 200 }, (_, i) => `Line ${i} of the note`);
    const out = miniatureSource(lines.join("\n"), 100);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.endsWith("of the note")).toBe(true);
  });

  it("cuts one very long line at a word", () => {
    const out = miniatureSource("word ".repeat(100), 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith("word")).toBe(true);
  });

  it("closes a code fence the cut left open", () => {
    const source = `# Code\n\n\`\`\`js\n${"const a = 1;\n".repeat(50)}\`\`\`\n`;
    const out = miniatureSource(source, 120);
    expect(out.trimEnd().endsWith("```")).toBe(true);
    expect((out.match(/^```/gm) || []).length % 2).toBe(0);
  });

  it("closes a tilde fence with tildes, and leaves closed fences alone", () => {
    const tilde = `~~~~\n${"x\n".repeat(100)}~~~~\n`;
    expect(miniatureSource(tilde, 40).endsWith("\n~~~~")).toBe(true);
    const closed = "```\ncode\n```\n\nAfter.";
    expect(miniatureSource(closed)).toBe(closed);
  });

  it("closes a display-math block the cut left open", () => {
    const out = miniatureSource(`Intro\n\n$$\n${"x + y\n".repeat(50)}$$\n`, 60);
    expect(out.endsWith("\n$$")).toBe(true);
  });

  it("does not read a $$ inside a code fence as math", () => {
    expect(miniatureSource("```\n$$\n```\n\nText")).toBe("```\n$$\n```\n\nText");
  });
});
