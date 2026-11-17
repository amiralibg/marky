import { useMemo, useRef, useState } from "react";
import EmptyState from "../ui/EmptyState";
import useNotesStore from "../../store/notesStore";
import useSettingsStore from "../../store/settingsStore";
import useUIStore from "../../store/uiStore";
import useModalAccessibility from "../../hooks/useModalAccessibility";
import { deleteEntryOnDisk } from "../../utils/fileSystem";
import {
  baseNameOf,
  getIndexedAttachments,
  isImagePath,
  toAssetUrl,
} from "../../utils/attachments";
import { buildAttachmentUsageMap } from "../../utils/attachmentUsage";
import ConfirmDialog from "./ConfirmDialog";

/**
 * One place to see every file the vault carries around: which notes use it,
 * and which files nobody uses anymore.
 */
const AttachmentManagerModal = ({ isOpen, onClose }) => {
  const items = useNotesStore((state) => state.items);
  const rootFolderPath = useNotesStore((state) => state.rootFolderPath);
  const refreshRootFromDisk = useNotesStore((state) => state.refreshRootFromDisk);
  const selectNote = useNotesStore((state) => state.selectNote);
  const attachmentFolder = useSettingsStore((state) => state.attachmentFolder);
  const { addNotification } = useUIStore();

  const [query, setQuery] = useState("");
  const [selectedPath, setSelectedPath] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const dialogRef = useRef(null);
  const searchRef = useRef(null);
  useModalAccessibility(isOpen, dialogRef, searchRef);

  const attachments = useMemo(() => getIndexedAttachments(), [items, isOpen]);

  const knownPaths = useMemo(
    () => new Set(attachments.map((path) => path.toLowerCase())),
    [attachments]
  );

  const usageMap = useMemo(
    () =>
      buildAttachmentUsageMap(
        items.filter((entry) => entry.type === "note"),
        { vaultRoot: rootFolderPath, knownPaths }
      ),
    [items, rootFolderPath, knownPaths]
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = needle
      ? attachments.filter((path) => baseNameOf(path).toLowerCase().includes(needle))
      : attachments;
    return [...list].sort((a, b) => {
      const usedA = usageMap.has(a) ? 1 : 0;
      const usedB = usageMap.has(b) ? 1 : 0;
      // Unused first — the whole point is spotting what can go.
      if (usedA !== usedB) return usedA - usedB;
      return a.localeCompare(b);
    });
  }, [attachments, query, usageMap]);

  const selected = selectedPath && knownPaths.has(selectedPath.toLowerCase()) ? selectedPath : null;
  const usedBy = selected ? (usageMap.get(selected) ?? []) : [];
  const relativePath =
    selected && rootFolderPath && selected.startsWith(`${rootFolderPath}/`)
      ? selected.slice(rootFolderPath.length + 1)
      : selected;

  if (!isOpen || !rootFolderPath) return null;

  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      addNotification(label, "success", 1800);
    } catch (error) {
      addNotification("Could not copy: " + error.message, "error");
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteEntryOnDisk(pendingDelete);
      await refreshRootFromDisk();
      addNotification("Attachment deleted", "success");
      setSelectedPath(null);
    } catch (error) {
      addNotification("Failed to delete: " + error.message, "error");
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Attachment manager"
    >
      <div className="modal-scrim animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        className="relative z-10 w-full max-w-3xl max-h-[80vh] flex flex-col glass-panel modal-panel animate-fade-in"
      >
        {/* Header */}
        <div className="modal-header shrink-0 pb-3">
          <div className="flex-1 min-w-0">
            <h2 className="modal-title">Attachments</h2>
            <p className="modal-subtitle">
              {attachments.length} file{attachments.length !== 1 ? "s" : ""} in{" "}
              <span className="font-mono">{attachmentFolder || "the workspace root"}</span> ·{" "}
              {usageMap.size} referenced
            </p>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label="Close attachment manager">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {attachments.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon="attachment"
              title="No attachments yet"
              body="Drop or paste an image into a note and it lands here, ready to reuse."
            />
          </div>
        ) : !selected ? (
          /* Gallery: every attachment visible at a glance. Picking one opens
             the detail view below. */
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-5 pt-4 pb-3">
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by name"
                aria-label="Filter attachments by name"
                className="field"
              />
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar px-5 pb-5">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3">
                {visible.map((path) => {
                  const uses = usageMap.get(path)?.length ?? 0;
                  return (
                    <button
                      key={path}
                      onClick={() => setSelectedPath(path)}
                      className="group overflow-hidden rounded-card bg-item-active text-start shadow-[0_0_0_1px_var(--color-border)] transition-shadow hover:shadow-[0_0_0_1px_var(--color-border-light)]"
                      title={path}
                    >
                      <span className="block aspect-square w-full overflow-hidden bg-overlay-subtle">
                        {isImagePath(path) ? (
                          <img
                            src={toAssetUrl(path)}
                            alt=""
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="w-full h-full flex items-center justify-center">
                            <svg
                              className="w-8 h-8 text-text-muted"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.5}
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"
                              />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5" />
                            </svg>
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-1.5 px-2.5 py-2">
                        <span className="min-w-0 flex-1 truncate text-[12px] text-text-secondary transition-colors group-hover:text-text-primary">
                          {baseNameOf(path)}
                        </span>
                        {uses === 0 ? (
                          <span
                            className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-500/80"
                            title="Not referenced by any note"
                          />
                        ) : (
                          <span className="shrink-0 text-[11px] tabular-nums text-text-muted">
                            {uses}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
              {visible.length === 0 && (
                <EmptyState
                  icon="filter"
                  title="No attachments match"
                  body={`No file name contains “${query.trim()}”.`}
                  action={{ label: "Clear filter", onClick: () => setQuery("") }}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex min-h-0">
            {/* File list */}
            <div className="w-64 shrink-0 border-e border-border flex flex-col min-h-0">
              <div className="px-3 pt-3 pb-2">
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter by name"
                  aria-label="Filter attachments by name"
                  className="field h-9"
                />
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-2 space-y-px">
                {visible.map((path) => {
                  const uses = usageMap.get(path)?.length ?? 0;
                  const isSelected = selected === path;
                  return (
                    <button
                      key={path}
                      onClick={() => setSelectedPath(path)}
                      className={`palette-row min-h-9 gap-2 px-2 text-[13px] ${isSelected ? "is-selected" : ""}`}
                      title={path}
                    >
                      {isImagePath(path) ? (
                        <img
                          src={toAssetUrl(path)}
                          alt=""
                          loading="lazy"
                          className="h-7 w-7 shrink-0 rounded-control bg-overlay-subtle object-cover"
                        />
                      ) : (
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-overlay-subtle">
                          <svg
                            className="w-3.5 h-3.5 text-text-muted"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.75}
                              d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"
                            />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5" />
                          </svg>
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate">{baseNameOf(path)}</span>
                      {uses > 0 ? (
                        <span className="shrink-0 text-[11px] tabular-nums text-text-muted">
                          {uses}
                        </span>
                      ) : (
                        <span
                          className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-500/80"
                          title="Not referenced by any note"
                        />
                      )}
                    </button>
                  );
                })}
                {visible.length === 0 && (
                  <EmptyState
                    compact
                    icon="filter"
                    title="No attachments match"
                    action={{ label: "Clear filter", onClick: () => setQuery("") }}
                  />
                )}
              </div>
            </div>

            {/* Detail */}
            <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-5">
              {!selected ? (
                <div className="h-full flex items-center justify-center text-center">
                  <p className="text-[12.5px] text-text-muted max-w-[16rem] leading-relaxed">
                    Select a file to see where it is used.
                    <br />
                    The amber dot marks files no note references.
                  </p>
                </div>
              ) : (
                <>
                  <button onClick={() => setSelectedPath(null)} className="btn btn-sm -ms-3 mb-2">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                    All attachments
                  </button>
                  {isImagePath(selected) && (
                    <div className="mb-4 flex max-h-56 items-center justify-center overflow-hidden rounded-card bg-overlay-subtle">
                      <img
                        src={toAssetUrl(selected)}
                        alt={baseNameOf(selected)}
                        className="max-w-full max-h-56 object-contain"
                      />
                    </div>
                  )}

                  <p
                    className="text-sm font-medium text-text-primary truncate"
                    title={baseNameOf(selected)}
                  >
                    {baseNameOf(selected)}
                  </p>
                  <p className="mt-1 break-all font-mono text-[11.5px] text-text-muted">
                    {relativePath}
                  </p>

                  <div className="flex flex-wrap gap-2 mt-4">
                    <button
                      onClick={() =>
                        copyText(`![[${baseNameOf(selected)}]]`, "Embed copied — paste into a note")
                      }
                      className="btn btn-sm btn-primary"
                    >
                      Copy embed
                    </button>
                    <button
                      onClick={() => copyText(relativePath, "Path copied")}
                      className="btn btn-sm"
                    >
                      Copy path
                    </button>
                    <button
                      onClick={() => setPendingDelete(selected)}
                      className="btn btn-sm btn-danger ms-auto"
                    >
                      Delete…
                    </button>
                  </div>

                  <h3 className="side-label mt-6 mb-2">
                    Used in{" "}
                    {usedBy.length > 0
                      ? `${usedBy.length} note${usedBy.length !== 1 ? "s" : ""}`
                      : "nowhere"}
                  </h3>
                  {usedBy.length > 0 ? (
                    <ul className="space-y-px">
                      {usedBy.map((note) => (
                        <li key={note.id}>
                          <button
                            onClick={() => {
                              selectNote(note.id);
                              onClose();
                            }}
                            className="palette-row min-h-8 truncate px-2.5 text-[13px]"
                          >
                            {note.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[12.5px] text-text-muted leading-relaxed">
                      No note links to this file. Deleting it will not change any note.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <ConfirmDialog
          isOpen={Boolean(pendingDelete)}
          title="Delete attachment"
          message={
            pendingDelete
              ? `Delete "${baseNameOf(pendingDelete)}" from the workspace?${
                  usedBy.length > 0
                    ? ` ${usedBy.length} note${usedBy.length !== 1 ? "s" : ""} still reference${
                        usedBy.length === 1 ? "s" : ""
                      } it and will show a broken image.`
                    : ""
                } This action cannot be undone.`
              : ""
          }
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setPendingDelete(null)}
        />
      </div>
    </div>
  );
};

export default AttachmentManagerModal;
