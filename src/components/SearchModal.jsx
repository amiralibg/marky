import { useState, useEffect, useRef } from 'react';
import Fuse from 'fuse.js';
import useNotesStore from '../store/notesStore';

const DEFAULT_SEARCH_OPTIONS = {
  title: true,
  content: true,
  tags: false,
  path: false,
  caseSensitive: false,
  exact: false,
  regex: false,
};

const normalizeForMatch = (value, caseSensitive) => {
  const text = value ?? '';
  return caseSensitive ? text : text.toLowerCase();
};

const findSubstringIndices = (fieldValue, query, caseSensitive) => {
  if (!query) return [];

  const original = fieldValue ?? '';
  const haystack = normalizeForMatch(original, caseSensitive);
  const needle = normalizeForMatch(query, caseSensitive);

  if (!needle) return [];

  const indices = [];
  let startIndex = 0;
  while (startIndex < haystack.length) {
    const foundAt = haystack.indexOf(needle, startIndex);
    if (foundAt === -1) break;
    indices.push([foundAt, foundAt + needle.length - 1]);
    startIndex = foundAt + Math.max(1, needle.length);
  }

  return indices;
};

const findRegexIndices = (fieldValue, regex) => {
  const text = fieldValue ?? '';
  const matches = [];
  let match;
  let safety = 0;
  regex.lastIndex = 0;

  while ((match = regex.exec(text)) !== null) {
    const matchedText = match[0] ?? '';
    if (!matchedText.length) {
      regex.lastIndex += 1;
      safety += 1;
      if (safety > text.length + 5) break;
      continue;
    }

    matches.push([match.index, match.index + matchedText.length - 1]);
    if (!regex.global) break;
  }

  return matches;
};

const buildManualMatches = (note, searchQuery, options) => {
  const fields = [];
  if (options.title) fields.push({ key: 'name', value: note.name || '' });
  if (options.content) fields.push({ key: 'content', value: note.content || '' });
  if (options.tags) fields.push({ key: 'tags', value: (note.tags || []).join(' ') });
  if (options.path) fields.push({ key: 'filePath', value: note.filePath || '' });

  const matchEntries = [];

  if (options.regex) {
    const flags = options.caseSensitive ? 'g' : 'gi';
    let regex;
    try {
      regex = new RegExp(searchQuery, flags);
    } catch (error) {
      throw new Error(error.message || 'Invalid regular expression');
    }

    fields.forEach(({ key, value }) => {
      const indices = findRegexIndices(value, new RegExp(regex.source, regex.flags));
      if (indices.length > 0) {
        matchEntries.push({ key, indices });
      }
    });
  } else {
    fields.forEach(({ key, value }) => {
      const indices = findSubstringIndices(value, searchQuery, options.caseSensitive);
      if (indices.length > 0) {
        matchEntries.push({ key, indices });
      }
    });
  }

  return matchEntries;
};

const getMatchedFieldLabels = (matches = []) => {
  const fieldNames = new Set(matches.map((m) => m.key));
  return [
    fieldNames.has('name') && 'Title',
    fieldNames.has('content') && 'Content',
    fieldNames.has('tags') && 'Tags',
    fieldNames.has('filePath') && 'Path',
  ].filter(Boolean);
};

