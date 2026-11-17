import {
  forwardRef,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import HtmlDocumentView, { HtmlViewModeControl } from "./HtmlDocumentView";
import EditorActionsMenu from "./EditorActionsMenu";
import useNotesStore, { registerPendingEditFlusher } from "../../store/notesStore";
import useUIStore from "../../store/uiStore";
import useSettingsStore, { normalizeHtmlViewMode } from "../../store/settingsStore";
import { openNoteInNewWindow } from "../../utils/noteWindows";

const ExportModal = lazy(() => import("../modals/ExportModal"));
const NoteHistoryModal = lazy(() => import("../modals/NoteHistoryModal"));

const SOURCE_PUSH_DELAY = 300;

const normalizePath = (value) => (value ? value.replace(/\\/g, "/") : "");

/**
 * An HTML document open in the main window: the shared view, wired to the
 * notes store the same way the markdown editor is — content goes through
 * `updateNote` (dirty state, drafts, auto-save, history), Save goes through
 * `saveCurrentNoteToDisk`, and pending typing is drained before any write.
 */
const HtmlDocumentEditor = forwardRef(({ note, focusMode = false }, ref) => {
  const updateNote = useNotesStore((state) => state.updateNote);
  const saveCurrentNoteToDisk = useNotesStore((state) => state.saveCurrentNoteToDisk);
  const selectNote = useNotesStore((state) => state.selectNote);
  const rootFolderPath = useNotesStore((state) => state.rootFolderPath);
  const items = useNotesStore((state) => state.items);
  const isDirty = useNotesStore((state) => state.dirtyNoteIds.includes(note.id));
  const addNotification = useUIStore((state) => state.addNotification);
  const titlebarSlot = useUIStore((state) => state.titlebarSlot);
  const htmlViewMode = useSettingsStore((state) => state.htmlViewMode);
  const setHtmlViewMode = useSettingsStore((state) => state.setHtmlViewMode);
  const runScripts = useSettingsStore((state) => state.htmlRunScripts !== false);
  const saveMode = useSettingsStore((state) => state.saveMode);
  const themeId = useSettingsStore((state) => state.themeId);
  const accentColorId = useSettingsStore((state) => state.accentColorId);
  const vimMode = useSettingsStore((state) => state.vimMode);
  const vimVisualLineMotion = useSettingsStore((state) => state.vimVisualLineMotion);
  const showLineNumbers = useSettingsStore((state) => state.showLineNumbers);
  const keymaps = useSettingsStore((state) => state.keymaps);
  const mode = normalizeHtmlViewMode(htmlViewMode);
  const isAutoSave = saveMode === "auto";

  // Typing in Source stays local and is pushed to the store on a short
  // debounce, like the markdown editor; edits made in place arrive already
  // debounced by the view.
  const [draft, setDraft] = useState(note.content || "");
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const pushTimerRef = useRef(null);
  const pendingPushRef = useRef(false);
  const viewRef = useRef(null);
  const [showExport, setShowExport] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const pushDraft = useCallback(() => {
    if (pushTimerRef.current) {
      clearTimeout(pushTimerRef.current);
      pushTimerRef.current = null;
    }
    if (!pendingPushRef.current) return;
    pendingPushRef.current = false;
    updateNote(note.id, draftRef.current);
  }, [note.id, updateNote]);

  const flush = useCallback(() => {
    viewRef.current?.flushEdits();
    pushDraft();
  }, [pushDraft]);

  useEffect(() => registerPendingEditFlusher(flush), [flush]);
  useEffect(() => () => flush(), [flush]);

  // The store's copy is the truth whenever nothing local is pending: a
  // switch of document, an external change, a restore.
  useEffect(() => {
    if (pendingPushRef.current) return;
    const content = note.content || "";
    if (content !== draftRef.current) setDraft(content);
  }, [note.id, note.content]);

  const handleSourceChange = useCallback(
    (next) => {
      setDraft(next);
      pendingPushRef.current = true;
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
      pushTimerRef.current = setTimeout(pushDraft, SOURCE_PUSH_DELAY);
    },
    [pushDraft]
  );

  const handleEditChange = useCallback(
    (next) => {
      setDraft(next);
      pendingPushRef.current = false;
      updateNote(note.id, next);
    },
    [note.id, updateNote]
  );

  const save = useCallback(async () => {
    flush();
    if (!note.filePath) {
      addNotification("This document has no file yet", "info");
      return;
    }
    try {
      await saveCurrentNoteToDisk();
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1600);
    } catch (error) {
      addNotification(`Failed to save: ${error.message}`, "error");
    }
  }, [flush, note.filePath, saveCurrentNoteToDisk, addNotification]);

  useImperativeHandle(ref, () => ({ save, flush, openExport: () => setShowExport(true) }), [
    save,
    flush,
  ]);

  // ⌘S / Ctrl+S in the app (the frame forwards its own as a message).
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save]);

  const setMode = useCallback(
    (next) => {
      flush();
      setHtmlViewMode(next);
    },
    [flush, setHtmlViewMode]
  );

  const openDocument = useCallback(
    (path) => {
      const target = items.find(
        (item) => item.type === "note" && normalizePath(item.filePath) === normalizePath(path)
      );
      if (target) selectNote(target.id);
      else addNotification("That document isn't in this vault.", "info");
    },
    [items, selectNote, addNotification]
  );

  const notify = useCallback(
    (message, type = "info") => addNotification(message, type),
    [addNotification]
  );

  // The vault-relative folders, for the status line (the last two when deep).
  const folders = (() => {
    const file = normalizePath(note.filePath);
    const root = normalizePath(rootFolderPath).replace(/\/+$/, "");
    if (!file || !root || !file.startsWith(`${root}/`)) return [];
    const parts = file
      .slice(root.length + 1)
      .split("/")
      .slice(0, -1);
    return parts.length > 2 ? ["…", ...parts.slice(-2)] : parts;
  })();
  const fileName = normalizePath(note.filePath).split("/").pop() || `${note.name}.html`;

  const crumbs = (
    <>
      {rootFolderPath && (
        <>
          <button
            type="button"
            onClick={() => selectNote(null)}
            className="-mx-1.5 max-w-[10rem] shrink-0 truncate rounded-control px-1.5 py-1 transition-colors hover:bg-item-hover hover:text-text-primary"
            title="Workspace home"
          >
            {normalizePath(rootFolderPath).split("/").filter(Boolean).pop()}
          </button>
          {folders.map((folder, index) => (
            <span key={`${index}-${folder}`} className="flex min-w-0 items-center gap-1">
              <span aria-hidden="true">/</span>
              <span className="max-w-[8rem] truncate">{folder}</span>
            </span>
          ))}
          <span aria-hidden="true">/</span>
        </>
      )}
      <span className="truncate font-medium text-text-secondary">{fileName}</span>
      {(isAutoSave ? !note.filePath : !note.filePath || isDirty) && (
        <span
          className="ms-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
          title={!note.filePath ? "Not saved to disk yet" : "Unsaved changes"}
        />
      )}
    </>
  );

  const mod = typeof navigator !== "undefined" && navigator.platform.includes("Mac") ? "⌘" : "Ctrl";
  const actions = [
    {
      id: "save",
      label: isAutoSave ? "Save now" : "Save",
      shortcut: `${mod}S`,
      disabled: !note.filePath,
      iconPath:
        "M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4",
      onSelect: save,
    },
    note.filePath && {
      id: "history",
      label: "Document history",
      iconPath: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
      onSelect: () => {
        flush();
        setShowHistory(true);
      },
    },
    note.filePath && {
      id: "window",
      label: "Open in new window",
      iconPath: "M4 6a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM10 10h8v8h-8z",
      onSelect: () => {
        flush();
        openNoteInNewWindow(note.filePath).catch((error) =>
          addNotification(`Could not open a new window: ${error.message}`, "error")
        );
      },
    },
    {
      id: "export",
      label: "Export…",
      iconPath: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4",
      onSelect: () => {
        flush();
        setShowExport(true);
      },
    },
  ];

  return (
    <>
      {titlebarSlot &&
        !focusMode &&
        createPortal(
          <div className="flex items-center gap-2">
            <HtmlViewModeControl mode={mode} onChange={setMode} />
            <EditorActionsMenu items={actions} />
          </div>,
          titlebarSlot
        )}
      <HtmlDocumentView
        ref={viewRef}
        source={draft}
        filePath={note.filePath}
        vaultRoot={rootFolderPath}
        name={note.name}
        mode={mode}
        runScripts={runScripts}
        onChange={mode === "source" ? handleSourceChange : handleEditChange}
        onSave={save}
        onOpenDocument={openDocument}
        notify={notify}
        crumbs={crumbs}
        statusExtra={savedFlash ? <span className="animate-fade-in">Saved</span> : null}
        showStatus={!focusMode}
        themeKey={`${themeId}:${accentColorId}`}
        keymaps={keymaps}
        sourceEditorProps={{
          enableLineNumbers: showLineNumbers,
          enableVimMode: vimMode,
          vimVisualLineMotion,
          editorSearchKeymap: keymaps?.editorSearch,
        }}
      />
      <Suspense fallback={null}>
        {showExport && (
          <ExportModal isOpen={showExport} onClose={() => setShowExport(false)} note={note} />
        )}
        {showHistory && (
          <NoteHistoryModal
            isOpen={showHistory}
            onClose={() => setShowHistory(false)}
            note={note}
            onRestore={(content) => {
              updateNote(note.id, content);
              setDraft(content);
              setShowHistory(false);
              addNotification("Restored snapshot", "success");
            }}
          />
        )}
      </Suspense>
    </>
  );
});

HtmlDocumentEditor.displayName = "HtmlDocumentEditor";

export default HtmlDocumentEditor;
