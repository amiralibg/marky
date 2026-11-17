import { describe, expect, it } from "vitest";
import { buildSourceMap } from "./htmlSourceMap";
import { applyHtmlEdits, describeRefusal } from "./htmlPatch";

// Each awkward document the in-place editor has to survive. They are written
// out byte by byte (CRLF, BOM, no final newline) because those bytes are what
// the tests are about.
const DOCS = {
  unquoted: "<!doctype html><p class=lead id=intro>Unquoted attributes</p><p data-x=1>Two</p>",
  uppercase:
    "<!DOCTYPE HTML>\n<HTML LANG=EN><HEAD><TITLE>Up</TITLE></HEAD><BODY>\n<P CLASS=Lead>Shouted paragraph</P>\n<H2 ID=Sec>Heading</H2>\n</BODY></HTML>\n",
  omittedEnds:
    "<p>First paragraph\n<p>Second paragraph\n<ul>\n  <li>One\n  <li>Two\n</ul>\n<table>\n  <tr><td>A1<td>B1\n  <tr><td>A2<td>B2\n</table>\n",
  impliedTbody: "<table><tr><th>Name<th>Score</tr><tr><td>Ada</td><td>99</td></tr></table>",
  voids:
    '<p>Line one<br>line two<br/>end</p>\n<p><img src="a.png" alt="A">Caption text <input type=checkbox checked></p>\n<hr>\n<p>After rule</p>',
  entities:
    "<p>Fish &amp; chips &mdash; &#8212; &#x2014; &nbsp;and a bare & here</p>\n<p>&lt;tag&gt; &copy; 2026</p>",
  pre: "<pre>\n  keep\n    this   spacing\n</pre>\n<p>Below the pre</p>",
  scriptWithP:
    '<p>Before</p>\n<script>\n  const html = "</p><p>not a paragraph</p>";\n  if (1 < 2 && 3 > 2) console.log(html);\n</script>\n<p>After the script</p>',
  comments:
    "<!-- top comment -->\n<p>Para <!-- inline <b>bold</b> comment --> text</p>\n<!-- <p>commented out paragraph</p> -->\n<p>Last</p>",
  crlf: "<!doctype html>\r\n<html>\r\n<body>\r\n<p>CRLF one\r\ncontinues</p>\r\n<p>CRLF two</p>\r\n</body>\r\n</html>\r\n",
  bom: "﻿<!doctype html>\n<html><body><p>With a BOM</p><p>Second</p></body></html>",
  bomCrlf: "﻿<!doctype html>\r\n<p>BOM and CRLF</p>\r\n<p>Second line</p>",
  fragmentOnly: "<h1>No html head or body</h1>\n<p>Just content</p>\n<p>More content</p>",
  noFinalNewline: "<p>No newline at the end</p>",
};

// The frame reports a block's children with the browser's `innerHTML`; the
// map's own serialisation is the same algorithm, so tests read it from there.
const editOf = (source, predicate, html, extra = {}) => {
  const map = buildSourceMap(source);
  const block = map.blocks.find(predicate);
  if (!block) throw new Error("no matching block");
  return {
    id: block.id,
    tag: block.tag,
    originalHtml: map.serializeInner(block.id),
    html,
    ...extra,
  };
};

const byText = (text) => (block) => {
  // Match on the block's own source range so tests read naturally.
  return block.__text === undefined ? false : block.__text.includes(text);
};

// Attach each block's inner source to it for the `byText` matcher.
const mapWithText = (source) => {
  const map = buildSourceMap(source);
  for (const block of map.blocks) block.__text = source.slice(block.innerStart, block.innerEnd);
  return map;
};

const editByText = (source, text, html, extra = {}) => {
  const map = mapWithText(source);
  // The innermost block containing the text: the one a click on it activates.
  const block = map.blocks
    .filter(byText(text))
    .sort((a, b) => a.end - a.start - (b.end - b.start))[0];
  if (!block) throw new Error(`no block containing ${JSON.stringify(text)}`);
  return {
    id: block.id,
    tag: block.tag,
    originalHtml: map.serializeInner(block.id),
    html,
    ...extra,
  };
};

const permutations = (list) => {
  if (list.length <= 1) return [list];
  return list.flatMap((item, i) =>
    permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((rest) => [item, ...rest])
  );
};

