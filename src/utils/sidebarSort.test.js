import { describe, it, expect } from "vitest";
import { sortSidebarItems } from "./sidebarSort";

const folder = (id, name, order) => ({
  id,
  name,
  type: "folder",
  ...(order !== undefined ? { order } : {}),
});
const note = (id, name, extra = {}) => ({ id, name, type: "note", ...extra });

describe("sortSidebarItems", () => {
  const a = note("a", "A.md");
  const b = note("b", "B.md");
  const c = note("c", "C.md");
  const guides = folder("g", "Guides");
  const journal = folder("j", "Journal");

  it("sorts folders first, then by name", () => {
    const sorted = sortSidebarItems([a, guides, b, journal], "name-asc", true);
    expect(sorted.map((i) => i.id)).toEqual(["g", "j", "a", "b"]);
  });

  it("floats a pinned note above everything in its group, including folders", () => {
    const sorted = sortSidebarItems([guides, a, journal, b], "name-asc", true, new Set(["a"]));
    expect(sorted.map((i) => i.id)).toEqual(["a", "g", "j", "b"]);
  });

  it("keeps pinned notes in sort order among themselves", () => {
    const sorted = sortSidebarItems([c, a, b], "name-asc", true, new Set(["b", "a"]));
    expect(sorted.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("pinned beats manual drag order", () => {
    const reordered = { ...b, order: 0 };
    const first = { ...a, order: 1 };
    const sorted = sortSidebarItems([first, reordered], "name-asc", true, new Set(["a"]));
    expect(sorted.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("respects date sorting among non-pinned items", () => {
    const oldNote = { ...note("o", "Old.md"), updatedAt: "2026-01-01" };
    const newNote = { ...note("n", "New.md"), updatedAt: "2026-08-01" };
    const sorted = sortSidebarItems([oldNote, newNote], "date-desc", true);
    expect(sorted.map((i) => i.id)).toEqual(["n", "o"]);
  });
});
