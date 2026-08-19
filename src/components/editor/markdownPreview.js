import { marked } from "marked";
import hljs from "highlight.js/lib/common";
import markedFootnote from "marked-footnote";
import markedKatex from "marked-katex-extension";
import "katex/dist/katex.min.css";
import useNotesStore from "../../store/notesStore";
import { slugify } from "../../utils/slugify";
import { parseFrontmatter } from "../../utils/frontmatter";
import { insertBlankLineSpacers } from "../../utils/blankLineSpacers";
import { detectBaseDirection } from "../../utils/bidi";
import {
  isImagePath,
  parseEmbedSize,
  resolveMediaSrc,
  stripEmbedSize,
} from "../../utils/attachments";

const escapeHtml = (value = "") =>
  value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });

const wikiLinkExtension = {
  name: "wikilink",
  level: "inline",
  start(src) {
    return src.indexOf("[[");
  },
  tokenizer(src) {
    const rule = /^\[\[([^\]]+)\]\]/;
    const match = rule.exec(src);
    if (match) {
      const inner = match[1].trim();
      if (!inner) return undefined;
      const [targetPart, aliasPart] = inner.split("|");
      const target = (targetPart || "").trim();
      if (!target) return undefined;

      return {
        type: "wikilink",
        raw: match[0],
        target,
        text: aliasPart ? aliasPart.trim() : target,
        tokens: [],
      };
    }
    return undefined;
  },
  renderer(token) {
    const label = token.text || token.target;
    const attrs = [
      'class="wikilink"',
      `data-wikilink-target="${escapeHtml(token.target)}"`,
      'href="#"',
    ];

    if (typeof token.exists === "boolean") {
      attrs.push(`data-wikilink-exists="${token.exists ? "true" : "false"}"`);
    }

    return `<a ${attrs.join(" ")}>${escapeHtml(label)}</a>`;
  },
};

const unescapeHtml = (value = "") =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

const baseNameOf = (value = "") => value.replace(/\\/g, "/").split("/").pop() || value;

// A URL scheme that would execute rather than load. `marked`'s own image
// renderer screens these out; ours replaces it, so it has to do the same.
const isUnsafeUrl = (value) => /^\s*(javascript|vbscript|data:text\/html)/i.test(value || "");

const buildImageTag = (target, alt = "", title = "") => {
  if (isUnsafeUrl(target)) return escapeHtml(alt);

  const src = resolveMediaSrc(target);
  const size = parseEmbedSize(target);
  const attrs = [
    `src="${escapeHtml(src)}"`,
    // `alt` arrives already escaped from marked's tokenizer for markdown
    // images; embeds pass their own raw text, so both paths escape here and
    // the tokenizer's escaping is undone first to avoid doubling it.
    `alt="${escapeHtml(unescapeHtml(alt))}"`,
    'class="md-image"',
    `data-md-src="${escapeHtml(target)}"`,
    // A broken image otherwise collapses to nothing, which reads as "the app
    // dropped my picture". Marked instead, so the note shows what it looked for.
    "onerror=\"this.classList.add('md-image-missing')\"",
    "onload=\"this.classList.remove('md-image-missing')\"",
  ];
  if (title) attrs.push(`title="${escapeHtml(unescapeHtml(title))}"`);
  if (size?.width) attrs.push(`width="${size.width}"`);
  if (size?.height) attrs.push(`height="${size.height}"`);
  return `<img ${attrs.join(" ")}>`;
};

/**
 * Obsidian's embed syntax, `![[target]]`.
 *
 * Registered ahead of the wiki-link extension so the `!` is consumed as part of
 * the embed; left to itself the link extension matches the `[[…]]` and the note
 * renders a stray `!` in front of a link where an image belongs.
 */
const wikiEmbedExtension = {
  name: "wikiembed",
  level: "inline",
  start(src) {
    return src.indexOf("![[");
  },
  tokenizer(src) {
    const match = /^!\[\[([^\]]+)\]\]/.exec(src);
    if (!match) return undefined;
    const target = match[1].trim();
    if (!target) return undefined;
    return { type: "wikiembed", raw: match[0], target, tokens: [] };
  },
  renderer(token) {
    const path = stripEmbedSize(token.target);
    if (isImagePath(path)) {
      return buildImageTag(token.target, baseNameOf(path));
    }
    // A non-image embed (a PDF, another note) is not something the preview can
    // inline, so it degrades to the link the target names.
    return `<a class="wikilink" data-wikilink-target="${escapeHtml(path)}" href="#">${escapeHtml(path)}</a>`;
  },
};

let extensionsRegistered = false;

