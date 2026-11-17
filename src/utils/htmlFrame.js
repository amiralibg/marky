/**
 * The `srcdoc` an HTML document is shown in.
 *
 * Every frame Marky draws an HTML document in is sandboxed without
 * `allow-same-origin`, so the page runs in an opaque origin that can never
 * be the app's. Its content arrives as `srcdoc` built here from the file's
 * source; nothing injected is ever written back to the file.
 *
 * What gets injected, at the earliest point the parser will put it into the
 * head (after the doctype, before any of the document's own markup — so the
 * policy is in force before the document's first script or resource):
 *
 *   - a CSP `<meta>` that limits where the page may load from. `asset:`,
 *     `ipc:` and `tauri:` are left out, and so is plain `http:` (on Windows it
 *     carries the asset and IPC hosts), apart from localhost dev servers.
 *     In Edit, the miniature and Preview with scripts off it also turns off
 *     every script but Marky's;
 *   - a `<base>` pointing at the document's folder over Marky's document
 *     scheme (which serves the vault and nothing else), so relative images,
 *     stylesheets and scripts resolve as they would on disk;
 *   - the style that hides scrollbars (every kind), Marky's own agent script
 *     (see htmlFrameAgents.js; Preview and Edit) and, in Edit, the outline
 *     styles.
 *
 * Two neutralisations, also only in the frame: `<meta http-equiv=refresh>`
 * (it would navigate the frame away), and, when scripts are off, link
 * targets (links aim at a popup the sandbox refuses instead of loading in
 * the frame — a second line behind the agent, which intercepts the click).
 *
 * In Edit, each editable block's start tag also gets `data-marky-b="<id>"`
 * (its offset in the source, see htmlSourceMap.js), and unsound blocks
 * `data-marky-lock`, so the edit agent can say which element the user typed
 * into.
 */
import { parse } from "parse5";
import { buildSourceMap } from "./htmlSourceMap";
import { editFrameAgent, previewFrameAgent } from "./htmlFrameAgents";

/**
 * Sandbox flags per frame kind. Never `allow-same-origin`, never top
 * navigation or popups. Preview with the document's scripts off still gets
 * `allow-scripts`, for Marky's agent alone: as in Edit, the frame's policy
 * runs nothing but the script carrying the nonce, so the document stays inert
 * while the app's shortcuts and links keep working inside it.
 */
export const sandboxFor = (kind) => (kind === "edit" || kind === "preview" ? "allow-scripts" : "");

/** Files larger than this are not drawn as a Home miniature. */
export const MINIATURE_SIZE_LIMIT = 512 * 1024;

const BOM = "﻿";

const escapeAttr = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// Inline script text must never contain `</script` (it would end the element
// early) or `<!--` (script data escape states).
const scriptText = (code) => code.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");

/** Where the document may load resources from (see the header comment). */
export const resourceSources = (documentOrigin) =>
  ["https:", "data:", "blob:", "http://localhost:*", "http://127.0.0.1:*", documentOrigin]
    .filter(Boolean)
    .join(" ");

/**
 * The policy for each frame kind.
 * @param {"preview"|"edit"|"miniature"} kind
 * @param {{ documentOrigin?: string, nonce?: string, runScripts?: boolean }} options
 */
export const contentSecurityPolicy = (
  kind,
  { documentOrigin = "", nonce = "", runScripts = true } = {}
) => {
  const sources = resourceSources(documentOrigin);
  const local = ["data:", documentOrigin].filter(Boolean).join(" ");
  if (kind === "miniature") {
    // A card on Home: nothing runs and nothing leaves the machine.
    return [
      "default-src 'none'",
      `img-src ${local}`,
      `style-src 'unsafe-inline' ${local}`,
      `font-src ${local}`,
      "form-action 'none'",
    ].join("; ");
  }
  const common = [
    `default-src ${sources}`,
    `style-src ${sources} 'unsafe-inline'`,
    `img-src ${sources}`,
    `font-src ${sources}`,
    `media-src ${sources}`,
    "object-src 'none'",
    "form-action 'none'",
  ];
  if (kind === "edit" || !runScripts) {
    return [
      ...common,
      // Only Marky's agent runs: no document script, no inline handler, no
      // `javascript:` URL, no eval. Edit, and Preview with scripts off.
      `script-src 'nonce-${nonce}'`,
      "connect-src 'none'",
      "frame-src 'none'",
      "child-src 'none'",
      "worker-src 'none'",
    ].join("; ");
  }
  return [
    ...common,
    `script-src ${sources} 'unsafe-inline' 'unsafe-eval'`,
    `connect-src ${sources} ws://localhost:* ws://127.0.0.1:* wss:`,
    // Nested frames: remote embeds and other vault documents. Not `data:` or
    // `blob:`, which would run outside this policy.
    `frame-src https: ${documentOrigin}`.trim(),
    `child-src https: ${documentOrigin}`.trim(),
    `worker-src blob: ${documentOrigin}`.trim(),
  ].join("; ");
};

