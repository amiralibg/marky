/**
 * Visible text of an HTML document, for word counts, search and excerpts.
 *
 * Deliberately not a DOM parse: this runs over every HTML file in a vault on
 * load and on every search, and a 2 MB generated report would stall the UI if
 * it went through DOMParser each time. A few linear regex passes are enough to
 * answer "what words does a reader see": the parts a reader never sees (head,
 * scripts, styles, templates, comments) are cut first, then tags, then the
 * common entities are decoded.
 */

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  copy: "©",
  reg: "®",
  trade: "™",
  middot: "·",
  bull: "•",
  laquo: "«",
  raquo: "»",
  times: "×",
  euro: "€",
};

export const decodeEntities = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, body) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1));
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });

// Block-level tags whose boundaries are word boundaries: `<p>a</p><p>b</p>`
// reads as two words, not "ab".
const BLOCK_BOUNDARY =
  /<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|td|th|table|section|article|header|footer|nav|aside|main|blockquote|pre|figure|figcaption|dt|dd|dl|hr|form|fieldset|legend|caption|summary|details|button|label|option)\b[^>]*>/gi;

/**
 * The text a reader of the rendered page would see, whitespace-collapsed.
 * @param {string} html
 * @returns {string}
 */
export function extractHtmlText(html) {
  if (!html || typeof html !== "string") return "";
  let text = html
    .replace(/<!--[\s\S]*?(?:-->|$)/g, " ")
    .replace(/<head\b[\s\S]*?(?:<\/head\s*>|(?=<body\b))/gi, " ")
    .replace(
      /<(script|style|template|noscript|svg|math|textarea|select)\b[\s\S]*?(?:<\/\1\s*>|$)/gi,
      " "
    )
    // A `<title>` outside a head (no `<head>` tag written) is still not body text.
    .replace(/<title\b[\s\S]*?(?:<\/title\s*>|$)/gi, " ")
    .replace(BLOCK_BOUNDARY, " ")
    .replace(/<[^>]*>/g, "");
  text = decodeEntities(text);
  return text.replace(/\s+/g, " ").trim();
}

/** Words in the rendered page, counted the way the markdown status bar counts. */
export const countHtmlWords = (html) => {
  const text = extractHtmlText(html);
  return text ? text.split(" ").length : 0;
};

/** The document's `<title>`, decoded, or "" when it has none. */
export function extractHtmlTitle(html) {
  if (!html) return "";
  const match = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  return match ? decodeEntities(match[1]).replace(/\s+/g, " ").trim() : "";
}