if (!extensionsRegistered) {
  // Register footnotes and KaTeX before the custom renderer block
  marked.use(markedFootnote());
  marked.use(markedKatex({ throwOnError: false }));

  marked.use({
    extensions: [wikiEmbedExtension, wikiLinkExtension],
    walkTokens(token) {
      if (token.type === "wikilink") {
        const state = useNotesStore.getState();
        const note = state.findNoteByLinkTarget?.(token.target);
        token.exists = Boolean(note);
      }
    },
    renderer: {
      // Every image target in a vault is a file path — relative to the note or
      // to the vault root — and a webview served from `tauri://localhost` can
      // load none of them. Resolve to a real path and hand it to the asset
      // protocol; remote and data URLs pass straight through.
      image(href, title, text) {
        const isToken = href && typeof href === "object";
        return buildImageTag(
          isToken ? href.href : href,
          isToken ? href.text : text,
          (isToken ? href.title : title) || ""
        );
      },
      heading(token) {
        const text = typeof token === "object" ? token.text : token;
        const depth = typeof token === "object" ? token.depth : arguments[1];
        const id = slugify(text);
        return `<h${depth} id="${escapeHtml(id)}" dir="auto">${text}</h${depth}>\n`;
      },
      paragraph(token) {
        const text = typeof token === "object" ? token.text : token;
        return `<p dir="auto">${text}</p>\n`;
      },
      listitem(token) {
        const text = typeof token === "object" ? token.text : token;
        const isTask = typeof token === "object" ? token.task : false;
        const isChecked = typeof token === "object" ? token.checked : false;
        if (isTask) {
          const checkbox = `<input type="checkbox"${isChecked ? ' checked=""' : ""} disabled="">`;
          return `<li dir="auto">${checkbox} ${text}</li>\n`;
        }
        return `<li dir="auto">${text}</li>\n`;
      },
      blockquote(token) {
        const body = typeof token === "object" ? token.text : token;
        // `dir="auto"` only considers text that isn't already inside an element
        // carrying its own `dir` — and every paragraph in here has one, so the
        // blockquote always resolved LTR and hung its rule on the left of a
        // Persian quote. Resolve the direction from the quote's own text.
        const dir = detectBaseDirection(body.replace(/<[^>]*>/g, ""));
        return `<blockquote dir="${dir}">${body}</blockquote>\n`;
      },
      // Wrap tables so a wide one scrolls inside its own box instead of
      // stretching the reading column. The wrapper also carries the rounded
      // border, which a <table> can't clip on its own.
      table(header, body) {
        const tbody = body ? `<tbody>${body}</tbody>` : "";
        return `<div class="table-wrap"><table><thead>${header}</thead>${tbody}</table></div>\n`;
      },
      // marked 9 calls this as `tablecell(content, { header, align })`; newer
      // versions pass a single token. Reading only the token shape dropped both
      // flags, so every header cell rendered as a <td> and the column alignment
      // from `|:---:|` was thrown away.
      tablecell(token, flags) {
        const isToken = typeof token === "object";
        const content = isToken ? token.text : token;
        const isHeader = isToken ? token.header : Boolean(flags?.header);
        const align = (isToken ? token.align : flags?.align) || "";
        const tag = isHeader ? "th" : "td";
        const alignAttr = align ? ` style="text-align:${align}"` : "";
        return `<${tag} dir="auto"${alignAttr}>${content}</${tag}>\n`;
      },
      code(code, language) {
        const text = typeof code === "object" ? code.text : code;
        const lang = typeof code === "object" ? code.lang : language;

        // Mermaid diagrams: render as placeholder for post-processing
        if (lang === "mermaid") {
          return `<div class="mermaid-wrapper"><div class="mermaid">${escapeHtml(text)}</div></div>`;
        }

        const validLang = lang && hljs.getLanguage(lang);
        const highlighted = validLang
          ? hljs.highlight(text, { language: lang }).value
          : hljs.highlightAuto(text).value;
        const langLabel = lang || "text";
        const escapedCode = text.replace(/"/g, "&quot;").replace(/'/g, "&#39;");

        // Emitted without whitespace between tags. Indenting this template put
        // real newlines in the DOM, and in Live mode the widget inherits
        // `white-space: break-spaces` from `.cm-content`, which renders each
        // one as a blank line inside the block.
        const copyIcon =
          '<svg class="copy-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>' +
          '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>' +
          "</svg>";
        const checkIcon =
          '<svg class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none">' +
          '<polyline points="20 6 9 17 4 12"></polyline>' +
          "</svg>";

        return (
          '<div class="code-block-wrapper">' +
          '<div class="code-block-header">' +
          `<span class="code-block-lang">${escapeHtml(langLabel)}</span>` +
          `<button class="code-copy-btn" data-code="${escapedCode}" title="Copy code">${copyIcon}${checkIcon}</button>` +
          "</div>" +
          `<pre><code class="hljs language-${escapeHtml(langLabel)}">${highlighted}</code></pre>` +
          "</div>"
        );
      },
    },
  });
  extensionsRegistered = true;
}

export const renderMarkdownPreview = (markdown) => {
  const previewMarkdown = parseFrontmatter(markdown).body;
  const tokens = marked.lexer(previewMarkdown);

  // The footnote extension emits its section as the first token and relies on
  // `marked.parse()` to place it. Rendering through `lexer` + `parser` (which
  // we do, to turn blank lines into spacers) skips that step, so the notes
  // landed above the document title. Move the section to the end ourselves.
  const footnotesIndex = tokens.findIndex((token) => token.type === "footnotes");
  if (footnotesIndex !== -1) {
    tokens.push(...tokens.splice(footnotesIndex, 1));
  }

  const tokensWithBlankLines = insertBlankLineSpacers(tokens);

  // Run the registered `walkTokens` hooks — the wikilink resolver above, and
  // whatever the extensions installed. `marked.parse()` does this; `lexer` +
  // `parser` do not, and marked-footnote depends on it: it latches a
  // "this document has footnotes" flag while lexing and clears it from its
  // walkTokens hook. Left latched, the next document never got its footnotes
  // token seeded at index 0, and the footnote *reference* tokenizer — which
  // reads `lexer.tokens[0]` unguarded — threw on any note carrying a `[^1]`.
  // A note with footnotes rendered once, then failed every time after.
  if (marked.defaults.walkTokens) {
    marked.walkTokens(tokensWithBlankLines, marked.defaults.walkTokens);
  }

  return marked.parser(tokensWithBlankLines);
};
