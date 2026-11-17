/**
 * The two small scripts Marky puts inside an HTML document's frame.
 *
 * Each is a self-contained function: it is serialised with `toString()` into
 * the frame's `srcdoc` and runs there, in the frame's own opaque origin, never
 * in the app. It may not close over anything in this module. It talks to the
 * app only with `postMessage`, every message stamped with a per-frame random
 * `channel` the document cannot learn (the script element removes itself
 * before any of the document's own markup is parsed, and the `srcdoc`
 * attribute lives on the app's side of the origin boundary).
 *
 * The app treats every message as untrusted anyway: it checks the sender is
 * the frame's `contentWindow`, the channel, and the shape of each field.
 */

/**
 * Preview: the document's scripts run, so this script cannot trust anything
 * in the frame's realm after its own first statement. It captures what it
 * needs before the document runs, and acts only on events the user produced
 * (`isTrusted` is unforgeable): a click on a link becomes a request to the
 * app to open it, instead of a navigation of the frame.
 */
export function previewFrameAgent(config) {
  "use strict";
  var parentWindow = window.parent;
  var post = parentWindow.postMessage;
  var apply = Reflect.apply;
  var addListener = EventTarget.prototype.addEventListener;
  var preventDefault = Event.prototype.preventDefault;
  var getAttribute = Element.prototype.getAttribute;
  var hasAttribute = Element.prototype.hasAttribute;
  var nodeNameOf = Object.getOwnPropertyDescriptor(Node.prototype, "nodeName").get;
  var parentNodeOf = Object.getOwnPropertyDescriptor(Node.prototype, "parentNode").get;
  var setHash = Object.getOwnPropertyDescriptor(Location.prototype, "hash").set;
  var keyGetter = function (name) {
    return Object.getOwnPropertyDescriptor(KeyboardEvent.prototype, name).get;
  };
  var keyOf = keyGetter("key");
  var metaOf = keyGetter("metaKey");
  var ctrlOf = keyGetter("ctrlKey");
  var shiftOf = keyGetter("shiftKey");
  var altOf = keyGetter("altKey");
  var lower = String.prototype.toLowerCase;
  var location = window.location;
  var channel = config.channel;
  var target = config.parentOrigin;
  // The app's shortcuts, as { key, shift, alt } chords (see `frameShortcuts`).
  var shortcuts = config.shortcuts || [];

  var send = function (message) {
    message.channel = channel;
    try {
      apply(post, parentWindow, [message, target]);
    } catch {
      /* the app is gone */
    }
  };

  var linkOf = function (node) {
    var current = node;
    while (current) {
      var name = apply(nodeNameOf, current, []);
      if ((name === "A" || name === "AREA") && apply(hasAttribute, current, ["href"])) {
        return current;
      }
      current = apply(parentNodeOf, current, []);
    }
    return null;
  };

  var onClick = function (event) {
    if (!event.isTrusted || event.button > 1) return;
    var link = linkOf(event.target);
    if (!link) return;
    var raw = String(apply(getAttribute, link, ["href"]) || "").trim();
    if (/^javascript:/i.test(raw)) return; // the document's own script; let it run
    apply(preventDefault, event, []);
    if (raw.charAt(0) === "#") {
      // A same-page anchor. With a `<base>` in place the default action would
      // load the file again; a fragment navigation keeps the page and still
      // fires `hashchange` for pages that route on it.
      apply(setHash, location, [raw.slice(1)]);
      return;
    }
    send({ type: "link", href: String(link.href || "") });
  };

  // An app shortcut pressed inside the page: cancelled here, so the native
  // menu does not act on the same press as well, and handed to the app as a
  // description. Only presses the user made (`isTrusted` cannot be forged)
  // and only the app's own chords; everything else stays with the page.
  // Escape goes too, uncancelled, so it still leaves focus mode.
  var onKey = function (event) {
    if (!event.isTrusted) return;
    var key = String(apply(keyOf, event, []) || "");
    var meta = Boolean(apply(metaOf, event, []));
    var ctrl = Boolean(apply(ctrlOf, event, []));
    var shift = Boolean(apply(shiftOf, event, []));
    var alt = Boolean(apply(altOf, event, []));
    if (!(meta || ctrl)) {
      if (key === "Escape") {
        send({
          type: "key",
          key: key,
          metaKey: false,
          ctrlKey: false,
          shiftKey: shift,
          altKey: alt,
        });
      }
      return;
    }
    var name = apply(lower, key, []);
    var claimed = false;
    for (var i = 0; i < shortcuts.length; i += 1) {
      var chord = shortcuts[i];
      if (chord.key === name && chord.shift === shift && chord.alt === alt) {
        claimed = true;
        break;
      }
    }
    if (!claimed) return;
    apply(preventDefault, event, []);
    send({ type: "key", key: key, metaKey: meta, ctrlKey: ctrl, shiftKey: shift, altKey: alt });
  };

  apply(addListener, window, ["click", onClick, true]);
  apply(addListener, window, ["auxclick", onClick, true]);
  apply(addListener, window, ["keydown", onKey, true]);
  var self = document.currentScript;
  if (self) self.remove();
}

