/**
 * Write in-place edits of an HTML document back into its source, surgically.
 *
 * Each edit names a block by its id from `buildSourceMap` (its start offset in
 * the source the edit frame was built from) and carries what the frame saw:
 * the block's tag, its children's HTML before the user touched it, and its
 * children's HTML now. Applying an edit replaces only that block's inner
 * range — or, when the block's tag changed (a paragraph made a heading), the
 * whole element — with the new HTML. Every other character of the file stays
 * exactly as it was.
 *
 * Nothing here guesses. An edit is refused, and the file left as it was for
 * that block, when:
 *   - the block is not in the map, or its mapping is unsound (see
 *     htmlSourceMap.js — content the parser moved, cloned or invented);
 *   - the element at that offset is not the one the user edited: a different
 *     tag, or children that no longer serialise to what the frame saw before
 *     the edit (the file changed underneath, or the page was altered by
 *     something other than the user);
 *   - the patched file, parsed again, does not give back that block with
 *     exactly the new content (the new HTML would have restructured the page).
 *
 * Order never matters: edits are applied by position, from the end of the
 * file backwards, so earlier offsets stay valid. When one edited block
 * contains another, the outer edit wins — its HTML already includes the
 * inner block as it is now — and the inner one is not applied twice.
 *
 * Pure (parse5 and strings), like the source map.
 */
import { defaultTreeAdapter, parse, parseFragment, serialize } from "parse5";
import { buildSourceMap, BLOCK_STYLE_TAGS } from "./htmlSourceMap";

const HTML_NS = "http://www.w3.org/1999/xhtml";

/**
 * @typedef {object} HtmlEdit
 * @property {number} id             Block id from the source map.
 * @property {string} tag            The block's tag as the frame saw it before the edit.
 * @property {string} [newTag]       Set when the block style changed (p → h2 …).
 * @property {string} originalHtml   The block's children before the edit (innerHTML).
 * @property {string} html           The block's children now (innerHTML).
 */

/**
 * @typedef {object} PatchResult
 * @property {string} output                         The patched source.
 * @property {number[]} applied                      Ids of edits written into `output`.
 * @property {{ id: number, reason: string }[]} refused
 * @property {number[]} superseded                   Ids skipped because an enclosing edit carries them.
 */

const MAX_HTML_LENGTH = 4 * 1024 * 1024;

/** `html` parsed as the children of a `tag` element, the way the full parse would. */
const childrenAs = (html, tag) =>
  parseFragment(defaultTreeAdapter.createElement(tag, HTML_NS, []), html).childNodes;

const stripBom = (text) => (text.startsWith("\uFEFF") ? text.slice(1) : text);

/** The file's line ending, so a CRLF file does not grow LF lines inside a patch. */
const lineEndingOf = (source) => (/\r\n/.test(source) ? "\r\n" : "\n");

const withLineEndings = (html, eol) => (eol === "\n" ? html : html.replace(/\r?\n/g, eol));

const isEditShape = (edit) =>
  edit &&
  Number.isInteger(edit.id) &&
  typeof edit.tag === "string" &&
  typeof edit.html === "string" &&
  typeof edit.originalHtml === "string" &&
  edit.html.length <= MAX_HTML_LENGTH &&
  edit.originalHtml.length <= MAX_HTML_LENGTH &&
  (edit.newTag === undefined || edit.newTag === null || typeof edit.newTag === "string");

/** What the patch writes for one edit, and over which range. */
const replacementFor = (block, edit, eol) => {
  const html = withLineEndings(edit.html, eol);
  const newTag = edit.newTag && edit.newTag !== block.tag ? edit.newTag : null;
  if (!newTag) {
    return { from: block.innerStart, to: block.innerEnd, text: html, tag: block.tag };
  }
  // A style change rewrites the tag, so the whole element is replaced. The
  // start tag's attributes are carried over exactly as written; the end tag
  // is always written, because the new tag may not allow omitting it.
  const attrs = block.attrsSource ? ` ${block.attrsSource}` : "";
  return {
    from: block.start,
    to: block.end,
    text: `<${newTag}${attrs}>${html}</${newTag}>`,
    tag: newTag,
  };
};

/**
 * Check edits against the map and pick the ones to apply: sound, matching,
 * and not contained in another edit.
 */
const selectEdits = (map, edits, refused, superseded) => {
  const accepted = [];
  // One edit per block. Two different edits for the same block cannot be
  // ordered without guessing which is newer, so both are refused; identical
  // copies count once.
  const seen = new Map();
  for (const edit of edits) {
    if (!isEditShape(edit)) continue;
    const prior = seen.get(edit.id);
    if (prior === undefined) seen.set(edit.id, edit);
    else if (
      prior !== null &&
      (prior.html !== edit.html || prior.newTag !== edit.newTag || prior.tag !== edit.tag)
    ) {
      seen.set(edit.id, null);
    }
  }
  const emitted = new Set();
  for (const edit of edits) {
    if (isEditShape(edit)) {
      if (seen.get(edit.id) === null) {
        refused.push({ id: edit.id, reason: "duplicate-edit" });
        continue;
      }
      if (emitted.has(edit.id)) continue;
      emitted.add(edit.id);
    }
    if (!isEditShape(edit)) {
      refused.push({ id: edit?.id ?? -1, reason: "invalid-edit" });
      continue;
    }
    const block = map.byId.get(edit.id);
    if (!block) {
      refused.push({ id: edit.id, reason: "unknown-block" });
      continue;
    }
    if (!block.sound) {
      refused.push({ id: edit.id, reason: block.reason || "unsound" });
      continue;
    }
    if (block.tag !== edit.tag) {
      refused.push({ id: edit.id, reason: "tag-mismatch" });
      continue;
    }
    if (edit.newTag && edit.newTag !== block.tag) {
      if (!BLOCK_STYLE_TAGS.includes(edit.newTag) || !BLOCK_STYLE_TAGS.includes(block.tag)) {
        refused.push({ id: edit.id, reason: "unsupported-style" });
        continue;
      }
    }
    // The element at this offset must be the one the user edited: its
    // children, as they are in the file now, must be what the frame saw.
    const current = map.serializeInner(block.id);
    if (current !== edit.originalHtml) {
      refused.push({ id: edit.id, reason: "content-mismatch" });
      continue;
    }
    accepted.push({ edit, block });
  }

  // Outer wins: drop any edit whose element lies inside another accepted
  // edit's element. Sorted by start, an enclosing element always comes first.
  accepted.sort((a, b) => a.block.start - b.block.start || b.block.end - a.block.end);
  const kept = [];
  for (const entry of accepted) {
    const parent = kept.find(
      (outer) => entry.block.start >= outer.block.start && entry.block.end <= outer.block.end
    );
    if (parent) superseded.push(entry.edit.id);
    else kept.push(entry);
  }
  return kept;
};

