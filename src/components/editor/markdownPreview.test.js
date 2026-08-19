import { beforeEach, describe, expect, it } from "vitest";
import { renderMarkdownPreview } from "./markdownPreview";
import {
  buildImageMarkdown,
  setAttachmentContext,
  setAttachmentIndex,
} from "../../utils/attachments";

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

// A vault imported from Obsidian writes its images as file paths, which a
// webview served from `tauri://localhost` cannot load. Every one of these used
// to render as a broken icon.
describe("images", () => {
  const VAULT = "/Vault";

  beforeEach(() => {
    setAttachmentContext({ notePath: `${VAULT}/Notes/Trip.md`, vaultRoot: VAULT });
    setAttachmentIndex(
      [{ path: `${VAULT}/attachments/shot.png` }, { path: `${VAULT}/Notes/beside.png` }],
      VAULT
    );
  });

  it("resolves a note-relative markdown image to a real file", () => {
    const html = renderMarkdownPreview("![A shot](beside.png)");
    expect(html).toContain("/Vault/Notes/beside.png");
    expect(html).toContain('alt="A shot"');
  });

  it("resolves an Obsidian embed by name alone", () => {
    const html = renderMarkdownPreview("![[shot.png]]");
    expect(html).toContain("<img ");
    expect(html).toContain("/Vault/attachments/shot.png");
  });

  it("applies an embed's width", () => {
    expect(renderMarkdownPreview("![[shot.png|300]]")).toContain('width="300"');
  });

  it("leaves an embed of a non-image as a link", () => {
    const html = renderMarkdownPreview("![[Some Note]]");
    expect(html).not.toContain("<img ");
    expect(html).toContain('data-wikilink-target="Some Note"');
  });

  it("leaves remote and data URLs alone", () => {
    expect(renderMarkdownPreview("![](https://example.com/a.png)")).toContain(
      'src="https://example.com/a.png"'
    );
  });

  it("refuses a script URL", () => {
    expect(renderMarkdownPreview("![bad](javascript:alert(1))")).not.toContain("<img ");
  });

  // The end-to-end shape of the bug: a screenshot dragged in from macOS wrote a
  // link whose narrow no-break space ended the URL, so the parser never saw an
  // image at all and the note showed the markdown source as text.
  it("renders a link to a macOS screenshot as an image, not as text", () => {
    const file = "Screenshot 2026-08-18 at 9.55.54\u202fPM.png";
    setAttachmentIndex([{ path: `${VAULT}/attachments/${file}` }], VAULT);

    const link = buildImageMarkdown(`${VAULT}/attachments/${file}`, `${VAULT}/Notes/Trip.md`, "");
    const html = renderMarkdownPreview(link);

    expect(html).toContain("<img ");
    expect(html).toContain("%E2%80%AF");
    // Nothing of the source markup survives into the output.
    expect(html).not.toContain("](");
  });

  // The other half of the same fact: leave that character raw and the parser
  // gives up on the link, which is exactly what the note used to show.
  it("cannot parse the same link when the space is left raw", () => {
    const raw = "![](attachments/Screenshot 9.55.54\u202fPM.png)";
    expect(renderMarkdownPreview(raw)).not.toContain("<img ");
  });
});