/**
 * The bytes outside the given source ranges must be identical. `ranges` are
 * in the *original* source; the output is compared piecewise around them.
 */
const expectOnlyRangesChanged = (source, output, ranges) => {
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  let cursorIn = 0;
  let cursorOut = 0;
  for (const range of sorted) {
    const keep = source.slice(cursorIn, range.from);
    expect(output.slice(cursorOut, cursorOut + keep.length)).toBe(keep);
    cursorOut += keep.length + range.replacement.length;
    expect(output.slice(cursorOut - range.replacement.length, cursorOut)).toBe(range.replacement);
    cursorIn = range.to;
  }
  expect(output.slice(cursorOut)).toBe(source.slice(cursorIn));
};

const innerRange = (source, edit) => {
  const block = buildSourceMap(source).byId.get(edit.id);
  return { from: block.innerStart, to: block.innerEnd };
};

describe("buildSourceMap", () => {
  it("maps blocks to their inner ranges", () => {
    const source = "<p>Hello <b>you</b></p><h2>Title</h2>";
    const map = buildSourceMap(source);
    expect(map.blocks.map((b) => [b.tag, source.slice(b.innerStart, b.innerEnd)])).toEqual([
      ["p", "Hello <b>you</b>"],
      ["h2", "Title"],
    ]);
    expect(map.blocks.every((b) => b.sound)).toBe(true);
  });

  it("ends a block with an omitted end tag where the next token starts", () => {
    const source = DOCS.omittedEnds;
    const map = buildSourceMap(source);
    const texts = map.blocks.map((b) => source.slice(b.innerStart, b.innerEnd));
    expect(texts).toContain("First paragraph\n");
    expect(texts).toContain("One\n  ");
    expect(texts).toContain("A1");
    expect(texts).toContain("B2\n");
    expect(map.blocks.filter((b) => !b.hasEndTag).length).toBeGreaterThan(4);
  });

  it("counts offsets in the original string for BOM and CRLF files", () => {
    const source = DOCS.bomCrlf;
    const map = buildSourceMap(source);
    expect(map.bom).toBe(1);
    const first = map.blocks[0];
    expect(source.slice(first.start, first.end)).toBe("<p>BOM and CRLF</p>");
    expect(source.slice(first.innerStart, first.innerEnd)).toBe("BOM and CRLF");
  });

  it("does not treat script contents or comments as blocks", () => {
    const scripts = buildSourceMap(DOCS.scriptWithP);
    expect(scripts.blocks.map((b) => b.tag)).toEqual(["p", "p"]);
    const comments = buildSourceMap(DOCS.comments);
    expect(comments.blocks.map((b) => b.tag)).toEqual(["p", "p"]);
  });

  it("marks foster-parented content unsound", () => {
    const map = buildSourceMap("<table><p>stray</p><tr><td>cell</td></tr></table>");
    const stray = map.blocks.find((b) => b.tag === "p");
    const cell = map.blocks.find((b) => b.tag === "td");
    expect(stray.sound).toBe(false);
    expect(stray.reason).toBe("moved-by-parser");
    expect(cell.sound).toBe(true);
  });

  it("marks a paragraph holding a cloned formatting element unsound", () => {
    const map = buildSourceMap("<p><b>one<p>two</b> three</p>");
    const [first, second] = map.blocks;
    expect(first.sound).toBe(true);
    expect(second.sound).toBe(false);
    // The clone sits inside the second paragraph but was written before it.
    expect(["misnested", "moved-by-parser"]).toContain(second.reason);
  });

  it("only offers containers that hold inline text", () => {
    const map = buildSourceMap(
      '<div class="lead">Some <em>words</em></div><div class="bars"><i></i><i></i></div><div><p>wrapped</p></div>'
    );
    expect(map.blocks.map((b) => b.tag)).toEqual(["div", "p"]);
  });

  it("lets a list item with a nested list be a block, nested items too", () => {
    const map = buildSourceMap("<ul><li>Parent<ul><li>Child</li></ul></li></ul>");
    expect(map.blocks.map((b) => [b.tag, b.depth])).toEqual([
      ["li", 0],
      ["li", 1],
    ]);
  });
});

