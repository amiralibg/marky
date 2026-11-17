/**
 * Where each editable block of an HTML document lives in its source.
 *
 * Edit mode lets the user type on the rendered page, but what gets saved is
 * the file, and the file must change only where the user typed. So every block
 * the page offers for editing is tied, here, to the exact characters of its
 * element in the source: the start tag, the inner range (end of the start tag
 * to the start of the end tag, or to where the element implicitly ends when
 * the end tag is omitted) and the whole element range.
 *
 * Pure: parse5 and string offsets, no DOM and no React, so it runs in vitest
 * exactly as it runs in the app.
 *
 * Offsets index the source string as read from disk, BOM included. parse5
 * counts a CRLF as the two characters it is, so CRLF files need no special
 * casing; a leading BOM is stripped before parsing (parse5 would otherwise
 * read it as body text) and added back to every offset.
 *
 * A block is only offered when its mapping is *sound*: everything the parser
 * placed inside the element came from inside the element's source range, and
 * nothing that lies inside that range was moved elsewhere. The parser moves
 * content around for misnested formatting (the adoption agency algorithm
 * clones a `<b>` into the next paragraph), stray table content (foster
 * parenting) and implied elements (`<tbody>`, `<html>`); a block touched by
 * any of that has no single source range that means "this element's
 * children", so it is marked unsound and Edit refuses it rather than guess.
 */
import { parse, serialize } from "parse5";

/** Elements that hold a run of text and are edited as one block. */
export const TEXT_BLOCK_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "td",
  "th",
  "blockquote",
  "figcaption",
  "dt",
  "dd",
  "summary",
  "caption",
]);

/**
 * Generic containers that are editable when they hold only inline content and
 * some text — a `<div class="lead">Some words</div>`, not a layout wrapper.
 */
export const INLINE_CONTAINER_TAGS = new Set([
  "div",
  "section",
  "article",
  "aside",
  "header",
  "footer",
  "main",
  "address",
  "center",
  "legend",
]);

/** Inline (phrasing) elements a block may contain and still be edited as text. */
export const PHRASING_TAGS = new Set([
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "big",
  "br",
  "cite",
  "code",
  "data",
  "del",
  "dfn",
  "em",
  "font",
  "i",
  "img",
  "ins",
  "kbd",
  "label",
  "mark",
  "nobr",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "small",
  "span",
  "strike",
  "strong",
  "sub",
  "sup",
  "time",
  "tt",
  "u",
  "var",
  "wbr",
]);

/** Tags a block style change may move between. */
export const BLOCK_STYLE_TAGS = ["p", "h1", "h2", "h3", "h4", "h5", "h6"];

const BOM = "﻿";

const isElement = (node) => Boolean(node && node.tagName);
const isText = (node) => node?.nodeName === "#text";

/**
 * True when every descendant of `node` is phrasing content (text, comments,
 * inline elements). A list item may also carry nested lists: its own text is
 * still a block of its own, and the nested items are blocks too.
 */
const holdsOnlyInline = (node, allowNestedLists) => {
  for (const child of node.childNodes || []) {
    if (!isElement(child)) continue;
    const tag = child.tagName;
    if (allowNestedLists && (tag === "ul" || tag === "ol")) continue;
    if (!PHRASING_TAGS.has(tag)) return false;
    if (child.namespaceURI && child.namespaceURI !== "http://www.w3.org/1999/xhtml") return false;
    if (!holdsOnlyInline(child, false)) return false;
  }
  return true;
};

const hasVisibleText = (node) => {
  for (const child of node.childNodes || []) {
    if (isText(child) && child.value.trim()) return true;
    if (isElement(child) && hasVisibleText(child)) return true;
  }
  return false;
};

/** The kind of block this element is, or null when it is not one. */
const blockKindOf = (node) => {
  const tag = node.tagName;
  if (node.namespaceURI !== "http://www.w3.org/1999/xhtml") return null;
  if (TEXT_BLOCK_TAGS.has(tag)) {
    return holdsOnlyInline(node, tag === "li") ? "text" : null;
  }
  if (INLINE_CONTAINER_TAGS.has(tag)) {
    return holdsOnlyInline(node, false) && hasVisibleText(node) ? "inline" : null;
  }
  return null;
};

