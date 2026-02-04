import useSettingsStore from '../store/settingsStore';

const EditorSettings = () => {
  const { vimMode, toggleVimMode } = useSettingsStore();

  return (
    <div className="space-y-6">
      {/* Vim Mode Toggle */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2">
            Vim Mode
            <span className="px-2 py-0.5 text-[10px] font-medium bg-accent/10 text-accent rounded border border-accent/20">
              Advanced
            </span>
          </h3>
          <p className="text-xs text-text-muted leading-relaxed">
            Enable Vim keybindings in the markdown editor. Provides powerful modal editing with Normal, Insert, and Visual modes.
          </p>
          {vimMode && (
            <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-xs text-amber-300 flex items-start gap-2">
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  <strong>Note:</strong> Toggling Vim mode will reinitialize the editor and may clear undo history for the current note.
                </span>
              </p>
            </div>
          )}
        </div>
        <button
          onClick={toggleVimMode}
          className={`
            relative ml-4 w-14 h-7 rounded-full transition-all duration-200 shrink-0
            ${vimMode
              ? 'bg-accent shadow-lg shadow-accent/30'
              : 'bg-overlay-light hover:bg-overlay-medium'
            }
          `}
          aria-label="Toggle Vim Mode"
        >
          <span
            className={`
              absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200
              ${vimMode ? 'translate-x-7' : 'translate-x-0'}
            `}
          />
        </button>
      </div>

      {/* Vim Mode Quick Reference */}
      {vimMode && (
        <div className="p-4 bg-overlay-subtle rounded-xl border border-overlay-light">
          <h4 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Quick Reference
          </h4>
          <div className="space-y-2 text-xs text-text-secondary">
            <div className="flex justify-between items-center py-1">
              <span>Enter Insert mode:</span>
              <kbd className="px-2 py-1 bg-overlay-light border border-overlay-medium rounded text-[10px] font-mono">i</kbd>
            </div>
            <div className="flex justify-between items-center py-1">
              <span>Return to Normal mode:</span>
              <kbd className="px-2 py-1 bg-overlay-light border border-overlay-medium rounded text-[10px] font-mono">Esc</kbd>
            </div>
            <div className="flex justify-between items-center py-1">
              <span>Enter Visual mode:</span>
              <kbd className="px-2 py-1 bg-overlay-light border border-overlay-medium rounded text-[10px] font-mono">v</kbd>
            </div>
            <div className="flex justify-between items-center py-1">
              <span>Save and continue:</span>
              <kbd className="px-2 py-1 bg-overlay-light border border-overlay-medium rounded text-[10px] font-mono">:w</kbd>
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
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