describe("applyHtmlEdits round-trip identity", () => {
  for (const [name, source] of Object.entries(DOCS)) {
    it(`leaves ${name} byte-identical when nothing is edited`, () => {
      const map = buildSourceMap(source);
      expect(applyHtmlEdits(source, [], map).output).toBe(source);
      // Every block "edited" back to what it was is still nothing.
      const noops = map.blocks
        .filter((b) => b.sound)
        .map((b) => ({
          id: b.id,
          tag: b.tag,
          originalHtml: map.serializeInner(b.id),
          html: map.serializeInner(b.id),
        }));
      const result = applyHtmlEdits(source, noops, map);
      expect(result.output).toBe(source);
      expect(result.applied).toEqual([]);
      expect(result.refused).toEqual([]);
    });
  }
});

describe("applyHtmlEdits single edits", () => {
  it("replaces only the edited block's inner range", () => {
    const source = "<!doctype html>\n<h1>Title</h1>\n<p>Old text</p>\n<p>Untouched</p>\n";
    const edit = editByText(source, "Old text", "New <b>text</b>");
    const result = applyHtmlEdits(source, [edit]);
    expect(result.applied).toEqual([edit.id]);
    expect(result.output).toBe(
      "<!doctype html>\n<h1>Title</h1>\n<p>New <b>text</b></p>\n<p>Untouched</p>\n"
    );
    expectOnlyRangesChanged(source, result.output, [
      { ...innerRange(source, edit), replacement: "New <b>text</b>" },
    ]);
  });

  it("edits a paragraph whose end tag is omitted", () => {
    const source = DOCS.omittedEnds;
    const edit = editByText(source, "First paragraph", "First, edited\n");
    const result = applyHtmlEdits(source, [edit]);
    expect(result.applied).toEqual([edit.id]);
    expect(result.output.startsWith("<p>First, edited\n<p>Second paragraph")).toBe(true);
    expectOnlyRangesChanged(source, result.output, [
      { ...innerRange(source, edit), replacement: "First, edited\n" },
    ]);
  });

  it("edits a cell under an implied tbody", () => {
    const source = DOCS.impliedTbody;
    const edit = editByText(source, "Ada", "Grace");
    const result = applyHtmlEdits(source, [edit]);
    expect(result.output).toBe(source.replace("<td>Ada</td>", "<td>Grace</td>"));
  });

  it("edits a cell whose end tag is omitted", () => {
    const source = DOCS.omittedEnds;
    const edit = editByText(source, "B1", "B1 revised\n  ");
    const result = applyHtmlEdits(source, [edit]);
    expect(result.applied).toEqual([edit.id]);
    expectOnlyRangesChanged(source, result.output, [
      { ...innerRange(source, edit), replacement: "B1 revised\n  " },
    ]);
  });

  it("keeps CRLF line endings and the BOM", () => {
    const source = DOCS.crlf;
    const edit = editByText(source, "CRLF one", "CRLF one\nstill two lines");
    const result = applyHtmlEdits(source, [edit]);
    expect(result.output).toBe(
      source.replace("CRLF one\r\ncontinues", "CRLF one\r\nstill two lines")
    );

    const withBom = DOCS.bomCrlf;
    const bomEdit = editByText(withBom, "Second line", "Second, edited");
    const bomResult = applyHtmlEdits(withBom, [bomEdit]);
    expect(bomResult.output.startsWith("﻿<!doctype html>\r\n")).toBe(true);
    expect(bomResult.output).toBe(withBom.replace("Second line", "Second, edited"));
  });

  it("keeps a missing final newline missing", () => {
    const source = DOCS.noFinalNewline;
    const edit = editByText(source, "No newline", "Still no newline");
    expect(applyHtmlEdits(source, [edit]).output).toBe("<p>Still no newline</p>");
  });

  it("edits inside documents with entities, voids, scripts, comments and uppercase tags", () => {
    const cases = [
      [DOCS.entities, "&lt;tag&gt;", "plain"],
      [DOCS.voids, "After rule", "After the rule"],
      [DOCS.scriptWithP, "After the script", "After, edited"],
      [DOCS.comments, "Last", "Last, edited"],
      [DOCS.uppercase, "Shouted", "Quiet paragraph"],
      [DOCS.pre, "Below the pre", "Below, edited"],
      [DOCS.fragmentOnly, "Just content", "Edited content"],
      [DOCS.unquoted, "Unquoted", "Still unquoted"],
      [DOCS.bom, "With a BOM", "Still a BOM"],
    ];
    for (const [source, text, html] of cases) {
      const edit = editByText(source, text, html);
      const result = applyHtmlEdits(source, [edit]);
      expect(result.applied).toEqual([edit.id]);
      expectOnlyRangesChanged(source, result.output, [
        { ...innerRange(source, edit), replacement: html },
      ]);
    }
  });

  it("writes text that needs escaping as the frame serialised it", () => {
    const source = "<p>Old</p>";
    // `innerHTML` escapes &, < and > in text; the patch writes that as is.
    const edit = editByText(
      source,
      "Old",
      "a &amp; b &lt;script&gt;alert(1)&lt;/script&gt; &gt; c"
    );
    const result = applyHtmlEdits(source, [edit]);
    expect(result.output).toBe("<p>a &amp; b &lt;script&gt;alert(1)&lt;/script&gt; &gt; c</p>");
    // Parsed again, it is text, not a script element.
    const map = buildSourceMap(result.output);
    expect(map.serializeInner(map.blocks[0].id)).not.toContain("<script>");
  });

  it("keeps the attributes of an edited element exactly as written", () => {
    const source = "<P CLASS=lead data-a='x'>Text</P>";
    const edit = editByText(source, "Text", "Words");
    expect(applyHtmlEdits(source, [edit]).output).toBe("<P CLASS=lead data-a='x'>Words</P>");
  });
});

