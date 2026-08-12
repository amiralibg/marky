import { describe, expect, it } from "vitest";
import { marked } from "marked";
import { insertBlankLineSpacers } from "./blankLineSpacers";

// How many blank lines the spacers between two block types represent.
const spacersBetween = (markdown, beforeType, afterType) => {
  const tokens = insertBlankLineSpacers(marked.lexer(markdown));
  const start = tokens.findIndex((t) => t.type === beforeType);
  const end = tokens.findIndex((t, i) => i > start && t.type === afterType);
  if (start === -1 || end === -1) return null;

  return tokens
    .slice(start + 1, end)
    .filter((t) => t.text?.includes("markdown-blank-lines"))
    .reduce((total, t) => total + Number(t.text.match(/--blank-lines: (\d+)/)[1]), 0);
};

const TABLE = ["| A | B |", "| --- | --- |", "| 1 | 2 |"].join("\n");

describe("insertBlankLineSpacers", () => {
  it("emits one spacer per authored blank line between paragraphs", () => {
    expect(spacersBetween("one\n\ntwo", "paragraph", "paragraph")).toBe(1);
    expect(spacersBetween("one\n\n\ntwo", "paragraph", "paragraph")).toBe(2);
  });

  it("spaces a table evenly above and below when a list follows", () => {
    // The regression: marked folds the blank line after a table into
    // `table.raw`, so no `space` token is emitted and Read mode lost the gap
    // below the table while Live mode kept it.
    const doc = ["- [ ] task", "", TABLE, "", "3. item"].join("\n");

    const above = spacersBetween(doc, "list", "table");
    const below = spacersBetween(doc, "table", "list");

    expect(above).toBe(1);
    expect(below).toBe(1);
    expect(above).toBe(below);
  });

  it("keeps two authored blank lines after a table as two", () => {
    const doc = ["intro", "", TABLE, "", "", "3. item"].join("\n");
    expect(spacersBetween(doc, "table", "list")).toBe(2);
  });

  it("adds nothing when a block is followed immediately by the next one", () => {
    // No blank line between them, so no spacer is owed.
    expect(spacersBetween("# Title\nBody.", "heading", "paragraph")).toBe(0);
  });

  it("does not double-count when a real space token is also present", () => {
    // paragraph.raw ends with a single newline, so only the `space` token counts.
    expect(spacersBetween("one\n\ntwo", "paragraph", "paragraph")).toBe(1);
  });

  it("leaves the tokens themselves untouched", () => {
    const tokens = marked.lexer("# Title\n\nBody.");
    const result = insertBlankLineSpacers(tokens);

    expect(result.filter((t) => t.type === "heading")).toHaveLength(1);
    expect(result.find((t) => t.type === "heading").text).toBe("Title");
    expect(result.filter((t) => t.type === "paragraph")).toHaveLength(1);
  });

  it("survives tokens with no raw", () => {
    expect(() => insertBlankLineSpacers([{ type: "custom" }])).not.toThrow();
    expect(insertBlankLineSpacers([{ type: "custom" }])).toHaveLength(1);
  });

  it("handles an empty token list", () => {
    expect(insertBlankLineSpacers([])).toEqual([]);
    expect(insertBlankLineSpacers()).toEqual([]);
  });
});
