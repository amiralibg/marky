import { describe, expect, it } from "vitest";
import { countHtmlWords, decodeEntities, extractHtmlText, extractHtmlTitle } from "./htmlText";

describe("extractHtmlText", () => {
  it("keeps what a reader sees and drops what they don't", () => {
    const html = `<!doctype html><html><head><title>Hidden title</title>
      <style>p { color: red }</style><script>var secret = "no";</script></head>
      <body><h1>Q3 in numbers</h1><!-- a comment --><p>Downloads <b>grew</b>.</p>
      <template><p>template text</p></template><noscript>enable js</noscript>
      <svg><text>chart label</text></svg></body></html>`;
    expect(extractHtmlText(html)).toBe("Q3 in numbers Downloads grew.");
  });

  it("treats block boundaries as word boundaries", () => {
    expect(extractHtmlText("<p>one</p><p>two</p><li>three</li>")).toBe("one two three");
    expect(extractHtmlText("a<br>b")).toBe("a b");
    expect(extractHtmlText("in<b>line</b>")).toBe("inline");
  });

  it("decodes entities", () => {
    expect(extractHtmlText("<p>Fish &amp; chips &mdash; &#8212; &#x2014; &nbsp;x</p>")).toBe(
      "Fish & chips — — — x"
    );
    expect(decodeEntities("&unknown; &#0; &#xFFFFFFF;")).toBe("&unknown; &#0; &#xFFFFFFF;");
  });

  it("handles documents without head or body, and unclosed blocks", () => {
    expect(extractHtmlText("<title>T</title><p>Body text")).toBe("Body text");
    expect(extractHtmlText("<script>never closed")).toBe("");
    expect(extractHtmlText("")).toBe("");
    expect(extractHtmlText(null)).toBe("");
  });
});

describe("countHtmlWords", () => {
  it("counts visible words", () => {
    expect(countHtmlWords("<h1>Two words</h1><p>and three more</p><script>x y z</script>")).toBe(5);
    expect(countHtmlWords("<p></p>")).toBe(0);
  });
});

describe("extractHtmlTitle", () => {
  it("reads and decodes the title", () => {
    expect(extractHtmlTitle("<title> Q3 &amp; Q4\n report </title>")).toBe("Q3 & Q4 report");
    expect(extractHtmlTitle("<p>no title</p>")).toBe("");
    expect(extractHtmlTitle("")).toBe("");
  });
});
