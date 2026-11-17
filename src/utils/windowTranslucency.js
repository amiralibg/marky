import { invoke } from "@tauri-apps/api/core";
import { detectPlatform } from "./platform";

/**
 * Translucent window: the desk (title bar + sidebar) shows the blurred desktop
 * behind the app, while the sheet stays opaque.
 *
 * Two halves, and both have to agree:
 *
 * - Native: the window carries a system material behind its webview — macOS
 *   vibrancy, Mica on Windows 11 or Acrylic on Windows 10 — applied by the
 *   `set_window_translucency` command in main.rs. Every window is created
 *   transparent on those platforms so the material can be switched on and off
 *   at runtime; with the setting off, the page simply paints over it.
 * - Page: `<html data-translucent>` makes html/body/#root transparent and paints
 *   the desk part-transparent (index.css), so the material shows through.
 *
 * Linux is left out on purpose. Tauri has no blur there (no compositor API it
 * can drive across GNOME, KDE and the rest), and a see-through window without
 * blur puts the wallpaper sharp behind the sidebar text, which is unreadable.
 * The desk stays opaque and the setting is not offered.
 */
export const supportsWindowTranslucency = (platform = detectPlatform()) =>
  platform === "macos" || platform === "windows";

/**
 * Off by default on every platform until it has been seen working end to end.
 * On macOS the material, the window shadow, the rounded corners and the
 * traffic-light placement were checked in a dev build, but the desktop
 * actually showing through the desk — and the sidebar text holding 4.5:1 over
 * a worst-case bright or dark wallpaper — could not be confirmed from a
 * window capture. The Windows path is written from the Tauri and
 * window-vibrancy docs and has not been run at all. Flip this to
 * `detectPlatform() === "macos"` once macOS has been checked by eye.
 */
export const TRANSLUCENT_WINDOW_DEFAULT = false;

/**
 * How much of the desktop shows through the desk, 0–100 in steps of 5: the
 * opacity of the app's own desk tint over the OS material, turned around so
 * that more reads as more see-through. The sheet is never affected.
 *
 * 0% paints the desk fully opaque (the window reads as solid). 100% is the
 * floor below, per scheme: the thinnest tint that still holds the sidebar's
 * secondary text and the sheet's ring over a busy wallpaper, given that the
 * OS material (macOS sidebar vibrancy, Mica, Acrylic) already blurs and
 * tints what is behind it. Dark gets the lower floor because the dark
 * material is itself near the dark desk colour.
 *
 * The default, 50%, is exactly the look the setting had before it could be
 * adjusted (a 72% tint on light themes, 66% on dark), which is how the floors
 * are derived: floor = 2 × old tint − 100.
 */
export const TRANSLUCENCY_MIN = 0;
export const TRANSLUCENCY_MAX = 100;
export const TRANSLUCENCY_STEP = 5;
export const TRANSLUCENCY_DEFAULT = 50;
export const DESK_TINT_FLOOR = { light: 44, dark: 32 };

/** Any stored or typed value as a valid amount: a multiple of 5 within 0–100. */
export const clampTranslucency = (value) => {
  const number = Number(value);
  if (value === null || value === "" || !Number.isFinite(number)) return TRANSLUCENCY_DEFAULT;
  const stepped = Math.round(number / TRANSLUCENCY_STEP) * TRANSLUCENCY_STEP;
  return Math.min(TRANSLUCENCY_MAX, Math.max(TRANSLUCENCY_MIN, stepped));
};

/** The desk tint's opacity, in percent, for an amount and a scheme. */
export const deskAlphaFor = (amount, dark = false) => {
  const floor = dark ? DESK_TINT_FLOOR.dark : DESK_TINT_FLOOR.light;
  const value = 100 - (clampTranslucency(amount) / 100) * (100 - floor);
  return Math.round(value * 10) / 10;
};

let lastRequest = null;
let currentAmount = TRANSLUCENCY_DEFAULT;

const isDarkTheme = () =>
  typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";

/**
 * Paint the desk tint for an amount, CSS only: the native material does not
 * change with it, so dragging the slider never calls into Rust. Read by
 * `:root[data-translucent] .app-shell` in index.css.
 */
export const applyTranslucencyAmount = (amount = currentAmount) => {
  currentAmount = clampTranslucency(amount);
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty(
    "--desk-alpha",
    `${deskAlphaFor(currentAmount, isDarkTheme())}%`
  );
};

// The desk colour as `#rrggbb`, or null when the theme has not set one yet.
const deskColour = () => {
  const value = document.documentElement.style.getPropertyValue("--color-bg-sidebar").trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
};

/**
 * Tell the native side what this window should look like. Besides switching
 * the material, Rust remembers the request with the desk colour so the next
 * launch puts the same look on every window before its page has painted
 * (`WindowAppearance` in main.rs) — which is why this runs on Linux too,
 * where there is no material but the desk colour still keeps GTK's default
 * background from flashing.
 */
const requestNative = (enabled) => {
  const dark = isDarkTheme();
  const background = deskColour();
  const key = `${enabled}:${dark}:${background}`;
  // Theme and settings re-apply on every sync; the native call is not free
  // (it rebuilds the material view), so repeat requests are dropped.
  if (key === lastRequest) return;
  lastRequest = key;
  invoke("set_window_translucency", { enabled, dark, background }).catch(() => {
    // No Tauri runtime (tests, a browser preview): nothing native to change.
  });
};

/**
 * Publish the setting on `<html>` and switch this window's material. The
 * amount is optional: left out, the last one applied stays.
 */
export const applyWindowTranslucency = (enabled, amount) => {
  if (typeof document === "undefined") return;
  const on = Boolean(enabled) && supportsWindowTranslucency();
  const root = document.documentElement;
  applyTranslucencyAmount(amount === undefined ? currentAmount : amount);
  if (on) root.dataset.translucent = "";
  else delete root.dataset.translucent;
  requestNative(on);
};

/**
 * The native material takes its light or dark look from the window's
 * appearance, not from the page. Called by `applyTheme` whenever the theme's
 * type may have changed, so a dark theme never sits on a light material —
 * and the desk tint, whose floor differs between the schemes, follows too.
 */
export const syncWindowAppearance = () => {
  if (typeof document === "undefined") return;
  applyTranslucencyAmount();
  requestNative("translucent" in document.documentElement.dataset);
};
