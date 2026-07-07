import useSettingsStore, { ACCENT_COLORS, THEMES } from "../../store/settingsStore";

const AppearanceSettings = () => {
  const { themeId, setTheme, accentColorId, setAccentColor } = useSettingsStore();

  return (
    <div className="space-y-10">
      {/* Theme Selection */}
      <div>
        <h3 className="text-[13px] font-semibold text-text-primary mb-0.5">Theme</h3>
        <p className="text-[13px] text-text-muted mb-4">Applies across the whole app, instantly.</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Theme">
          {THEMES.map((theme) => {
            const selected = themeId === theme.id;
            return (
              <button
                key={theme.id}
                onClick={() => setTheme(theme.id)}
                role="radio"
                aria-checked={selected}
                aria-label={`${theme.name} theme, ${theme.type}`}
                className="rounded-[13px] p-[11px] text-left transition-all"
                style={{
                  background: "var(--color-bg-editor)",
                  border: `1.5px solid ${selected ? "var(--color-accent)" : "var(--color-border)"}`,
                  boxShadow: selected ? "0 0 0 3px var(--color-accent-dim)" : "none",
                }}
              >
                <div
                  className="flex h-[72px] overflow-hidden rounded-lg"
                  style={{ border: "1px solid rgba(128,128,128,.16)" }}
                  aria-hidden="true"
                >
                  <div style={{ width: "34%", backgroundColor: theme.preview.sidebar }} />
                  <div
                    className="flex-1 px-2 py-[9px]"
                    style={{ backgroundColor: theme.preview.bg }}
                  >
                    <div
                      className="mb-[5px] h-1.5 w-[70%] rounded-[3px]"
                      style={{ backgroundColor: theme.preview.bar }}
                    />
                    <div
                      className="h-1.5 w-[45%] rounded-[3px] opacity-60"
                      style={{ backgroundColor: theme.preview.bar }}
                    />
                  </div>
                </div>
                <div className="mt-[9px] flex items-center justify-between">
                  <span className="text-[13px] font-medium text-text-primary">{theme.name}</span>
                  <span className="rounded-[5px] bg-overlay-subtle px-1.5 py-px text-[10px] font-semibold text-text-muted">
                    {theme.type === "light" ? "Light" : "Dark"}
                  </span>
                </div>
              </button>
            );
          })}
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
