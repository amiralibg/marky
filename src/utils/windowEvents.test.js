import { beforeEach, describe, expect, it, vi } from "vitest";

const listen = vi.fn();
const getCurrentWindow = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({ listen: (...args) => listen(...args) }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => getCurrentWindow() }));

const loadModule = async () => {
  vi.resetModules();
  return import("./windowEvents");
};

/** Registers a listener and hands back the callback Tauri would invoke. */
const attach = async (event = "menu://new-window") => {
  const { listenForWindow } = await loadModule();
  const handler = vi.fn();
  await listenForWindow(event, handler);
  return { handler, deliver: listen.mock.calls.at(-1)[1] };
};

beforeEach(() => {
  listen.mockReset();
  listen.mockResolvedValue(() => {});
  getCurrentWindow.mockReset();
  getCurrentWindow.mockReturnValue({ label: "vault-abc" });
});

describe("listenForWindow", () => {
  it("subscribes the ordinary way, so a broadcast always reaches it", async () => {
    await attach();
    // No target option: an addressed emit would not match this listener, which
    // is why the sender broadcasts and names its window in the payload instead.
    expect(listen.mock.calls.at(-1)).toHaveLength(2);
  });

  it("runs the handler for an event meant for this window", async () => {
    const { handler, deliver } = await attach();
    deliver({ payload: { window: "vault-abc" } });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("ignores an event meant for another window", async () => {
    const { handler, deliver } = await attach();
    deliver({ payload: { window: "main" } });

    expect(handler).not.toHaveBeenCalled();
  });

  it("runs the handler when no window is named, since that means everyone", async () => {
    const { handler, deliver } = await attach();
    deliver({ payload: { window: null } });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("passes the whole event through, payload included", async () => {
    const { handler, deliver } = await attach("file-change");
    const event = { payload: { window: "vault-abc", path: "/vault/a.md" } };
    deliver(event);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it("still delivers without a Tauri runtime to compare against", async () => {
    getCurrentWindow.mockImplementation(() => {
      throw new Error("no runtime");
    });

    const { handler, deliver } = await attach();
    deliver({ payload: { window: "main" } });

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
