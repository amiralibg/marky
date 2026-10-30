import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installQuietScrollbars, SCROLL_IDLE_MS } from "./quietScrollbars";

describe("installQuietScrollbars", () => {
  let uninstall;
  let pane;

  beforeEach(() => {
    vi.useFakeTimers();
    pane = document.createElement("div");
    document.body.appendChild(pane);
    uninstall = installQuietScrollbars(document);
  });

  afterEach(() => {
    uninstall();
    pane.remove();
    vi.useRealTimers();
  });

  it("marks only the element that scrolled, then clears it once scrolling stops", () => {
    const other = document.createElement("div");
    document.body.appendChild(other);

    pane.dispatchEvent(new Event("scroll"));
    expect(pane.hasAttribute("data-scrolling")).toBe(true);
    expect(other.hasAttribute("data-scrolling")).toBe(false);

    vi.advanceTimersByTime(SCROLL_IDLE_MS + 1);
    expect(pane.hasAttribute("data-scrolling")).toBe(false);
    other.remove();
  });

  it("keeps the bar up while scroll events keep coming", () => {
    pane.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(SCROLL_IDLE_MS - 100);
    pane.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(SCROLL_IDLE_MS - 100);
    expect(pane.hasAttribute("data-scrolling")).toBe(true);
  });
});
