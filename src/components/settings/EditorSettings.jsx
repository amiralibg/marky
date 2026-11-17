import useSettingsStore, { EDITOR_WIDTHS, normalizeSaveMode } from "../../store/settingsStore";

const EditorSettings = () => {
  const {
    vimMode,
    toggleVimMode,
    vimVisualLineMotion,
    toggleVimVisualLineMotion,
    saveMode,
    autosaveDelay,
    setSaveMode,
    setAutosaveDelay,
    typewriterMode: typewriterModeEnabled,
    setTypewriterMode,
    showLineNumbers,
    setShowLineNumbers,
    htmlRunScripts,
    setHtmlRunScripts,
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

  const isAutoSave = normalizeSaveMode(saveMode) === "auto";
  const mod = typeof navigator !== "undefined" && navigator.platform.includes("Mac") ? "⌘" : "Ctrl";

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
      {/* Save mode */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 id="autosave-setting-title" className="text-sm font-semibold text-text-primary mb-1">
            Save automatically
          </h3>
          <p
            id="autosave-setting-description"
            className="text-[12.5px] leading-relaxed text-text-muted"
          >
            Notes are written to disk as you type, and whenever you switch note, close a tab, leave
            the window or quit. Turn this off to save with {mod}S instead, with a dot marking notes
            that have changes you have not written yet.
          </p>
          {isAutoSave && (
            <div className="mt-3 flex items-center gap-3">
              <span className="text-[12.5px] text-text-secondary">Save after</span>
              <div className="flex gap-1.5 flex-wrap">
                {delayOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setAutosaveDelay(opt.value)}
                    aria-pressed={autosaveDelay === opt.value}
                    aria-label={`Save ${opt.label} after you stop typing`}
                    className="chip h-7 px-2.5 text-[12.5px]"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <button
          onClick={() => setSaveMode(isAutoSave ? "manual" : "auto")}
          aria-checked={isAutoSave}
          aria-labelledby="autosave-setting-title"
          aria-describedby="autosave-setting-description"
          role="switch"
          className="switch"
        ></button>
      </div>

      {/* Line Numbers Toggle */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3
            id="line-numbers-setting-title"
            className="text-sm font-semibold text-text-primary mb-1"
          >
            Line numbers
          </h3>
          <p
            id="line-numbers-setting-description"
            className="text-[12.5px] leading-relaxed text-text-muted"
          >
            Show line numbers, fold arrows, and the active-line highlight in the editor. Off by
            default for a clean, document-style look.
          </p>
        </div>
        <button
          onClick={() => setShowLineNumbers(!showLineNumbers)}
          aria-checked={showLineNumbers}
          aria-labelledby="line-numbers-setting-title"
          aria-describedby="line-numbers-setting-description"
          role="switch"
          className="switch"
        ></button>
      </div>

      {/* HTML documents' scripts. Beside line numbers: both decide what an
          open document shows, rather than how the app behaves. */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3
            id="html-scripts-setting-title"
            className="text-sm font-semibold text-text-primary mb-1"
          >
            Run scripts in HTML documents
          </h3>
          <p
            id="html-scripts-setting-description"
            className="text-[12.5px] leading-relaxed text-text-muted"
          >
            Lets an HTML document&rsquo;s own scripts run in Preview, inside a sandbox that cannot
            reach Marky or your files. Turn this off to show pages as static markup. Scripts are
            always paused while you edit.
          </p>
        </div>
        <button
          onClick={() => setHtmlRunScripts(htmlRunScripts === false)}
          aria-checked={htmlRunScripts !== false}
          aria-labelledby="html-scripts-setting-title"
          aria-describedby="html-scripts-setting-description"
          role="switch"
          className="switch"
        ></button>
      </div>

      {/* Editor Width — one measure for the editor and the rendered preview, so
          switching Source → Live → Read never reflows the text. */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 id="editor-width-title" className="text-sm font-semibold text-text-primary mb-1">
            Editor width
          </h3>
          <p
            id="editor-width-description"
            className="text-[12.5px] leading-relaxed text-text-muted"
          >
            How wide the text column is allowed to grow. Narrow keeps lines at a comfortable reading
            length; wide fills the window. The same measure applies in Source, Live, and Read.
          </p>
          <div className="mt-3 rounded-card bg-item-hover p-1">
            <div
              className="relative grid grid-cols-3 gap-1"
              role="group"
              aria-labelledby="editor-width-title"
              aria-describedby="editor-width-description"
            >
              <span
                className="absolute inset-y-0 w-1/3 rounded-control bg-item-active shadow-[0_0_0_1px_var(--color-border)] transition-[inset-inline-start] duration-200 ease-soft"
                // Positioned by its logical start so the thumb follows the
                // segments in a right-to-left layout too.
                style={{ insetInlineStart: `${(selectedWidthIndex * 100) / 3}%` }}
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
                    className={`relative z-10 rounded-control px-2.5 py-2.5 text-start transition-colors ${
                      isActive ? "text-text-primary" : "text-text-muted hover:text-text-primary"
                    }`}
                    aria-pressed={isActive}
                    aria-label={`${option.label} editor width: ${option.description}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 flex-col justify-center gap-1 rounded-control bg-overlay-subtle px-1">
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
                        <span className="block text-[12.5px] font-semibold">{option.label}</span>
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
            Attachment folder
          </h3>
          <p
            id="attachment-folder-description"
            className="text-[12.5px] leading-relaxed text-text-muted"
          >
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
            className="field mt-3 font-mono text-[12.5px]"
          />
        </div>
      </div>

      {/* Workspace excludes */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 id="ignore-patterns-title" className="text-sm font-semibold text-text-primary mb-1">
            Excluded folders
          </h3>
          <p
            id="ignore-patterns-description"
            className="text-[12.5px] leading-relaxed text-text-muted"
          >
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
            className="field mt-3 font-mono text-[12.5px]"
          />
        </div>
      </div>

      {/* Vim Mode Toggle */}
      {/* Sidebar Density */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 id="sidebar-density-title" className="text-sm font-semibold text-text-primary mb-1">
            Sidebar density
          </h3>
          <p
            id="sidebar-density-description"
            className="text-[12.5px] leading-relaxed text-text-muted"
          >
            Tune the note tree spacing for small screens, large workspaces, or a more relaxed
            browsing feel.
          </p>
          <div className="mt-3 rounded-card bg-item-hover p-1">
            <div
              className="relative grid grid-cols-3 gap-1"
              role="group"
              aria-labelledby="sidebar-density-title"
              aria-describedby="sidebar-density-description"
            >
              <span
                className="absolute inset-y-0 w-1/3 rounded-control bg-item-active shadow-[0_0_0_1px_var(--color-border)] transition-[inset-inline-start] duration-200 ease-soft"
                // Positioned by its logical start so the thumb follows the
                // segments in a right-to-left layout too.
                style={{ insetInlineStart: `${(selectedDensityIndex * 100) / 3}%` }}
                aria-hidden="true"
              />
              {densityOptions.map((option) => {
                const isActive = sidebarDensity === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSidebarDensity(option.value)}
                    className={`relative z-10 rounded-control px-2.5 py-2.5 text-start transition-colors ${
                      isActive ? "text-text-primary" : "text-text-muted hover:text-text-primary"
                    }`}
                    aria-pressed={isActive}
                    aria-label={`${option.label} sidebar density: ${option.description}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 flex-col justify-center gap-1 rounded-control bg-overlay-subtle px-1.5">
                        {option.bars.map((barClass, index) => (
                          <span
                            key={index}
                            className={`${barClass} rounded-full ${isActive ? "bg-accent" : "bg-text-muted/50"}`}
                          />
                        ))}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[12.5px] font-semibold">{option.label}</span>
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
            Sidebar metadata
          </h3>
          <p
            id="sidebar-metadata-description"
            className="text-[12.5px] leading-relaxed text-text-muted"
          >
            Show note tags, backlink counts, pinned markers, and saved indicators in the sidebar
            tree.
          </p>
        </div>
        <button
          onClick={() => setShowSidebarMetadata(!showSidebarMetadata)}
          aria-checked={showSidebarMetadata}
          aria-labelledby="sidebar-metadata-title"
          aria-describedby="sidebar-metadata-description"
          role="switch"
          className="switch"
        ></button>
      </div>

      {/* Typewriter Mode Toggle */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3
            id="typewriter-mode-title"
            className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2"
          >
            Typewriter mode
            <span className="rounded-full bg-accent-dim px-2 py-0.5 text-[11px] font-medium text-accent">
              Focus mode
            </span>
          </h3>
          <p
            id="typewriter-mode-description"
            className="text-[12.5px] leading-relaxed text-text-muted"
          >
            Keep the current line vertically centered in the editor while you type. Works best in
            focus mode for a distraction-free writing experience.
          </p>
        </div>
        <button
          onClick={() => setTypewriterMode(!typewriterModeEnabled)}
          aria-checked={typewriterModeEnabled}
          aria-labelledby="typewriter-mode-title"
          aria-describedby="typewriter-mode-description"
          role="switch"
          className="switch"
        ></button>
      </div>

      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3
            id="vim-mode-title"
            className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2"
          >
            Vim mode
            <span className="rounded-full bg-accent-dim px-2 py-0.5 text-[11px] font-medium text-accent">
              Advanced
            </span>
          </h3>
          <p id="vim-mode-description" className="text-[12.5px] leading-relaxed text-text-muted">
            Enable Vim keybindings in the markdown editor. Provides powerful modal editing with
            Normal, Insert, and Visual modes.
          </p>
          {vimMode && (
            <div className="mt-3 p-3 bg-amber-500/10 rounded-control">
              <p className="text-xs text-text-secondary flex items-start gap-2">
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
          aria-checked={vimMode}
          aria-labelledby="vim-mode-title"
          aria-describedby="vim-mode-description"
          role="switch"
          className="switch"
        ></button>
      </div>

      {vimMode && (
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 id="vim-visual-line-title" className="text-sm font-semibold text-text-primary mb-1">
              Move by visual line
            </h3>
            <p
              id="vim-visual-line-description"
              className="text-[12.5px] leading-relaxed text-text-muted"
            >
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
            aria-checked={vimVisualLineMotion}
            aria-labelledby="vim-visual-line-title"
            aria-describedby="vim-visual-line-description"
            role="switch"
            className="switch"
          ></button>
        </div>
      )}

      {/* Vim Mode Quick Reference */}
      {vimMode && (
        <div className="rounded-card bg-item-hover p-4">
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
            Quick reference
          </h4>
          <div className="space-y-2 text-[12.5px] text-text-secondary">
            <div className="flex justify-between items-center py-1">
              <span>Enter Insert mode:</span>
              <kbd className="kbd-hint">i</kbd>
            </div>
            <div className="flex justify-between items-center py-1">
              <span>Return to Normal mode:</span>
              <kbd className="kbd-hint">Esc</kbd>
            </div>
            <div className="flex justify-between items-center py-1">
              <span>Enter Visual mode:</span>
              <kbd className="kbd-hint">v</kbd>
            </div>
            <div className="flex justify-between items-center py-1">
              <span>Save and continue:</span>
              <kbd className="kbd-hint">:w</kbd>
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
