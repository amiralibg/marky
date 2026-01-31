import { useState, useEffect, useRef } from 'react';
import Fuse from 'fuse.js';
import useNotesStore from '../store/notesStore';

const SearchModal = ({ isOpen, onClose, onSelectResult }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchResults, setSearchResults] = useState([]);
  const searchInputRef = useRef(null);
  const resultsContainerRef = useRef(null);

  const { items, selectNote } = useNotesStore();

  // Create Fuse.js instance for fuzzy searching
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSelectedIndex(0);
      return;
    }

    // Filter only notes (not folders)
    const notes = items.filter(item => item.type === 'note');

    // Configure Fuse.js for fuzzy search
    const fuse = new Fuse(notes, {
      keys: [
        { name: 'name', weight: 2 }, // Title has higher weight
        { name: 'content', weight: 1 }
      ],
      includeScore: true,
      includeMatches: true,
      threshold: 0.4, // 0 = perfect match, 1 = match anything
      ignoreLocation: true,
      minMatchCharLength: 2,
      findAllMatches: true
    });

    const results = fuse.search(searchQuery).slice(0, 20); // Limit to 20 results
    setSearchResults(results);
    setSelectedIndex(0);
  }, [searchQuery, items]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
      setSearchQuery('');
      setSearchResults([]);
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
            prev < searchResults.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (searchResults[selectedIndex]) {
            handleSelectNote(searchResults[selectedIndex].item);
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
  }, [isOpen, searchResults, selectedIndex, onClose]);

  // Scroll selected result into view
  useEffect(() => {
    if (resultsContainerRef.current && searchResults.length > 0) {
      const selectedElement = resultsContainerRef.current.children[selectedIndex];
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex, searchResults.length]);

  const handleSelectNote = (note) => {
    selectNote(note.id);
    onClose();
    // Call the callback to scroll and highlight the search text
    if (onSelectResult && searchQuery) {
      onSelectResult(searchQuery);
    }
  };

  const getPreviewText = (result) => {
    const { item, matches } = result;

    // Find the best match in content
    const contentMatch = matches?.find(m => m.key === 'content');

    if (contentMatch && contentMatch.indices && contentMatch.indices.length > 0) {
      const firstMatch = contentMatch.indices[0];
      const start = Math.max(0, firstMatch[0] - 50);
      const end = Math.min(item.content.length, firstMatch[1] + 100);

      let preview = item.content.slice(start, end).trim();
      if (start > 0) preview = '...' + preview;
      if (end < item.content.length) preview = preview + '...';

      return preview;
    }

    // Fallback to first 150 characters
    const preview = item.content?.slice(0, 150) || 'No content';
    return preview + (item.content?.length > 150 ? '...' : '');
  };

  const highlightMatches = (text, matches, key) => {
    if (!matches || matches.length === 0) return text;

    const match = matches.find(m => m.key === key);
    if (!match || !match.indices) return text;

    const indices = match.indices;
    const parts = [];
    let lastIndex = 0;

    indices.forEach(([start, end]) => {
      // Add text before match
      if (start > lastIndex) {
        parts.push({ text: text.slice(lastIndex, start), highlight: false });
      }
      // Add matched text
      parts.push({ text: text.slice(start, end + 1), highlight: true });
      lastIndex = end + 1;
    });

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push({ text: text.slice(lastIndex), highlight: false });
    }

    return parts;
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
                className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notes by title or content..."
                className="w-full pl-10 pr-4 py-3 bg-overlay-subtle border border-overlay-subtle rounded-lg text-sm text-text-primary placeholder-text-muted outline-none focus:bg-white/5 focus:border-accent/50 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-overlay-light rounded text-text-muted hover:text-text-primary transition-colors"
                  title="Clear search"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Result count */}
            {searchQuery && (
              <div className="mt-2 text-xs text-text-muted px-1">
                {searchResults.length > 0
                  ? `Found ${searchResults.length} note${searchResults.length !== 1 ? 's' : ''}`
                  : 'No results found'
                }
              </div>
            )}
          </div>

          {/* Search Results */}
          <div
            ref={resultsContainerRef}
            className="max-h-[60vh] overflow-y-auto custom-scrollbar"
          >
            {searchResults.length === 0 && searchQuery.trim() !== '' && (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <svg className="w-16 h-16 text-text-muted opacity-50 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="text-text-secondary font-medium">No notes found</p>
                <p className="text-sm text-text-muted mt-1">Try a different search term</p>
              </div>
            )}

            {searchResults.length === 0 && searchQuery.trim() === '' && (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <svg className="w-16 h-16 text-accent opacity-50 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p className="text-text-secondary font-medium">Search your notes</p>
                <p className="text-sm text-text-muted mt-1">Type to search by title or content</p>
              </div>
            )}

            {searchResults.map((result, index) => {
              const titleParts = highlightMatches(result.item.name, result.matches, 'name');
              const preview = getPreviewText(result);
              const isSelected = index === selectedIndex;

              return (
                <button
                  key={result.item.id}
                  onClick={() => handleSelectNote(result.item)}
                  className={`w-full text-left px-4 py-3 border-b border-overlay-subtle hover:bg-overlay-light transition-colors ${
                    isSelected ? 'bg-overlay-light border-l-2 border-l-accent' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Note Icon */}
                    <svg className="w-5 h-5 text-text-muted shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>

                    <div className="flex-1 min-w-0">
                      {/* Title with highlighting */}
                      <div className="font-medium text-text-primary mb-1">
                        {Array.isArray(titleParts) ? (
                          titleParts.map((part, i) => (
                            <span
                              key={i}
                              className={part.highlight ? 'bg-accent/30 text-accent' : ''}
                            >
                              {part.text}
                            </span>
                          ))
                        ) : (
                          result.item.name
                        )}
                      </div>

                      {/* Preview */}
                      <p className="text-xs text-text-muted line-clamp-2">
                        {preview}
                      </p>

                      {/* Match score indicator */}
                      {result.score !== undefined && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1 bg-overlay-subtle rounded-full overflow-hidden max-w-[100px]">
                            <div
                              className="h-full bg-accent rounded-full transition-all"
                              style={{ width: `${Math.max(10, (1 - result.score) * 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-text-muted">
                            {Math.round((1 - result.score) * 100)}% match
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Selected indicator */}
                    {isSelected && (
                      <svg className="w-5 h-5 text-accent shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer with keyboard hints */}
          {searchResults.length > 0 && (
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
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </>
  );
};

export default SearchModal;
