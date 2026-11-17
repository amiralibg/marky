import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { editFrameAgent, previewFrameAgent } from "./htmlFrameAgents";
import { formatShortcuts, frameShortcuts } from "./htmlFrameMessages";

// The keymaps the defaults ship with, as far as these tests need them.
const KEYMAPS = {
  toggleSidebar: { key: "b", modifiers: ["mod"] },
  commandPalette: { key: "k", modifiers: ["mod"] },
  closeTab: { key: "w", modifiers: ["mod"] },
  search: { key: "F", modifiers: ["mod", "shift"] },
  bold: { key: "B", modifiers: ["mod", "shift"] },
  italic: { key: "i", modifiers: ["mod"] },
  link: { key: "K", modifiers: ["mod", "shift"] },
};

/**
 * Run an agent the way the frame does: as source text, inside a document of
 * its own (a same-origin iframe here, so the test can reach in). The agent
 * posts to `window.parent`, which is this test's window.
 */
const mount = (agent, config, bodyHtml) => {
  const iframe = document.createElement("iframe");
  document.body.appendChild(iframe);
  const win = iframe.contentWindow;
  win.document.open();
  win.document.write(`<!doctype html><html><head></head><body>${bodyHtml}</body></html>`);
  win.document.close();
  win.requestAnimationFrame = (callback) => win.setTimeout(callback, 0);
  // jsdom keeps `hash` on the location object itself, not its prototype.
  if (!Object.getOwnPropertyDescriptor(win.Location.prototype, "hash")) {
    Object.defineProperty(win.Location.prototype, "hash", {
      configurable: true,
      get: () => "",
      set: () => {},
    });
  }
  vi.spyOn(win.parent, "postMessage").mockImplementation((message) => posted.push(message));
  win.eval(`(${agent.toString()})(${JSON.stringify(config)});`);
  return { iframe, win, doc: win.document };
};

let posted;
beforeEach(() => {
  posted = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

const typesPosted = () => posted.map((message) => message.type);

const mousedown = (win, element) =>
  element.dispatchEvent(new win.MouseEvent("mousedown", { bubbles: true, cancelable: true }));

const keydown = (win, target, init) => {
  const event = new win.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

const EDIT_PAGE = `
  <main>
    <p data-marky-b="10">Editable paragraph</p>
    <table data-marky-b="20" data-marky-lock="unsound"><tr><td>Locked cell</td></tr></table>
    <div id="loose">Text that is part of no block</div>
  </main>`;

const mountEdit = () =>
  mount(
    editFrameAgent,
    {
      channel: "ch",
      parentOrigin: "*",
      mac: true,
      shortcuts: frameShortcuts(KEYMAPS),
      format: formatShortcuts(KEYMAPS),
    },
    EDIT_PAGE
  );

describe("edit agent: clicks", () => {
  it("activates an editable block on mousedown", () => {
    const { win, doc } = mountEdit();
    const paragraph = doc.querySelector("p");
    mousedown(win, paragraph);
    expect(paragraph.getAttribute("contenteditable")).toBe("true");
    expect(paragraph.hasAttribute("data-marky-on")).toBe(true);
  });

  it("deselects silently on a click outside any block", () => {
    const { win, doc } = mountEdit();
    const paragraph = doc.querySelector("p");
    mousedown(win, paragraph);
    posted = [];

    mousedown(win, doc.getElementById("loose"));
    expect(paragraph.hasAttribute("contenteditable")).toBe(false);
    expect(paragraph.hasAttribute("data-marky-on")).toBe(false);
    // The app hears that nothing is selected, and nothing else: no message
    // for the user.
    expect(typesPosted()).toEqual(["selection"]);
    expect(posted[0].active).toBe(false);
  });

  it("says nothing either when nothing was selected", () => {
    const { win, doc } = mountEdit();
    mousedown(win, doc.getElementById("loose"));
    mousedown(win, doc.body);
    expect(typesPosted()).not.toContain("locked");
    expect(typesPosted()).not.toContain("unmapped");
  });

  it("still explains a locked block, which looks editable", () => {
    const { win, doc } = mountEdit();
    mousedown(win, doc.querySelector("td"));
    const locked = posted.find((message) => message.type === "locked");
    expect(locked).toMatchObject({ id: 20, reason: "unsound", channel: "ch" });
    expect(doc.querySelector("table").hasAttribute("contenteditable")).toBe(false);
  });

  it("deselects on Escape", () => {
    const { win, doc } = mountEdit();
    const paragraph = doc.querySelector("p");
    mousedown(win, paragraph);
    const event = keydown(win, paragraph, { key: "Escape" });
    expect(event.defaultPrevented).toBe(true);
    expect(paragraph.hasAttribute("contenteditable")).toBe(false);
    // Handled in the frame: not forwarded to the app as well.
    expect(typesPosted()).not.toContain("key");
  });

  it("deselects when the app asks", () => {
    const { win, doc } = mountEdit();
    const paragraph = doc.querySelector("p");
    mousedown(win, paragraph);
    win.dispatchEvent(
      new win.MessageEvent("message", {
        data: { channel: "ch", type: "deactivate" },
        source: win.parent,
      })
    );
    expect(paragraph.hasAttribute("contenteditable")).toBe(false);
  });
});

describe("edit agent: shortcuts", () => {
  it("hands the app's shortcuts back, cancelled in the frame", () => {
    const { win, doc } = mountEdit();
    const paragraph = doc.querySelector("p");
    mousedown(win, paragraph);
    posted = [];
    // ⌘B is the sidebar here, as over a note — even with a block active.
    const event = keydown(win, paragraph, { key: "b", metaKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(posted).toEqual([
      {
        type: "key",
        key: "b",
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        channel: "ch",
      },
    ]);
  });

  it("formats on the bold keymap, not ⌘B", () => {
    const { win, doc } = mountEdit();
    const paragraph = doc.querySelector("p");
    mousedown(win, paragraph);
    doc.execCommand = vi.fn();
    posted = [];
    const event = keydown(win, paragraph, { key: "B", metaKey: true, shiftKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(doc.execCommand).toHaveBeenCalledWith("bold", false);
    expect(typesPosted()).not.toContain("key");
  });

  it("leaves chords the app does not bind to the page and the system", () => {
    const { win, doc } = mountEdit();
    for (const init of [
      { key: "c", metaKey: true },
      { key: "q", metaKey: true },
      { key: "h", metaKey: true },
    ]) {
      const event = keydown(win, doc.body, init);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(typesPosted()).not.toContain("key");
  });

  it("forwards Escape when no block is active", () => {
    const { win, doc } = mountEdit();
    keydown(win, doc.body, { key: "Escape" });
    expect(posted.find((message) => message.type === "key")).toMatchObject({ key: "Escape" });
  });
});

describe("preview agent", () => {
  it("forwards nothing from events the page made itself", () => {
    const { win, doc } = mount(
      previewFrameAgent,
      { channel: "ch", parentOrigin: "*", shortcuts: frameShortcuts(KEYMAPS) },
      "<p>Hi</p>"
    );
    // A script-dispatched event is never trusted, whatever it claims to be.
    const event = keydown(win, doc.body, { key: "b", metaKey: true });
    keydown(win, doc.body, { key: "Escape" });
    expect(event.defaultPrevented).toBe(false);
    expect(posted).toEqual([]);
  });
});
