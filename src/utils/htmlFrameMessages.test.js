import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve("key123")) }));
// jsdom's user agent says "darwin", which reads as Windows to a substring test.
vi.mock("./platform", () => ({ detectPlatform: () => "macos" }));

import {
  chordOf,
  formatShortcuts,
  frameShortcuts,
  isAcceptableHref,
  safeSandbox,
  sanitizeEditMessage,
  sanitizeKeyMessage,
  sanitizeSelectionMessage,
} from "./htmlFrameMessages";
import { classifyFrameLink, documentRootFor, resolveDocumentLocation } from "./htmlDocuments";
import { documentExcerpt, documentText, documentWordCount } from "./documentText";

describe("safeSandbox", () => {
  it("keeps only allow-scripts, whatever is asked for", () => {
    expect(safeSandbox("allow-scripts allow-same-origin allow-top-navigation allow-popups")).toBe(
      "allow-scripts"
    );
    expect(safeSandbox("allow-same-origin")).toBe("");
    expect(safeSandbox("")).toBe("");
    expect(safeSandbox(undefined)).toBe("");
  });
});

describe("sanitizeEditMessage", () => {
  const good = { type: "edit", id: 12, tag: "p", originalHtml: "a", html: "b" };

  it("accepts a well-formed edit and copies only known fields", () => {
    expect(sanitizeEditMessage({ ...good, extra: "<script>" })).toEqual({
      id: 12,
      tag: "p",
      originalHtml: "a",
      html: "b",
    });
    expect(sanitizeEditMessage({ ...good, newTag: "h2" }).newTag).toBe("h2");
  });

  it("rejects anything off-shape", () => {
    for (const bad of [
      null,
      { ...good, id: "12" },
      { ...good, id: -1 },
      { ...good, id: 1.5 },
      { ...good, tag: "script" },
      { ...good, tag: "img" },
      { ...good, html: 5 },
      { ...good, originalHtml: undefined },
      { ...good, newTag: "script" },
      { ...good, newTag: "li" },
      { ...good, html: "x".repeat(5 * 1024 * 1024) },
    ]) {
      expect(sanitizeEditMessage(bad)).toBeNull();
    }
  });
});

describe("sanitizeSelectionMessage", () => {
  it("keeps numbers and booleans, drops the rest", () => {
    const result = sanitizeSelectionMessage({
      active: true,
      rect: { top: 1, left: 2, right: 3, bottom: 4, evil: "x" },
      tag: "<img onerror>",
      bold: "yes",
      link: 7,
    });
    expect(result).toEqual({
      active: true,
      collapsed: false,
      rect: { top: 1, left: 2, right: 3, bottom: 4 },
      blockRect: { top: 1, left: 2, right: 3, bottom: 4 },
      tag: "p",
      styleable: false,
      bold: false,
      italic: false,
      link: null,
    });
    expect(sanitizeSelectionMessage({ active: true, rect: { top: NaN } })).toBeNull();
    expect(sanitizeSelectionMessage({ active: false })).toBeNull();
  });
});

describe("sanitizeKeyMessage", () => {
  it("passes a short key and boolean modifiers only", () => {
    expect(sanitizeKeyMessage({ key: "k", metaKey: true, shiftKey: "yes" })).toEqual({
      key: "k",
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    });
    expect(sanitizeKeyMessage({ key: "x".repeat(40) })).toBeNull();
    expect(sanitizeKeyMessage({ key: 3 })).toBeNull();
  });

  it("accepts only the allowed shapes", () => {
    for (const key of ["b", "B", "=", "+", "/", "0", "Enter", "ArrowUp", "F5"]) {
      expect(sanitizeKeyMessage({ key, ctrlKey: true })).not.toBeNull();
    }
    for (const key of ["", " ", "bb", "ƒ", "Enterx", "<script>", "F13", "Unidentified"]) {
      expect(sanitizeKeyMessage({ key, metaKey: true })).toBeNull();
    }
  });

  it("needs ⌘ or Ctrl, except for a bare Escape", () => {
    expect(sanitizeKeyMessage({ key: "b" })).toBeNull();
    expect(sanitizeKeyMessage({ key: "b", shiftKey: true, altKey: true })).toBeNull();
    expect(sanitizeKeyMessage({ key: "Enter", shiftKey: true })).toBeNull();
    expect(sanitizeKeyMessage({ key: "Escape" })).toEqual({
      key: "Escape",
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    });
  });
});

