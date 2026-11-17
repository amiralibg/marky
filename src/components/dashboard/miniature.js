import { renderMarkdownMiniature } from "../editor/markdownPreview";
import { miniatureSource } from "../../utils/library";

// Elements a miniature never keeps. Media would load (a remote image is a
// network request per card), scripts and frames would run, and form controls
// other than a task checkbox would be focusable inside a card.
const DROPPED =
  "script, style, iframe, frame, object, embed, link, meta, base, form, button, select, textarea, audio, source, track";
const MEDIA = "img, picture, video, canvas, svg";

/**
 * Read mode puts the renderer's HTML into the page as it is, raw HTML in the
 * note included. A miniature is stricter, because a Home screen shows dozens
 * at once and nobody chose to open them: the HTML is parsed into an inert
 * `<template>` (nothing in it loads or runs), media are swapped for a
 * placeholder, and every event handler, link target, id and stylesheet URL
 * is removed. Ids matter too: heading ids from many cards would collide with
 * each other and with the open document's anchors.
 */
export const scrubMiniatureHtml = (html) => {
  const template = document.createElement("template");
  template.innerHTML = html;
  const root = template.content;

  root.querySelectorAll(DROPPED).forEach((node) => node.remove());
  root.querySelectorAll(MEDIA).forEach((node) => {
    const placeholder = document.createElement("span");
    placeholder.className = "mini-media";
    node.replaceWith(placeholder);
  });
  root.querySelectorAll("input").forEach((node) => {
    if (node.getAttribute("type") !== "checkbox") node.remove();
    else node.setAttribute("disabled", "");
  });
  root.querySelectorAll("*").forEach((node) => {
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      if (
        name.startsWith("on") ||
        name === "id" ||
        name === "href" ||
        name === "src" ||
        name === "srcset" ||
        name === "tabindex" ||
        name === "contenteditable" ||
        (name === "style" && /url\s*\(|expression/i.test(attr.value))
      ) {
        node.removeAttribute(attr.name);
      }
    }
  });
  return template.innerHTML;
};

// Rendered HTML per note version. Keyed on the note's id, its updatedAt and
// its length, so an edit (which moves both) renders again and nothing else
// does. Bounded, oldest out first: a long session browsing a large vault
// should not keep every card it ever drew.
const CACHE_LIMIT = 400;
const cache = new Map();

const cacheKey = (note) =>
  `${note.id}\u0000${note.updatedAt || ""}\u0000${note.content?.length ?? -1}`;

export const peekMiniature = (note) => (note ? cache.get(cacheKey(note)) : undefined);

export const renderMiniature = (note) => {
  const key = cacheKey(note);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let html = "";
  try {
    html = scrubMiniatureHtml(renderMarkdownMiniature(miniatureSource(note.content)));
  } catch (error) {
    console.error("Miniature render failed:", error);
  }
  cache.set(key, html);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return html;
};
