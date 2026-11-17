import { useEffect, useRef } from "react";
import useModalAccessibility from "../../hooks/useModalAccessibility";

const SHORTCUTS = [
  {
    category: "File operations",
    items: [
      { keys: ["Cmd/Ctrl", "N"], description: "Create new note" },
      { keys: ["Cmd/Ctrl", "Shift", "N"], description: "Create new folder" },
      { keys: ["Cmd/Ctrl", "O"], description: "Open folder" },
      { keys: ["Cmd/Ctrl", "S"], description: "Save current note" },
    ],
  },
  {
    category: "Editing",
    items: [
      { keys: ["Cmd/Ctrl", "Shift", "B"], description: "Bold text" },
      { keys: ["Cmd/Ctrl", "I"], description: "Italic text" },
      { keys: ["Cmd/Ctrl", "K"], description: "Insert link" },
      { keys: ["Cmd/Ctrl", "Shift", "C"], description: "Insert code block" },
      { keys: ["Cmd/Ctrl", "Shift", "L"], description: "Insert list" },
    ],
  },
  {
    category: "View",
    items: [
      { keys: ["Cmd/Ctrl", "1"], description: "Editor only" },
      { keys: ["Cmd/Ctrl", "2"], description: "Split view" },
      { keys: ["Cmd/Ctrl", "3"], description: "Preview only" },
      { keys: ["Cmd/Ctrl", "B"], description: "Toggle sidebar" },
      { keys: ["Cmd/Ctrl", "Alt", "F"], description: "Toggle focus mode" },
    ],
  },
  {
    category: "Help",
    items: [
      { keys: ["Cmd/Ctrl", "?"], description: "Show this help" },
      { keys: ["Esc"], description: "Close dialogs" },
    ],
  },
];

const KeyboardShortcutsModal = ({ isOpen, onClose }) => {
  const dialogRef = useRef(null);
  useModalAccessibility(isOpen, dialogRef);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
      // Open with Cmd/Ctrl + ?
      if ((e.metaKey || e.ctrlKey) && e.key === "?" && !isOpen) {
        e.preventDefault();
        // This would need to be triggered from parent
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className="modal-scrim z-50 animate-fade-in" onClick={onClose} aria-hidden="true" />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          ref={dialogRef}
          className="glass-panel modal-panel w-full max-w-[560px] max-h-[85vh] flex flex-col pointer-events-auto animate-fade-in"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="keyboard-shortcuts-title"
          tabIndex={-1}
        >
          <div className="modal-header shrink-0">
            <h2 id="keyboard-shortcuts-title" className="modal-title">
              Keyboard shortcuts
            </h2>
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
            {SHORTCUTS.map((category) => (
              <section key={category.category}>
                <h3 className="palette-group pt-4">{category.category}</h3>
                {category.items.map((shortcut, index) => (
                  <div
                    key={index}
                    className="flex min-h-9 items-center justify-between gap-4 px-3 text-[13.5px]"
                  >
                    <span className="text-text-secondary">{shortcut.description}</span>
                    <span className="kbd-hint">{shortcut.keys.join(" ")}</span>
                  </div>
                ))}
              </section>
            ))}
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

export default KeyboardShortcutsModal;
