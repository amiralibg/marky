import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import CodeMirrorEditor from "./editor/CodeMirrorEditor";
import EditorScrollFade from "./editor/EditorScrollFade";
import useSettingsStore, {
  applyTheme,
  applyAccentColor,
  applyFontScale,
  normalizeSaveMode,
} from "../store/settingsStore";
import { readMarkdownFile, writeMarkdownFileOnDisk } from "../utils/fileSystem";
import {
  addNoteHistorySnapshot,
  setDraftCacheEntry,
  removeDraftCacheEntry,
} from "../utils/sideStore";
import { setAttachmentContext } from "../utils/attachments";
import { copyDroppedImages, saveImageAttachment } from "../utils/attachmentSaver";
import { useExternalImageDrop } from "../hooks/useExternalImageDrop";

const fileNameOf = (path) => (path || "").replace(/\\/g, "/").split("/").pop() || "Note";

// `getCurrentWindow` throws outright when the Tauri runtime is absent, so it is
// never called bare — the same guard main.jsx uses.
const currentWindow = () => {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
};

/**
 * A window that edits exactly one file.
 *
 * Deliberately *not* a second copy of the app. This window is a view onto one
 * file in a vault another window already has open, so two notes stores would
 * each hold a copy of the same vault and clobber the other's writes. (A window
 * that owns a *different* vault is fine and supported — see `vaultWindows.js`,
 * where the separate `localStorage` key keeps the two apart.) This window never
 * touches the notes store: it reads its file, edits it, and writes it back, so
 * the only shared state is the settings the editor reads to style itself.
 *
 * Coordination with the main window happens through the file itself. Saving
 * here fires the workspace watcher there, which is the same path an edit from
 * any other editor takes — including the existing conflict detection.
 */
