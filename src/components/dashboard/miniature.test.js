import { describe, expect, it, vi } from "vitest";
import { peekMiniature, renderMiniature, scrubMiniatureHtml } from "./miniature";
import { renderMarkdownMiniature, renderMarkdownPreview } from "../editor/markdownPreview";

describe("renderMarkdownMiniature", () => {
  it("leaves code plain: no highlighting, no copy button", () => {
    const html = renderMarkdownMiniature("```js\nconst a = 1;\n```");
    expect(html).toContain("<pre><code>const a = 1;</code></pre>");
    expect(html).not.toContain("hljs");
    expect(html).not.toContain("code-copy-btn");
  });

  it("swaps images and mermaid for placeholders", () => {
    const html = renderMarkdownMiniature(
      "![chart](https://example.com/c.png)\n\n```mermaid\ngraph TD; A-->B\n```"
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain('class="mermaid"');
    expect(html.match(/mini-media/g)).toHaveLength(2);
  });

  it("shows math as text instead of running KaTeX", () => {
    const html = renderMarkdownMiniature("Energy $E = mc^2$ here\n\n$$\nx^2\n$$");
    expect(html).not.toContain("katex");
    expect(html).toContain('<span class="mini-math">E = mc^2</span>');
    expect(html).toContain('<span class="mini-math">x^2</span>');
  });

  it("leaves Read mode exactly as it was afterwards", () => {
    renderMarkdownMiniature("```js\nconst a = 1;\n```");
    const read = renderMarkdownPreview("```js\nconst a = 1;\n```\n\n$x$\n\n![a](b.png)");
    expect(read).toContain("hljs");
    expect(read).toContain("katex");
    expect(read).toContain("<img");
  });
});

describe("scrubMiniatureHtml", () => {
  it("removes scripts, handlers, links, ids and media", () => {
    const html = scrubMiniatureHtml(
      '<h1 id="t">T</h1><a href="https://x.test" onclick="evil()">x</a>' +
        '<img src="https://x.test/a.png" onerror="evil()"><script>evil()</script>' +
        '<iframe src="https://x.test"></iframe><p style="background:url(https://x.test)">p</p>'
    );
    expect(html).not.toMatch(/id=|href=|src=|onclick|onerror|<script|<iframe|<img|url\(/);
    expect(html).toContain('<span class="mini-media"></span>');
    expect(html).toContain("<h1>T</h1>");
  });

  it("keeps task checkboxes, disabled, and drops other inputs", () => {
    const html = scrubMiniatureHtml('<input type="checkbox" checked><input type="text">');
    expect(html).toBe('<input type="checkbox" checked="" disabled="">');
  });
});

describe("renderMiniature", () => {
  it("renders a note once per version", () => {
    const note = { id: "n1", updatedAt: "2026-01-01", content: "# Hello\n\nWorld" };
    expect(peekMiniature(note)).toBeUndefined();
    const first = renderMiniature(note);
    expect(first).toContain("<h1");
    expect(first).not.toContain("id=");
    expect(peekMiniature(note)).toBe(first);

    const edited = { ...note, updatedAt: "2026-01-02", content: "# Hello again" };
    expect(peekMiniature(edited)).toBeUndefined();
    expect(renderMiniature(edited)).toContain("Hello again");
  });

  it("returns empty HTML rather than throwing on a renderer failure", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = { id: "n2", updatedAt: "x", content: { notAString: true } };
    expect(typeof renderMiniature(broken)).toBe("string");
    spy.mockRestore();
  });
});
