import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
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
    setEditorSplitRatio
  } = useNotesStore();

  const { addNotification } = useUIStore();

  const [markdown, setMarkdown] = useState("");
  const [viewMode, setViewMode] = useState("split"); // "editor", "preview", or "split"
  const [showExportModal, setShowExportModal] = useState(false);
  const [isResizingSplit, setIsResizingSplit] = useState(false);

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

  // Expose setViewMode to parent
  useImperativeHandle(ref, () => ({
    setViewMode
  }), []);

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
    const currentNote = getCurrentNote();
    if (currentNote) {
      setMarkdown(currentNote.content || "");
    } else {
      setMarkdown("");
    }
  }, [currentNoteId, getCurrentNote]);

  const handleMarkdownChange = (value) => {
    setMarkdown(value);
    if (currentNoteId) {
      updateNote(currentNoteId, value);
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

  const getPreviewHtml = () => {
    try {
      // Ensure markdown is a string, not null or undefined
      const safeMarkdown = markdown || "";
      return { __html: marked(safeMarkdown) };
    } catch (error) {
      console.error("Markdown rendering error:", error);
      return { __html: "<p>Error rendering markdown</p>" };
    }
  };

  // Handle interactive checkboxes in preview
  useEffect(() => {
    if (viewMode === 'editor' && window.innerWidth >= 768) return;

    const container = document.querySelector('.markdown-preview');
    if (!container) return;

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');

    const handleCheckboxChange = (index, checked) => {
      const regex = /^(\s*)[-*+]\s+\[([ x])\]/gm;
      let match;
      let currentIndex = 0;
      let newMarkdown = markdown;

      // Find the Nth match in the markdown string
      // using replace to iterate is easier to handle position updates if needed, 
      // but here we just need to find the Nth occurrence index

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

      const listener = (e) => {
        // Prevent default rendering if we want full control, 
        // but letting it toggle visually while we update state is often smoother
        // However, React state update will re-render and overwrite it anyway.
        handleCheckboxChange(index, checkbox.checked);
      };

      // Store listener to cleanup if needed, but since innerHTML trashes DOM,
      // we usually just let it be. But cleaning up event listeners is good practice 
      // if the elements persisted, which they don't here.
      checkbox.addEventListener('change', listener);
    });

    // Cleanup not strictly necessary for innerHTML replacements but good for safety
    return () => {
      // interactive elements are destroyed on next render
    };
  }, [markdown, viewMode]);

  // Handle copy button clicks on code blocks
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
  }, [markdown, viewMode]);

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
          <div className="w-24 h-24 mx-auto mb-8 bg-gradient-to-tr from-accent/20 to-accent/5 rounded-2xl flex items-center justify-center border border-accent/10 shadow-inner">
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
          <span className="text-sm text-text-primary font-semibold truncate">{currentNote.name}</span>
          {currentNote.filePath ? (
            <span className="text-xs text-text-muted hidden sm:inline truncate opacity-60">({currentNote.filePath})</span>
          ) : (
            <span className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">Unsaved</span>
          )}
        </div>

        {/* View Mode Toggles */}
        <div className="flex items-center gap-3">
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
            className={`flex flex-col ${viewMode === "split" ? "border-r border-border" : "w-full"}`}
            style={{ width: viewMode === "split" ? `${editorSplitRatio}%` : '100%' }}
          >
            <textarea
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
                dangerouslySetInnerHTML={getPreviewHtml()}
              />
            </div>
          </div>
        )}
      </div>

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