describe("frameShortcuts", () => {
  const keymaps = {
    toggleSidebar: { key: "b", modifiers: ["mod"] },
    search: { key: "F", modifiers: ["mod", "shift"] },
    toggleFocusMode: { key: "F", modifiers: ["mod", "alt"] },
    // Native editing keys stay with the frame whatever a keymap says.
    newNote: { key: "c", modifiers: ["mod"] },
    // Not an app-level action: the editor's own formatting.
    bold: { key: "B", modifiers: ["mod", "shift"] },
  };

  it("lists the app's chords under the user's keymaps", () => {
    const chords = frameShortcuts(keymaps);
    expect(chords).toContainEqual({ key: "b", shift: false, alt: false });
    expect(chords).toContainEqual({ key: "f", shift: true, alt: false });
    expect(chords).toContainEqual({ key: "f", shift: false, alt: true });
    // ⌘⇧Enter focus mode and the shifted zoom keys are bound outside keymaps.
    expect(chords).toContainEqual({ key: "enter", shift: true, alt: false });
    expect(chords).toContainEqual({ key: "+", shift: true, alt: false });
    expect(chords).not.toContainEqual({ key: "c", shift: false, alt: false });
    expect(chords).not.toContainEqual({ key: "b", shift: true, alt: false });
  });

  it("skips entries without ⌘/Ctrl or with a key of the wrong shape", () => {
    expect(chordOf({ key: "b", modifiers: ["shift"] })).toBeNull();
    expect(chordOf({ key: "bb", modifiers: ["mod"] })).toBeNull();
    expect(chordOf(null)).toBeNull();
    expect(frameShortcuts({ toggleSidebar: { key: "b" } })).not.toContainEqual(
      expect.objectContaining({ key: "b", shift: false })
    );
  });

  it("gives Edit the markdown editor's formatting keys", () => {
    expect(formatShortcuts(keymaps).bold).toEqual({ key: "b", shift: true, alt: false });
    expect(formatShortcuts({}).italic).toBeNull();
  });
});

describe("isAcceptableHref", () => {
  it("allows web, mail, anchors and relative paths", () => {
    for (const ok of [
      "https://a.test",
      "http://a.test/x",
      "mailto:a@b.test",
      "#top",
      "other.html",
      "../up.html",
      "/abs",
    ]) {
      expect(isAcceptableHref(ok)).toBe(true);
    }
  });
  it("refuses script and data URLs", () => {
    for (const bad of [
      "javascript:alert(1)",
      " JavaScript:x",
      "data:text/html,x",
      "vbscript:x",
      "file:///etc/passwd",
      "",
    ]) {
      expect(isAcceptableHref(bad)).toBe(false);
    }
  });
});

describe("classifyFrameLink", () => {
  const location = {
    origin: "marky-doc://localhost",
    rootKey: "k",
    rootPath: "/Users/me/Vault",
  };

  it("sends web and mail links to the system", () => {
    expect(classifyFrameLink("https://example.com/a", location)).toEqual({
      action: "external",
      url: "https://example.com/a",
    });
    expect(classifyFrameLink("mailto:a@b.test", location).action).toBe("external");
  });

  it("opens other vault documents in Marky", () => {
    expect(classifyFrameLink("marky-doc://localhost/k/Notes/Plan.md", location)).toEqual({
      action: "document",
      path: "/Users/me/Vault/Notes/Plan.md",
    });
    expect(classifyFrameLink("marky-doc://localhost/k/b.html", location).action).toBe("document");
  });

  it("does nothing with other files, other schemes or nonsense", () => {
    expect(classifyFrameLink("marky-doc://localhost/k/app.zip", location)).toEqual({
      action: "ignore",
      reason: "not-a-document",
    });
    for (const href of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "asset://localhost/x",
      "x",
      "",
      5,
    ]) {
      expect(classifyFrameLink(href, location).action).toBe("ignore");
    }
  });

  it("does not treat a Windows document-scheme URL as external", () => {
    const windows = { ...location, origin: "http://marky-doc.localhost" };
    expect(classifyFrameLink("http://marky-doc.localhost/k/b.html", windows).action).toBe(
      "document"
    );
  });
});

describe("document locations", () => {
  it("uses the vault as the root for files inside it, else the file's folder", () => {
    expect(documentRootFor("/V/Projects/a.html", "/V")).toBe("/V");
    expect(documentRootFor("/Downloads/a.html", "/V")).toBe("/Downloads");
    expect(documentRootFor("C:\\V\\a.html", "C:\\V")).toBe("C:/V");
  });

  it("builds the base from the registered key", async () => {
    const location = await resolveDocumentLocation("/V/Projects/Q3 report.html", "/V");
    expect(location.rootKey).toBe("key123");
    expect(location.baseHref).toBe("marky-doc://localhost/key123/Projects/");
  });
});

describe("documentText", () => {
  const html = {
    id: "note::/v/a.html",
    kind: "html",
    content: '<style>.kpi{color:#fff}</style><h1>Q3 report</h1><p class="kpi">Downloads grew</p>',
  };
  const note = { id: "note::/v/b.md", content: "# Plan\n\nWords here" };

  it("reads an HTML document's visible text and a note's markdown", () => {
    expect(documentText(html)).toBe("Q3 report Downloads grew");
    expect(documentText(note)).toBe(note.content);
    expect(documentText(null)).toBe("");
  });

  it("counts and excerpts by kind", () => {
    expect(documentWordCount(html)).toBe(4);
    expect(documentWordCount(note)).toBe(4);
    expect(documentExcerpt(html, 9)).toBe("Q3 report…");
  });
});
