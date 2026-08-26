import { describe, expect, it } from "vitest";
import {
  pruneSelection,
  resolveSelectionTargets,
  selectRangeIds,
  resolvePasteDestination,
  filterPasteTargets,
  selectFolderContents,
} from "./treeSelection";

const order = ["a", "b", "c", "d", "e"];

describe("selectRangeIds", () => {
  it("covers the rows between the anchor and the click", () => {
    expect(selectRangeIds(order, "b", "d")).toEqual(["b", "c", "d"]);
  });

  it("works the same dragging upward", () => {
    expect(selectRangeIds(order, "d", "b")).toEqual(["b", "c", "d"]);
  });

  it("selects one row when the anchor and the click are the same", () => {
    expect(selectRangeIds(order, "c", "c")).toEqual(["c"]);
  });

  it("falls back to the clicked row when there is no anchor yet", () => {
    expect(selectRangeIds(order, null, "c")).toEqual(["c"]);
  });

  it("falls back to the clicked row when the anchor has scrolled out of the tree", () => {
    // The anchor's folder was collapsed, so its row is no longer in the order.
    expect(selectRangeIds(order, "gone", "c")).toEqual(["c"]);
  });
});

const items = [
  { id: "folder", type: "folder", parentId: null },
  { id: "child", type: "note", parentId: "folder" },
  { id: "grandchild", type: "note", parentId: "child" },
  { id: "loose", type: "note", parentId: null },
];

describe("resolveSelectionTargets", () => {
  it("acts on the clicked row alone when nothing is selected", () => {
    const item = items[3];
    expect(resolveSelectionTargets(items, new Set(), item)).toEqual([item]);
  });

  it("acts on the clicked row alone when it sits outside the selection", () => {
    const item = items[3];
    const targets = resolveSelectionTargets(items, new Set(["folder", "child"]), item);
    expect(targets).toEqual([item]);
  });

  it("acts on the whole selection when the clicked row is part of it", () => {
    const targets = resolveSelectionTargets(items, new Set(["folder", "loose"]), items[0]);
    expect(targets.map((entry) => entry.id)).toEqual(["folder", "loose"]);
  });

  it("drops rows whose folder is also selected, so nothing is deleted twice", () => {
    const selected = new Set(["folder", "child", "grandchild"]);
    const targets = resolveSelectionTargets(items, selected, items[0]);
    expect(targets.map((entry) => entry.id)).toEqual(["folder"]);
  });

  it("survives a parent chain that loops back on itself", () => {
    const cyclic = [
      { id: "x", type: "folder", parentId: "y" },
      { id: "y", type: "folder", parentId: "x" },
    ];
    const targets = resolveSelectionTargets(cyclic, new Set(["x", "y"]), cyclic[0]);
    expect(targets).toEqual([]);
  });

  it("returns nothing for a missing row", () => {
    expect(resolveSelectionTargets(items, new Set(["loose"]), null)).toEqual([]);
  });
});

describe("pruneSelection", () => {
  it("drops ids whose rows are gone", () => {
    const pruned = pruneSelection(new Set(["loose", "deleted"]), items);
    expect([...pruned]).toEqual(["loose"]);
  });

  it("returns the same set when everything still exists, so React skips the render", () => {
    const selection = new Set(["loose"]);
    expect(pruneSelection(selection, items)).toBe(selection);
  });

  it("leaves an empty selection alone", () => {
    const empty = new Set();
    expect(pruneSelection(empty, items)).toBe(empty);
  });
});

const fsItems = [
  { id: "root-folder", type: "folder", parentId: null, filePath: "/vault/Root" },
  { id: "note-a", type: "note", parentId: "root-folder", filePath: "/vault/Root/A.md" },
  { id: "sub", type: "folder", parentId: "root-folder", filePath: "/vault/Root/Sub" },
  { id: "deep-note", type: "note", parentId: "sub", filePath: "/vault/Root/Sub/deep.md" },
  { id: "top-note", type: "note", parentId: null, filePath: "/vault/Top.md" },
];

describe("resolvePasteDestination", () => {
  it("pastes into a folder row itself", () => {
    expect(resolvePasteDestination(fsItems, fsItems[2])).toBe(fsItems[2]);
  });

  it("pastes beside a note, into the note's own folder", () => {
    expect(resolvePasteDestination(fsItems, fsItems[3])).toBe(fsItems[2]);
  });

  it("falls back to the workspace root at root level", () => {
    expect(resolvePasteDestination(fsItems, fsItems[4])).toBe(null);
  });

  it("returns the root for a missing row", () => {
    expect(resolvePasteDestination(fsItems, null)).toBe(null);
  });
});

describe("filterPasteTargets", () => {
  const clipboard = [fsItems[0], fsItems[1]];

  it("keeps everything when pasting at the workspace root", () => {
    expect(filterPasteTargets(clipboard, null)).toEqual(clipboard);
  });

  it("drops a folder pasted into itself", () => {
    expect(filterPasteTargets([fsItems[0]], fsItems[0])).toEqual([]);
  });

  it("drops a folder pasted into its own descendant", () => {
    expect(filterPasteTargets([fsItems[0], fsItems[1]], fsItems[2]).map((e) => e.id)).toEqual([
      "note-a",
    ]);
  });

  it("drops a cut row pasted back where it already lives", () => {
    expect(filterPasteTargets([fsItems[1]], fsItems[0], "cut")).toEqual([]);
  });

  it("keeps a copied row pasted into its own folder — that is how you duplicate", () => {
    expect(filterPasteTargets([fsItems[1]], fsItems[0], "copy")).toEqual([fsItems[1]]);
  });

  it("tolerates rows without a path (unsaved buffers)", () => {
    const loose = [{ id: "x", type: "note", parentId: null }];
    expect(filterPasteTargets(loose, fsItems[0])).toEqual(loose);
  });
});

describe("selectFolderContents", () => {
  it("selects every child of a focused folder", () => {
    const ids = selectFolderContents(fsItems, fsItems[0]);
    expect(ids.sort()).toEqual(["note-a", "sub"]);
  });

  it("selects the siblings of a focused note", () => {
    expect(selectFolderContents(fsItems, fsItems[3])).toEqual(["deep-note"]);
  });

  it("selects the whole root level from a root row", () => {
    expect(selectFolderContents(fsItems, fsItems[4])).toEqual(["root-folder", "top-note"]);
  });

  it("returns nothing for a missing row", () => {
    expect(selectFolderContents(fsItems, null)).toEqual([]);
  });
});
