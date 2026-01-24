import useSettingsStore, { ACCENT_COLORS, THEMES } from '../store/settingsStore';

const AppearanceSettings = () => {
  const { themeId, setTheme, accentColorId, setAccentColor } = useSettingsStore();

  return (
    <div className="space-y-8">
      {/* Theme Selection */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-1">Theme</h3>
        <p className="text-xs text-text-muted mb-4">
          Choose a color scheme for the application.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              onClick={() => setTheme(theme.id)}
              className={`
                group relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all
                ${themeId === theme.id
                  ? 'border-accent bg-accent/10'
                  : 'border-transparent bg-overlay-subtle hover:bg-overlay-light hover:border-overlay-light'
                }
              `}
            >
              {/* Theme preview */}
              <div className="w-full aspect-4/3 rounded-lg overflow-hidden border border-overlay-light">
                <div
                  className="h-full flex"
                  style={{ backgroundColor: theme.preview.bg }}
                >
                  {/* Sidebar preview */}
                  <div
                    className="w-1/3 h-full"
                    style={{ backgroundColor: theme.preview.sidebar }}
                  >
                    <div
                      className="w-3/4 h-1.5 mt-2 ml-1 rounded-sm"
                      style={{ backgroundColor: theme.preview.accent }}
                    />
                    <div
                      className="w-1/2 h-1 mt-1 ml-1 rounded-sm"
                      style={{ backgroundColor: theme.preview.accent }}
                    />
                    <div
                      className="w-2/3 h-1 mt-1 ml-1 rounded-sm"
                      style={{ backgroundColor: theme.preview.accent }}
                    />
                  </div>
                  {/* Editor preview */}
                  <div className="flex-1 p-1.5">
                    <div
                      className="w-full h-1 rounded-sm"
                      style={{ backgroundColor: theme.preview.accent }}
                    />
                    <div
                      className="w-3/4 h-1 mt-1 rounded-sm"
                      style={{ backgroundColor: theme.preview.accent }}
                    />
                    <div
                      className="w-1/2 h-1 mt-1 rounded-sm"
                      style={{ backgroundColor: theme.preview.accent }}
                    />
                  </div>
                </div>
              </div>

              {/* Theme name */}
              <div className="flex items-center gap-2">
                <span className={`
                  text-xs font-medium transition-colors
                  ${themeId === theme.id ? 'text-text-primary' : 'text-text-muted group-hover:text-text-secondary'}
                `}>
                  {theme.name}
                </span>
                {theme.type === 'light' && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-400 rounded">
                    Light
                  </span>
                )}
              </div>

              {/* Checkmark for selected */}
              {themeId === theme.id && (
                <div className="absolute top-2 right-2">
                  <svg className="w-4 h-4 text-accent" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Accent Color */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-1">Accent Color</h3>
        <p className="text-xs text-text-muted mb-4">
          Choose a color for buttons, links, and highlights.
        </p>

        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {ACCENT_COLORS.map((color) => (
            <button
              key={color.id}
              onClick={() => setAccentColor(color.id)}
              className={`
                group relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all
                ${accentColorId === color.id
                  ? 'border-overlay-strong bg-overlay-light'
                  : 'border-transparent bg-overlay-subtle hover:bg-overlay-light hover:border-overlay-light'
                }
              `}
            >
              {/* Color swatch */}
              <div
                className={`
                  w-8 h-8 rounded-full transition-transform group-hover:scale-110
                  ${accentColorId === color.id ? 'ring-2 ring-white/50 ring-offset-2 ring-offset-bg-base' : ''}
                `}
                style={{ backgroundColor: color.value }}
              />

              {/* Color name */}
              <span className={`
                text-xs font-medium transition-colors
                ${accentColorId === color.id ? 'text-text-primary' : 'text-text-muted group-hover:text-text-secondary'}
              `}>
                {color.name}
              </span>

              {/* Checkmark for selected */}
              {accentColorId === color.id && (
                <div className="absolute top-2 right-2">
                  <svg className="w-4 h-4 text-accent" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="p-4 bg-overlay-subtle rounded-xl border border-overlay-light">
        <h4 className="text-sm font-medium text-text-primary mb-3">Preview</h4>
        <div className="flex flex-wrap items-center gap-3">
          <button className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors">
            Primary Button
          </button>
          <button className="px-4 py-2 bg-accent/10 hover:bg-accent/20 text-accent text-sm font-medium rounded-lg border border-accent/20 transition-colors">
            Secondary Button
          </button>
          <span className="text-accent text-sm font-medium cursor-pointer hover:underline">
            Link Text
          </span>
        </div>
      </div>
    </div>
  );
};

export default AppearanceSettings;
