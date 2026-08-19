import { describe, it, expect, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { imagePaste } from "./imagePaste";

const makeView = (doc = "", saveImage = vi.fn(), onError = vi.fn()) => {
  const state = EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [imagePaste({ saveImage, onError })],
  });
  const view = new EditorView({ state, parent: document.body });
  return { view, saveImage, onError };
};

// jsdom has no ClipboardEvent with a usable DataTransfer, so the event is
// hand-rolled — the handler only ever reads `clipboardData`.
const pasteEvent = ({ items = [], text = "" } = {}) => {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      items,
      files: [],
      getData: (type) => (type === "text/plain" ? text : ""),
    },
  });
  return event;
};

const imageItem = (file) => ({ kind: "file", type: file.type, getAsFile: () => file });

const pngFile = (name = "image.png") =>
  new File([new Uint8Array([1, 2, 3])], name, {
    type: "image/png",
  });

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("imagePaste", () => {
  it("saves a pasted bitmap and links it where the cursor was", async () => {
    const saveImage = vi.fn(async () => "![](attachments/a.png)");
    const { view } = makeView("Before ", saveImage);

    view.contentDOM.dispatchEvent(pasteEvent({ items: [imageItem(pngFile())] }));
    await flush();

    expect(saveImage).toHaveBeenCalledTimes(1);
    expect(view.state.doc.toString()).toBe("Before ![](attachments/a.png)");
    view.destroy();
  });

  it("shows a placeholder while the file is being written", async () => {
    let release;
    const saveImage = vi.fn(
      () => new Promise((resolve) => (release = () => resolve("![](a.png)")))
    );
    const { view } = makeView("", saveImage);

    view.contentDOM.dispatchEvent(pasteEvent({ items: [imageItem(pngFile())] }));
    expect(view.state.doc.toString()).toContain("Saving image");

    release();
    await flush();
    expect(view.state.doc.toString()).toBe("![](a.png)");
    view.destroy();
  });

  // A failed write used to be invisible: the note kept a placeholder pointing at
  // a file that was never created.
  it("takes the placeholder back out when the write fails", async () => {
    const saveImage = vi.fn(async () => {
      throw new Error("nowhere to write");
    });
    const { view, onError } = makeView("Note", saveImage);

    view.contentDOM.dispatchEvent(pasteEvent({ items: [imageItem(pngFile())] }));
    await flush();

    expect(view.state.doc.toString()).toBe("Note");
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "nowhere to write" }));
    view.destroy();
  });

  it("leaves a text paste to the editor", async () => {
    const saveImage = vi.fn();
    const { view } = makeView("", saveImage);

    view.contentDOM.dispatchEvent(
      pasteEvent({ items: [imageItem(pngFile())], text: "some copied prose" })
    );
    await flush();

    expect(saveImage).not.toHaveBeenCalled();
    view.destroy();
  });

  // Copying a file in Finder puts the file *and* its path on the clipboard;
  // that path is not prose the user meant to paste.
  it("still takes the image when the only text is the file's own path", async () => {
    const saveImage = vi.fn(async () => "![](a.png)");
    const { view } = makeView("", saveImage);

    view.contentDOM.dispatchEvent(
      pasteEvent({ items: [imageItem(pngFile("a.png"))], text: "file:///Users/me/a.png" })
    );
    await flush();

    expect(saveImage).toHaveBeenCalledTimes(1);
    view.destroy();
  });

  it("inserts one link per image when several are pasted at once", async () => {
    let n = 0;
    const saveImage = vi.fn(async () => `![](${(n += 1)}.png)`);
    const { view } = makeView("", saveImage);

    view.contentDOM.dispatchEvent(
      pasteEvent({ items: [imageItem(pngFile("a.png")), imageItem(pngFile("b.png"))] })
    );
    await flush();
    await flush();

    expect(view.state.doc.toString()).toBe("![](1.png)![](2.png)");
    view.destroy();
  });
});
