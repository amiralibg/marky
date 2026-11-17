import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((command) =>
    command === "register_document_root" ? Promise.resolve("rootkey") : Promise.resolve()
  ),
}));
vi.mock("../../utils/platform", () => ({ detectPlatform: () => "macos" }));

import { invoke } from "@tauri-apps/api/core";
import HtmlDocumentView, { HtmlViewModeControl } from "./HtmlDocumentView";
import { buildSourceMap } from "../../utils/htmlSourceMap";

const SOURCE =
  '<!doctype html>\r\n<html><body>\r\n<h1>Q3 report</h1>\r\n<p class=lead>Downloads grew.</p>\r\n<script>document.title = "ran"</script>\r\n</body></html>';

const renderView = async (props = {}) => {
  const onChange = vi.fn();
  const notify = vi.fn();
  let view;
  await act(async () => {
    view = render(
      <HtmlDocumentView
        source={SOURCE}
        filePath="/Vault/Projects/Q3 report.html"
        vaultRoot="/Vault"
        name="Q3 report"
        mode="preview"
        runScripts
        onChange={onChange}
        notify={notify}
        {...props}
      />
    );
  });
  return { ...view, onChange, notify };
};

const frame = (container) => container.querySelector("iframe");

/** A message as the frame would send it: from its own window, on its channel. */
const fromFrame = (iframe, data) => {
  const channel = /"channel":"([0-9a-f]+)"/.exec(iframe.getAttribute("srcdoc"))[1];
  window.dispatchEvent(
    new MessageEvent("message", { data: { channel, ...data }, source: iframe.contentWindow })
  );
};

beforeEach(() => {
  invoke.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("HtmlViewModeControl", () => {
  it("offers Preview, Edit and Source and reports the pick", () => {
    const onChange = vi.fn();
    render(<HtmlViewModeControl mode="edit" onChange={onChange} />);
    expect(screen.getByRole("button", { name: /edit view/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: /source view/i }));
    expect(onChange).toHaveBeenCalledWith("source");
  });
});

describe("HtmlDocumentView preview", () => {
  it("renders the page in a frame sandboxed without same-origin, based on the vault", async () => {
    const { container } = await renderView();
    const iframe = frame(container);
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    const srcdoc = iframe.getAttribute("srcdoc");
    expect(srcdoc).toContain('<base href="marky-doc://localhost/rootkey/Projects/">');
    expect(srcdoc).toContain("Content-Security-Policy");
    expect(invoke).toHaveBeenCalledWith("register_document_root", { path: "/Vault" });
  });

  it("runs none of the document's scripts when scripts are off, only the agent", async () => {
    const { container } = await renderView({ runScripts: false });
    const iframe = frame(container);
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    const srcdoc = iframe.getAttribute("srcdoc");
    const nonce = srcdoc.match(/script-src 'nonce-([0-9a-f]+)'/)?.[1];
    expect(nonce).toBeTruthy();
    // The agent carries the nonce; the document's own script does not.
    expect(srcdoc).toContain(`<script nonce="${nonce}">`);
    expect(srcdoc).toContain('<script>document.title = "ran"</script>');
    expect(screen.getByText("Scripts off")).toBeInTheDocument();
  });

  it("shows the status bar actions", async () => {
    await renderView();
    expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /open in browser/i }));
    expect(invoke).toHaveBeenCalledWith("open_document_in_browser", {
      path: "/Vault/Projects/Q3 report.html",
    });
    expect(screen.getByText(/HTML document · \d+ B/)).toBeInTheDocument();
  });

  it("opens web links through the app and ignores messages from anyone else", async () => {
    const { container } = await renderView();
    const iframe = frame(container);
    // Not the frame's window: ignored.
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "link", href: "https://evil.test" },
        source: window,
      })
    );
    expect(invoke).not.toHaveBeenCalledWith("open_external_url", expect.anything());
    // The frame, without its channel: ignored.
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "link", href: "https://evil.test", channel: "wrong" },
        source: iframe.contentWindow,
      })
    );
    expect(invoke).not.toHaveBeenCalledWith("open_external_url", expect.anything());

    await act(async () => fromFrame(iframe, { type: "link", href: "https://example.com/x" }));
    expect(invoke).toHaveBeenCalledWith("open_external_url", { url: "https://example.com/x" });
  });

  it("opens a link to another vault document in Marky", async () => {
    const onOpenDocument = vi.fn();
    const { container } = await renderView({ onOpenDocument });
    await act(async () =>
      fromFrame(frame(container), {
        type: "link",
        href: "marky-doc://localhost/rootkey/Notes/Plan.md",
      })
    );
    expect(onOpenDocument).toHaveBeenCalledWith("/Vault/Notes/Plan.md");
  });
});

