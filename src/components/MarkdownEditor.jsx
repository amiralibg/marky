import { useState, useEffect } from "react";
import { marked } from "marked";
import Toolbar from "./Toolbar";
import useNotesStore from "../store/notesStore";
import "./MarkdownPreview.css";

const MarkdownEditor = () => {
  const { currentNoteId, updateNote, getCurrentNote } = useNotesStore();

  const [markdown, setMarkdown] = useState("");
  const [viewMode, setViewMode] = useState("split"); // "editor", "preview", or "split"

  useEffect(() => {
    const currentNote = getCurrentNote();
    if (currentNote) {
      // Handle null content (lazy-loaded notes)
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

  const currentNote = getCurrentNote();

  if (!currentNote) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        <div className="text-center">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-lg">No note selected</p>
          <p className="text-sm mt-2">Select a note from the sidebar or create a new one</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-editor-bg">
      {/* Title Bar */}
      <div className="h-10 border-b border-border flex items-center px-4 bg-titlebar-bg shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm text-text-secondary font-medium">{currentNote.name}</span>
          {currentNote.filePath ? (
            <span className="text-xs text-text-muted truncate">({currentNote.filePath})</span>
          ) : (
            <span className="text-xs text-amber-300 bg-amber-300/10 px-2 py-0.5 rounded">Unsaved</span>
          )}
        </div>

        {/* View Mode Toggles */}
        <div className="flex items-center gap-1 bg-border rounded p-0.5">
          <button
            onClick={() => setViewMode("editor")}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              viewMode === "editor"
                ? "bg-accent text-white"
                : "text-text-secondary hover:bg-border/80"
            }`}
            title="Editor Only"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => setViewMode("split")}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              viewMode === "split"
                ? "bg-accent text-white"
                : "text-text-secondary hover:bg-border/80"
            }`}
            title="Split View"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
            </svg>
          </button>
          <button
            onClick={() => setViewMode("preview")}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              viewMode === "preview"
                ? "bg-accent text-white"
                : "text-text-secondary hover:bg-border/80"
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

      {/* Toolbar */}
      {(viewMode === "editor" || viewMode === "split") && (
        <div className="border-b border-border bg-titlebar-bg shrink-0">
          <Toolbar onInsert={insertMarkdown} />
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 min-h-0 overflow-hidden flex">
        {/* Editor */}
        {(viewMode === "editor" || viewMode === "split") && (
          <div className={`flex flex-col ${viewMode === "split" ? "w-1/2 border-r border-border" : "w-full"}`}>
            <textarea
              className="w-full h-full bg-editor-bg border-none p-6 font-mono text-[14px] leading-relaxed
                       text-text-primary resize-none outline-none placeholder-text-muted
                       editor-textarea"
              value={markdown}
              onChange={(e) => handleMarkdownChange(e.target.value)}
              placeholder="Start typing your markdown here..."
              spellCheck="false"
            />
          </div>
        )}

        {/* Preview */}
        {(viewMode === "preview" || viewMode === "split") && (
          <div className={`flex flex-col bg-editor-bg overflow-y-auto ${viewMode === "split" ? "w-1/2" : "w-full"}`}>
            <div className="p-6">
              <div
                className="markdown-preview prose prose-invert max-w-none"
                dangerouslySetInnerHTML={getPreviewHtml()}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MarkdownEditor;
