import { useState, useEffect, useCallback, forwardRef, useImperativeHandle, useRef, useMemo } from "react";
import { marked } from "marked";
import hljs from "highlight.js";
import Toolbar from "./Toolbar";
import ExportModal from "./ExportModal";
import useNotesStore from "../store/notesStore";
import useUIStore from "../store/uiStore";
import "./MarkdownPreview.css";

const escapeHtml = (value = "") =>
  value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });

const wikiLinkExtension = {
  name: "wikilink",
  level: "inline",
  start(src) {
    return src.indexOf("[[");
  },
  tokenizer(src) {
    const rule = /^\[\[([^\[\]]+)\]\]/;
    const match = rule.exec(src);
    if (match) {
      const inner = match[1].trim();
      if (!inner) return undefined;
      const [targetPart, aliasPart] = inner.split("|");
      const target = (targetPart || "").trim();
      if (!target) return undefined;

      return {
        type: "wikilink",
        raw: match[0],
        target,
        text: aliasPart ? aliasPart.trim() : target,
        tokens: []
      };
    }
    return undefined;
  },
  renderer(token) {
    const label = token.text || token.target;
    const attrs = [
      'class="wikilink"',
      `data-wikilink-target="${escapeHtml(token.target)}"`,
      'href="#"'
    ];

    if (typeof token.exists === "boolean") {
      attrs.push(`data-wikilink-exists="${token.exists ? "true" : "false"}"`);
    }

    return `<a ${attrs.join(" ")}>${escapeHtml(label)}</a>`;
  }
};

let wikiExtensionRegistered = false;

if (!wikiExtensionRegistered) {
  marked.use({
    extensions: [wikiLinkExtension],
    walkTokens(token) {
      if (token.type === "wikilink") {
        const state = useNotesStore.getState();
        const note = state.findNoteByLinkTarget?.(token.target);
        token.exists = Boolean(note);
      }
    },
    renderer: {
      code(code, language) {
        const text = typeof code === 'object' ? code.text : code;
        const lang = typeof code === 'object' ? code.lang : language;
        const validLang = lang && hljs.getLanguage(lang);
        const highlighted = validLang
          ? hljs.highlight(text, { language: lang }).value
          : hljs.highlightAuto(text).value;
        const langLabel = lang || 'text';
        const escapedCode = text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');

        return `<div class="code-block-wrapper">
          <div class="code-block-header">
            <span class="code-block-lang">${escapeHtml(langLabel)}</span>
            <button class="code-copy-btn" data-code="${escapedCode}" title="Copy code">
              <svg class="copy-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <svg class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </button>
          </div>
          <pre><code class="hljs language-${escapeHtml(langLabel)}">${highlighted}</code></pre>
        </div>`;
      }
    }
  });
  wikiExtensionRegistered = true;
}