const randomToken = () => {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

/** A fresh channel id or nonce. Exposed for the frame component. */
export const newFrameToken = randomToken;

const attrLocations = (node) => node.sourceCodeLocation?.attrs || {};

/**
 * Walk the parsed document once for what the builders need: the doctype's
 * end, the document's own `<base href>`, refresh metas and link targets.
 */
const scanDocument = (body) => {
  const document = parse(body, { sourceCodeLocationInfo: true });
  const info = { insertAt: 0, baseHref: null, refreshAttrs: [], targetAttrs: [] };

  // After the doctype, if nothing but whitespace and comments comes before
  // it; otherwise the doctype is ignored by the parser anyway and the start
  // of the file is the earliest point.
  const doctype = document.childNodes.find((node) => node.nodeName === "#documentType");
  if (doctype?.sourceCodeLocation) {
    const before = body.slice(0, doctype.sourceCodeLocation.startOffset);
    if (!before.replace(/<!--[\s\S]*?-->/g, "").trim()) {
      info.insertAt = doctype.sourceCodeLocation.endOffset;
    }
  }

  const walk = (node) => {
    for (const child of node.childNodes || []) {
      if (!child.tagName) continue;
      const attrs = child.attrs || [];
      const named = (name) => attrs.find((attr) => attr.name === name);
      if (child.tagName === "base" && info.baseHref === null && named("href")) {
        info.baseHref = named("href").value;
      }
      if (child.tagName === "meta") {
        const equiv = named("http-equiv");
        const loc = attrLocations(child)["http-equiv"];
        if (equiv && /^\s*refresh\s*$/i.test(equiv.value) && loc) info.refreshAttrs.push(loc);
      }
      if (child.tagName === "a" || child.tagName === "area" || child.tagName === "base") {
        const loc = attrLocations(child).target;
        if (loc && named("target")) info.targetAttrs.push(loc);
      }
      walk(child.tagName === "template" && child.content ? child.content : child);
    }
  };
  walk(document);
  return info;
};

/**
 * Apply insertions/replacements (offsets into `body`) in one pass. Each is
 * `{ at, text }` (insert) or `{ from, to, text }` (replace); none overlap.
 */
const splice = (body, edits) => {
  const sorted = edits
    .map((edit) => ("at" in edit ? { from: edit.at, to: edit.at, text: edit.text } : edit))
    .sort((a, b) => a.from - b.from || a.to - b.to);
  let out = "";
  let cursor = 0;
  for (const edit of sorted) {
    out += body.slice(cursor, edit.from) + edit.text;
    cursor = edit.to;
  }
  return out + body.slice(cursor);
};

const isAbsoluteUrl = (value) => /^[a-z][a-z0-9+.-]*:/i.test(String(value || "").trim());

const agentScript = (agent, config, nonce) =>
  `<script${nonce ? ` nonce="${nonce}"` : ""}>${scriptText(
    `(${agent.toString()})(${JSON.stringify(config)});`
  )}</script>`;

/**
 * Scrollbars are hidden inside every frame, as they are everywhere in the app
 * (see index.css): the page's root and every inner scroller. Plain CSS, so it
 * works with scripts off and in miniatures. Injected at render time only.
 */
export const HIDE_SCROLLBARS =
  "<style>*{scrollbar-width:none!important}" +
  "::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}</style>";

// Edit mode's marks, injected into the page's styling at render time only.
// The hover hairline and the caret-block outline follow the mockup; the
// accent comes from the app's theme. Only blocks take the text cursor:
// everything else in the page (its margins, images, text Marky cannot place)
// is not clickable for editing and shows the default arrow.
const editStyles = (accent) => `<style>
html,html *{cursor:default!important}
[data-marky-b],[data-marky-b] *{cursor:text!important}
[data-marky-hover]{outline:1px solid rgba(29,36,51,.22)!important;outline-offset:6px!important;border-radius:2px}
[data-marky-on]{outline:1.5px solid ${accent}!important;outline-offset:6px!important;border-radius:2px;caret-color:${accent}}
[data-marky-lock][data-marky-hover]{outline-style:dashed!important}
</style>`;

const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([0-9.,%\s]+\)|[a-z]+)$/i;

/**
 * Build a frame's `srcdoc`.
 * @param {string} source            The file as read (BOM, CRLF and all).
 * @param {object} options
 * @param {"preview"|"edit"|"miniature"} options.kind
 * @param {string} [options.baseHref]       The document's folder over Marky's document scheme.
 * @param {string} [options.documentOrigin] That scheme's origin, for the CSP.
 * @param {boolean} [options.runScripts]    Preview only.
 * @param {string} [options.channel]        Message channel for the agent.
 * @param {string} [options.parentOrigin]   The app's origin, the agent's postMessage target.
 * @param {string} [options.nonce]          Edit, and Preview with scripts off: the agent's nonce.
 * @param {string} [options.accent]         Edit only: outline colour.
 * @param {boolean} [options.mac]           Edit only: ⌘ rather than Ctrl.
 * @param {Array<{key: string, shift: boolean, alt: boolean}>} [options.shortcuts]
 *   The app's chords the agent hands back (see `frameShortcuts`).
 * @param {object} [options.format]         Edit only: the bold / italic / link chords.
 * @param {ReturnType<typeof buildSourceMap>} [options.map]  Edit only: the source's map.
 */