const lowerBound = (sorted, value) => {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

const upperBound = (sorted, value) => {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

/**
 * Every node under `node` must carry a location inside [from, to]. A node
 * without one was invented by the parser; a node located outside was moved in
 * from elsewhere (or cloned from an earlier token).
 */
const descendantsWithin = (node, from, to) => {
  for (const child of node.childNodes || []) {
    const loc = child.sourceCodeLocation;
    if (!loc) return false;
    if (loc.startOffset < from || loc.endOffset > to) return false;
    if (isElement(child) && !descendantsWithin(child, from, to)) return false;
  }
  return true;
};

/**
 * @typedef {object} HtmlBlock
 * @property {number} id            Start offset of the element in the source; stable for one source.
 * @property {string} tag           Lower-case tag name.
 * @property {"text"|"inline"} kind
 * @property {number} start         Element start (the `<` of the start tag).
 * @property {number} end           Element end: after the end tag, or where it implicitly ends.
 * @property {number} startTagEnd   After the start tag's `>`.
 * @property {number} innerStart    Same as startTagEnd.
 * @property {number} innerEnd      Start of the end tag, or `end` when the end tag is omitted.
 * @property {boolean} hasEndTag
 * @property {string} attrsSource   The start tag's attributes exactly as written ("" for none).
 * @property {boolean} sound        Whether edits to this block can be saved.
 * @property {string|null} reason   Why not, when unsound.
 * @property {number} depth         Nesting depth among blocks (0 = outermost).
 */

/**
 * Parse `source` and map its editable blocks.
 * @param {string} source
 * @returns {{ source: string, bom: number, blocks: HtmlBlock[], byId: Map<number, HtmlBlock>, nodeOf: (id: number) => object|null, serializeInner: (id: number) => string|null }}
 */
export function buildSourceMap(source) {
  const text = typeof source === "string" ? source : "";
  const bom = text.startsWith(BOM) ? 1 : 0;
  const body = bom ? text.slice(1) : text;
  const document = parse(body, { sourceCodeLocationInfo: true });

  const intervalStarts = [];
  const intervalEnds = [];
  const candidates = [];

  // One walk: collect every located element's interval (for the foster check
  // below) and every candidate block with its located-ancestor count.
  const walk = (node, locatedAncestors, blockDepth, inForeignOrInert) => {
    for (const child of node.childNodes || []) {
      if (!isElement(child)) continue;
      const loc = child.sourceCodeLocation;
      if (loc) {
        intervalStarts.push(loc.startOffset);
        intervalEnds.push(loc.endOffset);
      }
      const inert =
        inForeignOrInert ||
        child.tagName === "template" ||
        child.tagName === "head" ||
        child.namespaceURI !== "http://www.w3.org/1999/xhtml";
      const kind = inert ? null : blockKindOf(child);
      if (kind) candidates.push({ node: child, kind, locatedAncestors, depth: blockDepth });
      walk(
        child.tagName === "template" && child.content ? child.content : child,
        locatedAncestors + (loc ? 1 : 0),
        blockDepth + (kind ? 1 : 0),
        inert
      );
    }
  };
  walk(document, 0, 0, false);

  intervalStarts.sort((a, b) => a - b);
  intervalEnds.sort((a, b) => a - b);

  const blocks = [];
  const nodes = new Map();

  for (const { node, kind, locatedAncestors, depth } of candidates) {
    const loc = node.sourceCodeLocation;
    const tag = node.tagName;
    if (!loc || !loc.startTag) continue;

    const start = loc.startOffset;
    const end = loc.endOffset;
    const startTagEnd = loc.startTag.endOffset;
    const hasEndTag = Boolean(loc.endTag);
    const innerEnd = hasEndTag ? loc.endTag.startOffset : end;

    let reason = null;

    // Foster parenting and friends: the located elements whose range strictly
    // contains this one's start are exactly its located ancestors in a tree
    // that kept source order. Any extra one is an element that is not an
    // ancestor yet surrounds it in the source — the parser moved this block
    // out of it.
    const containing = lowerBound(intervalStarts, start) - upperBound(intervalEnds, start);
    if (containing !== locatedAncestors) reason = "moved-by-parser";
    else if (!descendantsWithin(node, startTagEnd, innerEnd)) reason = "misnested";
    else if (innerEnd < startTagEnd) reason = "misnested";

    const attrs = loc.startTag.attrs ? Object.values(loc.startTag.attrs) : [];
    const attrsSource =
      attrs.length > 0
        ? body.slice(
            Math.min(...attrs.map((a) => a.startOffset)),
            Math.max(...attrs.map((a) => a.endOffset))
          )
        : "";

    const block = {
      id: start + bom,
      tag,
      kind,
      start: start + bom,
      end: end + bom,
      startTagEnd: startTagEnd + bom,
      innerStart: startTagEnd + bom,
      innerEnd: innerEnd + bom,
      hasEndTag,
      attrsSource,
      sound: reason === null,
      reason,
      depth,
    };
    blocks.push(block);
    nodes.set(block.id, node);
  }

  blocks.sort((a, b) => a.start - b.start);
  const byId = new Map(blocks.map((block) => [block.id, block]));

  return {
    source: text,
    bom,
    blocks,
    byId,
    document,
    nodeOf: (id) => nodes.get(id) || null,
    // The block's children as the HTML serialisation algorithm writes them —
    // the same algorithm a browser's `innerHTML` getter runs, so this is what
    // the edit frame reports for the untouched block.
    serializeInner: (id) => {
      const node = nodes.get(id);
      return node ? serialize(node) : null;
    },
  };
}

/** The source text of a block's inner range. */
export const innerSourceOf = (map, block) => map.source.slice(block.innerStart, block.innerEnd);
