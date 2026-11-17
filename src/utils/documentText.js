/**
 * The words a document holds, whatever its kind: a note's markdown as it is,
 * an HTML document's visible text (see htmlText.js) — never its tags,
 * scripts or styles. Search, the command palette, Home's word count and
 * excerpts all read documents through here, so an HTML report is found by
 * what it says and not by `class="kpi"`.
 */
import { isHtmlDocument } from "./documentKind";
import { countHtmlWords, extractHtmlText } from "./htmlText";
import { notePreview } from "./notePreview";
import { countWords } from "./workspaceStats";

// Extraction is a few regex passes over the whole file; cache it per version
// of each document so typing in one does not re-scan the vault.
const CACHE_LIMIT = 2000;
const cache = new Map();

const keyOf = (item) =>
  `${item.id}\u0000${item.updatedAt || ""}\u0000${item.content?.length ?? -1}`;

export const documentText = (item) => {
  if (!item) return "";
  const content = item.content || "";
  if (!isHtmlDocument(item)) return content;
  const key = keyOf(item);
  const hit = cache.get(key);
  if (hit !== undefined && hit.content === content) return hit.text;
  const text = extractHtmlText(content);
  cache.set(key, { content, text });
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return text;
};

/** Word count, counted the way each kind's status bar counts. */
export const documentWordCount = (item) =>
  isHtmlDocument(item) ? countHtmlWords(item?.content || "") : countWords(item?.content || "");

/** A short plain-text excerpt for previews and tooltips. */
export const documentExcerpt = (item, limit = 180) => {
  if (!item) return "";
  if (!isHtmlDocument(item)) return notePreview(item.content, limit);
  const text = documentText(item);
  if (text.length <= limit) return text;
  // Cut at a word boundary: drop the last word only when the limit split it.
  const head = text.slice(0, limit);
  const cut = /\s/.test(text[limit]) ? head : head.replace(/\s+\S*$/, "");
  return `${cut.trimEnd()}…`;
};
