import { describe, expect, it } from "vitest";
import {
  parsePipeTable,
  serializePipeTable,
  insertRow,
  insertColumn,
  removeRow,
  removeColumn,
  setColumnAlign,
} from "./tableEdit";

const source = ["| Name | Age |", "| --- | ---: |", "| Ada | 36 |", "| Alan | 41 |"].join("\n");

describe("parsePipeTable", () => {
  it("reads header, alignment and body rows", () => {
    expect(parsePipeTable(source)).toEqual({
      rows: [
        ["Name", "Age"],
        ["Ada", "36"],
        ["Alan", "41"],
      ],
      aligns: [null, "right"],
    });
  });

  it("unescapes pipes inside cells", () => {
    const parsed = parsePipeTable("| a \\| b |\n| --- |\n| c |");
    expect(parsed.rows).toEqual([["a | b"], ["c"]]);
  });

  it("pads ragged body rows to the header width", () => {
    const parsed = parsePipeTable("| a | b |\n| --- | --- |\n| only |");
    expect(parsed.rows[1]).toEqual(["only", ""]);
  });

  it("returns null for anything that is not a GFM table", () => {
    expect(parsePipeTable("just text")).toBe(null);
    expect(parsePipeTable("| a | b |\n| x | y |")).toBe(null); // no delimiter row
    expect(parsePipeTable("| a | b |\n| --- | --- | --- |")).toBe(null); // ragged delimiter
    expect(parsePipeTable(null)).toBe(null);
  });
});

describe("serializePipeTable", () => {
  it("round-trips without loss", () => {
    expect(serializePipeTable(parsePipeTable(source))).toBe(source);
  });

  it("escapes pipes it put into cells", () => {
    const out = serializePipeTable({ rows: [["a|b"]], aligns: [null] });
    expect(out).toBe("| a\\|b |\n| --- |");
  });

  // A contenteditable cell can end up holding a newline (a paste, or Enter on a
  // browser that ignored our keydown). Written straight out it split the row in
  // two and silently rewrote the whole table on the next parse.
  it("flattens newlines inside a cell instead of splitting the row", () => {
    const out = serializePipeTable({
      rows: [
        ["A", "B"],
        ["one\ntwo", "x"],
      ],
      aligns: [null, null],
    });
    expect(out.split("\n")).toHaveLength(3);
    expect(parsePipeTable(out).rows[1]).toEqual(["one two", "x"]);
  });
});

describe("grid operations", () => {
  const grid = parsePipeTable(source);

  it("inserts a row below and never before the header", () => {
    expect(insertRow(grid, 0).rows.length).toBe(4);
    expect(insertRow(grid, 99).rows[3]).toEqual(["", ""]);
  });

  it("never deletes the header row", () => {
    const next = removeRow(grid, 0);
    expect(next.rows[0]).toEqual(["Name", "Age"]);
    expect(next.rows.map((r) => r[0])).toEqual(["Name", "Alan"]);
  });

  it("deleting the last row leaves a one-row table rather than nothing", () => {
    const single = parsePipeTable("| a |\n| --- |\n| b |");
    expect(removeRow(removeRow(single, 1), 1).rows).toEqual([["a"]]);
  });

  it("adds a column to every row and keeps alignments aligned", () => {
    const next = insertColumn(grid, 1);
    expect(next.rows[0]).toEqual(["Name", "", "Age"]);
    expect(next.aligns).toEqual([null, null, "right"]);
  });

  it("refuses to delete the last column", () => {
    const one = parsePipeTable("| a |\n| --- |\n| b |");
    expect(removeColumn(one, 0)).toEqual(one);
  });

  it("sets a column alignment and writes it into the delimiter row", () => {
    const next = setColumnAlign(grid, 0, "center");
    expect(next.aligns).toEqual(["center", "right"]);
    expect(serializePipeTable(next).split("\n")[1]).toBe("| :---: | ---: |");
  });

  it("toggles an alignment off when it is re-applied", () => {
    expect(setColumnAlign(grid, 1, "right").aligns).toEqual([null, null]);
  });

  it("ignores an out-of-range column", () => {
    expect(setColumnAlign(grid, 9, "left")).toEqual(grid);
    expect(setColumnAlign(grid, -1, "left")).toEqual(grid);
  });
});
