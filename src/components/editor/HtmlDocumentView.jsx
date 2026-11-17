import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import HtmlFrame from "./HtmlFrame";
import HtmlEditToolbar from "./HtmlEditToolbar";
import CodeMirrorEditor from "./CodeMirrorEditor";
import EditorScrollFade from "./EditorScrollFade";
import { LoadingState, SkeletonLines } from "../ui/Loading";
import { buildFrameDocument, newFrameToken, sandboxFor } from "../../utils/htmlFrame";
import { buildSourceMap } from "../../utils/htmlSourceMap";
import {
  formatShortcuts,
  frameShortcuts,
  sanitizeEditMessage,
  sanitizeKeyMessage,
  sanitizeSelectionMessage,
} from "../../utils/htmlFrameMessages";
import { DEFAULT_KEYMAPS } from "../../store/settingsStore";
import { applyHtmlEdits, describeRefusal } from "../../utils/htmlPatch";
import {
  classifyFrameLink,
  openDocumentInBrowser,
  openExternalUrl,
  resolveDocumentLocation,
} from "../../utils/htmlDocuments";

// Preview / Edit / Source: an eye, a pen, angle brackets (the mockup's
// `.seg.for-html`).
const HTML_VIEW_OPTIONS = [
  {
    id: "preview",
    label: "Preview",
    icon: (
      <>
        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
        <circle cx="12" cy="12" r="2.8" />
      </>
    ),
  },
  { id: "edit", label: "Edit", icon: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /> },
  { id: "source", label: "Source", icon: <path d="m8 7-5 5 5 5M16 7l5 5-5 5" /> },
];

/** The segmented control for an HTML document, replacing Source / Live / Read. */
export const HtmlViewModeControl = ({ mode, onChange }) => (
  <div
    className="flex items-center gap-0.5 rounded-control bg-item-hover p-0.5 shrink-0"
    role="group"
    aria-label="Document view mode"
  >
    {HTML_VIEW_OPTIONS.map((option) => {
      const active = mode === option.id;
      return (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          aria-pressed={active}
          aria-label={`Switch to ${option.label} view`}
          title={`${option.label} view`}
          className={`flex h-7 items-center gap-1.5 rounded-[calc(var(--radius-control)-2px)] px-3 text-[12.5px] transition-[background-color,color] duration-140 ${
            active
              ? "bg-item-active font-semibold text-text-primary shadow-[0_0_0_1px_var(--color-border)]"
              : "font-medium text-text-secondary hover:text-text-primary"
          }`}
        >
          <svg
            className="h-3.5 w-3.5 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {option.icon}
          </svg>
          {option.label}
        </button>
      );
    })}
  </div>
);

const APPLY_DELAY = 200;

/** Hand a shortcut typed inside the frame to the app's own key handling. */
const redispatchKey = (data) => {
  const key = sanitizeKeyMessage(data);
  if (!key) return;
  window.dispatchEvent(new KeyboardEvent("keydown", { ...key, bubbles: true, cancelable: true }));
};

const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const readAccent = () => {
  if (typeof document === "undefined") return "#6d5ce0";
  const value = getComputedStyle(document.documentElement).getPropertyValue("--color-accent");
  return value.trim() || "#6d5ce0";
};

const appOrigin = () => {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return origin && origin !== "null" ? origin : "*";
};

const isMac = () => typeof navigator !== "undefined" && /mac/i.test(navigator.platform || "");

const StatusButton = ({ onClick, icon, children, title }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className="flex h-6 items-center gap-1.5 rounded-[calc(var(--radius-control)-2px)] px-2 text-text-secondary transition-colors hover:bg-item-hover hover:text-text-primary"
  >
    <svg
      className="h-[13px] w-[13px] shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={icon} />
    </svg>
    {children}
  </button>
);

/**
 * An HTML document in one of its three views. Store-agnostic: the main
 * window wires it to the notes store (HtmlDocumentEditor) and a note window
 * to its own file, so both get the same preview, editor and safety rules.
 *
 * @param {object} props
 * @param {string} props.source         The document's current text.
 * @param {string|null} props.filePath
 * @param {string|null} props.vaultRoot
 * @param {"preview"|"edit"|"source"} props.mode
 * @param {boolean} props.runScripts
 * @param {(next: string) => void} props.onChange    The document text changed (edit or source).
 * @param {() => void} [props.onSave]                 The user asked to save from inside the frame.
 * @param {(path: string) => void} [props.onOpenDocument]  A link to another vault document.
 * @param {(message: string, type?: string) => void} props.notify
 */
