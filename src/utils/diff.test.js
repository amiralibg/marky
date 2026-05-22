import { describe, expect, it } from "vitest";
import { computeLineDiff } from "./diff";

describe("computeLineDiff", () => {
  it("returns an empty diff for identical text", () => {
    expect(computeLineDiff("same\ntext", "same\ntext")).toEqual([]);
  });

  it("marks added, removed, and unchanged lines in order", () => {
    expect(computeLineDiff("alpha\nbeta\ngamma", "alpha\ndelta\ngamma\nomega")).toEqual([
      { type: "equal", line: "alpha" },
      { type: "remove", line: "beta" },
      { type: "add", line: "delta" },
      { type: "equal", line: "gamma" },
      { type: "add", line: "omega" },
    ]);
  });

  it("handles empty old or new text", () => {
    expect(computeLineDiff("", "new")).toEqual([
      { type: "remove", line: "" },
      { type: "add", line: "new" },
    ]);
    expect(computeLineDiff("old", "")).toEqual([
      { type: "remove", line: "old" },
      { type: "add", line: "" },
    ]);
  });
});
