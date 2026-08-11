import {
  useState,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useRef,
  useMemo,
  lazy,
  Suspense,
} from "react";
import { marked } from "marked";
import hljs from "highlight.js/lib/common";
import markedFootnote from "marked-footnote";
import markedKatex from "marked-katex-extension";
import "katex/dist/katex.min.css";
import CreateNoteModal from "../modals/CreateNoteModal";
import CodeMirrorEditor from "./CodeMirrorEditor";
import SelectionToolbar from "./SelectionToolbar";
import OutlineRail from "./OutlineRail";
import EditorScrollFade from "./EditorScrollFade";
import EditorActionsMenu from "./EditorActionsMenu";
import useNotesStore, { SETTINGS_TAB_ID } from "../../store/notesStore";
import useUIStore from "../../store/uiStore";
import useSettingsStore, { editorWidthValue } from "../../store/settingsStore";
import { slugify } from "../../utils/slugify";
import { parseHeadings } from "../../utils/headings";
import { parseFrontmatter } from "../../utils/frontmatter";
import { insertBlankLineSpacers } from "../../utils/blankLineSpacers";
import { saveMarkdownFile } from "../../utils/fileSystem";
import { isolateBidiRuns, detectBaseDirection } from "../../utils/bidi";
import "./MarkdownPreview.css";

const ExportModal = lazy(() => import("../modals/ExportModal"));
const SettingsPage = lazy(() => import("../settings/SettingsPage"));
const NoteHistoryModal = lazy(() => import("../modals/NoteHistoryModal"));
const ConflictCompareModal = lazy(() => import("../modals/ConflictCompareModal"));
const WorkspaceDashboard = lazy(() => import("../dashboard/WorkspaceDashboard"));
const NotePropertiesPanel = lazy(() => import("./NotePropertiesPanel"));

// Lazy-load mermaid only when needed (large dependency ~1.5MB)
let mermaidPromise = null;
const getMermaid = () => {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => {
      const isDark = document.documentElement.getAttribute("data-theme") !== "light";
      m.default.initialize({
        startOnLoad: false,
        theme: isDark ? "dark" : "default",
        securityLevel: "strict",
        fontFamily: "inherit",
      });
      return m.default;
    });
  }
  return mermaidPromise;
};

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
    const rule = /^\[\[([^\]]+)\]\]/;
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
        tokens: [],
      };
    }
    return undefined;
  },
  renderer(token) {
    const label = token.text || token.target;
    const attrs = [
      'class="wikilink"',
      `data-wikilink-target="${escapeHtml(token.target)}"`,
      'href="#"',
    ];

    if (typeof token.exists === "boolean") {
      attrs.push(`data-wikilink-exists="${token.exists ? "true" : "false"}"`);
    }

    return `<a ${attrs.join(" ")}>${escapeHtml(label)}</a>`;
  },
};

let extensionsRegistered = false;

if (!extensionsRegistered) {
  // Register footnotes and KaTeX before the custom renderer block
  marked.use(markedFootnote());
  marked.use(markedKatex({ throwOnError: false }));

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
      heading(token) {
        const text = typeof token === "object" ? token.text : token;
        const depth = typeof token === "object" ? token.depth : arguments[1];
        const id = slugify(text);
        return `<h${depth} id="${escapeHtml(id)}" dir="auto">${text}</h${depth}>\n`;
      },
      paragraph(token) {
        const text = typeof token === "object" ? token.text : token;
        return `<p dir="auto">${text}</p>\n`;
      },
      listitem(token) {
        const text = typeof token === "object" ? token.text : token;
        const isTask = typeof token === "object" ? token.task : false;
        const isChecked = typeof token === "object" ? token.checked : false;
        if (isTask) {
          const checkbox = `<input type="checkbox"${isChecked ? ' checked=""' : ""} disabled="">`;
          return `<li dir="auto">${checkbox} ${text}</li>\n`;
        }
        return `<li dir="auto">${text}</li>\n`;
      },
      blockquote(token) {
        const body = typeof token === "object" ? token.text : token;
        // `dir="auto"` only considers text that isn't already inside an element
        // carrying its own `dir` — and every paragraph in here has one, so the
        // blockquote always resolved LTR and hung its rule on the left of a
        // Persian quote. Resolve the direction from the quote's own text.
        const dir = detectBaseDirection(body.replace(/<[^>]*>/g, ""));
        return `<blockquote dir="${dir}">${body}</blockquote>\n`;
      },
      // Wrap tables so a wide one scrolls inside its own box instead of
      // stretching the reading column. The wrapper also carries the rounded
      // border, which a <table> can't clip on its own.
      table(header, body) {
        const tbody = body ? `<tbody>${body}</tbody>` : "";
        return `<div class="table-wrap"><table><thead>${header}</thead>${tbody}</table></div>\n`;
      },
      // marked 9 calls this as `tablecell(content, { header, align })`; newer
      // versions pass a single token. Reading only the token shape dropped both
      // flags, so every header cell rendered as a <td> and the column alignment
      // from `|:---:|` was thrown away.
      tablecell(token, flags) {
        const isToken = typeof token === "object";
        const content = isToken ? token.text : token;
        const isHeader = isToken ? token.header : Boolean(flags?.header);
        const align = (isToken ? token.align : flags?.align) || "";
        const tag = isHeader ? "th" : "td";
        const alignAttr = align ? ` style="text-align:${align}"` : "";
        return `<${tag} dir="auto"${alignAttr}>${content}</${tag}>\n`;
      },
      code(code, language) {
        const text = typeof code === "object" ? code.text : code;
        const lang = typeof code === "object" ? code.lang : language;

        // Mermaid diagrams: render as placeholder for post-processing
        if (lang === "mermaid") {
          return `<div class="mermaid-wrapper"><div class="mermaid">${escapeHtml(text)}</div></div>`;
        }

        const validLang = lang && hljs.getLanguage(lang);
        const highlighted = validLang
          ? hljs.highlight(text, { language: lang }).value
          : hljs.highlightAuto(text).value;
        const langLabel = lang || "text";
        const escapedCode = text.replace(/"/g, "&quot;").replace(/'/g, "&#39;");

        // Emitted without whitespace between tags. Indenting this template put
        // real newlines in the DOM, and in Live mode the widget inherits
        // `white-space: break-spaces` from `.cm-content`, which renders each
        // one as a blank line inside the block.
        const copyIcon =
          '<svg class="copy-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
          '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>' +
          '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>' +
          "</svg>";
        const checkIcon =
          '<svg class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none">' +
          '<polyline points="20 6 9 17 4 12"></polyline>' +
          "</svg>";

        return (
          '<div class="code-block-wrapper">' +
          '<div class="code-block-header">' +
          `<span class="code-block-lang">${escapeHtml(langLabel)}</span>` +
          `<button class="code-copy-btn" data-code="${escapedCode}" title="Copy code">${copyIcon}${checkIcon}</button>` +
          "</div>" +
          `<pre><code class="hljs language-${escapeHtml(langLabel)}">${highlighted}</code></pre>` +
          "</div>"
        );
      },
    },
  });
  extensionsRegistered = true;
}

