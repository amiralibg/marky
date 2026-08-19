import { useState } from "react";
import useSettingsStore, {
  ACCENT_COLORS,
  FONT_SCALE_DEFAULT,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
  THEMES,
  formatKeymap,
} from "../../store/settingsStore";

const THEME_FILTERS = [
  { id: "all", label: "All" },
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
];

const AppearanceSettings = () => {
  const { themeId, setTheme, accentColorId, setAccentColor, fontScale, setFontScale, getKeymap } =
    useSettingsStore();
  // Default the filter to the current theme's mode so the list opens focused
  // and compact; "All" reveals every theme.
  const currentType = THEMES.find((t) => t.id === themeId)?.type || "dark";
  const [filter, setFilter] = useState(currentType);

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
            className="flex items-center gap-0.5 rounded-lg bg-overlay-subtle p-0.5 shrink-0"
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
                  className={`rounded-md px-2.5 py-1 text-[12px] transition-colors ${
                    active
                      ? "bg-accent-dim font-semibold text-accent"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {f.label}
                  <span className="ml-1 text-[10px] opacity-60">{count}</span>
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
                className="rounded-[11px] p-2 text-left transition-all"
                style={{
                  background: "var(--color-bg-editor)",
                  border: `1.5px solid ${selected ? "var(--color-accent)" : "var(--color-border)"}`,
                  boxShadow: selected ? "0 0 0 3px var(--color-accent-dim)" : "none",
                }}
              >
                <div
                  className="flex h-[46px] overflow-hidden rounded-md"
                  style={{ border: "1px solid rgba(128,128,128,.16)" }}
                  aria-hidden="true"
                >
                  <div style={{ width: "34%", backgroundColor: theme.preview.sidebar }} />
                  <div className="flex-1 px-2 py-2" style={{ backgroundColor: theme.preview.bg }}>
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
          <div className="flex items-center gap-1 rounded-lg bg-overlay-subtle p-1">
            <button
              onClick={() => setFontScale(fontScale - FONT_SCALE_STEP)}
              disabled={fontScale <= FONT_SCALE_MIN}
              aria-label="Decrease text size"
              className="rounded-md px-2.5 py-1 text-[15px] leading-none text-text-secondary transition-colors hover:bg-overlay-light hover:text-text-primary disabled:pointer-events-none disabled:opacity-35"
            >
              −
            </button>
            <span
              className="min-w-[3.5rem] text-center text-[13px] font-semibold tabular-nums text-text-primary"
              aria-live="polite"
            >
              {fontScale}%
            </span>
            <button
              onClick={() => setFontScale(fontScale + FONT_SCALE_STEP)}
              disabled={fontScale >= FONT_SCALE_MAX}
              aria-label="Increase text size"
              className="rounded-md px-2.5 py-1 text-[15px] leading-none text-text-secondary transition-colors hover:bg-overlay-light hover:text-text-primary disabled:pointer-events-none disabled:opacity-35"
            >
              +
            </button>
          </div>

          <input
            type="range"
            min={FONT_SCALE_MIN}
            max={FONT_SCALE_MAX}
            step={FONT_SCALE_STEP}
            value={fontScale}
            onChange={(event) => setFontScale(Number(event.target.value))}
            aria-label="Text size"
            className="h-1 flex-1 min-w-[9rem] max-w-[18rem] cursor-pointer appearance-none rounded-full bg-overlay-light accent-accent"
          />

          {fontScale !== FONT_SCALE_DEFAULT && (
            <button
              onClick={() => setFontScale(FONT_SCALE_DEFAULT)}
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
                className="rounded-full p-[5px] transition-transform hover:scale-105"
                style={{ boxShadow: selected ? `0 0 0 2px ${color.value}` : "none" }}
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
