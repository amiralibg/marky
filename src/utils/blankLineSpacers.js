/**
 * Turn the blank lines an author typed into explicit spacer tokens.
 *
 * The preview sheet lets blank lines own the vertical rhythm: one authored blank
 * line renders as one line of space (see MarkdownPreview.css). That works only
 * if every blank line actually reaches the renderer.
 *
 * Most arrive as marked `space` tokens. Some do not: several block tokenizers
 * swallow the blank line that follows them into their own `raw`. A table
 * followed by a list is the case that surfaced — `table.raw` ends with "\n\n"
 * and no `space` token is emitted between them, so Read mode drew a full gap
 * above the table and almost none below, while Live mode (real editor lines)
 * stayed even.
 *
 * A block's `raw` ends with one newline for its own final line; every newline
 * beyond that is a blank line the author typed and we owe a spacer for.
 *
 * @param {Array<{type: string, raw?: string}>} tokens marked lexer output
 * @returns {Array} the same tokens with `markdown-blank-lines` html tokens added
 */
export const insertBlankLineSpacers = (tokens = []) => {
  const spacer = (blankLineCount, raw = "") => ({
    type: "html",
    raw,
    text: `<div class="markdown-blank-lines" style="--blank-lines: ${blankLineCount}" aria-hidden="true"></div>`,
    pre: false,
    block: true,
  });

  return tokens.flatMap((token) => {
    if (token.type === "space") {
      const newlineCount = (token.raw?.match(/\n/g) || []).length;
      return spacer(Math.max(1, newlineCount - 1), token.raw);
    }

    const trailingNewlines = (token.raw?.match(/\n*$/)?.[0] || "").length;
    const swallowed = Math.max(0, trailingNewlines - 1);
    return swallowed > 0 ? [token, spacer(swallowed)] : token;
  });
};
