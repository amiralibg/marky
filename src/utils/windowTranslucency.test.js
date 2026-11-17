import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve(true)) }));
vi.mock("./platform", () => ({ detectPlatform: () => "macos" }));

import { invoke } from "@tauri-apps/api/core";
import {
  DESK_TINT_FLOOR,
  TRANSLUCENCY_DEFAULT,
  applyTranslucencyAmount,
  applyWindowTranslucency,
  clampTranslucency,
  deskAlphaFor,
  syncWindowAppearance,
} from "./windowTranslucency";
import useSettingsStore from "../store/settingsStore";

const deskAlpha = () => document.documentElement.style.getPropertyValue("--desk-alpha");

afterEach(() => {
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.translucent;
  invoke.mockClear();
});

describe("deskAlphaFor", () => {
  it("is exactly the old fixed tint at the default amount", () => {
    // index.css's --desk-alpha before the slider existed: 72% light, 66% dark.
    expect(deskAlphaFor(TRANSLUCENCY_DEFAULT, false)).toBe(72);
    expect(deskAlphaFor(TRANSLUCENCY_DEFAULT, true)).toBe(66);
  });

  it("paints an opaque desk at 0%", () => {
    expect(deskAlphaFor(0, false)).toBe(100);
    expect(deskAlphaFor(0, true)).toBe(100);
  });

  it("stops at the legibility floor at 100%, and never goes under it", () => {
    expect(deskAlphaFor(100, false)).toBe(DESK_TINT_FLOOR.light);
    expect(deskAlphaFor(100, true)).toBe(DESK_TINT_FLOOR.dark);
    expect(deskAlphaFor(400, false)).toBe(DESK_TINT_FLOOR.light);
    expect(deskAlphaFor(-50, true)).toBe(100);
  });

  it("falls as the amount rises", () => {
    let previous = Infinity;
    for (let amount = 0; amount <= 100; amount += 5) {
      const alpha = deskAlphaFor(amount, false);
      expect(alpha).toBeLessThan(previous);
      previous = alpha;
    }
  });
});

describe("clampTranslucency", () => {
  it("snaps to steps of 5 inside 0–100", () => {
    expect(clampTranslucency(37)).toBe(35);
    expect(clampTranslucency(38)).toBe(40);
    expect(clampTranslucency(-10)).toBe(0);
    expect(clampTranslucency(250)).toBe(100);
  });

  it("falls back to the default for anything that is not a number", () => {
    for (const value of [undefined, null, "", "lots", NaN, Infinity, {}]) {
      expect(clampTranslucency(value)).toBe(TRANSLUCENCY_DEFAULT);
    }
    expect(clampTranslucency("20")).toBe(20);
  });
});

describe("applying the amount", () => {
  it("sets the desk tint for the current scheme without a native call", () => {
    applyTranslucencyAmount(100);
    expect(deskAlpha()).toBe(`${DESK_TINT_FLOOR.light}%`);
    document.documentElement.dataset.theme = "dark";
    applyTranslucencyAmount(100);
    expect(deskAlpha()).toBe(`${DESK_TINT_FLOOR.dark}%`);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("follows a light ↔ dark theme switch with the last amount", () => {
    applyTranslucencyAmount(0);
    applyTranslucencyAmount(100);
    document.documentElement.dataset.theme = "dark";
    syncWindowAppearance();
    expect(deskAlpha()).toBe(`${DESK_TINT_FLOOR.dark}%`);
  });

  it("keeps the last amount when the toggle is applied without one", () => {
    applyTranslucencyAmount(0);
    applyWindowTranslucency(true);
    expect(deskAlpha()).toBe("100%");
    expect(document.documentElement.hasAttribute("data-translucent")).toBe(true);
  });
});

describe("the native request", () => {
  it("sends the scheme and the desk colour, so Rust can dress the next launch", () => {
    document.documentElement.style.setProperty("--color-bg-sidebar", "#ECEBF1");
    applyWindowTranslucency(false);
    expect(invoke).toHaveBeenLastCalledWith("set_window_translucency", {
      enabled: false,
      dark: false,
      background: "#ecebf1",
    });
    document.documentElement.dataset.theme = "dark";
    document.documentElement.style.setProperty("--color-bg-sidebar", "#131217");
    applyWindowTranslucency(true);
    expect(invoke).toHaveBeenLastCalledWith("set_window_translucency", {
      enabled: true,
      dark: true,
      background: "#131217",
    });
  });

  it("passes a black desk on as #000000, with the dark tint over the material", () => {
    // The Black theme. Its desk colour is still a valid `#rrggbb` to save for
    // the next launch, and its tint follows the dark floor like any dark theme.
    document.documentElement.dataset.theme = "dark";
    document.documentElement.style.setProperty("--color-bg-sidebar", "#000000");
    applyWindowTranslucency(true, TRANSLUCENCY_DEFAULT);
    expect(invoke).toHaveBeenLastCalledWith("set_window_translucency", {
      enabled: true,
      dark: true,
      background: "#000000",
    });
    expect(deskAlpha()).toBe(`${deskAlphaFor(TRANSLUCENCY_DEFAULT, true)}%`);
  });

  it("drops a repeat of the same request", () => {
    document.documentElement.style.setProperty("--color-bg-sidebar", "#fdfdfc");
    applyWindowTranslucency(true);
    invoke.mockClear();
    applyWindowTranslucency(true);
    syncWindowAppearance();
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("the translucency setting", () => {
  it("stores a clamped amount and persists it with the other settings", () => {
    const store = useSettingsStore.getState();
    expect(store.setTranslucencyAmount(37)).toBe(35);
    expect(useSettingsStore.getState().translucencyAmount).toBe(35);
    const persisted = JSON.parse(localStorage.getItem("marky-settings")).state;
    expect(persisted.translucencyAmount).toBe(35);
    // Kept in the profile alongside the toggle, so it travels the same way.
    expect(persisted.sharedSettings.translucencyAmount).toBe(35);

    store.setTranslucencyAmount(9000);
    expect(useSettingsStore.getState().translucencyAmount).toBe(100);
  });

  it("repairs a stored value that is out of range or missing", () => {
    useSettingsStore.setState({
      translucencyAmount: "very",
      sharedSettings: { ...useSettingsStore.getState().sharedSettings, translucencyAmount: -40 },
    });
    useSettingsStore.getState().initializeSettings();
    expect(useSettingsStore.getState().translucencyAmount).toBe(0);

    useSettingsStore.setState({
      sharedSettings: {
        ...useSettingsStore.getState().sharedSettings,
        translucencyAmount: undefined,
      },
    });
    useSettingsStore.getState().initializeSettings();
    expect(useSettingsStore.getState().translucencyAmount).toBe(TRANSLUCENCY_DEFAULT);
  });
});