describe("applyHtmlEdits multiple and nested edits", () => {
  const source =
    "<!doctype html>\r\n<h1>Report</h1>\r\n<p>Alpha</p>\r\n<ul><li>Parent<ul><li>Child</li></ul></li></ul>\r\n<p>Omega</p>";

  it("applies several edits the same way in every order", () => {
    const edits = [
      editByText(source, "Report", "Quarterly report"),
      editByText(source, "Alpha", "Alpha, edited"),
      editByText(source, "Omega", "Omega, <i>edited</i>"),
    ];
    const outputs = new Set(
      permutations(edits).map((order) => applyHtmlEdits(source, order).output)
    );
    expect(outputs.size).toBe(1);
    const [output] = outputs;
    expectOnlyRangesChanged(
      source,
      output,
      edits.map((edit) => ({ ...innerRange(source, edit), replacement: edit.html }))
    );
  });

  it("lets the outer edit win over an edit nested in it, in every order", () => {
    const inner = editByText(source, "Child", "Child, edited");
    const outer = editByText(source, "Parent<ul>", "Parent, edited<ul><li>Child, edited</li></ul>");
    const other = editByText(source, "Alpha", "Alpha 2");
    const results = permutations([inner, outer, other]).map((order) =>
      applyHtmlEdits(source, order)
    );
    const outputs = new Set(results.map((r) => r.output));
    expect(outputs.size).toBe(1);
    for (const result of results) {
      expect(result.superseded).toEqual([inner.id]);
      expect([...result.applied].sort((a, b) => a - b)).toEqual(
        [outer.id, other.id].sort((a, b) => a - b)
      );
    }
    const [output] = outputs;
    // The inner text appears once: the outer edit already carried it.
    expect(output.split("Child, edited").length - 1).toBe(1);
    expectOnlyRangesChanged(source, output, [
      { ...innerRange(source, outer), replacement: outer.html },
      { ...innerRange(source, other), replacement: other.html },
    ]);
  });
});

