import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

// One handler is registered per mounted hook; tests drive it directly, which is
// exactly what Tauri does when a file crosses the window.
let handlers = [];
const unlisten = vi.fn();

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: async (handler) => {
      handlers.push(handler);
      return unlisten;
    },
  }),
}));

const { useExternalImageDrop } = await import("./useExternalImageDrop");
const { editorAcceptsDrop } = await import("../utils/externalDrop");
const { dropIndicator } = await import("../components/editor/dropIndicator");

const EDITOR_RECT = { left: 100, right: 500, top: 50, bottom: 400 };

// jsdom lays nothing out, so the two measurements the hook depends on are
// stubbed: where the editor is, and what offset a point maps to.
const makeView = (doc = "hello world", { scrollerRect = EDITOR_RECT, clipRect } = {}) => {
  let parent = document.body;
  if (clipRect) {
    // A scrolling container around the editor, which is how the app is laid out
    // in auto-height mode: the editor grows to fit the note and this scrolls.
    const wrapper = document.createElement("div");
    wrapper.style.overflowY = "auto";
    wrapper.getBoundingClientRect = () => clipRect;
    document.body.appendChild(wrapper);
    parent = wrapper;
  }

  const view = new EditorView({
    state: EditorState.create({ doc, extensions: [dropIndicator()] }),
    parent,
  });
  view.scrollDOM.getBoundingClientRect = () => scrollerRect;
  view.posAtCoords = ({ x }) => Math.min(Math.round(x - EDITOR_RECT.left), doc.length);
  return view;
};

const emit = (payload) => handlers.forEach((handler) => handler({ payload }));

// Tauri reports physical pixels; the tests pin the ratio at 1 so the numbers
// here are the CSS pixels the stubs above expect.
const at = (x, y) => ({ x, y });

describe("useExternalImageDrop", () => {
  let view;
  let onDropImages;

  beforeEach(() => {
    handlers = [];
    window.devicePixelRatio = 1;
    view = makeView();
    onDropImages = vi.fn(async () => {});
  });

  afterEach(() => {
    view.destroy();
    vi.clearAllMocks();
  });

  const mount = (options = {}) =>
    renderHook(() =>
      useExternalImageDrop({
        getView: () => view,
        onDropImages,
        ...options,
      })
    );

  const ready = async () => await waitFor(() => expect(handlers.length).toBe(1));

  it("claims an image held over the editor, so the sidebar leaves it alone", async () => {
    mount();
    await ready();
    expect(editorAcceptsDrop(at(200, 100), ["/photos/a.png"])).toBe(true);
  });

  it("leaves a drop outside the editor to the sidebar", async () => {
    mount();
    await ready();
    expect(editorAcceptsDrop(at(20, 100), ["/photos/a.png"])).toBe(false);
  });

  it("leaves a dropped markdown file to the sidebar", async () => {
    mount();
    await ready();
    expect(editorAcceptsDrop(at(200, 100), ["/notes/a.md"])).toBe(false);
  });

  it("shows the caret at the point under the pointer", async () => {
    mount();
    await ready();

    emit({ type: "enter", position: at(104, 100), paths: ["/photos/a.png"] });
    expect(view.dom.querySelector(".cm-marky-drop-caret")).not.toBeNull();

    emit({ type: "leave" });
    expect(view.dom.querySelector(".cm-marky-drop-caret")).toBeNull();
  });

  // Tauri's `over` payload carries a position and nothing else — the paths are
  // only named on `enter`. Reading them straight off the `over` event meant the
  // answer was always "not an image" and the caret never appeared.
  it("keeps claiming the drag while hovering, though `over` omits the paths", async () => {
    mount();
    await ready();

    emit({ type: "enter", position: at(104, 100), paths: ["/photos/a.png"] });
    emit({ type: "over", position: at(108, 100) });

    expect(editorAcceptsDrop(at(200, 100))).toBe(true);
    expect(view.dom.querySelector(".cm-marky-drop-caret")).not.toBeNull();
  });

  it("stops claiming once the drag ends", async () => {
    mount();
    await ready();

    emit({ type: "enter", position: at(104, 100), paths: ["/photos/a.png"] });
    emit({ type: "leave" });

    expect(editorAcceptsDrop(at(200, 100))).toBe(false);
  });

  it("hands the drop offset to the caller and clears the caret", async () => {
    mount();
    await ready();

    emit({ type: "enter", position: at(104, 100), paths: ["/photos/a.png"] });
    emit({ type: "over", position: at(104, 100) });
    emit({ type: "drop", position: at(104, 100), paths: ["/photos/a.png"] });

    expect(onDropImages).toHaveBeenCalledWith(["/photos/a.png"], 4);
    expect(view.dom.querySelector(".cm-marky-drop-caret")).toBeNull();
  });

  it("passes on only the images out of a mixed drop", async () => {
    mount();
    await ready();
    emit({ type: "drop", position: at(102, 100), paths: ["/a.png", "/b.md", "/c.jpg"] });
    expect(onDropImages).toHaveBeenCalledWith(["/a.png", "/c.jpg"], 2);
  });

  it("ignores a drop that lands outside the editor", async () => {
    mount();
    await ready();
    emit({ type: "drop", position: at(20, 100), paths: ["/a.png"] });
    expect(onDropImages).not.toHaveBeenCalled();
  });

  it("stops claiming drops once unmounted", async () => {
    const { unmount } = mount();
    await ready();
    unmount();

    expect(editorAcceptsDrop(at(200, 100), ["/photos/a.png"])).toBe(false);
    expect(unlisten).toHaveBeenCalled();
  });

  // In auto-height mode `.cm-scroller` is as tall as the whole note, so its box
  // runs off the top of the window behind the tab bar. Hit-testing against it
  // claimed drags over the tabs and dropped the caret at whatever line sat at
  // that height, far outside the visible text.
  describe("with the editor inside a scrolling container", () => {
    const CLIP = { left: 100, right: 500, top: 90, bottom: 700 };
    const TALL_SCROLLER = { left: 100, right: 500, top: -2000, bottom: 3000 };

    beforeEach(() => {
      view.destroy();
      view = makeView("hello world", { scrollerRect: TALL_SCROLLER, clipRect: CLIP });
    });

    it("ignores a drag over the tab bar above the visible editor", async () => {
      mount();
      await ready();
      expect(editorAcceptsDrop(at(200, 50), ["/a.png"])).toBe(false);
    });

    it("still claims a drag over the text itself", async () => {
      mount();
      await ready();
      expect(editorAcceptsDrop(at(200, 200), ["/a.png"])).toBe(true);
    });

    it("ignores a drag below the visible editor", async () => {
      mount();
      await ready();
      expect(editorAcceptsDrop(at(200, 740), ["/a.png"])).toBe(false);
    });
  });

  it("does not listen at all while disabled", async () => {
    mount({ enabled: false });
    expect(handlers).toHaveLength(0);
    expect(editorAcceptsDrop(at(200, 100), ["/photos/a.png"])).toBe(false);
  });
});
