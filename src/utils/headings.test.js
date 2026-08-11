import { describe, it, expect } from "vitest";
import { parseHeadings, activeHeadingIndex, activeHeadingPath } from "./headings";

describe("parseHeadings", () => {
  it("returns an empty list for empty input", () => {
    expect(parseHeadings("")).toEqual([]);
    expect(parseHeadings(null)).toEqual([]);
  });

  it("reads ATX headings with their level and 1-based line", () => {
    const headings = parseHeadings("# One\n\ntext\n\n### Three");
    expect(headings).toEqual([
      { level: 1, text: "One", id: "one", line: 1 },
      { level: 3, text: "Three", id: "three", line: 5 },
    ]);
  });

  it("strips closing hashes from a closed ATX heading", () => {
    expect(parseHeadings("## Title ##")[0].text).toBe("Title");
  });

  it("ignores hashes inside fenced code blocks", () => {
    const doc = ["# Real", "", "```sh", "# not a heading", "```", "", "## Also real"].join("\n");
    expect(parseHeadings(doc).map((h) => h.text)).toEqual(["Real", "Also real"]);
  });

  it("handles tilde fences and does not close a backtick fence with a tilde", () => {
    const doc = ["~~~", "# hidden", "~~~", "# shown"].join("\n");
    expect(parseHeadings(doc).map((h) => h.text)).toEqual(["shown"]);
  });

  it("reads setext headings, pointing line at the text", () => {
    const headings = parseHeadings("Title\n=====\n\nSub\n---");
    expect(headings).toEqual([
      { level: 1, text: "Title", id: "title", line: 1 },
      { level: 2, text: "Sub", id: "sub", line: 4 },
    ]);
  });

  it("does not treat a rule under a list item as a setext heading", () => {
    expect(parseHeadings("- item\n---")).toEqual([]);
  });

  it("skips YAML frontmatter so its closing --- is not a setext underline", () => {
    const doc = ["---", "title: Note", "tags: [a]", "---", "", "# Real"].join("\n");
    expect(parseHeadings(doc).map((h) => h.text)).toEqual(["Real"]);
  });
});

describe("activeHeadingIndex", () => {
  const headings = [{ line: 1 }, { line: 10 }, { line: 20 }];

  it("returns -1 before the first heading", () => {
    expect(activeHeadingIndex([{ line: 5 }], 1)).toBe(-1);
  });

  it("returns the last heading at or above the line", () => {
    expect(activeHeadingIndex(headings, 1)).toBe(0);
    expect(activeHeadingIndex(headings, 9)).toBe(0);
    expect(activeHeadingIndex(headings, 10)).toBe(1);
    expect(activeHeadingIndex(headings, 999)).toBe(2);
  });

  it("returns -1 for an empty outline", () => {
    expect(activeHeadingIndex([], 42)).toBe(-1);
  });
});

describe("activeHeadingPath", () => {
  // # Doc / ## Architecture / ### Key flows / ## Risks
  const headings = [
    { level: 1, line: 1 },
    { level: 2, line: 10 },
    { level: 3, line: 20 },
    { level: 2, line: 30 },
  ];

  it("is empty before the first heading", () => {
    expect([...activeHeadingPath([{ level: 1, line: 5 }], 1)]).toEqual([]);
    expect([...activeHeadingPath([], 42)]).toEqual([]);
  });

  it("lights up the active heading and each of its ancestors", () => {
    expect([...activeHeadingPath(headings, 25)].sort()).toEqual([0, 1, 2]);
  });

  it("drops a sibling branch once the cursor leaves it", () => {
    // Under "Risks": its h1 stays lit, but "Architecture" and "Key flows" don't.
    expect([...activeHeadingPath(headings, 30)].sort()).toEqual([0, 3]);
  });

  it("stops at a top-level heading", () => {
    expect([...activeHeadingPath(headings, 5)]).toEqual([0]);
  });

  it("handles skipped levels and a document that starts deep", () => {
    const skipped = [
      { level: 2, line: 1 },
      { level: 5, line: 5 },
    ];
    expect([...activeHeadingPath(skipped, 6)].sort()).toEqual([0, 1]);
  });
});
