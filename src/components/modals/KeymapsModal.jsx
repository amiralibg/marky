import { useEffect, useRef } from "react";
import useSettingsStore, {
  formatShortcutHint,
  DEFAULT_KEYMAPS,
  KEYMAP_CATEGORIES,
} from "../../store/settingsStore";
import useModalAccessibility from "../../hooks/useModalAccessibility";

const KeymapsModal = ({ isOpen, onClose }) => {
  const { keymaps } = useSettingsStore();
  const dialogRef = useRef(null);
  useModalAccessibility(isOpen, dialogRef);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isModified = (actionId) => {
    const current = keymaps[actionId];
    const original = DEFAULT_KEYMAPS[actionId];
    // A persisted keymap can carry actions this build no longer defines.
    if (!current || !original) return false;
    return (
      current.key !== original.key ||
      JSON.stringify(current.modifiers) !== JSON.stringify(original.modifiers)
    );
  };

  return (
    <>
      <div className="modal-scrim z-50 animate-fade-in" onClick={onClose} aria-hidden="true" />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          ref={dialogRef}
          className="glass-panel modal-panel w-full max-w-[760px] max-h-[85vh] flex flex-col pointer-events-auto animate-fade-in"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="keymaps-modal-title"
          tabIndex={-1}
        >
          <div className="modal-header shrink-0">
            <div className="min-w-0 flex-1">
              <h2 id="keymaps-modal-title" className="modal-title">
                Keyboard shortcuts
              </h2>
              <p className="modal-subtitle">
                Change any of them in Settings, under Shortcuts. A dot marks one you have changed.
              </p>
            </div>
            <button type="button" onClick={onClose} className="icon-btn" aria-label="Close">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
            <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
              {KEYMAP_CATEGORIES.map((category) => (
                <section key={category.name}>
                  <h3 className="palette-group pt-4">{category.name}</h3>
                  {category.actions.map((actionId) => {
                    const keymap = keymaps[actionId];
                    if (!keymap) return null;
                    const modified = isModified(actionId);
                    return (
                      <div
                        key={actionId}
                        className="flex min-h-9 items-center justify-between gap-4 px-3 text-[13.5px]"
                      >
                        <span className="flex min-w-0 items-center gap-2 text-text-secondary">
                          <span className="truncate">{keymap.description}</span>
                          {modified && (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                              title="Custom shortcut"
                              aria-label="Custom shortcut"
                            />
                          )}
                        </span>
                        <span className="kbd-hint">{formatShortcutHint(keymap)}</span>
                      </div>
                    );
                  })}
                </section>
              ))}
            </div>
          </div>

          <div className="modal-footer shrink-0">
            <button type="button" onClick={onClose} className="btn btn-primary">
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default KeymapsModal;
