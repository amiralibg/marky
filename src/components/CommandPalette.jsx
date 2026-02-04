import { useState, useEffect, useRef } from 'react';
import Fuse from 'fuse.js';
import useNotesStore from '../store/notesStore';

const CommandPalette = ({ isOpen, onClose, onExecuteCommand }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [results, setResults] = useState([]);
  const inputRef = useRef(null);
  const resultsContainerRef = useRef(null);

  const { items } = useNotesStore();

  // Define available commands
  const commands = [
    // File Operations
    { id: 'new-note', name: 'New Note', category: 'File Operations', icon: '📝', action: 'newNote', keywords: ['create', 'add'] },
    { id: 'new-folder', name: 'New Folder', category: 'File Operations', icon: '📁', action: 'newFolder', keywords: ['create', 'directory'] },
    { id: 'open-folder', name: 'Open Folder', category: 'File Operations', icon: '📂', action: 'openFolder', keywords: ['import', 'load'] },
    { id: 'save', name: 'Save Note', category: 'File Operations', icon: '💾', action: 'save', keywords: ['write'] },

    // Navigation
    { id: 'search', name: 'Search All Notes', category: 'Navigation', icon: '🔍', action: 'search', keywords: ['find'] },
    { id: 'toggle-sidebar', name: 'Toggle Sidebar', category: 'Navigation', icon: '🎯', action: 'toggleSidebar', keywords: ['hide', 'show'] },

    // View Modes
    { id: 'view-editor', name: 'Editor Only View', category: 'View', icon: '✏️', action: 'viewEditor', keywords: ['edit', 'write'] },
    { id: 'view-split', name: 'Split View', category: 'View', icon: '⚡', action: 'viewSplit', keywords: ['preview', 'both'] },
    { id: 'view-preview', name: 'Preview Only View', category: 'View', icon: '👁️', action: 'viewPreview', keywords: ['render', 'show'] },

    // Tools
    { id: 'graph', name: 'Open Graph View', category: 'Tools', icon: '🕸️', action: 'openGraph', keywords: ['network', 'connections'] },
    { id: 'export', name: 'Export Note', category: 'Tools', icon: '📤', action: 'exportNote', keywords: ['download', 'save as'] },
    { id: 'settings', name: 'Open Settings', category: 'Tools', icon: '⚙️', action: 'openSettings', keywords: ['preferences', 'config'] },
    { id: 'shortcuts', name: 'Show Keyboard Shortcuts', category: 'Help', icon: '⌨️', action: 'showShortcuts', keywords: ['help', 'keybindings'] },

    // Focus
    { id: 'focus-mode', name: 'Toggle Focus Mode', category: 'View', icon: '🎯', action: 'toggleFocusMode', keywords: ['distraction', 'zen', 'write', 'fullscreen'] },

    // Backup
    { id: 'backup', name: 'Backup Workspace', category: 'Tools', icon: '📦', action: 'backupWorkspace', keywords: ['export', 'zip', 'archive', 'save'] },
  ];

  // Get all notes for navigation
  const notes = items.filter(item => item.type === 'note');

  // Perform search
  useEffect(() => {
    if (!query.trim()) {
      // Show all commands when no query
      const commandResults = commands.map(cmd => ({
        type: 'command',
        item: cmd,
        score: 0
      }));
      setResults(commandResults);
      setSelectedIndex(0);
      return;
    }

    const allItems = [
      // Add commands with searchable fields
      ...commands.map(cmd => ({
        ...cmd,
        searchText: `${cmd.name} ${cmd.category} ${cmd.keywords.join(' ')}`,
        type: 'command'
      })),
      // Add notes
      ...notes.map(note => ({
        ...note,
        searchText: `${note.name} ${note.content || ''}`,
        type: 'note'
      }))
    ];

    const fuse = new Fuse(allItems, {
      keys: [
        { name: 'name', weight: 3 },
        { name: 'searchText', weight: 1 }
      ],
      includeScore: true,
      threshold: 0.3,
      ignoreLocation: true,
      minMatchCharLength: 1,
    });

    const searchResults = fuse.search(query).slice(0, 15);
    setResults(searchResults);
    setSelectedIndex(0);
  }, [query, items]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < results.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            handleSelect(results[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex, onClose]);

  // Scroll selected result into view
  useEffect(() => {
    if (resultsContainerRef.current && results.length > 0) {
      const selectedElement = resultsContainerRef.current.children[selectedIndex];
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex, results.length]);

  const handleSelect = (result) => {
    const item = result.item || result;

    if (item.type === 'note') {
      // Navigate to note
      if (onExecuteCommand) {
        onExecuteCommand({ action: 'selectNote', payload: item.id });
      }
    } else if (item.type === 'command') {
      // Execute command
      if (onExecuteCommand) {
        onExecuteCommand({ action: item.action });
      }
    }

    onClose();
  };

  const getCategoryIcon = (category) => {
    const icons = {
      'File Operations': '📁',
      'Navigation': '🧭',
      'View': '👁️',
      'Tools': '🛠️',
      'Help': '❓'
    };
    return icons[category] || '⚡';
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fadeIn"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] p-4 pointer-events-none">
        <div
          className="glass-panel border-glass-border rounded-xl shadow-2xl w-full max-w-2xl pointer-events-auto animate-slideUp overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search Input */}
          <div className="border-b border-glass-border p-4">
            <div className="relative">
              <svg
                className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-accent pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search notes or type a command..."
                className="w-full pl-10 pr-4 py-3 bg-overlay-subtle border border-overlay-subtle rounded-lg text-sm text-text-primary placeholder-text-muted outline-none focus:bg-white/5 focus:border-accent/50 transition-all"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-overlay-light rounded text-text-muted hover:text-text-primary transition-colors"
                  title="Clear"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Result count */}
            <div className="mt-2 text-xs text-text-muted px-1">
              {results.length > 0
                ? `${results.length} result${results.length !== 1 ? 's' : ''}`
                : query ? 'No results found' : 'All commands'
              }
            </div>
          </div>

          {/* Results */}
          <div
            ref={resultsContainerRef}
            className="max-h-[60vh] overflow-y-auto custom-scrollbar"
          >
            {results.length === 0 && query.trim() !== '' && (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <svg className="w-16 h-16 text-text-muted opacity-50 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-text-secondary font-medium">No results found</p>
                <p className="text-sm text-text-muted mt-1">Try a different search term</p>
              </div>
            )}

            {results.map((result, index) => {
              const item = result.item || result;
              const isSelected = index === selectedIndex;
              const isNote = item.type === 'note';

              return (
                <button
                  key={isNote ? item.id : item.id}
                  onClick={() => handleSelect(result)}
                  className={`w-full text-left px-4 py-3 border-b border-overlay-subtle hover:bg-overlay-light transition-colors ${
                    isSelected ? 'bg-overlay-light border-l-2 border-l-accent' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Icon */}
                    <div className="shrink-0 text-xl">
                      {isNote ? '📄' : item.icon}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Title */}
                      <div className="font-medium text-text-primary flex items-center gap-2">
                        <span className="truncate">{item.name}</span>
                        {isNote && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded uppercase font-semibold">
                            Note
                          </span>
                        )}
                      </div>

                      {/* Subtitle */}
                      <p className="text-xs text-text-muted truncate">
                        {isNote
                          ? (item.content?.slice(0, 80) || 'Empty note')
                          : `${getCategoryIcon(item.category)} ${item.category}`
                        }
                      </p>
                    </div>

                    {/* Selected indicator */}
                    {isSelected && (
                      <svg className="w-5 h-5 text-accent shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer with keyboard hints */}
          {results.length > 0 && (
            <div className="border-t border-glass-border px-4 py-2 bg-overlay-subtle/50">
              <div className="flex items-center justify-between text-[10px] text-text-muted">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-overlay-light rounded text-[9px] border border-overlay-subtle">↑</kbd>
                    <kbd className="px-1.5 py-0.5 bg-overlay-light rounded text-[9px] border border-overlay-subtle">↓</kbd>
                    Navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-overlay-light rounded text-[9px] border border-overlay-subtle">Enter</kbd>
                    Select
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-overlay-light rounded text-[9px] border border-overlay-subtle">Esc</kbd>
                    Close
                  </span>
                </div>
              </div>
            </div>
          )}
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

export default CommandPalette;