describe("HtmlDocumentView shortcuts", () => {
  it("replays a forwarded shortcut on the app's window, in Preview and Edit", async () => {
    for (const mode of ["preview", "edit"]) {
      const { container, unmount } = await renderView({ mode });
      const seen = [];
      const listener = (event) => seen.push(event);
      window.addEventListener("keydown", listener);
      await act(async () =>
        fromFrame(frame(container), { type: "key", key: "b", metaKey: true, extra: "x" })
      );
      window.removeEventListener("keydown", listener);
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({ key: "b", metaKey: true, shiftKey: false });
      unmount();
    }
  });

  it("drops a forwarded key of the wrong shape", async () => {
    const { container } = await renderView();
    const seen = [];
    const listener = (event) => seen.push(event);
    window.addEventListener("keydown", listener);
    for (const data of [
      { key: "b" },
      { key: "<img>", metaKey: true },
      { key: { toString: () => "b" }, metaKey: true },
    ]) {
      await act(async () => fromFrame(frame(container), { type: "key", ...data }));
    }
    window.removeEventListener("keydown", listener);
    expect(seen).toHaveLength(0);
  });

  it("hands the frame the user's keymaps", async () => {
    const { container } = await renderView({
      keymaps: { toggleSidebar: { key: "j", modifiers: ["mod"] } },
    });
    const srcdoc = frame(container).getAttribute("srcdoc");
    expect(srcdoc).toContain('{"key":"j","shift":false,"alt":false}');
    expect(srcdoc).not.toContain('{"key":"b","shift":false,"alt":false}');
  });
});

describe("HtmlDocumentView edit", () => {
  it("marks the page as editable with scripts paused, and changes nothing by itself", async () => {
    vi.useFakeTimers();
    const { container, onChange, rerender } = await renderView({ mode: "edit" });
    const iframe = frame(container);
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe.getAttribute("srcdoc")).toMatch(/script-src 'nonce-[0-9a-f]+'/);
    expect(screen.getByText("Editing in place · scripts paused")).toBeInTheDocument();

    // The frame says hello, the user clicks around, nobody types.
    await act(async () => fromFrame(iframe, { type: "ready", blocks: 2 }));
    await act(async () => vi.advanceTimersByTime(1000));
    rerender(
      <HtmlDocumentView
        source={SOURCE}
        filePath="/Vault/Projects/Q3 report.html"
        vaultRoot="/Vault"
        mode="preview"
        runScripts
        onChange={onChange}
        notify={() => {}}
      />
    );
    await act(async () => vi.advanceTimersByTime(1000));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("writes an edit into the block's inner range only", async () => {
    vi.useFakeTimers();
    const { container, onChange } = await renderView({ mode: "edit" });
    const map = buildSourceMap(SOURCE);
    const paragraph = map.blocks.find((b) => b.tag === "p");
    await act(async () =>
      fromFrame(frame(container), {
        type: "edit",
        id: paragraph.id,
        tag: "p",
        originalHtml: "Downloads grew.",
        html: "Downloads grew <b>22%</b>.",
      })
    );
    await act(async () => vi.advanceTimersByTime(500));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      SOURCE.replace("Downloads grew.", "Downloads grew <b>22%</b>.")
    );
  });

  it("refuses an edit that does not match the file, with a message", async () => {
    vi.useFakeTimers();
    const { container, onChange, notify } = await renderView({ mode: "edit" });
    const paragraph = buildSourceMap(SOURCE).blocks.find((b) => b.tag === "p");
    await act(async () =>
      fromFrame(frame(container), {
        type: "edit",
        id: paragraph.id,
        tag: "p",
        originalHtml: "Something else",
        html: "Edited",
      })
    );
    await act(async () => vi.advanceTimersByTime(500));
    expect(onChange).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/changed on disk/), "warning");
    expect(screen.getByText("1 edit not saved")).toBeInTheDocument();
  });

  it("says nothing about a click outside any block, but explains a locked one", async () => {
    const { container, notify } = await renderView({ mode: "edit" });
    // An older agent's "unmapped" report: no longer a message for the user.
    await act(async () => fromFrame(frame(container), { type: "unmapped" }));
    expect(notify).not.toHaveBeenCalled();
    await act(async () =>
      fromFrame(frame(container), { type: "locked", id: 3, reason: "unsound" })
    );
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(expect.any(String), "warning");
  });

  it("deselects the active block on Escape from the app's side", async () => {
    const { container } = await renderView({ mode: "edit" });
    const iframe = frame(container);
    const post = vi.spyOn(iframe.contentWindow, "postMessage");
    await act(async () =>
      fromFrame(iframe, {
        type: "selection",
        active: true,
        rect: { top: 100, left: 10, right: 50, bottom: 120 },
      })
    );
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "deactivate" }), "*");
  });

  it("ignores edit messages of the wrong shape", async () => {
    vi.useFakeTimers();
    const { container, onChange } = await renderView({ mode: "edit" });
    await act(async () =>
      fromFrame(frame(container), { type: "edit", id: "0", tag: "script", html: 1 })
    );
    await act(async () => vi.advanceTimersByTime(500));
    expect(onChange).not.toHaveBeenCalled();
  });
});
