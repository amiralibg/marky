import useSettingsStore, { EDITOR_WIDTHS } from "../../store/settingsStore";

const EditorSettings = () => {
  const {
    vimMode,
    toggleVimMode,
    vimVisualLineMotion,
    toggleVimVisualLineMotion,
    autosaveEnabled,
    autosaveDelay,
    setAutosaveEnabled,
    setAutosaveDelay,
    typewriterMode: typewriterModeEnabled,
    setTypewriterMode,
    showLineNumbers,
    setShowLineNumbers,
    editorWidth,
    setEditorWidth,
    ignorePatterns,
    setIgnorePatterns,
    attachmentFolder,
    setAttachmentFolder,
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
  const selectedWidthIndex = Math.max(
    EDITOR_WIDTHS.findIndex((option) => option.id === editorWidth),
    0
  );

  return (
    <div className="space-y-6">
      {/* Autosave Toggle */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 id="autosave-setting-title" className="text-sm font-semibold text-text-primary mb-1">
            Autosave
          </h3>
          <p id="autosave-setting-description" className="text-xs text-text-muted leading-relaxed">
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
                    aria-pressed={autosaveDelay === opt.value}
                    aria-label={`Set autosave delay to ${opt.label}`}
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
          aria-checked={autosaveEnabled}
          aria-labelledby="autosave-setting-title"
          aria-describedby="autosave-setting-description"
          role="switch"
        >
          <span
            className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${autosaveEnabled ? "translate-x-7" : "translate-x-0"}`}
          />
        </button>
      </div>

      {/* Line Numbers Toggle */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3
            id="line-numbers-setting-title"
            className="text-sm font-semibold text-text-primary mb-1"
          >
            Line Numbers
          </h3>
          <p
            id="line-numbers-setting-description"
            className="text-xs text-text-muted leading-relaxed"
          >
            Show line numbers, fold arrows, and the active-line highlight in the editor. Off by
            default for a clean, document-style look.
          </p>
        </div>
        <button
          onClick={() => setShowLineNumbers(!showLineNumbers)}
          className={`
            relative ml-4 w-14 h-7 rounded-full transition-all duration-200 shrink-0
            ${
              showLineNumbers
                ? "bg-accent shadow-lg shadow-accent/30"
                : "bg-overlay-light hover:bg-overlay-medium"
            }
          `}
          aria-checked={showLineNumbers}
          aria-labelledby="line-numbers-setting-title"
          aria-describedby="line-numbers-setting-description"
          role="switch"
        >
          <span
            className={`
              absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200
              ${showLineNumbers ? "translate-x-7" : "translate-x-0"}
            `}
          />
        </button>
      </div>

      {/* Editor Width — one measure for the editor and the rendered preview, so
          switching Source → Live → Read never reflows the text. */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 id="editor-width-title" className="text-sm font-semibold text-text-primary mb-1">
            Editor Width
          </h3>
          <p id="editor-width-description" className="text-xs text-text-muted leading-relaxed">
            How wide the text column is allowed to grow. Narrow keeps lines at a comfortable reading
            length; wide fills the window. The same measure applies in Source, Live, and Read.
          </p>
          <div className="mt-3 rounded-2xl border border-overlay-subtle bg-overlay-subtle/40 p-1.5 shadow-inner shadow-black/10">
            <div
              className="relative grid grid-cols-3 gap-1"
              role="group"
              aria-labelledby="editor-width-title"
              aria-describedby="editor-width-description"
            >
              <span
                className="absolute inset-y-0 left-0 w-1/3 rounded-xl border border-accent/30 bg-accent/10 shadow-sm shadow-accent/10 transition-transform duration-200 ease-out"
                style={{ transform: `translateX(${selectedWidthIndex * 100}%)` }}
                aria-hidden="true"
              />
              {EDITOR_WIDTHS.map((option, index) => {
                const isActive = editorWidth === option.id;
                // Three stacked rules that grow with the option — a miniature of
                // the text column the choice produces.
                const barWidth = ["w-2.5", "w-3.5", "w-full"][index];

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setEditorWidth(option.id)}
                    className={`relative z-10 rounded-xl px-2.5 py-2.5 text-left transition-colors ${
                      isActive ? "text-accent" : "text-text-muted hover:text-text-primary"
                    }`}
                    aria-pressed={isActive}
                    aria-label={`${option.label} editor width: ${option.description}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 flex-col justify-center gap-1 rounded-lg border border-overlay-subtle bg-bg-sidebar/70 px-1">
                        {[0, 1, 2].map((line) => (
                          <span
                            key={line}
                            className={`h-0.5 rounded-full ${barWidth} ${
                              isActive ? "bg-accent" : "bg-text-muted/50"
                            }`}
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

      {/* Where pasted images go */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 id="attachment-folder-title" className="text-sm font-semibold text-text-primary mb-1">
            Attachment Folder
          </h3>
          <p id="attachment-folder-description" className="text-xs text-text-muted leading-relaxed">
            Where images you paste or drop into a note are saved, relative to the workspace root.
            Leave it empty to keep them beside your notes at the top level.
          </p>
          <input
            type="text"
            value={attachmentFolder}
            onChange={(event) => setAttachmentFolder(event.target.value)}
            spellCheck={false}
            placeholder="attachments"
            aria-labelledby="attachment-folder-title"
            aria-describedby="attachment-folder-description"
            className="mt-3 w-full rounded-xl border border-overlay-subtle bg-overlay-subtle/40 px-3 py-2 font-mono text-xs leading-relaxed text-text-primary placeholder:text-text-muted focus:border-accent/50"
          />
        </div>
      </div>

      {/* Workspace excludes */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 id="ignore-patterns-title" className="text-sm font-semibold text-text-primary mb-1">
            Excluded Folders
          </h3>
          <p id="ignore-patterns-description" className="text-xs text-text-muted leading-relaxed">
            Marky already honours <code className="font-mono text-[11px]">.gitignore</code> and
            always skips <code className="font-mono text-[11px]">node_modules</code>. Add anything
            else you don’t want in the sidebar or search — one gitignore-style pattern per line.
            Takes effect on the next workspace refresh.
          </p>
          <textarea
            value={ignorePatterns}
            onChange={(event) => setIgnorePatterns(event.target.value)}
            rows={4}
            spellCheck={false}
            placeholder={"Archive/\nattachments/\n*.excalidraw.md"}
            aria-labelledby="ignore-patterns-title"
            aria-describedby="ignore-patterns-description"
            className="mt-3 w-full resize-y rounded-xl border border-overlay-subtle bg-overlay-subtle/40 px-3 py-2 font-mono text-xs leading-relaxed text-text-primary placeholder:text-text-muted focus:border-accent/50"
          />
        </div>
      </div>

      {/* Vim Mode Toggle */}
      {/* Sidebar Density */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 id="sidebar-density-title" className="text-sm font-semibold text-text-primary mb-1">
            Sidebar Density
          </h3>
          <p id="sidebar-density-description" className="text-xs text-text-muted leading-relaxed">
            Tune the note tree spacing for small screens, large workspaces, or a more relaxed
            browsing feel.
          </p>
          <div className="mt-3 rounded-2xl border border-overlay-subtle bg-overlay-subtle/40 p-1.5 shadow-inner shadow-black/10">
            <div
              className="relative grid grid-cols-3 gap-1"
              role="group"
              aria-labelledby="sidebar-density-title"
              aria-describedby="sidebar-density-description"
            >
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
                    aria-label={`${option.label} sidebar density: ${option.description}`}
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
          <h3 id="sidebar-metadata-title" className="text-sm font-semibold text-text-primary mb-1">
            Sidebar Metadata
          </h3>
          <p id="sidebar-metadata-description" className="text-xs text-text-muted leading-relaxed">
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
          aria-checked={showSidebarMetadata}
          aria-labelledby="sidebar-metadata-title"
          aria-describedby="sidebar-metadata-description"
          role="switch"
        >
          <span
            className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${showSidebarMetadata ? "translate-x-7" : "translate-x-0"}`}
          />
        </button>
      </div>

      {/* Typewriter Mode Toggle */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3
            id="typewriter-mode-title"
            className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2"
          >
            Typewriter Mode
            <span className="px-2 py-0.5 text-[10px] font-medium bg-accent/10 text-accent rounded border border-accent/20">
              Focus Mode
            </span>
          </h3>
          <p id="typewriter-mode-description" className="text-xs text-text-muted leading-relaxed">
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
          aria-checked={typewriterModeEnabled}
          aria-labelledby="typewriter-mode-title"
          aria-describedby="typewriter-mode-description"
          role="switch"
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
          <h3
            id="vim-mode-title"
            className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2"
          >
            Vim Mode
            <span className="px-2 py-0.5 text-[10px] font-medium bg-accent/10 text-accent rounded border border-accent/20">
              Advanced
            </span>
          </h3>
          <p id="vim-mode-description" className="text-xs text-text-muted leading-relaxed">
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
          aria-checked={vimMode}
          aria-labelledby="vim-mode-title"
          aria-describedby="vim-mode-description"
          role="switch"
        >
          <span
            className={`
              absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200
              ${vimMode ? "translate-x-7" : "translate-x-0"}
            `}
          />
        </button>
      </div>

      {vimMode && (
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 id="vim-visual-line-title" className="text-sm font-semibold text-text-primary mb-1">
              Move by visual line
            </h3>
            <p id="vim-visual-line-description" className="text-xs text-text-muted leading-relaxed">
              Long paragraphs wrap across several rows on screen but are a single line in the file.
              With this on, <code className="font-mono">j</code>,{" "}
              <code className="font-mono">k</code>, <code className="font-mono">0</code> and{" "}
              <code className="font-mono">$</code> step through the rows you can see instead of
              jumping a whole paragraph at a time. Operators are untouched —{" "}
              <code className="font-mono">dd</code> and <code className="font-mono">d$</code> still
              work on whole lines.
            </p>
          </div>
          <button
            onClick={toggleVimVisualLineMotion}
            className={`
              relative ml-4 w-14 h-7 rounded-full transition-all duration-200 shrink-0
              ${
                vimVisualLineMotion
                  ? "bg-accent shadow-lg shadow-accent/30"
                  : "bg-overlay-light hover:bg-overlay-medium"
              }
            `}
            aria-checked={vimVisualLineMotion}
            aria-labelledby="vim-visual-line-title"
            aria-describedby="vim-visual-line-description"
            role="switch"
          >
            <span
              className={`
                absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200
                ${vimVisualLineMotion ? "translate-x-7" : "translate-x-0"}
              `}
            />
          </button>
        </div>
      )}

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
