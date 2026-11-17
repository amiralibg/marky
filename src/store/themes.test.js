import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";
import { SYNTAX_PALETTES, themeIdToPaletteKey } from "../components/editor/theme";
import { THEMES, THEME_COUNTERPARTS, applyTheme } from "./settingsStore";

const byId = (id) => THEMES.find((theme) => theme.id === id);

// The keys the vault theme defines are the contract: applyTheme writes each
// one to a CSS variable, so a theme missing one would leave the previous
// theme's value in place.
const COLOR_KEYS = Object.keys(byId("vault").colors);

// WCAG 2.x relative luminance and contrast ratio, for opaque `#rrggbb`.
const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// The `themes` table the pre-paint script in index.html carries.
const prePaintThemes = () => {
  // Vitest runs from the project root (vite.config.js), where index.html is.
  const html = readFileSync(resolve(cwd(), "index.html"), "utf8");
  const match = html.match(/const themes = (\{[\s\S]*?\n {8}\});/);
  if (!match) throw new Error("index.html no longer has the pre-paint themes table");
  return new Function(`return ${match[1]};`)();
};

describe("THEMES", () => {
  it("has unique ids", () => {
    const ids = THEMES.map((theme) => theme.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("defines every colour key, as a non-empty string, on every theme", () => {
    for (const theme of THEMES) {
      expect(Object.keys(theme.colors).sort(), theme.id).toEqual([...COLOR_KEYS].sort());
      for (const key of COLOR_KEYS) {
        expect(typeof theme.colors[key], `${theme.id}.${key}`).toBe("string");
        expect(theme.colors[key].trim(), `${theme.id}.${key}`).not.toBe("");
      }
      for (const key of ["bg", "sidebar", "accent", "bar"]) {
        expect(theme.preview[key], `${theme.id}.preview.${key}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
      expect(["light", "dark"]).toContain(theme.type);
    }
  });

  it("gives every theme a light/dark counterpart of the other type", () => {
    for (const theme of THEMES) {
      const counterpart = byId(THEME_COUNTERPARTS[theme.id]);
      expect(counterpart, theme.id).toBeDefined();
      expect(counterpart.type, theme.id).not.toBe(theme.type);
    }
  });

  it("matches the pre-paint table in index.html, so launch does not flash", () => {
    const table = prePaintThemes();
    expect(Object.keys(table).sort()).toEqual(THEMES.map((theme) => theme.id).sort());
    for (const theme of THEMES) {
      const entry = table[theme.id];
      expect(entry.type, theme.id).toBe(theme.type);
      expect(entry.bgBase, theme.id).toBe(theme.colors.bgBase);
      expect(entry.bgSidebar, theme.id).toBe(theme.colors.bgSidebar);
      expect(entry.bgEditor, theme.id).toBe(theme.colors.bgEditor);
      expect(entry.textPrimary, theme.id).toBe(theme.colors.textPrimary);
      expect(entry.textSecondary, theme.id).toBe(theme.colors.textSecondary);
      expect(entry.textMuted, theme.id).toBe(theme.colors.textMuted);
      expect(entry.border, theme.id).toBe(theme.colors.border);
      if (entry.sheetRing) expect(entry.sheetRing, theme.id).toBe(theme.colors.sheetRing);
    }
  });

  it("keeps the derived sheet ring for themes without an override", () => {
    for (const theme of THEMES.filter((t) => t.id !== "black")) {
      const expected = theme.type === "light" ? theme.colors.borderLight : theme.colors.border;
      expect(theme.colors.sheetRing, theme.id).toBe(expected);
      expect(theme.preview.ring, theme.id).toBeUndefined();
    }
  });
});

describe("the Black theme", () => {
  const black = byId("black");

  it("sits directly after Vault Dark", () => {
    const ids = THEMES.map((theme) => theme.id);
    expect(ids.indexOf("black")).toBe(ids.indexOf("vault-dark") + 1);
    expect(black.type).toBe("dark");
  });

  it("is true black on the desk and the sheet", () => {
    expect(black.colors.bgBase).toBe("#000000");
    expect(black.colors.bgSidebar).toBe("#000000");
    expect(black.colors.bgEditor).toBe("#000000");
    expect(black.colors.titlebarBg).toBe("#000000");
  });

  it("meets WCAG AA for primary and secondary text, on black and on raised", () => {
    for (const surface of [black.colors.bgEditor, black.colors.glassPanelBg]) {
      expect(contrast(black.colors.textPrimary, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(black.colors.textSecondary, surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("outlines the sheet with the strong hairline, since nothing else draws it", () => {
    expect(black.colors.sheetRing).toBe(black.colors.borderLight);
    expect(black.colors.sheetRing).not.toBe(black.colors.border);
    expect(black.preview.ring).toBe(black.colors.sheetRing);
  });

  it("reads its code in the dark syntax palette, every token at AA on black", () => {
    const key = themeIdToPaletteKey(black.id, black.type);
    expect(key).toBe("dark");
    for (const [token, colour] of Object.entries(SYNTAX_PALETTES[key])) {
      expect(contrast(colour, black.colors.bgEditor), token).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("writes its ring and folder when applied", () => {
    applyTheme("black");
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--color-bg-editor")).toBe("#000000");
    expect(style.getPropertyValue("--color-sheet-ring")).toBe(black.colors.sheetRing);
    expect(style.getPropertyValue("--color-folder")).toBe(black.colors.folder);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("the folder colour", () => {
  const surfaceOf = (theme) => theme.colors.folder.match(/6%, (#[0-9a-f]{6})\)$/i)?.[1];

  it("is the theme's own surface with a 6% whisper of the accent", () => {
    for (const theme of THEMES) {
      expect(theme.colors.folder, theme.id).toMatch(
        /^color-mix\(in oklab, var\(--color-accent\) 6%, #[0-9a-f]{6}\)$/i
      );
      if (theme.id === "black") continue;
      const surface = theme.type === "light" ? theme.colors.bgSidebar : theme.colors.glassPanelBg;
      expect(surfaceOf(theme), theme.id).toBe(surface);
    }
  });

  it("differs between themes with different surfaces", () => {
    const ids = ["vault-dark", "paper-dark", "slate", "nord", "gruvbox-dark", "black", "vault"];
    const folders = ids.map((id) => byId(id).colors.folder);
    expect(new Set(folders).size).toBe(ids.length);
  });

  it("is lifted off black on the Black theme, so it reads as a card on the sheet", () => {
    const black = byId("black");
    const surface = surfaceOf(black);
    expect(surface).not.toBe(black.colors.glassPanelBg);
    expect(luminance(surface)).toBeGreaterThan(luminance(black.colors.glassPanelBg));
    // Text on the folder's pocket still reads at AA.
    expect(contrast(black.colors.textSecondary, surface)).toBeGreaterThanOrEqual(4.5);
  });
});
