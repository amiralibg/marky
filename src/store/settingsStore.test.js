import { describe, expect, it } from "vitest";
import useSettingsStore, {
  applyFontScale,
  clampFontScale,
  FONT_SCALE_DEFAULT,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
  normalizeViewMode,
  VIEW_MODE_DEFAULT,
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

describe("editor view mode", () => {
  it("remembers the last Source/Live/Read choice across reloads", () => {
    useSettingsStore.getState().setEditorViewMode("read");

    expect(useSettingsStore.getState().editorViewMode).toBe("read");
    const persisted = JSON.parse(localStorage.getItem("marky-settings"));
    expect(persisted.state.editorViewMode).toBe("read");
  });

  it("falls back to Live for anything that is not a known mode", () => {
    useSettingsStore.getState().setEditorViewMode("split");
    expect(useSettingsStore.getState().editorViewMode).toBe(VIEW_MODE_DEFAULT);
    expect(normalizeViewMode(undefined)).toBe("live");
    expect(normalizeViewMode("source")).toBe("source");
  });
});
