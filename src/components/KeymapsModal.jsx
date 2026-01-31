import { useEffect } from 'react';
import useSettingsStore, { formatKeymap, DEFAULT_KEYMAPS } from '../store/settingsStore';

// Group keymaps by category
const KEYMAP_CATEGORIES = [
  {
    name: 'File Operations',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
    actions: ['newNote', 'newFolder', 'openFolder', 'save']
  },
  {
    name: 'Navigation',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    actions: ['commandPalette', 'search', 'toggleSidebar']
  },
  {
    name: 'View',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
      </svg>
    ),
    actions: ['viewEditor', 'viewSplit', 'viewPreview']
  },
  {
    name: 'Editing',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
    actions: ['bold', 'italic', 'link', 'codeBlock', 'list']
  },
  {
    name: 'Help',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    actions: ['showShortcuts']
  }
];

const KeymapsModal = ({ isOpen, onClose }) => {
  const { keymaps } = useSettingsStore();

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isModified = (actionId) => {
    const current = keymaps[actionId];
    const original = DEFAULT_KEYMAPS[actionId];
    return current.key !== original.key ||
      JSON.stringify(current.modifiers) !== JSON.stringify(original.modifiers);
  };

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
          className="glass-panel border-glass-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col pointer-events-auto animate-slideUp"
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
              <p className="text-sm text-text-muted mt-1">
                All available keyboard shortcuts. Customize them in Settings.
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-overlay-light rounded-lg transition-colors"
              title="Close (Esc)"
            >
              <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {KEYMAP_CATEGORIES.map((category) => (
                <div
                  key={category.name}
                  className="bg-overlay-subtle rounded-xl border border-overlay-light overflow-hidden"
                >
                  {/* Category header */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-overlay-subtle border-b border-overlay-light">
                    <div className="text-accent">
                      {category.icon}
                    </div>
                    <h3 className="text-sm font-semibold text-text-primary">
                      {category.name}
                    </h3>
                  </div>

                  {/* Shortcuts list */}
                  <div className="p-2">
                    {category.actions.map((actionId) => {
                      const keymap = keymaps[actionId];
                      if (!keymap) return null;

                      const keys = formatKeymap(keymap);
                      const modified = isModified(actionId);

                      return (
                        <div
                          key={actionId}
                          className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-overlay-subtle transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-text-secondary">
                              {keymap.description}
                            </span>
                            {modified && (
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Custom shortcut" />
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {keys.map((key, i) => (
                              <span key={i} className="inline-flex items-center">
                                <kbd className="px-2 py-1 text-xs font-mono bg-overlay-subtle border border-overlay-light rounded shadow-sm text-text-primary min-w-6 text-center">
                                  {key}
                                </kbd>
                                {i < keys.length - 1 && (
                                  <span className="mx-1 text-text-muted">+</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Pro Tip */}
            <div className="mt-6 p-4 bg-accent/10 border border-accent/20 rounded-xl">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-accent shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div>
                  <h4 className="font-semibold text-text-primary text-sm mb-1">Customize Shortcuts</h4>
                  <p className="text-xs text-text-secondary">
                    You can customize any keyboard shortcut in{' '}
                    <span className="text-accent font-medium">Settings → Keyboard Shortcuts</span>.
                    Click on a shortcut to record a new key combination.
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

export default KeymapsModal;
