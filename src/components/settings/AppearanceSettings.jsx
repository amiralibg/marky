import { useEffect, useRef, useState } from "react";
import useSettingsStore, {
  ACCENT_COLORS,
  FONT_SCALE_DEFAULT,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
  READING_FONTS,
  THEMES,
  formatKeymap,
} from "../../store/settingsStore";
import {
  TRANSLUCENCY_MAX,
  TRANSLUCENCY_MIN,
  TRANSLUCENCY_STEP,
  applyTranslucencyAmount,
  clampTranslucency,
  supportsWindowTranslucency,
} from "../../utils/windowTranslucency";
import RangeSlider from "../ui/RangeSlider";

// Linux has no blur to offer, so the setting does not exist there (see
// windowTranslucency.js). The platform cannot change while the app runs.
const canBeTranslucent = supportsWindowTranslucency();

const THEME_FILTERS = [
  { id: "all", label: "All" },
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
];

// How long a slider gesture may keep gathering steps before the (expensive)
// app-wide reflow actually runs. Every committed step re-lays-out the whole
// UI, so a drag that fires dozens of change events used to stutter the very
// interface it was resizing.
const SCALE_COMMIT_DELAY_MS = 250;

const clampScale = (value) =>
  Math.min(
    FONT_SCALE_MAX,
    Math.max(FONT_SCALE_MIN, Math.round(value / FONT_SCALE_STEP) * FONT_SCALE_STEP)
  );

