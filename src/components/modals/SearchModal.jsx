import { useState, useEffect, useRef, useMemo } from "react";
import EmptyState from "../ui/EmptyState";
import Fuse from "fuse.js";
import { documentText } from "../../utils/documentText";
import { isHtmlDocument } from "../../utils/documentKind";
import useNotesStore from "../../store/notesStore";
import useModalAccessibility from "../../hooks/useModalAccessibility";
import { scrollItemIntoView } from "../../utils/scrollItemIntoView";

const RECENT_SEARCHES_KEY = "marky-recent-searches";
const MAX_RECENT_SEARCHES = 8;

const readRecentSearches = () => {
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveRecentSearch = (query) => {
  if (!query || !query.trim()) return;
  const trimmed = query.trim();
  try {
    const prev = readRecentSearches().filter((q) => q !== trimmed);
    const next = [trimmed, ...prev].slice(0, MAX_RECENT_SEARCHES);
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
};

const clearRecentSearches = () => {
  try {
    window.localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    /* */
  }
};

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
  const text = value ?? "";
  return caseSensitive ? text : text.toLowerCase();
};

const findSubstringIndices = (fieldValue, query, caseSensitive) => {
  if (!query) return [];

  const original = fieldValue ?? "";
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
  const text = fieldValue ?? "";
  const matches = [];
  let match;
  let safety = 0;
  regex.lastIndex = 0;

  while ((match = regex.exec(text)) !== null) {
    const matchedText = match[0] ?? "";
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
  if (options.title) fields.push({ key: "name", value: note.name || "" });
  if (options.content) fields.push({ key: "content", value: note.content || "" });
  if (options.tags) fields.push({ key: "tags", value: (note.tags || []).join(" ") });
  if (options.path) fields.push({ key: "filePath", value: note.filePath || "" });

  const matchEntries = [];

  if (options.regex) {
    const flags = options.caseSensitive ? "g" : "gi";
    let regex;
    try {
      regex = new RegExp(searchQuery, flags);
    } catch (error) {
      throw new Error(error.message || "Invalid regular expression");
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
    fieldNames.has("name") && "Title",
    fieldNames.has("content") && "Content",
    fieldNames.has("tags") && "Tags",
    fieldNames.has("filePath") && "Path",
  ].filter(Boolean);
};

const ResultRow = ({
  result,
  titleParts,
  preview,
  isSelected,
  matchedFields,
  onClick,
  resultId,
}) => (
  <button
    type="button"
    id={resultId}
    onClick={onClick}
    tabIndex={-1}
    role="option"
    aria-selected={isSelected}
    className={`palette-row items-start py-2.5 ${isSelected ? "is-selected" : ""}`}
  >
    <svg
      className="mt-0.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d={
          isHtmlDocument(result.item)
            ? "M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8zM14 3.5V8h4.5M10.5 12 8.5 14.2l2 2.3M13.5 12l2 2.2-2 2.3"
            : "M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8zM14 3.5V8h4.5M9 12.5h6M9 16h4"
        }
      />
    </svg>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-text-primary" dir="auto">
        {Array.isArray(titleParts)
          ? titleParts.map((part, i) => (
              <span key={i} className={part.highlight ? "bg-accent-dim text-accent" : ""}>
                {part.text}
              </span>
            ))
          : result.item.name}
      </span>
      {preview && (
        <span
          className="mt-0.5 block text-[12.5px] font-normal leading-snug text-text-muted line-clamp-2"
          dir="auto"
        >
          {preview}
        </span>
      )}
      {(matchedFields.length > 0 || result.score !== undefined) && (
        <span className="mt-1 block text-[11.5px] font-normal text-text-muted">
          {matchedFields.join(" · ")}
          {matchedFields.length > 0 && result.score !== undefined ? " · " : ""}
          {result.score !== undefined && `${Math.round((1 - result.score) * 100)}% match`}
        </span>
      )}
    </span>
  </button>
);

const SearchModal = ({ isOpen, onClose, onSelectResult }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchResults, setSearchResults] = useState([]);
  const [searchOptions, setSearchOptions] = useState(DEFAULT_SEARCH_OPTIONS);
  const [searchError, setSearchError] = useState("");
  const [groupByFolder, setGroupByFolder] = useState(false);
  const [recentSearches, setRecentSearches] = useState(() => readRecentSearches());
  const searchInputRef = useRef(null);
  const resultsContainerRef = useRef(null);
  const dialogRef = useRef(null);
  const resultsListboxId = "search-results-listbox";
  const activeResultId = searchResults.length > 0 ? `search-result-${selectedIndex}` : undefined;

  const { items, selectNote } = useNotesStore();
  useModalAccessibility(isOpen, dialogRef, searchInputRef);

  const notes = useMemo(() => items.filter((item) => item.type === "note"), [items]);
  const normalizedNotes = useMemo(
    () =>
      notes.map((note) => ({
        ...note,
        // Search reads an HTML document's visible text: what the page says,
        // not its tags, scripts and styles. Matches and previews index into
        // this text, so they line up with what is shown.
        content: documentText(note),
        tagsText: Array.isArray(note.tags) ? note.tags.join(" ") : "",
      })),
    [notes]
  );

  const enabledScopes = useMemo(() => {
    const scopes = [];
    if (searchOptions.title) scopes.push({ name: "name", weight: 2 });
    if (searchOptions.content) scopes.push({ name: "content", weight: 1 });
    if (searchOptions.tags) scopes.push({ name: "tagsText", weight: 1.1 });
    if (searchOptions.path) scopes.push({ name: "filePath", weight: 0.9 });
    return scopes;
  }, [searchOptions.title, searchOptions.content, searchOptions.tags, searchOptions.path]);

  const fuse = useMemo(() => {
    if (!normalizedNotes.length || !enabledScopes.length) return null;
    return new Fuse(normalizedNotes, {
      keys: enabledScopes,
      includeScore: true,
      includeMatches: true,
      threshold: 0.4,
      ignoreLocation: true,
      minMatchCharLength: 2,
      findAllMatches: true,
      isCaseSensitive: searchOptions.caseSensitive,
    });
  }, [normalizedNotes, enabledScopes, searchOptions.caseSensitive]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSelectedIndex(0);
      setSearchError("");
      return;
    }

    if (enabledScopes.length === 0) {
      setSearchResults([]);
      setSearchError("Enable at least one search scope (Title, Content, Tags, or Path).");
      setSelectedIndex(0);
      return;
    }

    setSearchError("");

    if (searchOptions.regex || searchOptions.exact) {
      try {
        const manualResults = normalizedNotes
          .map((note) => {
            const matches = buildManualMatches(note, searchQuery, searchOptions);
            return matches.length > 0 ? { item: note, matches, score: undefined } : null;
          })
          .filter(Boolean)
          .sort((a, b) => {
            const aName = a.matches.some((m) => m.key === "name") ? 0 : 1;
            const bName = b.matches.some((m) => m.key === "name") ? 0 : 1;
            if (aName !== bName) return aName - bName;

            const aContent = a.matches.some((m) => m.key === "content") ? 0 : 1;
            const bContent = b.matches.some((m) => m.key === "content") ? 0 : 1;
            if (aContent !== bContent) return aContent - bContent;

            return (a.item.name || "").localeCompare(b.item.name || "");
          })
          .slice(0, 20);

        setSearchResults(manualResults);
        setSelectedIndex(0);
      } catch (error) {
        setSearchResults([]);
        setSearchError(error.message || "Invalid search query");
      }
      return;
    }

    if (!fuse) {
      setSearchResults([]);
      setSelectedIndex(0);
      return;
    }

    const results = fuse.search(searchQuery).slice(0, 20);
    setSearchResults(results);
    setSelectedIndex(0);
  }, [searchQuery, enabledScopes, normalizedNotes, searchOptions, fuse]);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus({ preventScroll: true });
      setSearchQuery("");
      setSearchResults([]);
      setSelectedIndex(0);
      setSearchError("");
    }
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : prev));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;
        case "Enter":
          e.preventDefault();
          if (searchResults[selectedIndex]) {
            handleSelectNote(searchResults[selectedIndex].item);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, searchResults, selectedIndex, onClose]);

  // Keep the selected row visible without scrolling anything outside the list.
  useEffect(() => {
    if (searchResults.length === 0) return;
    const container = resultsContainerRef.current;
    scrollItemIntoView(container, container?.querySelector(`#search-result-${selectedIndex}`));
  }, [selectedIndex, searchResults.length]);

  const updateSearchOption = (key) => {
    setSearchOptions((prev) => {
      const next = { ...prev, [key]: !prev[key] };

      // regex and exact are mutually exclusive modes to keep matching semantics clear
      if (key === "regex" && next.regex) {
        next.exact = false;
      }
      if (key === "exact" && next.exact) {
        next.regex = false;
      }

      return next;
    });
  };

  const handleSelectNote = (note) => {
    if (searchQuery.trim()) {
      saveRecentSearch(searchQuery);
      setRecentSearches(readRecentSearches());
    }
    selectNote(note.id);
    onClose();
    // Call the callback to scroll and highlight the search text
    if (onSelectResult && searchQuery) {
      onSelectResult(searchQuery);
    }
  };

  const getPreviewText = (result) => {
    const { item, matches } = result;

    const pathMatch = matches?.find((m) => m.key === "filePath");
    const tagMatch = matches?.find((m) => m.key === "tags");
    const contentMatch = matches?.find((m) => m.key === "content");

    if (contentMatch && contentMatch.indices && contentMatch.indices.length > 0) {
      const firstMatch = contentMatch.indices[0];
      const start = Math.max(0, firstMatch[0] - 50);
      const end = Math.min(item.content.length, firstMatch[1] + 100);

      let preview = item.content.slice(start, end).trim();
      if (start > 0) preview = "..." + preview;
      if (end < item.content.length) preview = preview + "...";

      return preview;
    }

    if (tagMatch) {
      const tagsLabel =
        Array.isArray(item.tags) && item.tags.length > 0
          ? item.tags.map((tag) => `#${tag}`).join(" ")
          : "No tags";
      return `Matched in tags: ${tagsLabel}`;
    }

    if (pathMatch) {
      return `Matched in path: ${item.filePath || "No path"}`;
    }

    const preview = item.content?.slice(0, 150) || "No content";
    return preview + (item.content?.length > 150 ? "..." : "");
  };

  const highlightMatches = (text, matches, key) => {
    if (!matches || matches.length === 0) return text;

    const match = matches.find((m) => m.key === key);
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
    { key: "title", label: "Title" },
    { key: "content", label: "Content" },
    { key: "tags", label: "Tags" },
    { key: "path", label: "Path" },
  ];

  const modeButtons = [
    { key: "caseSensitive", label: "Case" },
    { key: "exact", label: "Exact" },
    { key: "regex", label: "Regex" },
  ];

  // Group results by parent folder path for display
  const groupedResults = useMemo(() => {
    if (!groupByFolder || searchResults.length === 0) return null;
    const groups = new Map();
    searchResults.forEach((result) => {
      const fp = result.item.filePath || "";
      const parts = fp.replace(/\\/g, "/").split("/");
      parts.pop(); // remove filename
      const folderPath = parts.join("/") || "/";
      const folderName = parts[parts.length - 1] || "Root";
      const key = folderPath;
      if (!groups.has(key)) groups.set(key, { folderName, folderPath, results: [] });
      groups.get(key).results.push(result);
    });
    return Array.from(groups.values());
  }, [groupByFolder, searchResults]);

  // Flat ordered list used for keyboard navigation (consistent regardless of grouping)
  const flatResults = searchResults;

  if (!isOpen) return null;

  const filterChip = (key, label, enabled, onClick) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      aria-pressed={enabled}
      className="chip h-7 px-2.5 text-[12.5px]"
    >
      {label}
    </button>
  );

  const renderRow = (result, index) => (
    <ResultRow
      key={result.item.id}
      result={result}
      titleParts={highlightMatches(result.item.name, result.matches, "name")}
      preview={getPreviewText(result)}
      isSelected={index === selectedIndex}
      matchedFields={getMatchedFieldLabels(result.matches)}
      resultId={`search-result-${index}`}
      onClick={() => handleSelectNote(result.item)}
    />
  );

  return (
    <>
      <div className="modal-scrim z-50 animate-fade-in" onClick={onClose} aria-hidden="true" />

      <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[14vh] pb-4 pointer-events-none">
        <div
          ref={dialogRef}
          className="glass-panel modal-panel w-full max-w-[640px] max-h-[min(640px,100%)] flex flex-col pointer-events-auto animate-fade-in"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="search-modal-title"
          tabIndex={-1}
        >
          <h2 id="search-modal-title" className="sr-only">
            Search notes
          </h2>
          <div className="modal-query">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes by title or content"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={searchResults.length > 0}
              aria-label="Search notes"
              aria-controls={resultsListboxId}
              aria-activedescendant={activeResultId}
              aria-describedby="search-results-status"
              dir="auto"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="icon-btn"
                title="Clear search"
                aria-label="Clear search"
              >
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
            )}
          </div>

          {/* Filters: what to search in, how to match, how to list. */}
          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2">
            <div className="flex items-center gap-1" role="group" aria-label="Search in">
              <span className="me-1 text-[12px] font-semibold text-text-muted">In</span>
              {scopeButtons.map((btn) =>
                filterChip(btn.key, btn.label, searchOptions[btn.key], () =>
                  updateSearchOption(btn.key)
                )
              )}
            </div>
            <div className="flex items-center gap-1" role="group" aria-label="Match">
              <span className="me-1 text-[12px] font-semibold text-text-muted">Match</span>
              {modeButtons.map((btn) =>
                filterChip(btn.key, btn.label, searchOptions[btn.key], () =>
                  updateSearchOption(btn.key)
                )
              )}
            </div>
            {searchResults.length > 0 &&
              filterChip("group", "Group by folder", groupByFolder, () =>
                setGroupByFolder((v) => !v)
              )}
          </div>

          {searchQuery && (
            <div
              id="search-results-status"
              className="px-5 pt-2 text-[12px] text-text-muted"
              role="status"
              aria-live="polite"
            >
              {searchResults.length > 0
                ? `${searchResults.length} note${searchResults.length !== 1 ? "s" : ""}`
                : searchError || "No results"}
            </div>
          )}

          <div
            ref={resultsContainerRef}
            id={resultsListboxId}
            role="listbox"
            aria-label="Search results"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
          >
            {searchResults.length === 0 &&
              searchQuery.trim() !== "" &&
              (searchError ? (
                <EmptyState icon="filter" title="Nothing to search with" body={searchError} />
              ) : (
                <EmptyState
                  icon="search"
                  title="No notes found"
                  body={`Nothing matches “${searchQuery.trim()}”. Try another word, or match on more than titles.`}
                />
              ))}

            {searchResults.length === 0 &&
              searchQuery.trim() === "" &&
              (recentSearches.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between">
                    <span className="palette-group">Recent searches</span>
                    <button
                      type="button"
                      onClick={() => {
                        clearRecentSearches();
                        setRecentSearches([]);
                      }}
                      className="btn btn-sm h-7 text-[12px]"
                    >
                      Clear
                    </button>
                  </div>
                  {recentSearches.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setSearchQuery(q)}
                      className="palette-row"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.6}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2" />
                      </svg>
                      <span className="truncate" dir="auto">
                        {q}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon="search"
                  title="Search your notes"
                  body="Type to search titles and contents."
                />
              ))}

            {groupedResults
              ? groupedResults.map((group) => (
                  <div key={group.folderPath}>
                    <div className="palette-group flex items-center gap-2" title={group.folderPath}>
                      <span className="truncate" dir="auto">
                        {group.folderName}
                      </span>
                      <span className="ms-auto font-medium">{group.results.length}</span>
                    </div>
                    {group.results.map((result) => renderRow(result, flatResults.indexOf(result)))}
                  </div>
                ))
              : searchResults.map((result, index) => renderRow(result, index))}
          </div>
        </div>
      </div>
    </>
  );
};

export default SearchModal;