export function buildFrameDocument(source, options) {
  const {
    kind,
    baseHref = "",
    documentOrigin = "",
    runScripts = true,
    channel = "",
    parentOrigin = "*",
    nonce = "",
    accent = "#6d5ce0",
    mac = false,
    shortcuts = [],
    format = {},
  } = options;
  const text = typeof source === "string" ? source : "";
  const bom = text.startsWith(BOM) ? 1 : 0;
  const body = bom ? text.slice(1) : text;
  const info = scanDocument(body);

  const head = [
    `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(
      contentSecurityPolicy(kind, { documentOrigin, nonce, runScripts })
    )}">`,
  ];
  // The document's own absolute base stays in charge; a relative one could
  // only resolve against the app, so Marky's goes first and wins.
  const ownBase = info.baseHref !== null && isAbsoluteUrl(info.baseHref);
  const baseAttrs = [];
  if (baseHref && !ownBase) baseAttrs.push(`href="${escapeAttr(baseHref)}"`);
  if (kind === "preview" && !runScripts) baseAttrs.push('target="_blank"');
  if (baseAttrs.length) head.push(`<base ${baseAttrs.join(" ")}>`);
  head.push(HIDE_SCROLLBARS);
  if (kind === "edit") {
    head.push(editStyles(SAFE_COLOR.test(accent) ? accent : "#6d5ce0"));
    head.push(
      agentScript(editFrameAgent, { channel, parentOrigin, mac, shortcuts, format }, nonce)
    );
  } else if (kind === "preview") {
    // With the document's scripts off the policy runs only the nonce'd
    // script, so the agent carries it; with them on it needs none.
    head.push(
      agentScript(previewFrameAgent, { channel, parentOrigin, shortcuts }, runScripts ? "" : nonce)
    );
  }

  const edits = [{ at: info.insertAt, text: head.join("") }];
  for (const loc of info.refreshAttrs) {
    edits.push({
      from: loc.startOffset,
      to: loc.endOffset,
      text: `data-marky-${body.slice(loc.startOffset, loc.endOffset)}`,
    });
  }
  if (kind === "preview" && !runScripts) {
    for (const loc of info.targetAttrs) {
      edits.push({ from: loc.startOffset, to: loc.endOffset, text: 'target="_blank"' });
    }
  }
  if (kind === "edit") {
    const map = options.map || buildSourceMap(text);
    for (const block of map.blocks) {
      // After the tag name, before any attribute: the first copy of an
      // attribute wins, so a document cannot shadow these.
      const at = block.start - bom + 1 + block.tag.length;
      const lock = block.sound ? "" : ` data-marky-lock="${escapeAttr(block.reason || "unsound")}"`;
      edits.push({ at, text: ` data-marky-b="${block.id}"${lock}` });
    }
  }
  return splice(body, edits);
}

/**
 * A document's folder as a URL over Marky's document scheme: the root's key,
 * then the folder's path inside the root, one encoded segment at a time so
 * relative URLs resolve the way they would on disk.
 */
export const documentBaseHref = (origin, rootKey, relativeDir) => {
  if (!origin || !rootKey) return "";
  const segments = String(relativeDir || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment));
  return `${origin}/${rootKey}/${segments.length ? `${segments.join("/")}/` : ""}`;
};

/**
 * The vault path a URL from the frame points at, or null when it is not a
 * document-scheme URL under `origin/rootKey`.
 */
export const pathFromDocumentUrl = (href, origin, rootKey, rootPath) => {
  if (!href || !origin || !rootKey || !rootPath) return null;
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const prefix = `${origin}/${rootKey}/`;
  const bare = `${url.origin === "null" ? `${url.protocol}//${url.host}` : url.origin}${url.pathname}`;
  if (!bare.startsWith(prefix)) return null;
  const segments = bare.slice(prefix.length).split("/").filter(Boolean);
  const decoded = [];
  for (const segment of segments) {
    let value;
    try {
      value = decodeURIComponent(segment);
    } catch {
      return null;
    }
    if (!value || value === "." || value === ".." || /[\\/\0]/.test(value)) return null;
    decoded.push(value);
  }
  if (decoded.length === 0) return null;
  const root = String(rootPath).replace(/\\/g, "/").replace(/\/+$/, "");
  return `${root}/${decoded.join("/")}`;
};
