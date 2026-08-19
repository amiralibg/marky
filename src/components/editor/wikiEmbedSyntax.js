import { tags } from "@lezer/highlight";

const EXCLAMATION = 33;

/**
 * A lezer inline parser for Obsidian's embed syntax, `![[target]]`.
 *
 * The markdown grammar has no idea what this is: it sees a `!` followed by an
 * image that never completes, and hands back a run of plain text. Live preview
 * walks the syntax tree, so without a node of its own an embed had nothing to
 * hang a rendered image on — and a vault imported from Obsidian, where embeds
 * are how images are written, showed its pictures as raw source.
 *
 * Registered before `Image` so the built-in parser never gets to claim the `![`.
 */
export const wikiEmbedSyntax = {
  defineNodes: [{ name: "WikiEmbed", style: tags.link }],
  parseInline: [
    {
      name: "WikiEmbed",
      before: "Image",
      parse(cx, next, pos) {
        if (next !== EXCLAMATION) return -1;
        if (pos + 3 > cx.end) return -1;
        if (cx.slice(pos, pos + 3) !== "![[") return -1;

        const rest = cx.slice(pos + 3, cx.end);
        const close = rest.indexOf("]]");
        if (close < 0) return -1;

        // An embed target never spans lines, and treating one that appears to
        // as an embed would swallow the rest of the paragraph.
        const target = rest.slice(0, close);
        if (!target.trim() || target.includes("\n")) return -1;

        return cx.addElement(cx.elt("WikiEmbed", pos, pos + 3 + close + 2));
      },
    },
  ],
};
