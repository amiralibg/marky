import { describe, expect, it } from "vitest";
import { notePreview } from "./notePreview";

describe("notePreview", () => {
  it("returns an empty string for an empty note", () => {
    expect(notePreview("")).toBe("");
    expect(notePreview(null)).toBe("");
    expect(notePreview("   \n\n  ")).toBe("");
  });

  it("drops frontmatter and previews the prose", () => {
    const doc = ["---", "title: Meeting", "tags: [a, b]", "---", "", "We agreed to ship."].join(
      "\n"
    );
    expect(notePreview(doc)).toBe("We agreed to ship.");
  });

  it("strips heading markers but keeps the words", () => {
    expect(notePreview("# Release plan\n\nShip on Friday.")).toBe("Release plan Ship on Friday.");
  });

  it("drops fenced code entirely", () => {
    const doc = ["Intro line.", "", "```js", "const secret = 1;", "```", "", "Outro line."].join(
      "\n"
    );
    const preview = notePreview(doc);
    expect(preview).toBe("Intro line. Outro line.");
    expect(preview).not.toContain("const");
  });

  it("drops an unterminated fence rather than dumping its source", () => {
    expect(notePreview("Intro.\n\n```js\nconst a = 1;")).toBe("Intro.");
  });

  it("keeps link text and drops the target", () => {
    expect(notePreview("See [the docs](https://example.com/very/long) for more.")).toBe(
      "See the docs for more."
    );
  });

  it("uses a wikilink's alias when it has one", () => {
    expect(notePreview("Refer to [[Project Alpha|the project]] today.")).toBe(
      "Refer to the project today."
    );
    expect(notePreview("Refer to [[Project Alpha]] today.")).toBe("Refer to Project Alpha today.");
  });

  it("removes images without leaving their alt text", () => {
    expect(notePreview("![a diagram](/img/x.png) Body text.")).toBe("Body text.");
  });

  it("unwraps inline emphasis and code", () => {
    expect(notePreview("A **bold** and *italic* and `code` and ~~gone~~ word.")).toBe(
      "A bold and italic and code and gone word."
    );
  });

  it("flattens lists, tasks and quotes", () => {
    const doc = ["- [ ] first task", "- second item", "1. numbered", "> quoted line"].join("\n");
    expect(notePreview(doc)).toBe("first task second item numbered quoted line");
  });

  it("previews a table as its cell text", () => {
    const doc = ["| Col | Val |", "| --- | --- |", "| a   | 1   |"].join("\n");
    expect(notePreview(doc)).toBe("Col Val a 1");
  });

  it("drops horizontal rules", () => {
    expect(notePreview("Above.\n\n---\n\nBelow.")).toBe("Above. Below.");
  });

  it("preserves right-to-left text unchanged", () => {
    expect(notePreview("# سلام دنیا\n\nاین یک یادداشت است.")).toBe("سلام دنیا این یک یادداشت است.");
  });

  it("truncates at a word boundary with an ellipsis", () => {
    const doc = "alpha bravo charlie delta echo foxtrot golf hotel india juliet";
    const preview = notePreview(doc, 20);

    expect(preview.length).toBeLessThanOrEqual(21); // 20 + the ellipsis
    expect(preview.endsWith("…")).toBe(true);
    expect(preview).not.toContain("  ");
    // Cut between words, not mid-word.
    expect(doc.startsWith(preview.slice(0, -1))).toBe(true);
  });

  it("does not truncate when the note already fits", () => {
    expect(notePreview("Short enough.", 100)).toBe("Short enough.");
  });

  it("falls back to a hard cut when there is no nearby word boundary", () => {
    const preview = notePreview("Supercalifragilisticexpialidocious", 10);
    expect(preview).toBe("Supercalif…");
  });
});