describe("applyHtmlEdits block style changes", () => {
  it("rewrites the whole element when the tag changes, keeping attributes", () => {
    const source = "<h1>Title</h1>\n<p class=lead id=x>Make me a heading</p>\n<p>Next</p>";
    const edit = editByText(source, "Make me", "Make me a heading", { newTag: "h2" });
    const result = applyHtmlEdits(source, [edit]);
    expect(result.applied).toEqual([edit.id]);
    expect(result.output).toBe(
      "<h1>Title</h1>\n<h2 class=lead id=x>Make me a heading</h2>\n<p>Next</p>"
    );
    const block = buildSourceMap(source).byId.get(edit.id);
    expectOnlyRangesChanged(source, result.output, [
      {
        from: block.start,
        to: block.end,
        replacement: "<h2 class=lead id=x>Make me a heading</h2>",
      },
    ]);
  });

  it("writes an end tag for a paragraph that had none", () => {
    const source = "<p>One\n<p>Two\n";
    const edit = editByText(source, "One", "One\n", { newTag: "h3" });
    expect(applyHtmlEdits(source, [edit]).output).toBe("<h3>One\n</h3><p>Two\n");
  });

  it("refuses a style change on a block that is not a paragraph or heading", () => {
    const source = "<ul><li>Item</li></ul>";
    const edit = editByText(source, "Item", "Item", { newTag: "h2" });
    const result = applyHtmlEdits(source, [edit]);
    expect(result.output).toBe(source);
    expect(result.refused).toEqual([{ id: edit.id, reason: "unsupported-style" }]);
  });
});

describe("applyHtmlEdits refusals", () => {
  it("refuses an edit to foster-parented content and leaves the file alone", () => {
    const source = "<table><p>stray</p><tr><td>cell</td></tr></table>";
    const edit = editByText(source, "stray", "moved");
    const result = applyHtmlEdits(source, [edit]);
    expect(result.output).toBe(source);
    expect(result.refused[0].reason).toBe("moved-by-parser");
    expect(describeRefusal(result.refused[0].reason)).toMatch(/can't be edited in place/);
  });

  it("refuses when the file no longer matches what the frame saw", () => {
    const source = "<p>Original</p>";
    const edit = { ...editByText(source, "Original", "Edited"), originalHtml: "Something else" };
    const result = applyHtmlEdits(source, [edit]);
    expect(result.output).toBe(source);
    expect(result.refused).toEqual([{ id: edit.id, reason: "content-mismatch" }]);
  });

  it("refuses when the tag at that offset is a different element", () => {
    const source = "<p>Original</p>";
    const edit = { ...editByText(source, "Original", "Edited"), tag: "h1" };
    expect(applyHtmlEdits(source, [edit]).refused[0].reason).toBe("tag-mismatch");
  });

  it("refuses an unknown block id", () => {
    const result = applyHtmlEdits("<p>x</p>", [
      { id: 999, tag: "p", originalHtml: "x", html: "y" },
    ]);
    expect(result.refused[0].reason).toBe("unknown-block");
    expect(result.output).toBe("<p>x</p>");
  });

  it("refuses an edit whose HTML would restructure the page, but keeps the others", () => {
    const source = "<p>First</p><p>Second</p>";
    const bad = editByText(source, "First", "broken</p><div>block</div><p>");
    const good = editByText(source, "Second", "Second, edited");
    const result = applyHtmlEdits(source, [bad, good]);
    expect(result.refused).toEqual([{ id: bad.id, reason: "would-restructure" }]);
    expect(result.applied).toEqual([good.id]);
    expect(result.output).toBe("<p>First</p><p>Second, edited</p>");
  });

  it("refuses a nested block element typed into a paragraph", () => {
    const source = "<p>Text</p>";
    const edit = editByText(source, "Text", "Text<ul><li>list</li></ul>");
    const result = applyHtmlEdits(source, [edit]);
    expect(result.output).toBe(source);
    expect(result.refused[0].reason).toBe("would-restructure");
  });

  it("refuses two different edits for the same block whatever their order", () => {
    const source = "<p>One</p>";
    const a = editByText(source, "One", "A");
    const b = editByText(source, "One", "B");
    for (const order of [
      [a, b],
      [b, a],
    ]) {
      const result = applyHtmlEdits(source, order);
      expect(result.output).toBe(source);
      expect(result.refused.map((r) => r.reason)).toEqual(["duplicate-edit", "duplicate-edit"]);
    }
  });

  it("ignores malformed edit objects", () => {
    const result = applyHtmlEdits("<p>x</p>", [null, { id: "0", html: 1 }]);
    expect(result.output).toBe("<p>x</p>");
    expect(result.refused.every((r) => r.reason === "invalid-edit")).toBe(true);
  });
});

describe("editOf helper", () => {
  it("builds an edit from a predicate", () => {
    const edit = editOf("<p>a</p>", (b) => b.tag === "p", "b");
    expect(edit).toMatchObject({ tag: "p", originalHtml: "a", html: "b" });
  });
});
