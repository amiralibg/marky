import { describe, expect, it } from "vitest";
import { renderMarkdownPreview } from "./markdownPreview";

const withFootnote = `# Title\n\nBody text.[^1]\n\n[^1]: The note.\n`;
const withoutFootnote = `# Plain\n\nNothing to reference here.\n`;

describe("renderMarkdownPreview", () => {
  it("puts the footnote section after the body, not above the title", () => {
    const html = renderMarkdownPreview(withFootnote);
    expect(html.indexOf("<h1")).toBeLessThan(html.indexOf("data-footnotes"));
    expect(html).toContain('<li id="footnote-1">');
  });

  // marked-footnote latches a per-document flag while lexing and clears it from
  // its `walkTokens` hook — a hook `marked.parse()` runs and `lexer` + `parser`
  // do not. Left latched, the next document never got its footnotes token
  // seeded, and the reference tokenizer threw reading `lexer.tokens[0]`: a note
  // with footnotes rendered once and failed every time after.
  it("renders a note with footnotes the same way every time", () => {
    const first = renderMarkdownPreview(withFootnote);

    renderMarkdownPreview(withoutFootnote);
    expect(renderMarkdownPreview(withFootnote)).toBe(first);

    renderMarkdownPreview(withFootnote);
    expect(renderMarkdownPreview(withFootnote)).toBe(first);
  });

  it("renders the blocks the renderer overrides", () => {
    const html = renderMarkdownPreview(
      ["> Quoted.", "", "$$x^2$$", "", "```js", "const a = 1;", "```"].join("\n")
    );
    expect(html).toContain("<blockquote dir=");
    expect(html).toContain("katex");
    expect(html).toContain('class="hljs language-js"');
  });

  it("still resolves wiki links while walking tokens", () => {
    expect(renderMarkdownPreview("See [[Some Note]].")).toContain(
      'data-wikilink-target="Some Note"'
    );
  });
});