const AppearanceSettings = () => {
  const {
    themeId,
    setTheme,
    accentColorId,
    setAccentColor,
    fontScale,
    setFontScale,
    editorFontScale,
    setEditorFontScale,
    readingFont,
    setReadingFont,
    translucentWindow,
    setTranslucentWindow,
    translucencyAmount,
    setTranslucencyAmount,
    getKeymap,
  } = useSettingsStore();
  // Default the filter to the current theme's mode so the list opens focused
  // and compact; "All" reveals every theme.
  const currentType = THEMES.find((t) => t.id === themeId)?.type || "dark";
  const [filter, setFilter] = useState(currentType);

  // Draft scales update the controls instantly; the stores — and with them
  // the app-wide reflow and the persisted write — are committed once the
  // gesture settles. An external change (keyboard shortcut, another window's
  // settings sync) still lands whenever no commit is pending.
  const [fontScaleDraft, setFontScaleDraft] = useState(fontScale);
  const [editorScaleDraft, setEditorScaleDraft] = useState(editorFontScale);
  const fontCommitRef = useRef(null);
  const editorCommitRef = useRef(null);

  useEffect(() => {
    if (fontCommitRef.current === null) setFontScaleDraft(fontScale);
  }, [fontScale]);
  useEffect(() => {
    if (editorCommitRef.current === null) setEditorScaleDraft(editorFontScale);
  }, [editorFontScale]);
  useEffect(
    () => () => {
      clearTimeout(fontCommitRef.current);
      clearTimeout(editorCommitRef.current);
    },
    []
  );

  const queueFontScale = (value) => {
    const clamped = clampScale(value);
    setFontScaleDraft(clamped);
    clearTimeout(fontCommitRef.current);
    fontCommitRef.current = setTimeout(() => {
      fontCommitRef.current = null;
      setFontScale(clamped);
    }, SCALE_COMMIT_DELAY_MS);
  };

  const queueEditorScale = (value) => {
    const clamped = clampScale(value);
    setEditorScaleDraft(clamped);
    clearTimeout(editorCommitRef.current);
    editorCommitRef.current = setTimeout(() => {
      editorCommitRef.current = null;
      setEditorFontScale(clamped);
    }, SCALE_COMMIT_DELAY_MS);
  };

  // The translucency slider paints the desk live as it moves (a CSS variable,
  // no native call) and persists once the gesture lands.
  const [translucencyDraft, setTranslucencyDraft] = useState(() =>
    clampTranslucency(translucencyAmount)
  );
  useEffect(() => {
    setTranslucencyDraft(clampTranslucency(translucencyAmount));
  }, [translucencyAmount]);
  const previewTranslucency = (value) => {
    const clamped = clampTranslucency(value);
    setTranslucencyDraft(clamped);
    applyTranslucencyAmount(clamped);
  };
  const commitTranslucency = (value) => setTranslucencyDraft(setTranslucencyAmount(value));

  const visibleThemes = THEMES.filter((t) => filter === "all" || t.type === filter);
  const darkCount = THEMES.filter((t) => t.type === "dark").length;
  const lightCount = THEMES.filter((t) => t.type === "light").length;

  return (
    <div className="space-y-10">
      {/* Theme Selection */}
      <div>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h3 className="text-[13px] font-semibold text-text-primary mb-0.5">Theme</h3>
            <p className="text-[13px] text-text-muted">Applies across the whole app, instantly.</p>
          </div>
          <div
            className="flex items-center gap-0.5 rounded-control bg-item-hover p-0.5 shrink-0"
            role="group"
            aria-label="Filter themes"
          >
            {THEME_FILTERS.map((f) => {
              const count =
                f.id === "all" ? THEMES.length : f.id === "dark" ? darkCount : lightCount;
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  aria-pressed={active}
                  className={`rounded-[calc(var(--radius-control)-2px)] px-2.5 py-1 text-[12px] transition-colors ${
                    active
                      ? "bg-item-active font-semibold text-text-primary shadow-[0_0_0_1px_var(--color-border)]"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {f.label}
                  <span className="ml-1 text-[11px] opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5"
          role="radiogroup"
          aria-label="Theme"
        >
          {visibleThemes.map((theme) => {
            const selected = themeId === theme.id;
            return (
              <button
                key={theme.id}
                onClick={() => setTheme(theme.id)}
                role="radio"
                aria-checked={selected}
                aria-label={`${theme.name} theme, ${theme.type}`}
                title={`${theme.name} · ${theme.type === "light" ? "Light" : "Dark"}`}
                className="rounded-card p-2 text-start transition-[box-shadow] duration-140"
                style={{
                  background: "var(--color-bg-editor)",
                  boxShadow: selected
                    ? "0 0 0 2px var(--color-accent)"
                    : "0 0 0 1px var(--color-border)",
                }}
              >
                {/* The theme in miniature: its desk, and its sheet floating on
                    it with the same gap the app leaves. */}
                <div
                  className="flex h-[52px] overflow-hidden rounded-control p-1.5 ps-[30%]"
                  style={{
                    backgroundColor: theme.preview.sidebar,
                    boxShadow: "inset 0 0 0 1px rgba(128,128,128,.16)",
                  }}
                  aria-hidden="true"
                >
                  <div
                    className="flex-1 rounded-control px-2 py-2"
                    style={{
                      backgroundColor: theme.preview.accent,
                      // A theme whose sheet is held by its ring alone (Black)
                      // shows that ring; the neutral grey would vanish there.
                      boxShadow: `0 0 0 1px ${theme.preview.ring || "rgba(128,128,128,.14)"}`,
                    }}
                  >
                    <div
                      className="mb-1 h-1 w-[70%] rounded-full"
                      style={{ backgroundColor: theme.preview.bar }}
                    />
                    <div
                      className="h-1 w-[45%] rounded-full opacity-60"
                      style={{ backgroundColor: theme.preview.bar }}
                    />
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-1">
                  <span className="truncate text-[12px] font-medium text-text-primary">
                    {theme.name}
                  </span>
                  {selected && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                      aria-hidden="true"
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {canBeTranslucent && (
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1">
            <h3
              id="translucent-window-title"
              className="text-[13px] font-semibold text-text-primary mb-0.5"
            >
              Translucent window
            </h3>
            <p id="translucent-window-description" className="text-[13px] text-text-muted">
              Lets the desktop show through the sidebar and title bar, softly blurred. Notes stay on
              an opaque page.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={translucentWindow}
            aria-labelledby="translucent-window-title"
            aria-describedby="translucent-window-description"
            onClick={() => setTranslucentWindow(!translucentWindow)}
            className="switch"
          ></button>
        </div>
      )}

      {canBeTranslucent && translucentWindow && (
        <div className="-mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <label
            htmlFor="translucency-amount"
            className="w-24 shrink-0 text-[13px] font-medium text-text-secondary"
          >
            Translucency
          </label>
          <RangeSlider
            id="translucency-amount"
            min={TRANSLUCENCY_MIN}
            max={TRANSLUCENCY_MAX}
            step={TRANSLUCENCY_STEP}
            value={translucencyDraft}
            onInput={previewTranslucency}
            onCommit={commitTranslucency}
            aria-valuetext={`${translucencyDraft}%`}
            aria-describedby="translucency-amount-hint"
            className="flex-1 max-w-[18rem]"
          />
          <span
            className="w-10 shrink-0 text-end text-[12.5px] font-medium tabular-nums text-text-secondary"
            aria-hidden="true"
          >
            {translucencyDraft}%
          </span>
          <p id="translucency-amount-hint" className="w-full text-[12.5px] text-text-muted">
            How much of the desktop shows through. 0% is a solid window.
          </p>
        </div>
      )}

      {/* Reading typeface */}
      <div>
        <h3 className="text-[13px] font-semibold text-text-primary mb-0.5">Typeface</h3>
        <p className="text-[13px] text-text-muted mb-4">
          The face your notes are set in, in Live and Read. Source always stays monospace.
        </p>

        <div
          className="grid grid-cols-3 gap-3 max-w-[36rem]"
          role="radiogroup"
          aria-label="Typeface"
        >
          {READING_FONTS.map((font) => {
            const selected = readingFont === font.id;
            const body = font.id === "serif" ? "font-serif" : "font-sans";
            const heading = font.id === "sans" ? "font-sans" : "font-serif";
            return (
              <button
                key={font.id}
                onClick={() => setReadingFont(font.id)}
                role="radio"
                aria-checked={selected}
                className={`rounded-card border p-3 text-start transition-colors ${
                  selected
                    ? "border-accent bg-accent-dim"
                    : "border-border hover:border-border-light hover:bg-overlay-subtle"
                }`}
              >
                <span
                  className={`block text-[22px] leading-none font-semibold tracking-[-0.02em] text-text-primary ${heading}`}
                  aria-hidden="true"
                >
                  Aa
                </span>
                <span
                  className={`mt-2 block text-[12px] leading-snug text-text-secondary ${body}`}
                  aria-hidden="true"
                >
                  The quick brown fox
                </span>
                <span className="mt-3 block text-[13px] font-semibold text-text-primary">
                  {font.label}
                </span>
                <span className="block text-[12px] text-text-muted">{font.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Text size */}
      <div>
        <h3 className="text-[13px] font-semibold text-text-primary mb-0.5">Text size</h3>
        <p className="text-[13px] text-text-muted mb-4">
          Scales the whole app — sidebar, editor and preview together.{" "}
          <span className="whitespace-nowrap">
            {formatKeymap(getKeymap("increaseFontSize")).join("")} and{" "}
            {formatKeymap(getKeymap("decreaseFontSize")).join("")}
          </span>{" "}
          do the same from anywhere.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-control bg-item-hover p-0.5">
            <button
              onClick={() => queueFontScale(fontScaleDraft - FONT_SCALE_STEP)}
              disabled={fontScaleDraft <= FONT_SCALE_MIN}
              aria-label="Decrease text size"
              className="h-7 rounded-[calc(var(--radius-control)-2px)] px-2.5 text-[15px] leading-none text-text-secondary transition-colors hover:bg-item-active hover:text-text-primary disabled:pointer-events-none disabled:opacity-35"
            >
              −
            </button>
            <span
              className="min-w-[3.5rem] text-center text-[13px] font-semibold tabular-nums text-text-primary"
              aria-live="polite"
            >
              {fontScaleDraft}%
            </span>
            <button
              onClick={() => queueFontScale(fontScaleDraft + FONT_SCALE_STEP)}
              disabled={fontScaleDraft >= FONT_SCALE_MAX}
              aria-label="Increase text size"
              className="h-7 rounded-[calc(var(--radius-control)-2px)] px-2.5 text-[15px] leading-none text-text-secondary transition-colors hover:bg-item-active hover:text-text-primary disabled:pointer-events-none disabled:opacity-35"
            >
              +
            </button>
          </div>

          <RangeSlider
            min={FONT_SCALE_MIN}
            max={FONT_SCALE_MAX}
            step={FONT_SCALE_STEP}
            value={fontScaleDraft}
            onInput={queueFontScale}
            aria-label="Text size"
            aria-valuetext={`${fontScaleDraft}%`}
            className="flex-1 max-w-[18rem]"
          />

          {fontScaleDraft !== FONT_SCALE_DEFAULT && (
            <button
              onClick={() => {
                clearTimeout(fontCommitRef.current);
                fontCommitRef.current = null;
                setFontScaleDraft(FONT_SCALE_DEFAULT);
                setFontScale(FONT_SCALE_DEFAULT);
              }}
              className="text-[12px] text-text-muted underline-offset-2 transition-colors hover:text-text-primary hover:underline"
            >
              Reset to {FONT_SCALE_DEFAULT}%
            </button>
          )}
        </div>
      </div>

      {/* Editor text size */}
      <div>
        <h3 className="text-[13px] font-semibold text-text-primary mb-0.5">Editor text size</h3>
        <p className="text-[13px] text-text-muted mb-4">
          Scales the note text on its own — the sidebar, menus and the rest of the app follow the
          setting above.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-control bg-item-hover p-0.5">
            <button
              onClick={() => queueEditorScale(editorScaleDraft - FONT_SCALE_STEP)}
              disabled={editorScaleDraft <= FONT_SCALE_MIN}
              aria-label="Decrease editor text size"
              className="h-7 rounded-[calc(var(--radius-control)-2px)] px-2.5 text-[15px] leading-none text-text-secondary transition-colors hover:bg-item-active hover:text-text-primary disabled:pointer-events-none disabled:opacity-35"
            >
              −
            </button>
            <span
              className="min-w-[3.5rem] text-center text-[13px] font-semibold tabular-nums text-text-primary"
              aria-live="polite"
            >
              {editorScaleDraft}%
            </span>
            <button
              onClick={() => queueEditorScale(editorScaleDraft + FONT_SCALE_STEP)}
              disabled={editorScaleDraft >= FONT_SCALE_MAX}
              aria-label="Increase editor text size"
              className="h-7 rounded-[calc(var(--radius-control)-2px)] px-2.5 text-[15px] leading-none text-text-secondary transition-colors hover:bg-item-active hover:text-text-primary disabled:pointer-events-none disabled:opacity-35"
            >
              +
            </button>
          </div>

          <RangeSlider
            min={FONT_SCALE_MIN}
            max={FONT_SCALE_MAX}
            step={FONT_SCALE_STEP}
            value={editorScaleDraft}
            onInput={queueEditorScale}
            aria-label="Editor text size"
            aria-valuetext={`${editorScaleDraft}%`}
            className="flex-1 max-w-[18rem]"
          />

          {editorScaleDraft !== FONT_SCALE_DEFAULT && (
            <button
              onClick={() => {
                clearTimeout(editorCommitRef.current);
                editorCommitRef.current = null;
                setEditorScaleDraft(FONT_SCALE_DEFAULT);
                setEditorFontScale(FONT_SCALE_DEFAULT);
              }}
              className="text-[12px] text-text-muted underline-offset-2 transition-colors hover:text-text-primary hover:underline"
            >
              Reset to {FONT_SCALE_DEFAULT}%
            </button>
          )}
        </div>
      </div>

      {/* Accent Color */}
      <div>
        <h3 className="text-[13px] font-semibold text-text-primary mb-0.5">Accent color</h3>
        <p className="text-[13px] text-text-muted mb-4">Used for buttons, links, and highlights.</p>

        <div className="flex flex-wrap gap-[13px]" role="radiogroup" aria-label="Accent color">
          {ACCENT_COLORS.map((color) => {
            const selected = accentColorId === color.id;
            return (
              <button
                key={color.id}
                onClick={() => setAccentColor(color.id)}
                role="radio"
                aria-checked={selected}
                aria-label={`${color.name} accent color`}
                title={color.name}
                className="rounded-full p-[5px] transition-[box-shadow] duration-140"
                style={{
                  boxShadow: selected ? `0 0 0 2px ${color.value}` : undefined,
                }}
              >
                <span
                  className="block h-[26px] w-[26px] rounded-full"
                  style={{ backgroundColor: color.value }}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AppearanceSettings;