const HtmlDocumentView = forwardRef(
  (
    {
      source,
      filePath,
      vaultRoot,
      name,
      mode,
      runScripts,
      onChange,
      onSave,
      onOpenDocument,
      notify,
      crumbs = null,
      statusExtra = null,
      showStatus = true,
      themeKey = "",
      sourceEditorProps = {},
      keymaps = DEFAULT_KEYMAPS,
    },
    ref
  ) => {
    const containerRef = useRef(null);
    const previewFrameRef = useRef(null);
    const editFrameRef = useRef(null);
    const sourceRef = useRef(source);
    sourceRef.current = source;
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const notifyRef = useRef(notify);
    notifyRef.current = notify;

    const [location, setLocation] = useState(undefined);
    const [reloadNonce, setReloadNonce] = useState(0);
    const [accent, setAccent] = useState(readAccent);
    const [editBase, setEditBase] = useState(null);
    const [selection, setSelection] = useState(null);
    const [frameBox, setFrameBox] = useState(null);
    const [linkRequested, setLinkRequested] = useState(false);
    const [refusedCount, setRefusedCount] = useState(0);
    // The frame whose page has finished loading (by its channel), for the
    // loading overlay: a large page can take a moment to lay out.
    const [loadedChannel, setLoadedChannel] = useState(null);

    const pendingRef = useRef(new Map());
    const lastOutputRef = useRef(null);
    const applyTimerRef = useRef(null);
    const notifiedRef = useRef(new Set());
    const throttleRef = useRef(new Map());

    // Where relative URLs in the page resolve. `null` outside the app.
    useEffect(() => {
      let cancelled = false;
      setLocation(undefined);
      resolveDocumentLocation(filePath, vaultRoot)
        .then((value) => {
          if (!cancelled) setLocation(value);
        })
        .catch(() => {
          if (!cancelled) setLocation(null);
        });
      return () => {
        cancelled = true;
      };
    }, [filePath, vaultRoot]);

    useEffect(() => {
      setAccent(readAccent());
    }, [themeKey]);

    const say = useCallback((key, message, type = "info", every = 4000) => {
      const now = Date.now();
      const last = throttleRef.current.get(key) || 0;
      if (now - last < every) return;
      throttleRef.current.set(key, now);
      notifyRef.current?.(message, type);
    }, []);

    // ── Edit: patch the base source with the edits the frame reported ──────
    const editMap = useMemo(
      () => (editBase === null ? null : buildSourceMap(editBase)),
      [editBase]
    );

    const applyPending = useCallback(() => {
      if (applyTimerRef.current) {
        clearTimeout(applyTimerRef.current);
        applyTimerRef.current = null;
      }
      if (editBase === null || !editMap) return;
      const edits = [...pendingRef.current.values()];
      if (edits.length === 0) return;
      const result = applyHtmlEdits(editBase, edits, editMap);
      setRefusedCount(result.refused.length);
      for (const refusal of result.refused) {
        const signature = `${refusal.id}:${refusal.reason}:${pendingRef.current.get(refusal.id)?.html.length}`;
        if (notifiedRef.current.has(signature)) continue;
        notifiedRef.current.add(signature);
        notifyRef.current?.(describeRefusal(refusal.reason), "warning");
      }
      if (result.output !== lastOutputRef.current) {
        lastOutputRef.current = result.output;
        if (result.output !== sourceRef.current) onChangeRef.current?.(result.output);
      }
    }, [editBase, editMap]);

    const applyRef = useRef(applyPending);
    applyRef.current = applyPending;

    const scheduleApply = useCallback(() => {
      if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
      applyTimerRef.current = setTimeout(() => applyRef.current(), APPLY_DELAY);
    }, []);

    const resetEditSession = useCallback((base) => {
      pendingRef.current = new Map();
      notifiedRef.current = new Set();
      lastOutputRef.current = base;
      setRefusedCount(0);
      setSelection(null);
      setEditBase(base);
    }, []);

    // Entering Edit snapshots the source the frame is built from; leaving
    // writes out whatever is pending first.
    useEffect(() => {
      if (mode === "edit") {
        resetEditSession(sourceRef.current);
        return () => {
          applyRef.current();
          resetEditSession(null);
        };
      }
      return undefined;
    }, [mode, resetEditSession]);

    // The file changed underneath (an external edit, a restore from history).
    // With nothing of the user's applied yet, rebuild from it; with edits in
    // flight the store keeps the user's text (as it does for notes), and the
    // next save writes it.
    useEffect(() => {
      if (mode !== "edit" || editBase === null) return;
      if (source === lastOutputRef.current || source === editBase) return;
      if (lastOutputRef.current !== editBase) return;
      resetEditSession(source);
    }, [source, mode, editBase, resetEditSession]);

    useEffect(
      () => () => {
        if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
      },
      []
    );

    const reload = useCallback(() => {
      if (mode === "edit") {
        applyRef.current();
        resetEditSession(sourceRef.current);
      }
      setReloadNonce((n) => n + 1);
    }, [mode, resetEditSession]);

    useImperativeHandle(ref, () => ({ flushEdits: () => applyRef.current(), reload }), [reload]);

    // ── Frames ─────────────────────────────────────────────────────────────
    // The app's shortcuts under the user's keymaps, handed to each frame's
    // agent so they work with focus inside the page. Keyed by value: a new
    // keymaps object with the same bindings must not rebuild the frame.
    const shortcutsKey = JSON.stringify({
      app: frameShortcuts(keymaps),
      format: formatShortcuts(keymaps),
    });
    const shortcuts = useMemo(() => JSON.parse(shortcutsKey), [shortcutsKey]);

    const ready = location !== undefined;
    const previewFrame = useMemo(() => {
      if (mode !== "preview" || !ready) return null;
      const channel = newFrameToken();
      return {
        channel,
        sandbox: sandboxFor("preview"),
        srcDoc: buildFrameDocument(source, {
          kind: "preview",
          baseHref: location?.baseHref || "",
          documentOrigin: location?.origin || "",
          runScripts,
          channel,
          nonce: newFrameToken(),
          parentOrigin: appOrigin(),
          shortcuts: shortcuts.app,
        }),
      };
      // `reloadNonce` rebuilds the page so its scripts run again.
    }, [mode, ready, source, location, runScripts, reloadNonce, shortcuts]);

    const editFrame = useMemo(() => {
      if (mode !== "edit" || !ready || editBase === null || !editMap) return null;
      const channel = newFrameToken();
      const nonce = newFrameToken();
      return {
        channel,
        sandbox: sandboxFor("edit"),
        srcDoc: buildFrameDocument(editBase, {
          kind: "edit",
          baseHref: location?.baseHref || "",
          documentOrigin: location?.origin || "",
          channel,
          nonce,
          parentOrigin: appOrigin(),
          accent,
          mac: isMac(),
          map: editMap,
          shortcuts: shortcuts.app,
          format: shortcuts.format,
        }),
      };
    }, [mode, ready, editBase, editMap, location, accent, reloadNonce, shortcuts]);

    const onPreviewMessage = useCallback(
      (data) => {
        if (data.type === "key") {
          redispatchKey(data);
          return;
        }
        if (data.type !== "link") return;
        const decision = classifyFrameLink(data.href, location);
        if (decision.action === "external") {
          openExternalUrl(decision.url).catch((error) =>
            notifyRef.current?.(`Couldn't open the link: ${error?.message || error}`, "error")
          );
        } else if (decision.action === "document") {
          onOpenDocument?.(decision.path);
        } else if (decision.reason === "not-a-document") {
          say("link-file", "That link points to a file Marky doesn't open.", "info");
        } else {
          say("link-other", "This kind of link doesn't open from a document.", "info");
        }
      },
      [location, onOpenDocument, say]
    );

    const measureFrame = useCallback(() => {
      const frame = editFrameRef.current?.element?.();
      const container = containerRef.current;
      if (!frame || !container) return;
      const f = frame.getBoundingClientRect();
      const c = container.getBoundingClientRect();
      setFrameBox({ top: f.top - c.top, left: f.left - c.left, width: f.width });
    }, []);

    const onEditMessage = useCallback(
      (data) => {
        switch (data.type) {
          case "edit": {
            const edit = sanitizeEditMessage(data);
            if (!edit) return;
            pendingRef.current.set(edit.id, edit);
            scheduleApply();
            return;
          }
          case "selection": {
            const next = sanitizeSelectionMessage(data);
            if (next) measureFrame();
            setSelection(next);
            return;
          }
          case "locked":
            say(
              "locked",
              describeRefusal(typeof data.reason === "string" ? data.reason : "unsound"),
              "warning"
            );
            return;
          case "save":
            applyRef.current();
            onSave?.();
            return;
          case "request-link":
            setLinkRequested(true);
            return;
          case "key":
            redispatchKey(data);
            return;
          default:
        }
      },
      [measureFrame, onSave, say, scheduleApply]
    );

    useEffect(() => {
      if (mode !== "edit") return undefined;
      window.addEventListener("resize", measureFrame);
      return () => window.removeEventListener("resize", measureFrame);
    }, [mode, measureFrame]);

    // Escape deselects the active block from the app's side too (focus on
    // the toolbar, or back in the app after a click outside the frame). The
    // frame handles its own Escape; the link field closes itself first.
    const blockActive = Boolean(selection?.active);
    useEffect(() => {
      if (mode !== "edit" || !blockActive) return undefined;
      const onKeyDown = (event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        const target = event.target;
        if (target instanceof Element && target.closest("input, textarea, select")) return;
        editFrameRef.current?.post({ type: "deactivate" });
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, [mode, blockActive]);

    const onToolbarCommand = useCallback((name, value) => {
      editFrameRef.current?.post({ type: "command", name, value });
    }, []);

    const handleLinkRequestHandled = useCallback(() => setLinkRequested(false), []);

    const lineSeparator = useMemo(
      () => (mode === "source" && /\r\n/.test(sourceRef.current) ? "\r\n" : null),
      [mode, filePath]
    );

    const size = useMemo(() => new TextEncoder().encode(source || "").length, [source]);

    const openInBrowser = () => {
      if (!filePath) return;
      openDocumentInBrowser(filePath).catch((error) =>
        notifyRef.current?.(`Couldn't open in the browser: ${error?.message || error}`, "error")
      );
    };

    const frameClass = "block h-full w-full border-0 bg-white";
    const activeChannel =
      mode === "preview" ? previewFrame?.channel : mode === "edit" ? editFrame?.channel : null;
    const pageLoading = mode !== "source" && (!activeChannel || loadedChannel !== activeChannel);
    const onPreviewLoad = useCallback(
      () => setLoadedChannel(previewFrame?.channel ?? null),
      [previewFrame?.channel]
    );
    const onEditLoad = useCallback(
      () => setLoadedChannel(editFrame?.channel ?? null),
      [editFrame?.channel]
    );

    return (
      <div className="flex h-full flex-col overflow-hidden bg-bg-editor">
        <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
          {mode === "preview" && previewFrame && (
            <HtmlFrame
              key={`preview:${previewFrame.sandbox}:${reloadNonce}`}
              ref={previewFrameRef}
              srcDoc={previewFrame.srcDoc}
              sandbox={previewFrame.sandbox}
              channel={previewFrame.channel}
              title={`${name || "HTML document"} (preview)`}
              onMessage={onPreviewMessage}
              onLoad={onPreviewLoad}
              className={frameClass}
            />
          )}
          {mode === "edit" && editFrame && (
            <>
              <HtmlFrame
                key={`edit:${reloadNonce}:${editFrame.channel}`}
                ref={editFrameRef}
                srcDoc={editFrame.srcDoc}
                sandbox={editFrame.sandbox}
                channel={editFrame.channel}
                title={`${name || "HTML document"} (editing)`}
                onMessage={onEditMessage}
                onLoad={onEditLoad}
                className={frameClass}
              />
              <HtmlEditToolbar
                selection={selection}
                frameBox={frameBox}
                onCommand={onToolbarCommand}
                linkRequested={linkRequested}
                onLinkRequestHandled={handleLinkRequestHandled}
              />
            </>
          )}
          <LoadingState
            active={pageLoading}
            label="Loading the page"
            className="absolute inset-0 z-[1] bg-bg-editor px-12 py-14"
          >
            <div className="mx-auto max-w-[41rem]">
              <SkeletonLines count={7} />
            </div>
          </LoadingState>
          {mode === "source" && (
            <EditorScrollFade className="h-full">
              <CodeMirrorEditor
                value={source}
                onChange={onChange}
                language="html"
                lineSeparator={lineSeparator}
                placeholder="<!doctype html>"
                className="w-full"
                autoHeight
                ariaLabel={`HTML source${name ? ` for ${name}` : ""}`}
                {...sourceEditorProps}
              />
            </EditorScrollFade>
          )}
        </div>

        {showStatus && (
          <div
            className="flex h-9 shrink-0 items-center gap-4 px-5 text-[12px] text-text-muted"
            role="status"
            aria-live="polite"
          >
            <span className="flex min-w-0 items-center gap-1">{crumbs}</span>
            <span className="flex-1" />
            {mode === "edit" && (
              <span className="flex shrink-0 items-center gap-2 text-text-secondary">
                <i className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                Editing in place · scripts paused
              </span>
            )}
            {mode === "preview" && !runScripts && <span className="shrink-0">Scripts off</span>}
            {mode === "edit" && refusedCount > 0 && (
              <span className="shrink-0 text-danger">
                {refusedCount === 1 ? "1 edit not saved" : `${refusedCount} edits not saved`}
              </span>
            )}
            {statusExtra}
            <span className="shrink-0 tabular-nums">HTML document · {formatSize(size)}</span>
            {mode !== "source" && (
              <StatusButton
                onClick={reload}
                icon="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"
                title="Load the page again"
              >
                Reload
              </StatusButton>
            )}
            {filePath && (
              <StatusButton
                onClick={openInBrowser}
                icon="M14 4.5h5.5V10M19.5 4.5 11 13M17.5 14v4a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V8A1.5 1.5 0 0 1 6 6.5h4"
                title="Open this file in your browser"
              >
                Open in browser
              </StatusButton>
            )}
          </div>
        )}
      </div>
    );
  }
);

HtmlDocumentView.displayName = "HtmlDocumentView";

export default HtmlDocumentView;
