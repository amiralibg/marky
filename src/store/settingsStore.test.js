import { describe, expect, it } from "vitest";
import {
  applyFontScale,
  clampFontScale,
  FONT_SCALE_DEFAULT,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
} from "./settingsStore";

describe("clampFontScale", () => {
  it("keeps a value that is already on a step", () => {
    expect(clampFontScale(120)).toBe(120);
  });

  it("holds at the ends of the range", () => {
    expect(clampFontScale(FONT_SCALE_MIN - FONT_SCALE_STEP)).toBe(FONT_SCALE_MIN);
    expect(clampFontScale(FONT_SCALE_MAX + FONT_SCALE_STEP)).toBe(FONT_SCALE_MAX);
  });

  it("snaps an off-step value to the nearest step", () => {
    expect(clampFontScale(103)).toBe(100);
    expect(clampFontScale(126)).toBe(130);
  });

  it("falls back to the default for values that are not numbers", () => {
    expect(clampFontScale(undefined)).toBe(FONT_SCALE_DEFAULT);
    expect(clampFontScale("huge")).toBe(FONT_SCALE_DEFAULT);
  });
});

describe("applyFontScale", () => {
  it("moves the root font size so every rem in the app follows", () => {
    applyFontScale(150);
    expect(document.documentElement.style.fontSize).toBe("24px");

    applyFontScale(FONT_SCALE_DEFAULT);
    expect(document.documentElement.style.fontSize).toBe("16px");
  });

  it("publishes the multiplier CodeMirror's px sizing reads", () => {
    applyFontScale(120);
    expect(document.documentElement.style.getPropertyValue("--marky-font-scale")).toBe("1.2");
  });

  it("clamps before applying, so a stored out-of-range value cannot shrink the app away", () => {
    applyFontScale(10);
    expect(document.documentElement.style.fontSize).toBe(`${(16 * FONT_SCALE_MIN) / 100}px`);
  });
});
