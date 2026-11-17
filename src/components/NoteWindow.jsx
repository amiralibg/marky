import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import CodeMirrorEditor from "./editor/CodeMirrorEditor";
import EditorScrollFade from "./editor/EditorScrollFade";
import HtmlDocumentView, { HtmlViewModeControl } from "./editor/HtmlDocumentView";
import { isHtmlPath } from "../utils/documentKind";
import { detectPlatform } from "../utils/platform";
import useSettingsStore, {
  applyTheme,
  applyAccentColor,
  applyFontScale,
  applyEditorFontScale,
  applyReadingFont,
  normalizeSaveMode,
} from "../store/settingsStore";
import { readMarkdownFile, writeMarkdownFileOnDisk } from "../utils/fileSystem";
import { applyWindowTranslucency } from "../utils/windowTranslucency";
import {
  addNoteHistorySnapshot,
  setDraftCacheEntry,
  removeDraftCacheEntry,
} from "../utils/sideStore";
import { setAttachmentContext } from "../utils/attachments";
import { copyDroppedImages, saveImageAttachment } from "../utils/attachmentSaver";
import { useExternalImageDrop } from "../hooks/useExternalImageDrop";
import { LoadingState, SkeletonLines } from "./ui/Loading";

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
  const editorFontScale = useSettingsStore((state) => state.editorFontScale);
  const readingFont = useSettingsStore((state) => state.readingFont);
  const translucentWindow = useSettingsStore((state) => state.translucentWindow);
  const translucencyAmount = useSettingsStore((state) => state.translucencyAmount);
  const vimMode = useSettingsStore((state) => state.vimMode);
  const vimVisualLineMotion = useSettingsStore((state) => state.vimVisualLineMotion);
  const showLineNumbers = useSettingsStore((state) => state.showLineNumbers);
  const keymaps = useSettingsStore((state) => state.keymaps);
  const attachmentFolder = useSettingsStore((state) => state.attachmentFolder);
  const saveMode = useSettingsStore((state) => normalizeSaveMode(state.saveMode));
  const autosaveDelay = useSettingsStore((state) => state.autosaveDelay);
  const isAutoSave = saveMode === "auto";
  const runScripts = useSettingsStore((state) => state.htmlRunScripts !== false);
  // An HTML document gets its three views here too. The mode is local: this
  // window must not write settings (see the note above the component).
  const isHtml = isHtmlPath(filePath);
  const [htmlMode, setHtmlMode] = useState("preview");
  const htmlViewRef = useRef(null);
  const [htmlNotice, setHtmlNotice] = useState(null);

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

  useEffect(() => {
    applyEditorFontScale(editorFontScale);
  }, [editorFontScale]);

  useEffect(() => {
    applyReadingFont(readingFont);
  }, [readingFont]);

  // Same window material as the main window, so a note opened on its own
  // reads as part of the same app.
  useEffect(() => {
    applyWindowTranslucency(translucentWindow, translucencyAmount);
  }, [translucentWindow, translucencyAmount]);

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
    htmlViewRef.current?.flushEdits();
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

  // The same desk-and-sheet as the main window: a strip of desk on top (the
  // drag region, and room for the traffic lights on macOS, where it is 52px to
  // centre on them like the main title bar), the sheet
  // floating below it with the 8px gap on the other three sides.
  const frame = (children, controls = null) => (
    <div className="app-shell flex h-full flex-col">
      <div
        className={`flex ${detectPlatform() === "macos" ? "h-[52px]" : "h-12"} shrink-0 items-center justify-end pe-3`}
        data-tauri-drag-region
      >
        {controls}
      </div>
      <div className="sheet mx-2 mb-2 flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );

  if (status === "loading") {
    return frame(
      <LoadingState label={`Opening ${fileNameOf(filePath)}`} className="h-full px-12 py-14">
        <div className="mx-auto max-w-[41rem]">
          <SkeletonLines count={7} />
        </div>
      </LoadingState>
    );
  }

  if (status === "error") {
    return frame(
      <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
        <p className="text-sm font-semibold text-text-primary">{fileNameOf(filePath)}</p>
        <p className="text-xs text-text-muted">{error}</p>
      </div>
    );
  }

  if (isHtml) {
    const saveState =
      htmlNotice ||
      (status === "saving"
        ? "Saving…"
        : isDirty
          ? isAutoSave
            ? "Saving…"
            : "Unsaved — ⌘S"
          : "Saved");
    return frame(
      <HtmlDocumentView
        ref={htmlViewRef}
        source={content}
        filePath={filePath}
        vaultRoot={null}
        name={fileNameOf(filePath)}
        mode={htmlMode}
        runScripts={runScripts}
        onChange={handleChange}
        onSave={() => void save()}
        onOpenDocument={(path) => {
          // This window holds one file; another document opens in the browser.
          setHtmlNotice(`Open ${fileNameOf(path)} from the main window`);
          setTimeout(() => setHtmlNotice(null), 4000);
        }}
        notify={(message) => {
          setHtmlNotice(message);
          setTimeout(() => setHtmlNotice(null), 5000);
        }}
        crumbs={
          <span className="truncate" title={filePath}>
            {fileNameOf(filePath)}
          </span>
        }
        statusExtra={<span className="shrink-0">{saveState}</span>}
        themeKey={`${themeId}:${accentColorId}`}
        keymaps={keymaps}
        sourceEditorProps={{
          enableLineNumbers: showLineNumbers,
          enableVimMode: vimMode,
          vimVisualLineMotion,
          editorSearchKeymap: keymaps?.editorSearch,
        }}
      />,
      <div data-no-drag>
        <HtmlViewModeControl
          mode={htmlMode}
          onChange={(next) => {
            htmlViewRef.current?.flushEdits();
            setHtmlMode(next);
          }}
        />
      </div>
    );
  }

  return frame(
    <>
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

      <div className="flex h-9 shrink-0 items-center justify-between gap-4 px-5 text-[12px] text-text-muted">
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
    </>
  );
};

export default NoteWindow;