const renderMarkdownPreview = (markdown) => {
  const previewMarkdown = parseFrontmatter(markdown).body;
  const tokens = marked.lexer(previewMarkdown);

  // The footnote extension emits its section as the first token and relies on
  // `marked.parse()` to place it. Rendering through `lexer` + `parser` (which
  // we do, to turn blank lines into spacers) skips that step, so the notes
  // landed above the document title. Move the section to the end ourselves.
  const footnotesIndex = tokens.findIndex((token) => token.type === "footnotes");
  if (footnotesIndex !== -1) {
    tokens.push(...tokens.splice(footnotesIndex, 1));
  }

  const tokensWithBlankLines = insertBlankLineSpacers(tokens);

  marked.walkTokens(tokensWithBlankLines, (token) => {
    if (token.type === "wikilink") {
      const state = useNotesStore.getState();
      const note = state.findNoteByLinkTarget?.(token.target);
      token.exists = Boolean(note);
    }
  });

  return marked.parser(tokensWithBlankLines);
};

const MarkdownEditor = forwardRef((props, ref) => {
  const { onOpenKeymapsModal, focusMode = false } = props;
  const {
    currentNoteId,
    updateNote,
    getCurrentNote,
    findNoteByLinkTarget,
    selectNote,
    createNote,
    rootFolderPath,
    saveCurrentNoteToDisk,
    updateNotePath,
    isNoteDirty,
    getNoteConflict,
    resolveNoteConflict,
    getRecoveredDraft,
    discardRecoveredDraft,
    getNotes,
    getAllTags,
  } = useNotesStore();

  const { addNotification, setShowWorkspaceModal } = useUIStore();
  const {
    vimMode,
    autosaveEnabled,
    autosaveDelay,
    typewriterMode: typewriterModeEnabled,
    showLineNumbers,
    editorWidth,
    vimVisualLineMotion,
    keymaps,
  } = useSettingsStore();
  // One measure for every view mode. Published as a CSS variable so the
  // rendered preview sheet (MarkdownPreview.css) reads the same value the
  // editor pane is capped at, instead of hard-coding its own.
  const measure = editorWidthValue(editorWidth);

  const [markdown, setMarkdown] = useState("");
  const [debouncedMarkdown, setDebouncedMarkdown] = useState(""); // Debounced for preview
  const [viewMode, setViewMode] = useState("live"); // "source" (raw), "live" (inline preview), or "read" (rendered)
  const [selection, setSelection] = useState({ empty: true }); // for the bubble toolbar
  const [showExportModal, setShowExportModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showConflictCompare, setShowConflictCompare] = useState(false);
  const [showCreateNoteModal, setShowCreateNoteModal] = useState(false);
  const [pendingNoteName, setPendingNoteName] = useState("");
  // 1-based document line the outline rail highlights against — the line at the
  // top of the viewport, so the rail tracks reading position, not the cursor.
  const [outlineLine, setOutlineLine] = useState(1);
  const [showProperties, setShowProperties] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSavedIndicator, setShowSavedIndicator] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState("idle"); // 'idle' | 'pending' | 'saving' | 'saved'

  // Search state
  const [searchMatches, setSearchMatches] = useState([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [vimModeStatus, setVimModeStatus] = useState({ mode: "normal", keyBuffer: "" });

  const updateTimerRef = useRef(null);
  const savedIndicatorTimerRef = useRef(null);
  const autosaveTimerRef = useRef(null);
  const autosaveClearTimerRef = useRef(null);
  const previewTimerRef = useRef(null); // Timer for debounced preview updates
  const editorRef = useRef(null);
  const editorPaneRef = useRef(null); // Outer scroll container for the editor pane
  const previewPaneRef = useRef(null);
  const highlightTimeoutRef = useRef(null);
  const localEditPendingRef = useRef(false);
  const localEditNoteIdRef = useRef(null);

  // Get dirty state from store (persists across tab switches)
  const hasUnsavedChanges = isNoteDirty(currentNoteId);
  const noteConflict = currentNoteId ? getNoteConflict(currentNoteId) : null;
  const recoveredDraft = currentNoteId ? getRecoveredDraft(currentNoteId) : null;

  // Function to find all matches in the text
  const findAllMatches = useCallback(
    (query) => {
      if (!query) return [];

      const matches = [];
      const content = markdown.toLowerCase();
      const searchTerm = query.toLowerCase();
      let index = 0;

      while ((index = content.indexOf(searchTerm, index)) !== -1) {
        matches.push({
          start: index,
          end: index + query.length,
        });
        index += 1;
      }

      return matches;
    },
    [markdown]
  );

  // Function to scroll to and highlight a specific match
  const scrollToMatch = useCallback(
    (matchIndex) => {
      if (!editorRef.current || matchIndex < 0 || matchIndex >= searchMatches.length) return;

      const match = searchMatches[matchIndex];
      const view = editorRef.current.getView();
      if (!view) return;

      // Set selection and scroll into view
      view.dispatch({
        selection: { anchor: match.start, head: match.end },
        scrollIntoView: true,
      });
      view.focus();
    },
    [searchMatches]
  );

  // Enhanced search function that finds all matches
  const scrollToAndHighlight = useCallback(
    (query) => {
      if (!query || !editorRef.current) {
        // Clear search
        setSearchMatches([]);
        setCurrentMatchIndex(0);
        return;
      }

      // Find all matches
      const matches = findAllMatches(query);

      if (matches.length === 0) return;

      // Update state
      setSearchMatches(matches);
      setCurrentMatchIndex(0);

      // Scroll to first match
      const view = editorRef.current.getView();
      if (!view) return;

      const match = matches[0];
      view.dispatch({
        selection: { anchor: match.start, head: match.end },
        scrollIntoView: true,
      });
      view.focus();
    },
    [findAllMatches]
  );

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
    setSearchMatches([]);
    setCurrentMatchIndex(0);
    if (editorRef.current) {
      const view = editorRef.current.getView();
      if (view) {
        const pos = view.state.selection.main.from;
        view.dispatch({
          selection: { anchor: pos },
        });
      }
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
      // Only handle when editor is focused
      if (!document.activeElement?.closest(".codemirror-wrapper")) return;

      // F3 or Cmd/Ctrl+G for next match
      if (e.key === "F3" || ((e.metaKey || e.ctrlKey) && e.key === "g" && !e.shiftKey)) {
        e.preventDefault();
        nextMatch();
      }
      // Shift+F3 or Cmd/Ctrl+Shift+G for previous match
      else if (
        (e.key === "F3" && e.shiftKey) ||
        ((e.metaKey || e.ctrlKey) && e.key === "g" && e.shiftKey)
      ) {
        e.preventDefault();
        previousMatch();
      }
      // Escape to clear search
      else if (e.key === "Escape") {
        e.preventDefault();
        clearSearch();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchMatches, nextMatch, previousMatch, clearSearch]);

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
    localEditPendingRef.current = false;
    localEditNoteIdRef.current = null;

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

  // Vim mode status callback handler
  const handleVimModeChange = useCallback((vimStatus) => {
    setVimModeStatus(vimStatus);
  }, []);

  const flushPendingNoteUpdate = useCallback(
    (noteId = currentNoteId, content = markdown) => {
      if (!noteId) return;

      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
        updateTimerRef.current = null;
      }

      if (localEditPendingRef.current && localEditNoteIdRef.current === noteId) {
        updateNote(noteId, content);
        localEditPendingRef.current = false;
        localEditNoteIdRef.current = null;
      }
    },
    [currentNoteId, markdown, updateNote]
  );

  // Manual save function
  const handleSave = useCallback(async () => {
    if (!currentNoteId || isSaving) return;

    const currentNote = getCurrentNote();

    // Unsaved scratch buffer → Save-As (pick a path), then it becomes a real file.
    if (!currentNote?.filePath) {
      flushPendingNoteUpdate(currentNoteId, markdown);
      setIsSaving(true);
      try {
        const savedPath = await saveMarkdownFile(markdown, null);
        if (savedPath) {
          updateNotePath(currentNoteId, savedPath);
          setShowSavedIndicator(true);
          if (savedIndicatorTimerRef.current) clearTimeout(savedIndicatorTimerRef.current);
          savedIndicatorTimerRef.current = setTimeout(() => setShowSavedIndicator(false), 2000);
          addNotification("Note saved", "success");
        }
      } catch (error) {
        console.error("Save failed:", error);
        addNotification(`Failed to save: ${error.message}`, "error");
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (noteConflict) {
      addNotification("Resolve the external file conflict before saving", "info");
      return;
    }

    setIsSaving(true);
    try {
      flushPendingNoteUpdate(currentNoteId, markdown);
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

      addNotification("Note saved successfully", "success");
    } catch (error) {
      console.error("Save failed:", error);
      addNotification(`Failed to save: ${error.message}`, "error");
    } finally {
      setIsSaving(false);
    }
  }, [
    currentNoteId,
    isSaving,
    markdown,
    getCurrentNote,
    flushPendingNoteUpdate,
    saveCurrentNoteToDisk,
    updateNotePath,
    addNotification,
    noteConflict,
  ]);

  // Autosave effect: schedule a disk write after typing stops when autosave is enabled
  useEffect(() => {
    if (!autosaveEnabled) {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      setAutosaveStatus("idle");
      return;
    }
    const note = getCurrentNote();
    if (!note?.filePath || !hasUnsavedChanges || noteConflict) {
      return;
    }
    setAutosaveStatus("pending");
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      setAutosaveStatus("saving");
      try {
        await saveCurrentNoteToDisk();
        setAutosaveStatus("saved");
        if (autosaveClearTimerRef.current) clearTimeout(autosaveClearTimerRef.current);
        autosaveClearTimerRef.current = setTimeout(() => setAutosaveStatus("idle"), 2000);
      } catch {
        setAutosaveStatus("idle");
      }
    }, autosaveDelay);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [
    markdown,
    autosaveEnabled,
    autosaveDelay,
    currentNoteId,
    hasUnsavedChanges,
    noteConflict,
    getCurrentNote,
    saveCurrentNoteToDisk,
  ]);

  const handleUseDiskVersion = useCallback(() => {
    if (!currentNoteId) return;
    const resolved = resolveNoteConflict(currentNoteId, "useDisk");
    if (resolved) {
      setShowConflictCompare(false);
      addNotification("Loaded the version from disk", "info");
    }
  }, [currentNoteId, resolveNoteConflict, addNotification]);

  const handleOverwriteDiskVersion = useCallback(async () => {
    if (!currentNoteId) return;
    const resolved = resolveNoteConflict(currentNoteId, "keepLocal");
    if (!resolved) return;
    setShowConflictCompare(false);

    const currentNote = getCurrentNote();
    if (!currentNote?.filePath || isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      flushPendingNoteUpdate(currentNoteId, markdown);
      await saveCurrentNoteToDisk();
      setShowSavedIndicator(true);
      if (savedIndicatorTimerRef.current) {
        clearTimeout(savedIndicatorTimerRef.current);
      }
      savedIndicatorTimerRef.current = setTimeout(() => {
        setShowSavedIndicator(false);
      }, 2000);
      addNotification("Draft saved and disk version overwritten", "success");
    } catch (error) {
      console.error("Overwrite save failed:", error);
      addNotification(`Failed to overwrite disk version: ${error.message}`, "error");
    } finally {
      setIsSaving(false);
    }
  }, [
    currentNoteId,
    resolveNoteConflict,
    getCurrentNote,
    flushPendingNoteUpdate,
    isSaving,
    markdown,
    saveCurrentNoteToDisk,
    addNotification,
  ]);

  const handleDiscardRecoveredDraft = useCallback(() => {
    if (!currentNoteId) return;
    discardRecoveredDraft(currentNoteId);
    addNotification("Recovered draft dismissed", "info");
  }, [currentNoteId, discardRecoveredDraft, addNotification]);

  // Keyboard shortcut for save (Ctrl+S / Cmd+S)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Check for Ctrl+S (Windows/Linux) or Cmd+S (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  // Expose methods to parent
  useImperativeHandle(
    ref,
    () => ({
      setViewMode,
      scrollToAndHighlight,
      handleSave,
      handleExport: () => setShowExportModal(true),
      nextMatch,
      previousMatch,
      clearSearch,
    }),
    [scrollToAndHighlight, handleSave, nextMatch, previousMatch, clearSearch]
  );

  const handleMarkdownChange = (value) => {
    // Update local state immediately for instant typing
    setMarkdown(value);
    localEditPendingRef.current = true;
    localEditNoteIdRef.current = currentNoteId;
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
      const noteIdForUpdate = currentNoteId;
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
      }

      updateTimerRef.current = setTimeout(() => {
        updateNote(noteIdForUpdate, value);
        if (localEditNoteIdRef.current === noteIdForUpdate) {
          localEditPendingRef.current = false;
          localEditNoteIdRef.current = null;
        }
        updateTimerRef.current = null;
      }, 300); // Update store 300ms after typing stops
    }
  };

  const handlePropertiesApply = useCallback(
    async (nextMarkdown) => {
      if (!currentNoteId) return;

      setMarkdown(nextMarkdown);
      setDebouncedMarkdown(nextMarkdown);
      updateNote(currentNoteId, nextMarkdown);
      localEditPendingRef.current = false;
      localEditNoteIdRef.current = null;
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
        updateTimerRef.current = null;
      }

      if (noteConflict) {
        setShowProperties(false);
        addNotification("Properties updated. Resolve the conflict before saving.", "info");
        return;
      }

      const note = getCurrentNote();
      if (!note?.filePath) {
        setShowProperties(false);
        addNotification("Properties updated. Save is unavailable for this note.", "info");
        return;
      }

      setIsSaving(true);
      try {
        await saveCurrentNoteToDisk();
        setShowSavedIndicator(true);
        if (savedIndicatorTimerRef.current) {
          clearTimeout(savedIndicatorTimerRef.current);
        }
        savedIndicatorTimerRef.current = setTimeout(() => {
          setShowSavedIndicator(false);
        }, 2000);
        setShowProperties(false);
        addNotification("Properties saved", "success");
      } catch (error) {
        console.error("Failed to save properties:", error);
        addNotification(`Properties updated but save failed: ${error.message}`, "error");
      } finally {
        setIsSaving(false);
      }
    },
    [
      currentNoteId,
      updateNote,
      noteConflict,
      getCurrentNote,
      saveCurrentNoteToDisk,
      addNotification,
    ]
  );

  const insertMarkdown = (before, after = "", placeholder = "") => {
    if (!editorRef.current) return;

    const view = editorRef.current.getView();
    if (!view) return;

    const { from, to } = view.state.selection.main;
    const selectedText = view.state.sliceDoc(from, to);
    const replacement = before + (selectedText || placeholder) + after;

    // Calculate new cursor position
    const newCursorPos = from + before.length + (selectedText || placeholder).length;

    view.dispatch({
      changes: { from, to, insert: replacement },
      selection: { anchor: newCursorPos },
      scrollIntoView: true,
    });

    view.focus();
  };

  // Memoize preview HTML - only recalculate when debouncedMarkdown changes
  const previewHtml = useMemo(() => {
    try {
      // Use debouncedMarkdown to avoid expensive parsing on every keystroke
      const safeMarkdown = debouncedMarkdown || "";
      return { __html: renderMarkdownPreview(safeMarkdown) };
    } catch (error) {
      console.error("Markdown rendering error:", error);
      return { __html: "<p>Error rendering markdown</p>" };
    }
  }, [debouncedMarkdown]);

  // Memoize status bar calculations - only recalculate when debouncedMarkdown changes
  const statusBarStats = useMemo(() => {
    const text = debouncedMarkdown || "";
    const words = text
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0);
    const paragraphs = text.split(/\n{2,}/).filter((block) => block.trim().length > 0);
    return {
      wordCount: words.length,
      charCount: text.length,
      paragraphCount: paragraphs.length,
      readTime: Math.ceil(words.length / 200),
    };
  }, [debouncedMarkdown]);

  // Isolate mixed-direction runs in the rendered preview. `dir="auto"` on each
  // block only picks a base direction; without isolation the neutral characters
  // between an English and a Persian phrase get reordered and the line becomes
  // unreadable. Runs before the checkbox/mermaid effects so they see final DOM.
  useEffect(() => {
    if (viewMode !== "read") return;
    const container = document.querySelector(".markdown-preview");
    if (!container) return;
    isolateBidiRuns(container);
  }, [previewHtml, viewMode]);

  // Handle interactive checkboxes in preview - use debouncedMarkdown to avoid running on every keystroke
  useEffect(() => {
    // Only the rendered Read view uses these DOM checkboxes; Live mode toggles
    // tasks via its own CodeMirror widget.
    if (viewMode !== "read") return;

    const container = document.querySelector(".markdown-preview");
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
          const newState = currentState === " " ? "x" : " ";
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
      checkbox.style.cursor = "pointer";

      const listener = () => {
        handleCheckboxChange(index);
      };

      checkbox.addEventListener("change", listener);
    });

    // Cleanup not strictly necessary for innerHTML replacements but good for safety
    return () => {
      // interactive elements are destroyed on next render
    };
  }, [debouncedMarkdown, viewMode]); // Use debouncedMarkdown instead of markdown

  // Handle copy button clicks on code blocks - use debouncedMarkdown to avoid running on every keystroke
  useEffect(() => {
    const container = document.querySelector(".markdown-preview");
    if (!container) return;

    const handleCopyClick = async (e) => {
      const btn = e.target.closest(".code-copy-btn");
      if (!btn) return;

      const code = btn.getAttribute("data-code");
      if (!code) return;

      try {
        await navigator.clipboard.writeText(code);
        const copyIcon = btn.querySelector(".copy-icon");
        const checkIcon = btn.querySelector(".check-icon");
        if (copyIcon && checkIcon) {
          copyIcon.style.display = "none";
          checkIcon.style.display = "block";
          setTimeout(() => {
            copyIcon.style.display = "block";
            checkIcon.style.display = "none";
          }, 2000);
        }
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    };

    container.addEventListener("click", handleCopyClick);
    return () => container.removeEventListener("click", handleCopyClick);
  }, [debouncedMarkdown, viewMode]); // Use debouncedMarkdown instead of markdown

  // Render mermaid diagrams after preview HTML is in the DOM
  useEffect(() => {
    if (viewMode !== "read") return;

    const container = document.querySelector(".markdown-preview");
    if (!container) return;

    const mermaidElements = container.querySelectorAll(".mermaid");
    if (mermaidElements.length === 0) return;

    getMermaid()
      .then((mermaid) => {
        // Re-initialize with current theme before rendering
        const isDark = document.documentElement.getAttribute("data-theme") !== "light";
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? "dark" : "default",
          securityLevel: "strict",
          fontFamily: "inherit",
        });
        mermaid.run({ nodes: mermaidElements }).catch((err) => {
          console.error("Mermaid rendering failed:", err);
        });
      })
      .catch((err) => {
        console.error("Failed to load mermaid:", err);
      });
  }, [debouncedMarkdown, viewMode]);

  const handlePreviewClick = useCallback(
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      // Handle anchor links (e.g., [Text](#heading-id)) — scroll preview to heading
      const anchorLink = target.closest('a[href^="#"]');
      if (anchorLink && !anchorLink.hasAttribute("data-wikilink-target")) {
        event.preventDefault();
        event.stopPropagation();
        const targetId = anchorLink.getAttribute("href").substring(1);
        if (targetId) {
          const previewContainer = target.closest(".markdown-preview");
          const targetElement = previewContainer?.querySelector(`#${CSS.escape(targetId)}`);
          if (targetElement) {
            targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }
        return;
      }

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

      // Show modal to create new note
      setPendingNoteName(linkTarget);
      setShowCreateNoteModal(true);
    },
    [findNoteByLinkTarget, rootFolderPath, selectNote, addNotification]
  );

  const handleCreateNoteFromLink = useCallback(
    async (noteName) => {
      try {
        const newId = await createNote(null, null, noteName);
        if (newId) {
          selectNote(newId);
          addNotification(`Note "${noteName}" created successfully`, "success");
        }
      } catch (error) {
        console.error("Failed to create note from link:", error);
        if (/workspace/i.test(error.message)) {
          setShowWorkspaceModal(true);
        } else {
          addNotification(`Failed to create note: ${error.message}`, "error");
        }
      }
    },
    [createNote, selectNote, addNotification]
  );

  // Handle TOC header click - scroll to line in editor and preview
  const handleTOCHeaderClick = useCallback(
    (header) => {
      // Scroll editor to the header line
      if (editorRef.current) {
        const lines = markdown.split("\n");
        let position = 0;
        for (let i = 0; i < header.line - 1 && i < lines.length; i++) {
          position += lines[i].length + 1; // +1 for newline
        }
        editorRef.current.scrollToPosition(position);
      }

      // Also scroll preview to the heading anchor if visible
      if (viewMode === "read") {
        const previewContainer = document.querySelector(".markdown-preview");
        if (previewContainer && header.id) {
          const targetElement = previewContainer.querySelector(`#${CSS.escape(header.id)}`);
          if (targetElement) {
            targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }
      }
    },
    [markdown, viewMode]
  );

  // Keep the outline rail in sync with what's at the top of the viewport.
  // Source/Live ask CodeMirror which document position sits at the pane's top
  // edge; Read walks the rendered headings and picks the last one above it.
  useEffect(() => {
    const pane = viewMode === "read" ? previewPaneRef.current : editorPaneRef.current;
    if (!pane) return undefined;

    let frame = null;

    const measure = () => {
      frame = null;
      const rect = pane.getBoundingClientRect();
      const probeY = rect.top + 6;

      if (viewMode === "read") {
        const nodes = pane.querySelectorAll("h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]");
        let line = 1;
        let index = 0;
        for (const node of nodes) {
          index += 1;
          if (node.getBoundingClientRect().top <= probeY + 4) line = index;
          else break;
        }
        // Read mode has no document lines to point at, so translate the
        // heading's ordinal back into its source line.
        const headings = parseHeadings(markdown);
        setOutlineLine(headings[line - 1]?.line ?? 1);
        return;
      }

      const view = editorRef.current?.getView?.();
      if (!view) return;
      const pos = view.posAtCoords({ x: rect.left + 12, y: probeY }, false);
      if (pos == null) return;
      setOutlineLine(view.state.doc.lineAt(pos).number);
    };

    const onScroll = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    pane.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      pane.removeEventListener("scroll", onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [viewMode, markdown, focusMode]);

  const currentNote = getCurrentNote();

  // Page header chrome (emoji + title + tags) derived from frontmatter / content
  // Sync editor content when external actions (e.g. Tag Manager / restore) update the current note.
  useEffect(() => {
    const hasPendingLocalEdit =
      localEditPendingRef.current && localEditNoteIdRef.current === currentNoteId;
    if (!currentNote || hasUnsavedChanges || hasPendingLocalEdit) return;
    const nextContent = currentNote.content || "";
    if (nextContent !== markdown) {
      setMarkdown(nextContent);
      setDebouncedMarkdown(nextContent);
    }
  }, [currentNoteId, currentNote?.content, hasUnsavedChanges, markdown]);

  // Check if we're viewing the settings tab
  if (currentNoteId === SETTINGS_TAB_ID) {
    return (
      <Suspense
        fallback={
          <div className="h-full flex items-center justify-center bg-bg-editor text-sm text-text-muted">
            Loading settings...
          </div>
        }
      >
        <SettingsPage onOpenKeymapsModal={onOpenKeymapsModal} />
      </Suspense>
    );
  }

  if (!currentNote) {
    return (
      <Suspense
        fallback={
          <div className="h-full flex items-center justify-center bg-bg-editor text-sm text-text-muted">
            Loading workspace...
          </div>
        }
      >
        <WorkspaceDashboard />
      </Suspense>
    );
  }

  const viewModeControl = (
    <div
      className="flex items-center gap-0.5 rounded-lg bg-overlay-subtle p-0.5 shrink-0"
      role="group"
      aria-label="Editor view mode"
    >
      {[
        { id: "source", label: "Source" },
        { id: "live", label: "Live" },
        { id: "read", label: "Read" },
      ].map((m) => (
        <button
          key={m.id}
          onClick={() => setViewMode(m.id)}
          aria-pressed={viewMode === m.id}
          aria-label={`Switch to ${m.label} view`}
          className={`rounded-md px-[11px] py-[5px] text-[13px] transition-colors ${
            viewMode === m.id
              ? "bg-accent-dim font-semibold text-accent"
              : "text-text-secondary hover:text-text-primary"
          }`}
          title={`${m.label} view`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );

  const mod = navigator.platform.includes("Mac") ? "⌘" : "Ctrl";
  const actionMenuItems = [
    {
      id: "save",
      label: isSaving ? "Saving…" : "Save",
      shortcut: `${mod}S`,
      disabled: isSaving || !currentNote.filePath,
      title: noteConflict
        ? "Resolve the external conflict first"
        : currentNote.filePath
          ? "Save this note"
          : "This note has no file path yet",
      iconPath:
        "M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4",
      onSelect: handleSave,
    },
    {
      id: "properties",
      label: "Note properties",
      active: showProperties,
      iconPath: "M9 12h6m-6 4h6M8 4h8l4 4v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2z",
      onSelect: () => setShowProperties((v) => !v),
    },
    currentNote.filePath && {
      id: "history",
      label: "Note history",
      iconPath: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
      onSelect: () => setShowHistoryModal(true),
    },
    {
      id: "export",
      label: "Export…",
      iconPath: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4",
      onSelect: () => setShowExportModal(true),
    },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg-editor">
      {/* Header — breadcrumb and view mode only. Everything else that used to
          sit here (Properties / Contents / Save / History / Export) is now one
          "⋯" menu, and the outline moved to the rail on the right edge. */}
      {!focusMode && (
        <div className="h-11 flex items-center gap-3 px-4 shrink-0 z-10 justify-between">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {rootFolderPath && (
              <>
                <button
                  onClick={() => selectNote(null)}
                  className="text-[13px] text-text-muted hover:text-text-primary truncate rounded px-1 py-0.5 transition-colors max-w-[12rem]"
                  title="Workspace home"
                >
                  {rootFolderPath.split("/").filter(Boolean).pop()}
                </button>
                <span className="text-text-muted/60 text-[13px]" aria-hidden="true">
                  /
                </span>
              </>
            )}
            <span className="text-[13px] text-text-primary font-medium truncate">
              {currentNote.name}
            </span>
            {/* One dot carries the whole save story: amber = in flight or
                unsaved, nothing at all = saved and quiet. */}
            {(!currentNote.filePath || hasUnsavedChanges || autosaveStatus === "saving") && (
              <span
                className={`ms-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400 ${
                  autosaveStatus === "saving" ? "animate-pulse" : ""
                }`}
                title={
                  !currentNote.filePath
                    ? "Not saved to disk yet"
                    : autosaveStatus === "saving"
                      ? "Saving…"
                      : "Unsaved changes"
                }
              />
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {viewModeControl}
            <EditorActionsMenu items={actionMenuItems} />
          </div>
        </div>
      )}

      {noteConflict && (
        <div
          className="flex items-center gap-3 border-b border-border bg-overlay-subtle px-4 py-2 shrink-0"
          role="alert"
          aria-live="assertive"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            </svg>
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">
            <span className="font-medium">Changed on disk</span>
            <span className="ml-2 text-text-muted">while you had unsaved edits.</span>
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setShowConflictCompare(true)}
              className="rounded-md px-2.5 py-1 text-[12px] text-text-secondary transition-colors hover:bg-overlay-light hover:text-text-primary"
            >
              Compare
            </button>
            <button
              onClick={handleUseDiskVersion}
              className="rounded-md px-2.5 py-1 text-[12px] text-text-secondary transition-colors hover:bg-overlay-light hover:text-text-primary"
            >
              Load disk
            </button>
            <button
              onClick={handleOverwriteDiskVersion}
              className="rounded-md bg-amber-500 px-2.5 py-1 text-[12px] font-medium text-black transition-opacity hover:opacity-90"
            >
              Overwrite
            </button>
          </div>
        </div>
      )}

      {recoveredDraft && !noteConflict && (
        <div
          className="flex items-center gap-3 border-b border-border bg-accent-dim px-4 py-2 shrink-0"
          role="status"
          aria-live="polite"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
            </svg>
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">
            <span className="font-medium">Unsaved draft recovered</span>
            {recoveredDraft.savedAt && (
              <span className="ml-2 text-text-muted">
                from {new Date(recoveredDraft.savedAt).toLocaleString()}
              </span>
            )}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleDiscardRecoveredDraft}
              className="rounded-md px-2.5 py-1 text-[12px] text-text-secondary transition-colors hover:bg-overlay-light hover:text-text-primary"
            >
              Discard
            </button>
            <button
              onClick={() => {
                if (currentNoteId)
                  saveCurrentNoteToDisk()
                    .then(() => addNotification("Recovered draft saved", "success"))
                    .catch(() => {});
              }}
              className="rounded-md bg-accent px-2.5 py-1 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
            >
              Save draft
            </button>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 min-h-0 overflow-hidden relative editor-container">
        {/* Centered, single-column measure — no bordered card, so the editor
            gets the room. Source/Live/Read all share one calm column. */}
        <div
          className={`h-full ${focusMode ? "flex justify-center" : "mx-auto w-full"}`}
          style={{ "--editor-measure": measure, maxWidth: focusMode ? undefined : measure }}
        >
          <div
            className={`h-full flex overflow-hidden ${focusMode ? "w-full justify-center" : ""}`}
          >
            {showProperties && (
              <Suspense fallback={null}>
                <NotePropertiesPanel
                  markdown={markdown}
                  onApply={handlePropertiesApply}
                  onClose={() => setShowProperties(false)}
                />
              </Suspense>
            )}

            {/* Editor — Source (raw) or Live (inline preview) */}
            {(viewMode === "source" || viewMode === "live") && (
              <EditorScrollFade
                ref={editorPaneRef}
                enabled={!focusMode}
                className={focusMode ? "max-w-3xl mx-auto" : ""}
                overlay={
                  /* Find results sit *outside* the faded scroller — pinned to
                     its top edge, they would otherwise dissolve into the top
                     gradient along with the text behind them. */
                  searchMatches.length > 0 ? (
                    <div
                      className="absolute top-4 right-4 z-20 flex items-center gap-2 bg-bg-sidebar border border-border rounded-lg shadow-lg px-3 py-2"
                      role="search"
                      aria-label="Find results controls"
                    >
                      <span
                        className="text-xs text-text-secondary font-medium"
                        role="status"
                        aria-live="polite"
                      >
                        {currentMatchIndex + 1} of {searchMatches.length}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={previousMatch}
                          className="p-1 hover:bg-overlay-light rounded transition-colors"
                          title="Previous match (Shift+Enter)"
                          aria-label="Go to previous search match"
                        >
                          <svg
                            className="w-4 h-4 text-text-secondary"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 15l7-7 7 7"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={nextMatch}
                          className="p-1 hover:bg-overlay-light rounded transition-colors"
                          title="Next match (Enter)"
                          aria-label="Go to next search match"
                        >
                          <svg
                            className="w-4 h-4 text-text-secondary"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </button>
                      </div>
                      <div className="w-px h-4 bg-border mx-1" />
                      <button
                        onClick={clearSearch}
                        className="p-1 hover:bg-overlay-light rounded transition-colors"
                        title="Clear search (Esc)"
                        aria-label="Clear editor search"
                      >
                        <svg
                          className="w-4 h-4 text-text-secondary"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  ) : null
                }
              >
                <CodeMirrorEditor
                  ref={editorRef}
                  value={markdown}
                  onChange={handleMarkdownChange}
                  onVimModeChange={handleVimModeChange}
                  onSelectionChange={setSelection}
                  placeholder="Write markdown, select text to format, or press / for blocks…"
                  className={focusMode ? "w-full h-full" : "w-full"}
                  autoHeight={!focusMode}
                  enableLineNumbers={showLineNumbers && viewMode === "source"}
                  enableVimMode={vimMode}
                  vimVisualLineMotion={vimVisualLineMotion}
                  enableTypewriterMode={typewriterModeEnabled && focusMode}
                  enableLivePreview={viewMode === "live"}
                  editorSearchKeymap={keymaps.editorSearch}
                  formattingKeymaps={keymaps}
                  getNotes={getNotes}
                  getTags={getAllTags}
                  ariaLabel={`Markdown editor${currentNote?.name ? ` for ${currentNote.name}` : ""}`}
                />
              </EditorScrollFade>
            )}

            {/* Read — fully rendered, non-editable */}
            {viewMode === "read" && (
              <EditorScrollFade
                ref={previewPaneRef}
                className={`bg-bg-editor ${focusMode ? "max-w-3xl mx-auto" : ""}`}
              >
                {/* The 40vh tail matches `.cm-content` in theme.js, so the end
                    of a note can scroll to mid-window in Read mode too. */}
                <div
                  className="w-full px-8 md:px-12 pt-8 pb-[40vh]"
                  onClick={handlePreviewClick}
                  role="region"
                  aria-label={`Markdown preview${currentNote?.name ? ` for ${currentNote.name}` : ""}`}
                >
                  <div
                    className="markdown-preview"
                    dir="auto"
                    dangerouslySetInnerHTML={previewHtml}
                  />
                </div>
              </EditorScrollFade>
            )}
          </div>
        </div>

        {/* Outline — hairline ticks on the right edge, expanding on hover */}
        {!focusMode && (
          <OutlineRail
            markdown={markdown}
            activeLine={outlineLine}
            onSelect={handleTOCHeaderClick}
          />
        )}
      </div>

      {/* Notion-style selection formatting bubble */}
      {viewMode !== "read" && <SelectionToolbar selection={selection} onInsert={insertMarkdown} />}

      {/* Status line — no bar, no border, no fill. Just the counts sitting
          quietly in the bottom corner, plus the Vim mode when it's on. The
          view mode is already visible in the header, so it's dropped here. */}
      {currentNote && !focusMode && (
        <div
          className="shrink-0 flex items-center justify-between gap-4 px-5 pb-2 pt-1 text-[11px] text-text-muted"
          role="status"
          aria-live="polite"
        >
          <span className="flex min-w-0 items-center gap-3 truncate">
            {vimMode && (
              <span
                className={`font-mono font-medium ${
                  vimModeStatus.mode === "insert"
                    ? "text-green-500"
                    : vimModeStatus.mode === "visual"
                      ? "text-blue-500"
                      : vimModeStatus.mode === "replace"
                        ? "text-amber-500"
                        : "text-accent"
                }`}
              >
                {vimModeStatus.mode.toUpperCase()}
              </span>
            )}
            {/* A save confirmation that fades on its own — the header dot only
                shows the *unsaved* state, so this closes the loop. */}
            {showSavedIndicator && <span className="animate-fade-in">Saved</span>}
          </span>
          <span className="flex shrink-0 items-center gap-4 tabular-nums">
            <span>{statusBarStats.wordCount.toLocaleString()} words</span>
            <span>{statusBarStats.charCount.toLocaleString()} characters</span>
            <span>{statusBarStats.paragraphCount.toLocaleString()} paragraphs</span>
          </span>
        </div>
      )}

      {/* Create Note Modal */}
      <CreateNoteModal
        isOpen={showCreateNoteModal}
        onClose={() => setShowCreateNoteModal(false)}
        onConfirm={handleCreateNoteFromLink}
        noteName={pendingNoteName}
      />

      <Suspense fallback={null}>
        {showExportModal && (
          <ExportModal
            isOpen={showExportModal}
            onClose={() => setShowExportModal(false)}
            note={currentNote}
          />
        )}
        {showHistoryModal && (
          <NoteHistoryModal
            isOpen={showHistoryModal}
            onClose={() => setShowHistoryModal(false)}
            note={currentNote}
            onRestore={(content) => {
              if (!currentNoteId) return;
              updateNote(currentNoteId, content);
              setMarkdown(content);
              setDebouncedMarkdown(content);
              setShowHistoryModal(false);
              addNotification("Restored snapshot into editor — save to persist", "success");
            }}
          />
        )}
        {currentNote && noteConflict && (
          <ConflictCompareModal
            isOpen={showConflictCompare}
            noteName={currentNote.name}
            localContent={markdown}
            diskContent={noteConflict.diskContent}
            detectedAt={noteConflict.detectedAt}
            onClose={() => setShowConflictCompare(false)}
            onUseDisk={handleUseDiskVersion}
            onKeepLocal={handleOverwriteDiskVersion}
          />
        )}
      </Suspense>
    </div>
  );
});

MarkdownEditor.displayName = "MarkdownEditor";

export default MarkdownEditor;
