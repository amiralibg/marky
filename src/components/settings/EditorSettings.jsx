import useSettingsStore from "../../store/settingsStore";

const EditorSettings = () => {
  const {
    vimMode,
    toggleVimMode,
    scrollSyncEnabled,
    toggleScrollSync,
    autosaveEnabled,
    autosaveDelay,
    setAutosaveEnabled,
    setAutosaveDelay,
    typewriterMode: typewriterModeEnabled,
    setTypewriterMode,
    sidebarDensity,
    setSidebarDensity,
    showSidebarMetadata,
    setShowSidebarMetadata,
  } = useSettingsStore();

  const delayOptions = [
    { label: "1 second", value: 1000 },
    { label: "2 seconds", value: 2000 },
    { label: "5 seconds", value: 5000 },
    { label: "10 seconds", value: 10000 },
  ];
  const densityOptions = [
    {
      label: "Compact",
      value: "compact",
      description: "More notes in view",
      bars: ["h-0.5", "h-0.5", "h-0.5"],
    },
    {
      label: "Comfortable",
      value: "comfortable",
      description: "Balanced spacing",
      bars: ["h-0.5", "h-1", "h-0.5"],
    },
    {
      label: "Spacious",
      value: "spacious",
      description: "Roomier rows",
      bars: ["h-1", "h-1.5", "h-1"],
    },
  ];
  const selectedDensityIndex = Math.max(
    densityOptions.findIndex((option) => option.value === sidebarDensity),
    0
  );

  return (
    <div className="space-y-6">
      {/* Autosave Toggle */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-text-primary mb-1">Autosave</h3>
          <p className="text-xs text-text-muted leading-relaxed">
            Automatically save the current note to disk after you stop typing. A status chip in the
            title bar shows when a save is pending or complete.
          </p>
          {autosaveEnabled && (
            <div className="mt-3 flex items-center gap-3">
              <span className="text-xs text-text-secondary">Save after</span>
              <div className="flex gap-1.5 flex-wrap">
                {delayOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setAutosaveDelay(opt.value)}
                    className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors ${
                      autosaveDelay === opt.value
                        ? "border-accent/40 bg-accent/10 text-accent"
                        : "border-overlay-subtle bg-overlay-subtle text-text-muted hover:text-text-primary hover:border-overlay-light"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <button
          onClick={() => setAutosaveEnabled(!autosaveEnabled)}
          className={`relative ml-4 w-14 h-7 rounded-full transition-all duration-200 shrink-0 ${
            autosaveEnabled
              ? "bg-accent shadow-lg shadow-accent/30"
              : "bg-overlay-light hover:bg-overlay-medium"
          }`}
          aria-label="Toggle Autosave"
        >
          <span
            className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${autosaveEnabled ? "translate-x-7" : "translate-x-0"}`}
          />
        </button>
      </div>

      {/* Preview Scroll Sync Toggle */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-text-primary mb-1">Preview Scroll Sync</h3>
          <p className="text-xs text-text-muted leading-relaxed">
            Sync scrolling between the editor and preview in split view. This is approximate and may
            drift on notes with heavy formatting or diagrams.
          </p>
        </div>
        <button
          onClick={toggleScrollSync}
          className={`
            relative ml-4 w-14 h-7 rounded-full transition-all duration-200 shrink-0
            ${
              scrollSyncEnabled
                ? "bg-accent shadow-lg shadow-accent/30"
                : "bg-overlay-light hover:bg-overlay-medium"
            }
          `}
          aria-label="Toggle Preview Scroll Sync"
        >
          <span
            className={`
              absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200
              ${scrollSyncEnabled ? "translate-x-7" : "translate-x-0"}
            `}
          />
        </button>
      </div>

      {/* Vim Mode Toggle */}
      {/* Sidebar Density */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-text-primary mb-1">Sidebar Density</h3>
          <p className="text-xs text-text-muted leading-relaxed">
            Tune the note tree spacing for small screens, large workspaces, or a more relaxed
            browsing feel.
          </p>
          <div className="mt-3 rounded-2xl border border-overlay-subtle bg-overlay-subtle/40 p-1.5 shadow-inner shadow-black/10">
            <div className="relative grid grid-cols-3 gap-1">
              <span
                className="absolute inset-y-0 left-0 w-1/3 rounded-xl border border-accent/30 bg-accent/10 shadow-sm shadow-accent/10 transition-transform duration-200 ease-out"
                style={{ transform: `translateX(${selectedDensityIndex * 100}%)` }}
                aria-hidden="true"
              />
              {densityOptions.map((option) => {
                const isActive = sidebarDensity === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSidebarDensity(option.value)}
                    className={`relative z-10 rounded-xl px-2.5 py-2.5 text-left transition-colors ${
                      isActive ? "text-accent" : "text-text-muted hover:text-text-primary"
                    }`}
                    aria-pressed={isActive}
                  >
                    <span className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 flex-col justify-center gap-1 rounded-lg border border-overlay-subtle bg-bg-sidebar/70 px-1.5">
                        {option.bars.map((barClass, index) => (
                          <span
                            key={index}
                            className={`${barClass} rounded-full ${isActive ? "bg-accent" : "bg-text-muted/50"}`}
                          />
                        ))}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold">{option.label}</span>
                        <span className="block truncate text-[11px] text-text-muted">
                          {option.description}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar Metadata Toggle */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-text-primary mb-1">Sidebar Metadata</h3>
          <p className="text-xs text-text-muted leading-relaxed">
            Show note tags, backlink counts, pinned markers, and saved indicators in the sidebar
            tree.
          </p>
        </div>
        <button
          onClick={() => setShowSidebarMetadata(!showSidebarMetadata)}
          className={`relative ml-4 w-14 h-7 rounded-full transition-all duration-200 shrink-0 ${
            showSidebarMetadata
              ? "bg-accent shadow-lg shadow-accent/30"
              : "bg-overlay-light hover:bg-overlay-medium"
          }`}
          aria-label="Toggle Sidebar Metadata"
        >
          <span
            className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${showSidebarMetadata ? "translate-x-7" : "translate-x-0"}`}
          />
        </button>
      </div>

      {/* Typewriter Mode Toggle */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2">
            Typewriter Mode
            <span className="px-2 py-0.5 text-[10px] font-medium bg-accent/10 text-accent rounded border border-accent/20">
              Focus Mode
            </span>
          </h3>
          <p className="text-xs text-text-muted leading-relaxed">
            Keep the current line vertically centered in the editor while you type. Works best in
            Focus Mode for a distraction-free writing experience.
          </p>
        </div>
        <button
          onClick={() => setTypewriterMode(!typewriterModeEnabled)}
          className={`relative ml-4 w-14 h-7 rounded-full transition-all duration-200 shrink-0 ${
            typewriterModeEnabled
              ? "bg-accent shadow-lg shadow-accent/30"
              : "bg-overlay-light hover:bg-overlay-medium"
          }`}
          aria-label="Toggle Typewriter Mode"
        >
          <span
            className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${
              typewriterModeEnabled ? "translate-x-7" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2">
            Vim Mode
            <span className="px-2 py-0.5 text-[10px] font-medium bg-accent/10 text-accent rounded border border-accent/20">
              Advanced
            </span>
          </h3>
          <p className="text-xs text-text-muted leading-relaxed">
            Enable Vim keybindings in the markdown editor. Provides powerful modal editing with
            Normal, Insert, and Visual modes.
          </p>
          {vimMode && (
            <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-xs text-amber-300 flex items-start gap-2">
                <svg
                  className="w-4 h-4 shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>
                  <strong>Note:</strong> Toggling Vim mode will reinitialize the editor and may
                  clear undo history for the current note.
                </span>
              </p>
            </div>
          )}
        </div>
        <button
          onClick={toggleVimMode}
          className={`
            relative ml-4 w-14 h-7 rounded-full transition-all duration-200 shrink-0
            ${
              vimMode
                ? "bg-accent shadow-lg shadow-accent/30"
                : "bg-overlay-light hover:bg-overlay-medium"
            }
          `}
          aria-label="Toggle Vim Mode"
        >
          <span
            className={`
              absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200
              ${vimMode ? "translate-x-7" : "translate-x-0"}
            `}
          />
        </button>
      </div>

      {/* Vim Mode Quick Reference */}
      {vimMode && (
        <div className="p-4 bg-overlay-subtle rounded-xl border border-overlay-light">
          <h4 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
            <svg
              className="w-4 h-4 text-accent"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Quick Reference
          </h4>
          <div className="space-y-2 text-xs text-text-secondary">
            <div className="flex justify-between items-center py-1">
              <span>Enter Insert mode:</span>
              <kbd className="px-2 py-1 bg-overlay-light border border-overlay-medium rounded text-[10px] font-mono">
                i
              </kbd>
            </div>
            <div className="flex justify-between items-center py-1">
              <span>Return to Normal mode:</span>
              <kbd className="px-2 py-1 bg-overlay-light border border-overlay-medium rounded text-[10px] font-mono">
                Esc
              </kbd>
            </div>
            <div className="flex justify-between items-center py-1">
              <span>Enter Visual mode:</span>
              <kbd className="px-2 py-1 bg-overlay-light border border-overlay-medium rounded text-[10px] font-mono">
                v
              </kbd>
            </div>
            <div className="flex justify-between items-center py-1">
              <span>Save and continue:</span>
              <kbd className="px-2 py-1 bg-overlay-light border border-overlay-medium rounded text-[10px] font-mono">
                :w
              </kbd>
            </div>
            <div className="mt-3 pt-3 border-t border-overlay-light">
              <a
                href="https://vim.rtorr.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline flex items-center gap-1"
              >
                View complete Vim cheatsheet
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditorSettings;
