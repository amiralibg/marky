import { useEffect } from 'react';

const SHORTCUTS = [
  {
    category: 'File Operations',
    items: [
      { keys: ['Cmd/Ctrl', 'N'], description: 'Create new note' },
      { keys: ['Cmd/Ctrl', 'Shift', 'N'], description: 'Create new folder' },
      { keys: ['Cmd/Ctrl', 'O'], description: 'Open folder' },
      { keys: ['Cmd/Ctrl', 'S'], description: 'Save current note' },
    ]
  },
  {
    category: 'Editing',
    items: [
      { keys: ['Cmd/Ctrl', 'B'], description: 'Bold text' },
      { keys: ['Cmd/Ctrl', 'I'], description: 'Italic text' },
      { keys: ['Cmd/Ctrl', 'K'], description: 'Insert link' },
      { keys: ['Cmd/Ctrl', 'Shift', 'C'], description: 'Insert code block' },
      { keys: ['Cmd/Ctrl', 'Shift', 'L'], description: 'Insert list' },
    ]
  },
  {
    category: 'View',
    items: [
      { keys: ['Cmd/Ctrl', '1'], description: 'Editor only' },
      { keys: ['Cmd/Ctrl', '2'], description: 'Split view' },
      { keys: ['Cmd/Ctrl', '3'], description: 'Preview only' },
      { keys: ['Cmd/Ctrl', '/'], description: 'Toggle sidebar' },
    ]
  },
  {
    category: 'Help',
    items: [
      { keys: ['Cmd/Ctrl', '?'], description: 'Show this help' },
      { keys: ['Esc'], description: 'Close dialogs' },
    ]
  }
];

const KeyboardShortcutsModal = ({ isOpen, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
      // Open with Cmd/Ctrl + ?
      if ((e.metaKey || e.ctrlKey) && e.key === '?' && !isOpen) {
        e.preventDefault();
        // This would need to be triggered from parent
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fadeIn"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="glass-panel border-glass-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col pointer-events-auto animate-slideUp"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b border-glass-border px-6 py-4 flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-xl font-semibold text-text-primary flex items-center gap-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                Keyboard Shortcuts
              </h2>
              <p className="text-sm text-text-muted mt-1">Quick reference for all keyboard shortcuts</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              title="Close (Esc)"
            >
              <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div className="space-y-6">
              {SHORTCUTS.map((category) => (
                <div key={category.category}>
                  <h3 className="text-sm font-semibold text-accent uppercase tracking-wider mb-3">
                    {category.category}
                  </h3>
                  <div className="space-y-2">
                    {category.items.map((shortcut, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5 transition-colors"
                      >
                        <span className="text-sm text-text-secondary">{shortcut.description}</span>
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key, keyIndex) => (
                            <span key={keyIndex} className="inline-flex items-center">
                              <kbd className="px-2 py-1 text-xs font-mono bg-white/5 border border-white/10 rounded shadow-sm text-text-primary">
                                {key}
                              </kbd>
                              {keyIndex < shortcut.keys.length - 1 && (
                                <span className="mx-1 text-text-muted">+</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Pro Tip */}
            <div className="mt-8 p-4 bg-accent/10 border border-accent/20 rounded-lg">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-accent shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div>
                  <h4 className="font-semibold text-text-primary text-sm mb-1">Pro Tip</h4>
                  <p className="text-xs text-text-secondary">
                    Press <kbd className="px-1.5 py-0.5 text-xs font-mono bg-white/5 border border-white/10 rounded">Cmd/Ctrl</kbd> + <kbd className="px-1.5 py-0.5 text-xs font-mono bg-white/5 border border-white/10 rounded">?</kbd> anytime to view this help panel.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-glass-border px-6 py-4 flex justify-end shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium bg-accent text-white hover:bg-accent-hover rounded-lg transition-colors shadow-lg shadow-accent/20"
            >
              Got it!
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(20px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>
    </>
  );
};

export default KeyboardShortcutsModal;
