import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { wikiEmbedSyntax } from "./wikiEmbedSyntax";

// The node names the parser produces for a document, in document order.
const nodesIn = (doc) => {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage, extensions: [wikiEmbedSyntax] })],
  });
  const names = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      names.push({ name: node.name, from: node.from, to: node.to });
    },
  });
  return names;
};

const embedsIn = (doc) => nodesIn(doc).filter((node) => node.name === "WikiEmbed");

describe("wikiEmbedSyntax", () => {
  it("gives an Obsidian embed a node of its own", () => {
    const doc = "Look: ![[shot.png]] there.";
    expect(embedsIn(doc)).toEqual([{ name: "WikiEmbed", from: 6, to: 19 }]);
  });

  it("covers the sizing suffix as part of the embed", () => {
    const doc = "![[shot.png|300]]";
    expect(embedsIn(doc)).toEqual([{ name: "WikiEmbed", from: 0, to: 17 }]);
  });

  it("leaves an ordinary markdown image to the base grammar", () => {
    const names = nodesIn("![alt](a.png)").map((node) => node.name);
    expect(names).toContain("Image");
    expect(names).not.toContain("WikiEmbed");
  });

  it("leaves a plain wiki link alone", () => {
    expect(embedsIn("See [[Some Note]].")).toEqual([]);
  });

  it("does not run past an unclosed embed", () => {
    expect(embedsIn("![[unclosed")).toEqual([]);
  });

  it("does not swallow a following line when the brackets never close", () => {
    expect(embedsIn("![[open\nnext line]]")).toEqual([]);
  });
});
