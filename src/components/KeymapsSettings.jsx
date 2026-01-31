import { useState, useEffect, useCallback } from 'react';
import useSettingsStore, { formatKeymap, DEFAULT_KEYMAPS } from '../store/settingsStore';

// Group keymaps by category
const KEYMAP_CATEGORIES = [
  {
    name: 'File Operations',
    actions: ['newNote', 'newFolder', 'openFolder', 'save']
  },
  {
    name: 'Navigation',
    actions: ['commandPalette', 'search', 'toggleSidebar']
  },
  {
    name: 'View',
    actions: ['viewEditor', 'viewSplit', 'viewPreview']
  },
  {
    name: 'Editing',
    actions: ['bold', 'italic', 'link', 'codeBlock', 'list']
  },
  {
    name: 'Help',
    actions: ['showShortcuts']
  }
];

const KeymapsSettings = ({ onOpenKeymapsModal }) => {
  const { keymaps, resetKeymaps, resetKeymap, updateKeymap, setIsRecordingKeymap } = useSettingsStore();
  const [editingAction, setEditingAction] = useState(null);
  const [recordedKeymap, setRecordedKeymap] = useState(null);

  const isRecording = editingAction !== null;

  // Sync recording state with global store
  useEffect(() => {
    setIsRecordingKeymap(isRecording);
    return () => setIsRecordingKeymap(false);
  }, [isRecording, setIsRecordingKeymap]);

  const handleStartRecording = (actionId) => {
    setEditingAction(actionId);
    setRecordedKeymap(null);
  };

  const handleCancelRecording = useCallback(() => {
    setEditingAction(null);
    setRecordedKeymap(null);
  }, []);

  const handleConfirmKeymap = useCallback(() => {
    if (editingAction && recordedKeymap) {
      updateKeymap(editingAction, recordedKeymap);
    }
    setEditingAction(null);
    setRecordedKeymap(null);
  }, [editingAction, recordedKeymap, updateKeymap]);

  // Global keydown listener for recording
  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Ignore modifier-only presses
      if (['Control', 'Meta', 'Shift', 'Alt'].includes(e.key)) return;

      // Cancel on Escape without modifier
      if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        handleCancelRecording();
        return;
      }

      const modifiers = [];
      if (e.metaKey || e.ctrlKey) modifiers.push('mod');
      if (e.shiftKey) modifiers.push('shift');
      if (e.altKey) modifiers.push('alt');

      // Require at least one modifier
      if (modifiers.length === 0) {
        return;
      }

      setRecordedKeymap({
        key: e.key,
        modifiers
      });
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isRecording, handleCancelRecording]);

  const isModified = (actionId) => {
    const current = keymaps[actionId];
    const original = DEFAULT_KEYMAPS[actionId];
    return current.key !== original.key ||
      JSON.stringify(current.modifiers) !== JSON.stringify(original.modifiers);
  };

  const hasAnyModifications = Object.keys(keymaps).some(isModified);

  // Format the recorded keymap for display
  const formatRecordedKeymap = (keymap) => {
    if (!keymap) return null;
    const parts = [];
    if (keymap.modifiers.includes('mod')) {
      parts.push(navigator.platform.includes('Mac') ? '⌘' : 'Ctrl');
    }
    if (keymap.modifiers.includes('shift')) {
      parts.push('Shift');
    }
    if (keymap.modifiers.includes('alt')) {
      parts.push(navigator.platform.includes('Mac') ? '⌥' : 'Alt');
    }
    let keyDisplay = keymap.key;
    if (keymap.key === '/') keyDisplay = '/';
    else if (keymap.key === '?') keyDisplay = '?';
    else if (keymap.key.length === 1) keyDisplay = keymap.key.toUpperCase();
    parts.push(keyDisplay);
    return parts;
  };

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Keyboard Shortcuts</h3>
          <p className="text-xs text-text-muted mt-1">
            Click on a shortcut to customize it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onOpenKeymapsModal && (
            <button
              onClick={onOpenKeymapsModal}
              className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary bg-overlay-subtle hover:bg-overlay-light rounded-lg border border-overlay-light transition-colors"
            >
              View All
            </button>
          )}
          {hasAnyModifications && (
            <button
              onClick={resetKeymaps}
              className="px-3 py-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 rounded-lg border border-amber-500/20 transition-colors"
            >
              Reset All
            </button>
          )}
        </div>
      </div>

      {/* Keymaps by category */}
      <div className="space-y-6">
        {KEYMAP_CATEGORIES.map((category) => (
          <div key={category.name}>
            <h4 className="text-xs font-semibold text-accent uppercase tracking-wider mb-3">
              {category.name}
            </h4>
            <div className="space-y-1">
              {category.actions.map((actionId) => {
                const keymap = keymaps[actionId];
                if (!keymap) return null;

                const isEditing = editingAction === actionId;
                const modified = isModified(actionId);
                const keys = formatKeymap(keymap);
                const recordedKeys = isEditing && recordedKeymap ? formatRecordedKeymap(recordedKeymap) : null;

                return (
                  <div
                    key={actionId}
                    className={`
                      flex items-center justify-between py-2 px-3 rounded-lg transition-colors
                      ${isEditing ? 'bg-accent/20 ring-1 ring-accent' : 'hover:bg-overlay-subtle'}
                    `}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-text-secondary">
                        {keymap.description}
                      </span>
                      {modified && !isEditing && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-400 rounded">
                          Modified
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        /* Recording UI */
                        <div className="flex items-center gap-2">
                          {recordedKeys ? (
                            /* Show recorded keys */
                            <div className="flex items-center gap-1 px-2 py-1 bg-accent/30 rounded-md">
                              {recordedKeys.map((key, i) => (
                                <span key={i} className="inline-flex items-center">
                                  <kbd className="px-1.5 py-0.5 text-xs font-mono bg-overlay-light border border-overlay-medium rounded text-text-primary">
                                    {key}
                                  </kbd>
                                  {i < recordedKeys.length - 1 && (
                                    <span className="mx-0.5 text-text-primary/60">+</span>
                                  )}
                                </span>
                              ))}
                            </div>
                          ) : (
                            /* Waiting for input */
                            <span className="text-xs font-medium text-accent animate-pulse px-2 py-1">
                              Press keys...
                            </span>
                          )}

                          {/* Confirm button */}
                          <button
                            onClick={handleConfirmKeymap}
                            disabled={!recordedKeymap}
                            className={`
                              p-1.5 rounded-md transition-colors
                              ${recordedKeymap
                                ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                                : 'bg-overlay-subtle text-text-muted cursor-not-allowed'
                              }
                            `}
                            title="Confirm"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>

                          {/* Cancel button */}
                          <button
                            onClick={handleCancelRecording}
                            className="p-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-md transition-colors"
                            title="Cancel (Esc)"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        /* Normal display */
                        <>
                          <button
                            onClick={() => handleStartRecording(actionId)}
                            className="flex items-center gap-1 px-2 py-1 rounded-md bg-overlay-subtle hover:bg-overlay-light border border-overlay-light transition-colors"
                            title="Click to change shortcut"
                          >
                            {keys.map((key, i) => (
                              <span key={i} className="inline-flex items-center">
                                <kbd className="px-1.5 py-0.5 text-xs font-mono bg-overlay-subtle border border-overlay-light rounded text-text-primary">
                                  {key}
                                </kbd>
                                {i < keys.length - 1 && (
                                  <span className="mx-0.5 text-text-muted">+</span>
                                )}
                              </span>
                            ))}
                          </button>

                          {/* Reset button (only if modified) */}
                          {modified && (
                            <button
                              onClick={() => resetKeymap(actionId)}
                              className="p-1 text-text-muted hover:text-text-secondary transition-colors"
                              title="Reset to default"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Info box */}
      <div className="p-4 bg-overlay-subtle rounded-xl border border-overlay-light">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-text-muted shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-xs text-text-muted">
              Shortcuts require at least one modifier key (Cmd/Ctrl, Shift, or Alt).
              Press Escape to cancel recording. Some system shortcuts may override custom keymaps.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KeymapsSettings;
