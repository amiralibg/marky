import { describe, expect, it } from "vitest";
import { pruneSelection, resolveSelectionTargets, selectRangeIds } from "./treeSelection";

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
