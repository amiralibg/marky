import { describe, it, expect, afterEach, vi } from "vitest";
import { editorAcceptsDrop, setEditorDropResolver, toLogicalPosition } from "./externalDrop";

afterEach(() => setEditorDropResolver(null));

describe("editorAcceptsDrop", () => {
  it("says no while nothing has claimed drops", () => {
    expect(editorAcceptsDrop({ x: 1, y: 1 }, ["/a.png"])).toBe(false);
  });

  it("passes the payload through to the registered resolver", () => {
    const resolver = vi.fn(() => true);
    setEditorDropResolver(resolver);

    expect(editorAcceptsDrop({ x: 10, y: 20 }, ["/a.png"])).toBe(true);
    expect(resolver).toHaveBeenCalledWith({ x: 10, y: 20 }, ["/a.png"]);
  });

  it("goes back to saying no once the editor unregisters", () => {
    setEditorDropResolver(() => true);
    setEditorDropResolver(null);
    expect(editorAcceptsDrop({ x: 1, y: 1 }, ["/a.png"])).toBe(false);
  });

  // The sidebar handles the drop when this returns false, so a resolver that
  // throws must not take the drop down with it.
  it("falls back to no when the resolver throws", () => {
    setEditorDropResolver(() => {
      throw new Error("view is gone");
    });
    expect(editorAcceptsDrop({ x: 1, y: 1 }, ["/a.png"])).toBe(false);
  });
});

// Tauri types every drag position as a `PhysicalPosition`, but only Windows
// actually sends one — the runtime relabels the platform's value without ever
// applying the scale factor. Halving the coordinate on a Retina Mac is what put
// the drop caret away from the pointer, further off the lower it was dragged.
describe("toLogicalPosition", () => {
  const originalRatio = window.devicePixelRatio;
  const originalAgent = navigator.userAgent;

  const pretendPlatform = (userAgent) =>
    Object.defineProperty(navigator, "userAgent", { value: userAgent, configurable: true });

  afterEach(() => {
    window.devicePixelRatio = originalRatio;
    pretendPlatform(originalAgent);
  });

  it("leaves a macOS point alone — AppKit already reports CSS pixels", () => {
    pretendPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
    window.devicePixelRatio = 2;
    expect(toLogicalPosition({ x: 400, y: 300 })).toEqual({ x: 400, y: 300 });
  });

  it("leaves GTK widget coordinates alone on Linux for the same reason", () => {
    pretendPlatform("Mozilla/5.0 (X11; Linux x86_64)");
    window.devicePixelRatio = 2;
    expect(toLogicalPosition({ x: 400, y: 300 })).toEqual({ x: 400, y: 300 });
  });

  it("scales Windows down, where the value really is in device pixels", () => {
    pretendPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    window.devicePixelRatio = 2;
    expect(toLogicalPosition({ x: 400, y: 300 })).toEqual({ x: 200, y: 150 });
  });

  it("is a no-op at a ratio of one, whatever the platform", () => {
    pretendPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    window.devicePixelRatio = 1;
    expect(toLogicalPosition({ x: 400, y: 300 })).toEqual({ x: 400, y: 300 });
  });

  // The position is relative to the webview, so it has to land inside it. If the
  // platform rule is ever wrong, the wrong reading falls off-screen.
  it("takes the other reading when the expected one lands outside the window", () => {
    pretendPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
    window.devicePixelRatio = 2;

    const offScreen = { x: window.innerWidth * 2 - 20, y: window.innerHeight * 2 - 20 };
    expect(toLogicalPosition(offScreen)).toEqual({
      x: offScreen.x / 2,
      y: offScreen.y / 2,
    });
  });

  it("handles a missing position", () => {
    expect(toLogicalPosition(null)).toBeNull();
  });
});
