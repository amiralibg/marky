import { describe, expect, it, vi } from "vitest";
import { scrollItemIntoView } from "./scrollItemIntoView";

const makeElement = (rect, scrollTop = 0) => ({
  scrollTop,
  getBoundingClientRect: () => rect,
});

const rect = (top, height) => ({ top, bottom: top + height, height });

describe("scrollItemIntoView", () => {
  it("does nothing when the item is already fully visible", () => {
    const container = makeElement(rect(100, 300), 40);
    scrollItemIntoView(container, makeElement(rect(150, 50)));
    expect(container.scrollTop).toBe(40);
  });

  it("scrolls up by the overshoot when the item sits above the viewport", () => {
    const container = makeElement(rect(100, 300), 200);
    scrollItemIntoView(container, makeElement(rect(70, 50)));
    expect(container.scrollTop).toBe(170);
  });

  it("scrolls down by the overshoot when the item sits below the viewport", () => {
    const container = makeElement(rect(100, 300), 0);
    scrollItemIntoView(container, makeElement(rect(380, 50)));
    expect(container.scrollTop).toBe(30);
  });

  it("never calls scrollIntoView, which would move ancestors too", () => {
    const container = makeElement(rect(100, 300), 0);
    const item = makeElement(rect(380, 50));
    item.scrollIntoView = vi.fn();
    scrollItemIntoView(container, item);
    expect(item.scrollIntoView).not.toHaveBeenCalled();
  });

  it("tolerates missing nodes", () => {
    expect(() => scrollItemIntoView(null, null)).not.toThrow();
  });
});