const SearchModal = ({ isOpen, onClose, onSelectResult }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchResults, setSearchResults] = useState([]);
  const [searchOptions, setSearchOptions] = useState(DEFAULT_SEARCH_OPTIONS);
  const [searchError, setSearchError] = useState('');
  const searchInputRef = useRef(null);
  const resultsContainerRef = useRef(null);

  const { items, selectNote } = useNotesStore();

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSelectedIndex(0);
      setSearchError('');
      return;
    }

    const notes = items.filter(item => item.type === 'note');
    const enabledScopes = [];
    if (searchOptions.title) enabledScopes.push({ name: 'name', weight: 2 });
    if (searchOptions.content) enabledScopes.push({ name: 'content', weight: 1 });
    if (searchOptions.tags) enabledScopes.push({ name: 'tagsText', weight: 1.1 });
    if (searchOptions.path) enabledScopes.push({ name: 'filePath', weight: 0.9 });

    if (enabledScopes.length === 0) {
      setSearchResults([]);
      setSearchError('Enable at least one search scope (Title, Content, Tags, or Path).');
      setSelectedIndex(0);
      return;
    }

    setSearchError('');

    const normalizedNotes = notes.map((note) => ({
      ...note,
      tagsText: Array.isArray(note.tags) ? note.tags.join(' ') : '',
    }));

    if (searchOptions.regex || searchOptions.exact) {
      try {
        const manualResults = normalizedNotes
          .map((note) => {
            const matches = buildManualMatches(note, searchQuery, searchOptions);
            return matches.length > 0 ? { item: note, matches, score: undefined } : null;
          })
          .filter(Boolean)
          .sort((a, b) => {
            const aName = a.matches.some(m => m.key === 'name') ? 0 : 1;
            const bName = b.matches.some(m => m.key === 'name') ? 0 : 1;
            if (aName !== bName) return aName - bName;

            const aContent = a.matches.some(m => m.key === 'content') ? 0 : 1;
            const bContent = b.matches.some(m => m.key === 'content') ? 0 : 1;
            if (aContent !== bContent) return aContent - bContent;

            return (a.item.name || '').localeCompare(b.item.name || '');
          })
          .slice(0, 20);

        setSearchResults(manualResults);
        setSelectedIndex(0);
      } catch (error) {
        setSearchResults([]);
        setSearchError(error.message || 'Invalid search query');
      }
      return;
    }

    const fuse = new Fuse(normalizedNotes, {
      keys: enabledScopes,
      includeScore: true,
      includeMatches: true,
      threshold: 0.4,
      ignoreLocation: true,
      minMatchCharLength: 2,
      findAllMatches: true,
      isCaseSensitive: searchOptions.caseSensitive,
    });

    const results = fuse.search(searchQuery).slice(0, 20);
    setSearchResults(results);
    setSelectedIndex(0);
  }, [searchQuery, items, searchOptions]);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
      setSearchQuery('');
      setSearchResults([]);
      setSelectedIndex(0);
      setSearchError('');
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

  const updateSearchOption = (key) => {
    setSearchOptions((prev) => {
      const next = { ...prev, [key]: !prev[key] };

      // regex and exact are mutually exclusive modes to keep matching semantics clear
      if (key === 'regex' && next.regex) {
        next.exact = false;
      }
      if (key === 'exact' && next.exact) {
        next.regex = false;
      }

      return next;
    });
  };

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

    const pathMatch = matches?.find(m => m.key === 'filePath');
    const tagMatch = matches?.find(m => m.key === 'tags');
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

    if (tagMatch) {
      const tagsLabel = Array.isArray(item.tags) && item.tags.length > 0
        ? item.tags.map(tag => `#${tag}`).join(' ')
        : 'No tags';
      return `Matched in tags: ${tagsLabel}`;
    }

    if (pathMatch) {
      return `Matched in path: ${item.filePath || 'No path'}`;
    }

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

  const scopeButtons = [
    { key: 'title', label: 'Title' },
    { key: 'content', label: 'Content' },
    { key: 'tags', label: 'Tags' },
    { key: 'path', label: 'Path' },
  ];

  const modeButtons = [
    { key: 'caseSensitive', label: 'Case' },
    { key: 'exact', label: 'Exact' },
    { key: 'regex', label: 'Regex' },
  ];

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
                  : (searchError || 'No results found')
                }
              </div>
            )}

            {/* Filters / toggles */}
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-text-muted">Scopes</span>
                {scopeButtons.map((btn) => {
                  const enabled = searchOptions[btn.key];
                  return (
                    <button
                      key={btn.key}
                      type="button"
                      onClick={() => updateSearchOption(btn.key)}
                      className={`px-2 py-1 rounded-md text-[11px] border transition-colors ${
                        enabled
                          ? 'border-accent/40 bg-accent/10 text-accent'
                          : 'border-overlay-subtle bg-overlay-subtle text-text-muted hover:text-text-primary hover:border-overlay-light'
                      }`}
                    >
                      {btn.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-text-muted">Mode</span>
                {modeButtons.map((btn) => {
                  const enabled = searchOptions[btn.key];
                  return (
                    <button
                      key={btn.key}
                      type="button"
                      onClick={() => updateSearchOption(btn.key)}
                      className={`px-2 py-1 rounded-md text-[11px] border transition-colors ${
                        enabled
                          ? 'border-accent/40 bg-accent/10 text-accent'
                          : 'border-overlay-subtle bg-overlay-subtle text-text-muted hover:text-text-primary hover:border-overlay-light'
                      }`}
                    >
                      {btn.label}
                    </button>
                  );
                })}
              </div>
            </div>
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
              const matchedFields = getMatchedFieldLabels(result.matches);

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

                      {matchedFields.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {matchedFields.map((field) => (
                            <span
                              key={field}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-overlay-subtle border border-overlay-subtle text-text-muted"
                            >
                              {field}
                            </span>
                          ))}
                        </div>
                      )}

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