const MarkdownEditor = forwardRef((props, ref) => {
  const {
    currentNoteId,
    updateNote,
    getCurrentNote,
    findNoteByLinkTarget,
    selectNote,
    createNote,
    rootFolderPath,
    editorSplitRatio,
    setEditorSplitRatio,
    saveCurrentNoteToDisk,
    isNoteDirty
  } = useNotesStore();

  const { addNotification } = useUIStore();

  const [markdown, setMarkdown] = useState("");
  const [debouncedMarkdown, setDebouncedMarkdown] = useState(""); // Debounced for preview
  const [viewMode, setViewMode] = useState("split"); // "editor", "preview", or "split"
  const [showExportModal, setShowExportModal] = useState(false);
  const [isResizingSplit, setIsResizingSplit] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSavedIndicator, setShowSavedIndicator] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  const updateTimerRef = useRef(null);
  const savedIndicatorTimerRef = useRef(null);
  const previewTimerRef = useRef(null); // Timer for debounced preview updates
  const textareaRef = useRef(null);
  const highlightTimeoutRef = useRef(null);

  // Get dirty state from store (persists across tab switches)
  const hasUnsavedChanges = isNoteDirty(currentNoteId);

  const startResizingSplit = useCallback((e) => {
    e.preventDefault();
    setIsResizingSplit(true);
  }, []);

  const stopResizingSplit = useCallback(() => {
    setIsResizingSplit(false);
  }, []);

  const resizeSplit = useCallback((e) => {
    if (isResizingSplit) {
      const container = document.querySelector('.editor-container');
      if (container) {
        const rect = container.getBoundingClientRect();
        const newRatio = ((e.clientX - rect.left) / rect.width) * 100;
        if (newRatio >= 20 && newRatio <= 80) {
          setEditorSplitRatio(newRatio);
        }
      }
    }
  }, [isResizingSplit, setEditorSplitRatio]);

  useEffect(() => {
    if (isResizingSplit) {
      window.addEventListener('mousemove', resizeSplit);
      window.addEventListener('mouseup', stopResizingSplit);
    } else {
      window.removeEventListener('mousemove', resizeSplit);
      window.removeEventListener('mouseup', stopResizingSplit);
    }
    return () => {
      window.removeEventListener('mousemove', resizeSplit);
      window.removeEventListener('mouseup', stopResizingSplit);
    };
  }, [isResizingSplit, resizeSplit, stopResizingSplit]);

  // Function to find all matches in the text
  const findAllMatches = useCallback((query) => {
    if (!query) return [];

    const matches = [];
    const content = markdown.toLowerCase();
    const searchTerm = query.toLowerCase();
    let index = 0;

    while ((index = content.indexOf(searchTerm, index)) !== -1) {
      matches.push({
        start: index,
        end: index + query.length
      });
      index += 1;
    }

    return matches;
  }, [markdown]);

  // Function to scroll to and highlight a specific match
  const scrollToMatch = useCallback((matchIndex) => {
    if (!textareaRef.current || matchIndex < 0 || matchIndex >= searchMatches.length) return;

    const match = searchMatches[matchIndex];
    const textarea = textareaRef.current;

    // Set selection first
    textarea.focus();
    textarea.setSelectionRange(match.start, match.end);

    // Use a more accurate scrolling method
    // Get the line number and calculate scroll position
    const textBeforeMatch = markdown.substring(0, match.start);
    const lines = textBeforeMatch.split('\n');
    const lineNumber = lines.length - 1;

    // Get computed line height from the textarea
    const computedStyle = window.getComputedStyle(textarea);
    const fontSize = parseFloat(computedStyle.fontSize);
    const lineHeight = parseFloat(computedStyle.lineHeight) || fontSize * 1.6;
    const paddingTop = parseFloat(computedStyle.paddingTop) || 0;

    // Calculate scroll position
    const targetScrollTop = (lineNumber * lineHeight) + paddingTop - (textarea.clientHeight / 3);

    // Scroll smoothly
    textarea.scrollTop = Math.max(0, targetScrollTop);
  }, [markdown, searchMatches]);

  // Enhanced search function that finds all matches
  const scrollToAndHighlight = useCallback((query) => {
    if (!query || !textareaRef.current) {
      // Clear search
      setSearchQuery("");
      setSearchMatches([]);
      setCurrentMatchIndex(0);
      return;
    }

    // Find all matches
    const matches = findAllMatches(query);

    if (matches.length === 0) return;

    // Update state
    setSearchQuery(query);
    setSearchMatches(matches);
    setCurrentMatchIndex(0);

    // Scroll to first match using accurate calculation
    const textarea = textareaRef.current;
    const match = matches[0];

    // Set selection first
    textarea.focus();
    textarea.setSelectionRange(match.start, match.end);

    // Calculate accurate scroll position
    const textBeforeMatch = markdown.substring(0, match.start);
    const lines = textBeforeMatch.split('\n');
    const lineNumber = lines.length - 1;

    // Get computed line height from the textarea
    const computedStyle = window.getComputedStyle(textarea);
    const fontSize = parseFloat(computedStyle.fontSize);
    const lineHeight = parseFloat(computedStyle.lineHeight) || fontSize * 1.6;
    const paddingTop = parseFloat(computedStyle.paddingTop) || 0;

    // Calculate and set scroll position
    const targetScrollTop = (lineNumber * lineHeight) + paddingTop - (textarea.clientHeight / 3);
    textarea.scrollTop = Math.max(0, targetScrollTop);
  }, [markdown, findAllMatches]);

  // Navigate to next match
  const nextMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    const nextIndex = (currentMatchIndex + 1) % searchMatches.length;
    setCurrentMatchIndex(nextIndex);
    scrollToMatch(nextIndex);
  }, [searchMatches, currentMatchIndex, scrollToMatch]);

  // Navigate to previous match
  const previousMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    const prevIndex = currentMatchIndex === 0 ? searchMatches.length - 1 : currentMatchIndex - 1;
    setCurrentMatchIndex(prevIndex);
    scrollToMatch(prevIndex);
  }, [searchMatches, currentMatchIndex, scrollToMatch]);

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchMatches([]);
    setCurrentMatchIndex(0);
    if (textareaRef.current) {
      const pos = textareaRef.current.selectionStart;
      textareaRef.current.setSelectionRange(pos, pos);
    }
  }, []);

  // Cleanup highlight timeout on unmount
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  // Keyboard shortcuts for search navigation
  useEffect(() => {
    if (searchMatches.length === 0) return;

    const handleKeyDown = (e) => {
      // Only handle when textarea is focused
      if (document.activeElement !== textareaRef.current) return;

      // F3 or Cmd/Ctrl+G for next match
      if (e.key === 'F3' || ((e.metaKey || e.ctrlKey) && e.key === 'g' && !e.shiftKey)) {
        e.preventDefault();
        nextMatch();
      }
      // Shift+F3 or Cmd/Ctrl+Shift+G for previous match
      else if ((e.key === 'F3' && e.shiftKey) || ((e.metaKey || e.ctrlKey) && e.key === 'g' && e.shiftKey)) {
        e.preventDefault();
        previousMatch();
      }
      // Escape to clear search
      else if (e.key === 'Escape') {
        e.preventDefault();
        clearSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchMatches, nextMatch, previousMatch, clearSearch]);

  useEffect(() => {
    const handleResize = () => {
      // Force editor view on small screens if split view is active
      if (window.innerWidth < 768 && viewMode === 'split') {
        setViewMode('editor');
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Check initial state

    return () => window.removeEventListener('resize', handleResize);
  }, [viewMode]);

  useEffect(() => {
    // Clear pending update when switching notes
    if (updateTimerRef.current) {
      clearTimeout(updateTimerRef.current);
      updateTimerRef.current = null;
    }
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }

    const currentNote = getCurrentNote();
    if (currentNote) {
      const content = currentNote.content || "";
      setMarkdown(content);
      setDebouncedMarkdown(content); // Initialize preview immediately on note switch
    } else {
      setMarkdown("");
      setDebouncedMarkdown("");
    }
    // Note: dirty state is tracked in the store, not locally
  }, [currentNoteId]); // CRITICAL: Only depend on currentNoteId, not getCurrentNote

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
      }
      if (savedIndicatorTimerRef.current) {
        clearTimeout(savedIndicatorTimerRef.current);
      }
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
      }
    };
  }, []);

  // Manual save function
  const handleSave = useCallback(async () => {
    if (!currentNoteId || isSaving) return;

    const currentNote = getCurrentNote();
    if (!currentNote?.filePath) {
      addNotification('Cannot save: note has no file path', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await saveCurrentNoteToDisk();
      // Note: dirty state is cleared in the store by saveCurrentNoteToDisk

      // Show "Saved" indicator
      setShowSavedIndicator(true);
      if (savedIndicatorTimerRef.current) {
        clearTimeout(savedIndicatorTimerRef.current);
      }
      savedIndicatorTimerRef.current = setTimeout(() => {
        setShowSavedIndicator(false);
      }, 2000);

      addNotification('Note saved successfully', 'success');
    } catch (error) {
      console.error('Save failed:', error);
      addNotification(`Failed to save: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  }, [currentNoteId, isSaving, markdown, getCurrentNote, saveCurrentNoteToDisk, addNotification]);

  // Keyboard shortcut for save (Ctrl+S / Cmd+S)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Check for Ctrl+S (Windows/Linux) or Cmd+S (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    setViewMode,
    scrollToAndHighlight,
    handleSave,
    handleExport: () => setShowExportModal(true),
    nextMatch,
    previousMatch,
    clearSearch
  }), [scrollToAndHighlight, handleSave, nextMatch, previousMatch, clearSearch]);

  const handleMarkdownChange = (value) => {
    // Update local state immediately for instant typing
    setMarkdown(value);
    // Note: dirty state is tracked in the store when updateNote is called

    // Debounce preview update to avoid expensive markdown parsing on every keystroke
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
    }
    previewTimerRef.current = setTimeout(() => {
      setDebouncedMarkdown(value);
    }, 150); // Update preview 150ms after typing stops

    // Debounce store update to avoid localStorage serialization on every keystroke
    if (currentNoteId) {
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
      }

      updateTimerRef.current = setTimeout(() => {
        updateNote(currentNoteId, value);
      }, 300); // Update store 300ms after typing stops
    }
  };

  const insertMarkdown = (before, after = "", placeholder = "") => {
    const textarea = document.querySelector(".editor-textarea");
    if (!textarea) return;

    const scrollTop = textarea.scrollTop;
    const scrollLeft = textarea.scrollLeft;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = markdown.substring(start, end);
    const replacement = before + (selectedText || placeholder) + after;

    const newMarkdown =
      markdown.substring(0, start) + replacement + markdown.substring(end);
    setMarkdown(newMarkdown);
    handleMarkdownChange(newMarkdown);

    setTimeout(() => {
      textarea.scrollTop = scrollTop;
      textarea.scrollLeft = scrollLeft;
      textarea.focus();
      const newCursorPos =
        start + before.length + (selectedText || placeholder).length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  // Memoize preview HTML - only recalculate when debouncedMarkdown changes
  const previewHtml = useMemo(() => {
    try {
      // Use debouncedMarkdown to avoid expensive parsing on every keystroke
      const safeMarkdown = debouncedMarkdown || "";
      return { __html: marked(safeMarkdown) };
    } catch (error) {
      console.error("Markdown rendering error:", error);
      return { __html: "<p>Error rendering markdown</p>" };
    }
  }, [debouncedMarkdown]);

  // Memoize status bar calculations - only recalculate when debouncedMarkdown changes
  const statusBarStats = useMemo(() => {
    const text = debouncedMarkdown || "";
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    return {
      wordCount: words.length,
      charCount: text.length,
      readTime: Math.ceil(words.length / 200)
    };
  }, [debouncedMarkdown]);

  // Handle interactive checkboxes in preview - use debouncedMarkdown to avoid running on every keystroke
  useEffect(() => {
    if (viewMode === 'editor' && window.innerWidth >= 768) return;

    const container = document.querySelector('.markdown-preview');
    if (!container) return;

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');

    const handleCheckboxChange = (index) => {
      const regex = /^(\s*)[-*+]\s+\[([ x])\]/gm;
      let newMarkdown = markdown;

      // We'll rebuild the string to avoid index calculation errors with multiple matches
      let matchCount = 0;
      newMarkdown = newMarkdown.replace(regex, (fullMatch, indent, currentState) => {
        if (matchCount === index) {
          matchCount++;
          const newState = currentState === ' ' ? 'x' : ' ';
          // Preserve exact formatting
          return fullMatch.replace(`[${currentState}]`, `[${newState}]`);
        }
        matchCount++;
        return fullMatch;
      });

      handleMarkdownChange(newMarkdown);
    };

    checkboxes.forEach((checkbox, index) => {
      checkbox.disabled = false;
      checkbox.style.cursor = 'pointer';

      const listener = () => {
        handleCheckboxChange(index);
      };

      checkbox.addEventListener('change', listener);
    });

    // Cleanup not strictly necessary for innerHTML replacements but good for safety
    return () => {
      // interactive elements are destroyed on next render
    };
  }, [debouncedMarkdown, viewMode]); // Use debouncedMarkdown instead of markdown

  // Handle copy button clicks on code blocks - use debouncedMarkdown to avoid running on every keystroke
  useEffect(() => {
    const container = document.querySelector('.markdown-preview');
    if (!container) return;

    const handleCopyClick = async (e) => {
      const btn = e.target.closest('.code-copy-btn');
      if (!btn) return;

      const code = btn.getAttribute('data-code');
      if (!code) return;

      try {
        await navigator.clipboard.writeText(code);
        const copyIcon = btn.querySelector('.copy-icon');
        const checkIcon = btn.querySelector('.check-icon');
        if (copyIcon && checkIcon) {
          copyIcon.style.display = 'none';
          checkIcon.style.display = 'block';
          setTimeout(() => {
            copyIcon.style.display = 'block';
            checkIcon.style.display = 'none';
          }, 2000);
        }
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    };

    container.addEventListener('click', handleCopyClick);
    return () => container.removeEventListener('click', handleCopyClick);
  }, [debouncedMarkdown, viewMode]); // Use debouncedMarkdown instead of markdown

  const handlePreviewClick = useCallback(async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const anchor = target.closest("a[data-wikilink-target]");
    if (!anchor) return;

    event.preventDefault();
    event.stopPropagation();

    const linkTarget = anchor.getAttribute("data-wikilink-target");
    if (!linkTarget) return;

    const existing = findNoteByLinkTarget(linkTarget);
    if (existing) {
      selectNote(existing.id);
      return;
    }

    if (!rootFolderPath) {
      addNotification("Open or create a workspace folder before creating linked notes.", "info");
      return;
    }

    const shouldCreate = window.confirm(`Create new note "${linkTarget}"?`);
    if (!shouldCreate) return;

    try {
      const newId = await createNote(null, null, linkTarget);
      if (newId) {
        selectNote(newId);
      }
    } catch (error) {
      console.error("Failed to create note from link:", error);
      addNotification(`Failed to create note: ${error.message}`, "error");
    }
  }, [createNote, findNoteByLinkTarget, rootFolderPath, selectNote]);

  const currentNote = getCurrentNote();

  if (!currentNote) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted bg-editor-bg relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute top-1/4 -right-20 w-96 h-96 bg-accent/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 -left-20 w-96 h-96 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="text-center z-10 max-w-md px-6 animate-in fade-in zoom-in-95 duration-500">
          <div className="w-24 h-24 mx-auto mb-8 bg-linear-to-tr from-accent/20 to-accent/5 rounded-2xl flex items-center justify-center border border-accent/10 shadow-inner">
            <svg className="w-12 h-12 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-text-primary tracking-tight mb-2">Ready to write?</h2>
          <p className="text-text-secondary mb-10 leading-relaxed text-sm">
            Select an existing note from the sidebar or start a fresh one to begin capturing your ideas.
          </p>

          <div className="grid grid-cols-1 gap-3 text-left">
            <div className="p-3 bg-overlay-subtle border border-overlay-subtle rounded-xl hover:border-overlay-light transition-colors flex items-center gap-3 group">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent group-hover:bg-accent/20 transition-colors">
                <span className="text-xs font-bold">N</span>
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-text-primary">Create New Note</p>
                <p className="text-[10px] text-text-muted">Press ⌘N to start a new document</p>
              </div>
            </div>

            <div className="p-3 bg-overlay-subtle border border-overlay-subtle rounded-xl hover:border-overlay-light transition-colors flex items-center gap-3 group">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:bg-blue-500/20 transition-colors">
                <span className="text-xs font-bold">O</span>
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-text-primary">Open Existing File</p>
                <p className="text-[10px] text-text-muted">Press ⌘O to import from disk</p>
              </div>
            </div>

            <div className="p-3 bg-overlay-subtle border border-overlay-subtle rounded-xl hover:border-overlay-light transition-colors flex items-center gap-3 group">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
                <span className="text-xs font-bold">G</span>
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-text-primary">Visualize Graph</p>
                <p className="text-[10px] text-text-muted">Explore connections between notes</p>
              </div>
            </div>
          </div>

          <div className="mt-12 text-[11px] text-text-muted flex items-center justify-center gap-4 opacity-70">
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-overlay-subtle border border-overlay-light rounded-md">⌘</kbd>
              <kbd className="px-1.5 py-0.5 bg-overlay-subtle border border-overlay-light rounded-md">K</kbd>
              <span>Shortcuts</span>
            </div>
            <div className="w-1 h-1 bg-overlay-medium rounded-full" />
            <span>v1.0.0</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-editor-bg">
      {/* Title Bar - Glass effect */}
      <div className="h-12 border-b border-border flex items-center px-4 bg-bg-base/80 backdrop-blur shrink-0 z-10 justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1 mr-4">
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-text-primary font-semibold truncate">{currentNote.name}</span>
            {currentNote.filePath && hasUnsavedChanges && (
              <div className="w-2 h-2 rounded-full bg-accent shrink-0" title="Unsaved changes" />
            )}
          </div>
          {currentNote.filePath ? (
            <>
              <span className="text-xs text-text-muted hidden sm:inline truncate opacity-60">({currentNote.filePath})</span>
              {showSavedIndicator && (
                <span className="text-[10px] text-green-300 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full flex items-center gap-1 animate-in fade-in duration-200">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Saved
                </span>
              )}
            </>
          ) : (
            <span className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">Unsaved</span>
          )}
        </div>

        {/* View Mode Toggles */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving || !currentNote.filePath}
            className={`px-2 py-1.5 text-xs rounded-md transition-colors flex items-center gap-1.5 ${
              isSaving || !currentNote.filePath
                ? 'text-text-muted cursor-not-allowed opacity-50'
                : 'text-text-secondary hover:text-text-primary hover:bg-overlay-subtle'
            }`}
            title={currentNote.filePath ? 'Save (Ctrl+S / Cmd+S)' : 'Cannot save: no file path'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            <span className="hidden sm:inline">{isSaving ? 'Saving...' : 'Save'}</span>
          </button>

          <button
            onClick={() => setShowExportModal(true)}
            className="px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-overlay-subtle rounded-md transition-colors flex items-center gap-1.5"
            title="Export Note"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span className="hidden sm:inline">Export</span>
          </button>

          <div className="flex items-center gap-1 bg-overlay-subtle rounded-lg p-1 border border-overlay-subtle">
            <button
              onClick={() => setViewMode("editor")}
              className={`p-1.5 rounded-md transition-all ${viewMode === "editor"
                ? "bg-accent text-white shadow-sm"
                : "text-text-secondary hover:text-text-primary hover:bg-overlay-subtle"
                }`}
              title="Editor Only"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode("split")}
              className={`hidden md:block p-1.5 rounded-md transition-all ${viewMode === "split"
                ? "bg-accent text-white shadow-sm"
                : "text-text-secondary hover:text-text-primary hover:bg-overlay-subtle"
                }`}
              title="Split View"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode("preview")}
              className={`p-1.5 rounded-md transition-all ${viewMode === "preview"
                ? "bg-accent text-white shadow-sm"
                : "text-text-secondary hover:text-text-primary hover:bg-overlay-subtle"
                }`}
              title="Preview Only"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      {(viewMode === "editor" || viewMode === "split") && (
        <div className="border-b border-border bg-bg-base/50 backdrop-blur shrink-0 overflow-x-auto custom-scrollbar">
          <Toolbar onInsert={insertMarkdown} />
        </div>
      )}

      {/* Content Area */}
      <div className={`flex-1 min-h-0 overflow-hidden flex editor-container ${isResizingSplit ? 'cursor-col-resize' : ''}`}>
        {/* Editor */}
        {(viewMode === "editor" || viewMode === "split") && (
          <div
            className={`flex flex-col relative ${viewMode === "split" ? "border-r border-border" : "w-full"}`}
            style={{ width: viewMode === "split" ? `${editorSplitRatio}%` : '100%' }}
          >
            {/* Search Controls */}
            {searchMatches.length > 0 && (
              <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-bg-sidebar border border-border rounded-lg shadow-lg px-3 py-2">
                <span className="text-xs text-text-secondary font-medium">
                  {currentMatchIndex + 1} of {searchMatches.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={previousMatch}
                    className="p-1 hover:bg-overlay-light rounded transition-colors"
                    title="Previous match (Shift+Enter)"
                  >
                    <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={nextMatch}
                    className="p-1 hover:bg-overlay-light rounded transition-colors"
                    title="Next match (Enter)"
                  >
                    <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
                <div className="w-px h-4 bg-border mx-1" />
                <button
                  onClick={clearSearch}
                  className="p-1 hover:bg-overlay-light rounded transition-colors"
                  title="Clear search (Esc)"
                >
                  <svg className="w-4 h-4 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            <textarea
              ref={textareaRef}
              className="w-full h-full bg-bg-editor border-none p-6 font-mono text-[15px] leading-relaxed
                       text-text-primary resize-none outline-none placeholder-text-muted
                       editor-textarea"
              value={markdown}
              onChange={(e) => handleMarkdownChange(e.target.value)}
              placeholder="Start typing your markdown here..."
              spellCheck="false"
            />
          </div>
        )}

        {/* Resize Handle */}
        {viewMode === "split" && (
          <div
            onMouseDown={startResizingSplit}
            className={`
              w-1 h-full cursor-col-resize hover:bg-accent/50 transition-colors z-10 shrink-0
              ${isResizingSplit ? 'bg-accent' : 'bg-transparent'}
            `}
          />
        )}

        {/* Preview */}
        {(viewMode === "preview" || viewMode === "split") && (
          <div
            className={`flex flex-col bg-bg-editor overflow-y-auto ${isResizingSplit ? 'pointer-events-none' : ''}`}
            style={{ width: viewMode === "split" ? `${100 - editorSplitRatio}%` : '100%' }}
            onClick={handlePreviewClick}
          >
            <div className="p-6">
              <div
                className="markdown-preview prose prose-invert max-w-none"
                dangerouslySetInnerHTML={previewHtml}
              />
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      {currentNote && (
        <div className="shrink-0 px-4 py-1.5 bg-overlay-subtle border-t border-border flex items-center justify-between text-xs text-text-muted">
          <div className="flex items-center gap-4">
            <span>
              {statusBarStats.wordCount} words
            </span>
            <span className="text-text-muted/50">•</span>
            <span>
              {statusBarStats.charCount} characters
            </span>
            <span className="text-text-muted/50">•</span>
            <span>
              {statusBarStats.readTime} min read
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-text-muted/50">View:</span>
            <span className="text-text-secondary capitalize">{viewMode}</span>
          </div>
        </div>
      )}

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        note={currentNote}
      />
    </div>
  );
});

MarkdownEditor.displayName = 'MarkdownEditor';

export default MarkdownEditor;