/**
 * Edit: the document's scripts and inline handlers are blocked by the frame's
 * CSP (only this script carries the nonce), so the DOM is the parsed file and
 * nothing else. The user types into one block at a time; every change is
 * reported to the app as the block's id (from `data-marky-b`), its original
 * tag and children, and its children now. Undo and redo are kept here, across
 * blocks, because the browser's own undo stack does not survive a block
 * losing `contenteditable`.
 */
export function editFrameAgent(config) {
  "use strict";
  var parentWindow = window.parent;
  var channel = config.channel;
  var BLOCK_ATTR = "data-marky-b";
  var LOCK_ATTR = "data-marky-lock";
  var HOVER_ATTR = "data-marky-hover";
  var ON_ATTR = "data-marky-on";
  var STYLE_TAGS = ["p", "h1", "h2", "h3", "h4", "h5", "h6"];
  var TYPING_PAUSE = 1200;

  var send = function (message) {
    message.channel = channel;
    try {
      parentWindow.postMessage(message, config.parentOrigin);
    } catch {
      /* the app is gone */
    }
  };

  var elements = {}; // id → current element
  var originalHtml = {}; // id → children as parsed, cleaned
  var originalTag = {}; // id → tag as parsed
  var lastSnapshot = {}; // id → children as of the last recorded change, with ids
  var lastTag = {};
  var undoStack = [];
  var redoStack = [];
  var openEntry = null;
  var lastInputAt = 0;
  var active = null;
  var hovered = null;
  // The selection inside the active block, kept so a command from the app's
  // toolbar (whose link field takes focus) applies where the user selected.
  var savedRange = null;

  var idOf = function (element) {
    return Number(element.getAttribute(BLOCK_ATTR));
  };
  var tagOf = function (element) {
    return element.tagName.toLowerCase();
  };

  // A copy of the block's children without Marky's own markers. `keepIds`
  // keeps nested blocks' ids (for undo snapshots, which are put back into
  // the page); reports to the app drop them, so they match the file.
  var serialize = function (element, keepIds) {
    var copy = element.cloneNode(true);
    var marked = copy.querySelectorAll(
      "[" +
        HOVER_ATTR +
        "],[" +
        ON_ATTR +
        "],[contenteditable],[" +
        BLOCK_ATTR +
        "],[" +
        LOCK_ATTR +
        "]"
    );
    for (var i = 0; i < marked.length; i += 1) {
      var node = marked[i];
      node.removeAttribute(HOVER_ATTR);
      node.removeAttribute(ON_ATTR);
      node.removeAttribute("contenteditable");
      if (!keepIds) {
        node.removeAttribute(BLOCK_ATTR);
        node.removeAttribute(LOCK_ATTR);
      }
    }
    return copy.innerHTML;
  };

  var index = function (root) {
    var found = root.querySelectorAll("[" + BLOCK_ATTR + "]");
    for (var i = 0; i < found.length; i += 1) elements[idOf(found[i])] = found[i];
  };

  var blockOf = function (node) {
    var current = node && node.nodeType === 1 ? node : node && node.parentElement;
    return current ? current.closest("[" + BLOCK_ATTR + "]") : null;
  };

  var rectOf = function (range) {
    var r = range.getBoundingClientRect();
    return { top: r.top, left: r.left, right: r.right, bottom: r.bottom };
  };

  var reportSelection = function () {
    if (!active) {
      send({ type: "selection", active: false });
      return;
    }
    var selection = document.getSelection();
    var inside = selection && selection.rangeCount > 0 && active.contains(selection.anchorNode);
    if (inside) savedRange = selection.getRangeAt(0).cloneRange();
    var collapsed = !inside || selection.isCollapsed;
    var rect = inside && !collapsed ? rectOf(selection.getRangeAt(0)) : rectOf(active);
    var anchor = inside ? blockOf(selection.anchorNode) : null;
    var link =
      inside && selection.anchorNode
        ? (selection.anchorNode.nodeType === 1
            ? selection.anchorNode
            : selection.anchorNode.parentElement
          ).closest("a[href]")
        : null;
    send({
      type: "selection",
      active: true,
      collapsed: collapsed,
      rect: rect,
      blockRect: rectOf(active),
      tag: tagOf(active),
      styleable: STYLE_TAGS.indexOf(originalTag[idOf(active)]) !== -1,
      bold: Boolean(inside && document.queryCommandState("bold")),
      italic: Boolean(inside && document.queryCommandState("italic")),
      link: link ? String(link.getAttribute("href") || "") : null,
      nested: Boolean(anchor && anchor !== active),
    });
  };

  var selectionFrame = 0;
  var scheduleSelection = function () {
    if (selectionFrame) return;
    selectionFrame = requestAnimationFrame(function () {
      selectionFrame = 0;
      reportSelection();
    });
  };

  var report = function (element) {
    var id = idOf(element);
    var message = {
      type: "edit",
      id: id,
      tag: originalTag[id],
      originalHtml: originalHtml[id],
      html: serialize(element, false),
    };
    if (tagOf(element) !== originalTag[id]) message.newTag = tagOf(element);
    send(message);
  };

  var closeEntry = function () {
    openEntry = null;
  };

  // Record the block's state after a change. Typing in one block without a
  // pause is one undo step; a new block, a pause or a command starts another.
  var record = function (element, boundary) {
    var id = idOf(element);
    var snapshot = serialize(element, true);
    var tag = tagOf(element);
    var now = Date.now();
    if (boundary || !openEntry || openEntry.id !== id || now - lastInputAt > TYPING_PAUSE) {
      openEntry = {
        id: id,
        beforeHtml: lastSnapshot[id],
        beforeTag: lastTag[id],
        afterHtml: snapshot,
        afterTag: tag,
      };
      undoStack.push(openEntry);
      if (undoStack.length > 500) undoStack.shift();
    } else {
      openEntry.afterHtml = snapshot;
      openEntry.afterTag = tag;
    }
    redoStack = [];
    lastInputAt = now;
    lastSnapshot[id] = snapshot;
    lastTag[id] = tag;
    if (boundary) closeEntry();
    report(element);
  };

  var replaceTag = function (element, tag) {
    var next = document.createElement(tag);
    for (var i = 0; i < element.attributes.length; i += 1) {
      next.setAttribute(element.attributes[i].name, element.attributes[i].value);
    }
    while (element.firstChild) next.appendChild(element.firstChild);
    element.replaceWith(next);
    elements[idOf(next)] = next;
    if (active === element) active = next;
    if (hovered === element) hovered = next;
    return next;
  };

  var caretToEnd = function (element) {
    var range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    var selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };

  var deactivate = function () {
    if (!active) return;
    active.removeAttribute("contenteditable");
    active.removeAttribute(ON_ATTR);
    active = null;
    savedRange = null;
    closeEntry();
    reportSelection();
  };

  var activate = function (element) {
    if (active === element) return;
    deactivate();
    if (element.hasAttribute(LOCK_ATTR)) {
      send({ type: "locked", id: idOf(element), reason: element.getAttribute(LOCK_ATTR) });
      return;
    }
    element.setAttribute("contenteditable", "true");
    element.setAttribute(ON_ATTR, "");
    active = element;
    scheduleSelection();
  };

  var restore = function (id, html, tag) {
    var element = elements[id];
    if (!element) return;
    if (tagOf(element) !== tag) element = replaceTag(element, tag);
    element.innerHTML = html;
    index(element);
    lastSnapshot[id] = html;
    lastTag[id] = tag;
    activate(element);
    element.focus();
    caretToEnd(element);
    report(element);
  };

  var undo = function () {
    closeEntry();
    var entry = undoStack.pop();
    if (!entry) return;
    redoStack.push(entry);
    restore(entry.id, entry.beforeHtml, entry.beforeTag);
  };

  var redo = function () {
    closeEntry();
    var entry = redoStack.pop();
    if (!entry) return;
    undoStack.push(entry);
    restore(entry.id, entry.afterHtml, entry.afterTag);
  };

  var command = function (name, value) {
    if (!active) return;
    active.focus();
    if (savedRange && active.contains(savedRange.startContainer)) {
      var current = document.getSelection();
      current.removeAllRanges();
      current.addRange(savedRange);
    }
    closeEntry();
    if (name === "bold" || name === "italic" || name === "unlink") {
      document.execCommand(name, false);
    } else if (name === "link") {
      var href = String(value || "").trim();
      if (!href || /^\s*(javascript|data|vbscript):/i.test(href)) return;
      var selection = document.getSelection();
      var node = selection && selection.anchorNode;
      var existing = node
        ? (node.nodeType === 1 ? node : node.parentElement).closest("a[href]")
        : null;
      if (existing && active.contains(existing) && selection.isCollapsed) {
        existing.setAttribute("href", href);
        record(active, true);
      } else {
        document.execCommand("createLink", false, href);
      }
    } else if (name === "block") {
      var tag = String(value || "");
      if (STYLE_TAGS.indexOf(tag) === -1) return;
      if (STYLE_TAGS.indexOf(originalTag[idOf(active)]) === -1) return;
      if (tagOf(active) === tag) return;
      var next = replaceTag(active, tag);
      next.focus();
      caretToEnd(next);
      record(next, true);
    }
    closeEntry();
    scheduleSelection();
  };

  var onMouseDown = function (event) {
    var block = blockOf(event.target);
    if (!block) {
      // Anything that is not a block — the page's margins, an image, text
      // the source map could not place — deselects, and says nothing: it is
      // how you click away. Locked blocks still explain themselves (they
      // look editable); see `activate`.
      deactivate();
      return;
    }
    if (active && active.contains(block) && active !== block) return; // inside the active block
    activate(block);
  };

  var onClick = function (event) {
    // Nothing in the page acts on a click while editing: links do not
    // navigate, summaries do not toggle, labels do not tick boxes.
    var target =
      event.target && event.target.closest
        ? event.target.closest("a, summary, label, button, input, select")
        : null;
    if (target) event.preventDefault();
  };

  var onMouseOver = function (event) {
    var block = blockOf(event.target);
    if (block === hovered) return;
    if (hovered) hovered.removeAttribute(HOVER_ATTR);
    hovered = block;
    if (hovered && hovered !== active) hovered.setAttribute(HOVER_ATTR, "");
  };

  var isMod = function (event) {
    return config.mac ? event.metaKey : event.ctrlKey;
  };

  // The app's chords (see `frameShortcuts`) and the formatting keys, the
  // same keymaps the markdown editor uses, so ⌘B toggles the sidebar here as
  // it does over a note and bold is on the bold keymap.
  var shortcuts = config.shortcuts || [];
  var format = config.format || {};
  var matches = function (chord, event, key) {
    return Boolean(
      chord &&
      (event.metaKey || event.ctrlKey) &&
      chord.key === key &&
      chord.shift === Boolean(event.shiftKey) &&
      chord.alt === Boolean(event.altKey)
    );
  };

  var forward = function (event) {
    send({
      type: "key",
      key: String(event.key || ""),
      metaKey: Boolean(event.metaKey),
      ctrlKey: Boolean(event.ctrlKey),
      shiftKey: Boolean(event.shiftKey),
      altKey: Boolean(event.altKey),
    });
  };

  var onKeyDown = function (event) {
    var key = String(event.key || "").toLowerCase();
    if (isMod(event) && !event.altKey) {
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (key === "y" && !config.mac) {
        event.preventDefault();
        redo();
        return;
      }
      if (key === "s" && !event.shiftKey) {
        event.preventDefault();
        send({ type: "save" });
        return;
      }
    }
    if (active && (matches(format.bold, event, key) || matches(format.italic, event, key))) {
      event.preventDefault();
      command(matches(format.bold, event, key) ? "bold" : "italic");
      return;
    }
    if (active && matches(format.link, event, key)) {
      event.preventDefault();
      send({ type: "request-link" });
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      for (var i = 0; i < shortcuts.length; i += 1) {
        if (matches(shortcuts[i], event, key)) {
          event.preventDefault();
          forward(event);
          return;
        }
      }
      return;
    }
    if (key === "escape") {
      // Escape deselects the block; with nothing selected it is the app's
      // (it leaves focus mode, as it does over a note).
      if (active) {
        event.preventDefault();
        active.blur();
        deactivate();
      } else {
        forward(event);
      }
      return;
    }
    if (!active) return;
    if (key === "enter") {
      // A new paragraph would be a new element the file does not have; a
      // line break stays inside this block.
      event.preventDefault();
      document.execCommand("insertLineBreak");
    }
  };

  var onBeforeInput = function (event) {
    var type = event.inputType;
    if (type === "historyUndo") {
      event.preventDefault();
      undo();
    } else if (type === "historyRedo") {
      event.preventDefault();
      redo();
    } else if (type === "insertParagraph") {
      event.preventDefault();
      document.execCommand("insertLineBreak");
    } else if (
      type === "insertFromPaste" ||
      type === "insertFromDrop" ||
      type === "insertFromYank"
    ) {
      // Pasted markup would bring its own structure and styles; text only.
      event.preventDefault();
      var data = event.dataTransfer || event.clipboardData;
      var text = data ? data.getData("text/plain") : "";
      if (text) document.execCommand("insertText", false, text.replace(/\r?\n/g, " "));
    }
  };

  var onInput = function (event) {
    var block = blockOf(event.target);
    if (block && block === active) record(block, false);
  };

  var onMessage = function (event) {
    if (event.source !== parentWindow) return;
    var data = event.data;
    if (!data || data.channel !== channel || typeof data.type !== "string") return;
    if (data.type === "command") command(String(data.name || ""), data.value);
    else if (data.type === "undo") undo();
    else if (data.type === "redo") redo();
    else if (data.type === "deactivate") deactivate();
  };

  var start = function () {
    var found = document.querySelectorAll("[" + BLOCK_ATTR + "]");
    for (var i = 0; i < found.length; i += 1) {
      var element = found[i];
      var id = idOf(element);
      elements[id] = element;
      originalHtml[id] = serialize(element, false);
      originalTag[id] = tagOf(element);
      lastSnapshot[id] = serialize(element, true);
      lastTag[id] = tagOf(element);
    }
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("mouseover", onMouseOver, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("beforeinput", onBeforeInput, true);
    document.addEventListener("input", onInput, true);
    document.addEventListener("selectionchange", scheduleSelection);
    document.addEventListener(
      "dragstart",
      function (event) {
        event.preventDefault();
      },
      true
    );
    window.addEventListener("scroll", scheduleSelection, true);
    window.addEventListener("resize", scheduleSelection);
    window.addEventListener("blur", closeEntry);
    send({ type: "ready", blocks: found.length });
  };

  window.addEventListener("message", onMessage);
  var self = document.currentScript;
  if (self) self.remove();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
}
