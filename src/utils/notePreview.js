import { parseFrontmatter } from "./frontmatter";

/**
 * A short plain-text excerpt of a note, for cards and result rows.
 *
 * Markdown syntax is stripped rather than rendered: at preview size the markers
 * are noise, and a half-rendered heading or an image's alt text reads worse than
 * the prose around it. Frontmatter and fenced code are dropped entirely — a note
 * that opens with a YAML block or a code fence should still preview as writing.
 *
 * @param {string} markdown
 * @param {number} [limit] Maximum characters to return
 * @returns {string} Plain text, whitespace collapsed, or "" for an empty note
 */
export const notePreview = (markdown, limit = 180) => {
  if (!markdown) return "";

  let text = parseFrontmatter(markdown).body;

  text = text
    // Fenced code and its contents.
    .replace(/^[ \t]*(`{3,}|~{3,})[\s\S]*?^[ \t]*\1[ \t]*$/gm, " ")
    // An unterminated fence at the end of the note.
    .replace(/^[ \t]*(`{3,}|~{3,})[\s\S]*$/m, " ")
    // Images first, so their alt text doesn't survive as link text below.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    // Links and wikilinks keep their visible label.
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_, target, alias) => alias || target)
    // HTML tags.
    .replace(/<[^>]+>/g, " ")
    // Leading block markers: headings, quotes, list bullets, task boxes.
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*>[ \t]?/gm, "")
    .replace(/^[ \t]*[-*+][ \t]+\[[ xX]\][ \t]*/gm, "")
    .replace(/^[ \t]*[-*+][ \t]+/gm, "")
    .replace(/^[ \t]*\d+[.)][ \t]+/gm, "")
    // Thematic breaks and setext underlines.
    .replace(/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, " ")
    .replace(/^[ \t]*=+[ \t]*$/gm, " ")
    // Inline emphasis, inline code, strikethrough, highlights.
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*\*|___)(.*?)\1/g, "$2")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/==(.*?)==/g, "$1")
    // Table pipes, so a table previews as its cell text.
    .replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm, " ")
    .replace(/\|/g, " ");

  // Collapse every run of whitespace, including the newlines the strips left.
  text = text.replace(/\s+/g, " ").trim();

  if (text.length <= limit) return text;
  // Prefer a word boundary, but never cut so far back that little is left.
  const clipped = text.slice(0, limit);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${(lastSpace > limit * 0.6 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
};