/**
 * Splice the replacements into `source`. `entries` are sorted by start and
 * never overlap, so going from the end backwards keeps every offset valid.
 * Returns the output and, for each entry, where its element starts in it.
 */
const splice = (source, entries, eol) => {
  let output = source;
  const patches = entries.map(({ edit, block }) => ({
    edit,
    block,
    ...replacementFor(block, edit, eol),
  }));
  for (let i = patches.length - 1; i >= 0; i -= 1) {
    const patch = patches[i];
    output = output.slice(0, patch.from) + patch.text + output.slice(patch.to);
  }
  // Where each element now starts: shifted by every earlier patch's growth.
  let shift = 0;
  for (const patch of patches) {
    patch.newStart = patch.block.start + shift;
    shift += patch.text.length - (patch.to - patch.from);
  }
  return { output, patches };
};

/**
 * Apply `edits` to `source`.
 * @param {string} source
 * @param {HtmlEdit[]} edits
 * @param {ReturnType<typeof buildSourceMap>} [map]  The source's map, when already built.
 * @returns {PatchResult}
 */
export function applyHtmlEdits(source, edits, map = buildSourceMap(source)) {
  const refused = [];
  const superseded = [];
  const list = Array.isArray(edits) ? edits : [];
  // Edits whose HTML did not change are not edits: entering and leaving a
  // block without typing must never touch the file.
  const changed = list.filter(
    (edit) => !edit || edit.html !== edit.originalHtml || (edit.newTag && edit.newTag !== edit.tag)
  );
  let entries = selectEdits(map, changed, refused, superseded);
  const eol = lineEndingOf(source);

  // Verify by parsing the result: the patched file must parse to exactly the
  // original document with only the edited blocks changed. When it does not,
  // find the edits responsible by trying each on its own, refuse those, and
  // apply the rest together (which is verified again).
  const attempt = (chosen) => {
    const { output, patches } = splice(source, chosen, eol);
    return verifyPatch(source, output, patches, eol)
      ? { output, applied: patches.map((p) => p.edit.id) }
      : null;
  };

  if (entries.length > 0) {
    const all = attempt(entries);
    if (all) return { output: all.output, applied: all.applied, refused, superseded };
    entries = entries.filter((entry) => {
      if (attempt([entry])) return true;
      refused.push({ id: entry.edit.id, reason: "would-restructure" });
      return false;
    });
    if (entries.length > 0) {
      const rest = attempt(entries);
      if (rest) return { output: rest.output, applied: rest.applied, refused, superseded };
      for (const entry of entries) refused.push({ id: entry.edit.id, reason: "would-restructure" });
    }
  }

  return { output: source, applied: [], refused, superseded };
}

/**
 * Build what the patched file *should* parse to — the original tree with each
 * patched block's children (and, for a style change, its tag) swapped — and
 * compare it with what it does parse to. Serialising both makes the
 * comparison total: every element, attribute and text node in the document.
 */
const verifyPatch = (source, output, patches, eol) => {
  const expected = buildSourceMap(source);
  for (const patch of patches) {
    const node = expected.nodeOf(patch.block.id);
    if (!node) return false;
    const children = childrenAs(withLineEndings(patch.edit.html, eol), patch.tag);
    let target = node;
    if (patch.tag !== node.tagName) {
      target = defaultTreeAdapter.createElement(patch.tag, HTML_NS, node.attrs);
      const siblings = node.parentNode.childNodes;
      siblings[siblings.indexOf(node)] = target;
      target.parentNode = node.parentNode;
    }
    for (const child of children) child.parentNode = target;
    target.childNodes = children;
  }
  const actual = parse(stripBom(output));
  return serialize(actual) === serialize(expected.document);
};

/** A sentence for the user explaining why an edit could not be saved. */
export const describeRefusal = (reason) => {
  switch (reason) {
    case "moved-by-parser":
    case "misnested":
    case "unsound":
      return "This part of the page is rebuilt by the browser from markup that does not nest cleanly, so it can't be edited in place. Use Source to change it.";
    case "content-mismatch":
      return "The file changed on disk while you were editing, so this edit was not saved. Reload and try again.";
    case "tag-mismatch":
    case "unknown-block":
      return "This block no longer matches the file, so the edit was not saved. Reload and try again.";
    case "would-restructure":
      return "This edit would change the structure of the page around it, so it was not saved. Use Source for structural changes.";
    case "unsupported-style":
      return "That block style can't be applied here.";
    default:
      return "This edit could not be saved.";
  }
};