const NoteWindow = ({ filePath }) => {
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const contentRef = useRef("");

  // Read-only use of the settings store: this window must never write settings,
  // or it would race the main window over the same persisted key.
  const themeId = useSettingsStore((state) => state.themeId);
  const accentColorId = useSettingsStore((state) => state.accentColorId);
  const fontScale = useSettingsStore((state) => state.fontScale);
  const vimMode = useSettingsStore((state) => state.vimMode);
  const vimVisualLineMotion = useSettingsStore((state) => state.vimVisualLineMotion);
  const showLineNumbers = useSettingsStore((state) => state.showLineNumbers);
  const keymaps = useSettingsStore((state) => state.keymaps);
  const attachmentFolder = useSettingsStore((state) => state.attachmentFolder);
  const saveMode = useSettingsStore((state) => normalizeSaveMode(state.saveMode));
  const autosaveDelay = useSettingsStore((state) => state.autosaveDelay);
  const isAutoSave = saveMode === "auto";

  // This window knows nothing of the workspace — it edits one file — so images
  // resolve against, and are written beside, the note itself.
  setAttachmentContext({ notePath: filePath, vaultRoot: null });

  const handleSaveImage = useCallback(
    async (file) => {
      const { markdown } = await saveImageAttachment({
        file,
        notePath: filePath,
        vaultRoot: null,
        attachmentFolder,
      });
      return markdown;
    },
    [filePath, attachmentFolder]
  );

  // Surfaced in the status bar rather than the error screen: a failed paste is
  // not a reason to take the editor away from someone mid-edit.
  const [imageError, setImageError] = useState(null);

  const handleImageError = useCallback((failure) => {
    setImageError(failure?.message || "Could not add that image.");
  }, []);

  useEffect(() => {
    if (!imageError) return undefined;
    const timer = setTimeout(() => setImageError(null), 5000);
    return () => clearTimeout(timer);
  }, [imageError]);

  const editorRef = useRef(null);

  const handleDropImages = useCallback(
    async (paths, pos) => {
      const view = editorRef.current?.getView();
      if (!view || paths.length === 0) return;

      try {
        const { markdown: links } = await copyDroppedImages({
          paths,
          notePath: filePath,
          vaultRoot: null,
          attachmentFolder,
        });
        if (links.length === 0) return;

        const at = Math.max(0, Math.min(pos ?? view.state.doc.length, view.state.doc.length));
        const line = view.state.doc.lineAt(at);
        const insert = `${at > line.from ? "\n" : ""}${links.join("\n")}${at < line.to ? "\n" : ""}`;

        view.dispatch({
          changes: { from: at, insert },
          selection: { anchor: at + insert.length },
          scrollIntoView: true,
        });
        view.focus();
      } catch (dropError) {
        handleImageError(dropError);
      }
    },
    [filePath, attachmentFolder, handleImageError]
  );

  useExternalImageDrop({
    getView: () => editorRef.current?.getView() ?? null,
    onDropImages: handleDropImages,
  });

  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);

  useEffect(() => {
    applyAccentColor(accentColorId);
  }, [accentColorId]);

  // A note opened in its own window reads the same text size as the main one.
  useEffect(() => {
    applyFontScale(fontScale);
  }, [fontScale]);

  const isDirty = content !== savedContent;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await readMarkdownFile(filePath);
        if (cancelled) return;
        setContent(loaded);
        setSavedContent(loaded);
        contentRef.current = loaded;
        setStatus("ready");
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError?.message || "Could not open this note.");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  // The title bar is the only place this window can show which file it holds.
  useEffect(() => {
    const name = fileNameOf(filePath);
    currentWindow()
      ?.setTitle(isDirty && !isAutoSave ? `• ${name}` : name)
      ?.catch(() => {});
  }, [filePath, isDirty, isAutoSave]);

  const handleChange = useCallback(
    (next) => {
      contentRef.current = next;
      setContent(next);
      // Same on-disk draft store the main window uses, so unsaved work here
      // survives a crash and is recovered by whichever window opens the file.
      setDraftCacheEntry(filePath, next);
    },
    [filePath]
  );

  const save = useCallback(async () => {
    const next = contentRef.current;
    setStatus("saving");
    try {
      await writeMarkdownFileOnDisk(filePath, next);
      addNoteHistorySnapshot(filePath, next);
      removeDraftCacheEntry(filePath);
      setSavedContent(next);
      setStatus("ready");
    } catch (saveError) {
      setError(saveError?.message || "Could not save this note.");
      setStatus("error");
    }
  }, [filePath]);

  // The same auto-save the main window has. Kept local rather than routed
  // through the notes store, because this window deliberately never touches it
  // (see the note above the component).
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    if (!isAutoSave || !isDirty) return undefined;
    const delay = Number.isFinite(autosaveDelay) && autosaveDelay > 0 ? autosaveDelay : 2000;
    const timer = setTimeout(() => {
      void saveRef.current();
    }, delay);
    return () => clearTimeout(timer);
  }, [isAutoSave, isDirty, content, autosaveDelay]);

  // Losing focus or closing the window are save points too — otherwise the file
  // on disk sits behind whatever is on screen for as long as the window is open.
  useEffect(() => {
    if (!isAutoSave) return undefined;

    const onBlur = () => {
      if (contentRef.current !== savedContent) void saveRef.current();
    };
    window.addEventListener("blur", onBlur);

    const appWindow = currentWindow();
    let unlisten = null;
    let closing = false;

    // `onCloseRequested` is absent outside the Tauri runtime.
    appWindow
      ?.onCloseRequested?.(async (event) => {
        if (closing) return;
        closing = true;
        event.preventDefault();
        try {
          await Promise.race([
            saveRef.current(),
            new Promise((resolve) => setTimeout(resolve, 2000)),
          ]);
        } catch (closeError) {
          console.error("Failed to save before closing:", closeError);
        }
        await appWindow.destroy();
      })
      ?.then((off) => {
        unlisten = off;
      })
      ?.catch(() => {});

    // Quitting is an application event, not a window one, so it arrives here
    // rather than through `onCloseRequested`. Every window that was asked to
    // flush has to answer: Rust holds the quit until the last one reports in,
    // so a silent window would stall the quit until its timeout fires.
    let unlistenExit = null;
    listen("app-exit-requested", async () => {
      try {
        if (contentRef.current !== savedContent) await saveRef.current();
      } finally {
        try {
          await invoke("confirm_exit");
        } catch (error) {
          console.error("Failed to confirm exit:", error);
        }
      }
    })
      .then((off) => {
        unlistenExit = off;
      })
      .catch(() => {});

    return () => {
      window.removeEventListener("blur", onBlur);
      unlisten?.();
      unlistenExit?.();
    };
  }, [isAutoSave, savedContent]);

  // Cmd/Ctrl+S saves; Cmd/Ctrl+W closes. Bound on the window rather than in the
  // editor keymap so they work even when focus is outside the text area.
  useEffect(() => {
    const onKeyDown = (event) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      if (event.key === "s") {
        event.preventDefault();
        void save();
      } else if (event.key === "w") {
        event.preventDefault();
        currentWindow()?.close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save]);

  if (status === "loading") {
    return (
      <div className="flex h-full items-center justify-center bg-bg-editor text-sm text-text-muted">
        Opening {fileNameOf(filePath)}…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-bg-editor px-8 text-center">
        <p className="text-sm font-semibold text-text-primary">{fileNameOf(filePath)}</p>
        <p className="text-xs text-text-muted">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-bg-editor">
      {/* Room for the overlay traffic lights on macOS. */}
      <div className="h-10 shrink-0" data-tauri-drag-region />

      <div className="min-h-0 flex-1">
        <EditorScrollFade className="mx-auto w-full max-w-[46rem]">
          <CodeMirrorEditor
            ref={editorRef}
            value={content}
            onChange={handleChange}
            placeholder="Write markdown…"
            className="w-full"
            autoHeight
            enableLineNumbers={showLineNumbers}
            enableVimMode={vimMode}
            vimVisualLineMotion={vimVisualLineMotion}
            enableLivePreview
            formattingKeymaps={keymaps}
            editorSearchKeymap={keymaps?.editorSearch}
            saveImage={handleSaveImage}
            onImageError={handleImageError}
            ariaLabel={`Editor for ${fileNameOf(filePath)}`}
          />
        </EditorScrollFade>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-4 px-5 pb-2 pt-1 text-[11px] text-text-muted">
        <span className="truncate" title={filePath}>
          {fileNameOf(filePath)}
        </span>
        <span>
          {imageError ||
            (status === "saving"
              ? "Saving…"
              : isDirty
                ? isAutoSave
                  ? "Saving…"
                  : "Unsaved — ⌘S"
                : "Saved")}
        </span>
      </div>
    </div>
  );
};

export default NoteWindow;
