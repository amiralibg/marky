import { useState, useMemo, useEffect } from "react";
import { getNoteHistorySnapshots } from "../../store/notesStore";
import { computeLineDiff } from "../../utils/diff";
import EmptyState from "../ui/EmptyState";
import { Loadable, SkeletonLines, SkeletonRows } from "../ui/Loading";

const formatRelativeTime = (isoString) => {
  if (!isoString) return "Unknown time";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;

  const now = new Date();
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "Just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const countWords = (text) => {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
};

const DiffView = ({ diffLines }) => {
  if (!diffLines || diffLines.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          icon="doc"
          title="No changes"
          body="This snapshot is the same as the note as it is now."
        />
      </div>
    );
  }

  let oldLineNum = 0;
  let newLineNum = 0;

  return (
    <div className="flex-1 overflow-auto custom-scrollbar">
      <table className="diff-table">
        <tbody>
          {diffLines.map((entry, idx) => {
            let leftNum = "";
            let rightNum = "";

            if (entry.type === "equal") {
              oldLineNum++;
              newLineNum++;
              leftNum = oldLineNum;
              rightNum = newLineNum;
            } else if (entry.type === "remove") {
              oldLineNum++;
              leftNum = oldLineNum;
            } else {
              newLineNum++;
              rightNum = newLineNum;
            }

            return (
              <tr
                key={idx}
                className={
                  entry.type === "add"
                    ? "diff-line-add"
                    : entry.type === "remove"
                      ? "diff-line-remove"
                      : "diff-line-equal"
                }
              >
                <td className="diff-gutter diff-gutter-old">{leftNum}</td>
                <td className="diff-gutter diff-gutter-new">{rightNum}</td>
                <td className="diff-indicator">
                  {entry.type === "add" ? "+" : entry.type === "remove" ? "−" : " "}
                </td>
                <td className="diff-content">
                  <span>{entry.line || "\u00A0"}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const NoteHistoryModal = ({ isOpen, onClose, note, onRestore }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmingIndex, setConfirmingIndex] = useState(null);
  const [viewMode, setViewMode] = useState("diff");

  // History moved from localStorage to disk, so this is a read rather than a
  // lookup. While it is in flight the modal shows the list's shape, not the
  // empty state.
  const [snapshots, setSnapshots] = useState([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);

  useEffect(() => {
    if (!isOpen || !note?.filePath) {
      setSnapshots([]);
      setLoadingSnapshots(false);
      return undefined;
    }

    let cancelled = false;
    setLoadingSnapshots(true);
    getNoteHistorySnapshots(note.filePath)
      .catch(() => [])
      .then((loaded) => {
        if (cancelled) return;
        setLoadingSnapshots(false);
        // Skip the latest snapshot (index 0) — it matches the current saved content
        setSnapshots(loaded.slice(1));
        // The list changed under the selection; start from the top rather than
        // pointing at an index the new list may not have.
        setSelectedIndex(0);
        setConfirmingIndex(null);
      });

    return () => {
      cancelled = true;
    };
  }, [note?.filePath, isOpen]);

  const selectedSnapshot = snapshots[selectedIndex] ?? null;

  const diffLines = useMemo(() => {
    if (!isOpen || !note || !selectedSnapshot || viewMode !== "diff") return null;
    const currentContent = note.content || "";
    const snapshotContent = selectedSnapshot.content || "";
    return computeLineDiff(currentContent, snapshotContent);
  }, [isOpen, note, selectedSnapshot, viewMode]);

  const diffStats = useMemo(() => {
    if (!diffLines || diffLines.length === 0) return null;
    let additions = 0;
    let deletions = 0;
    for (const entry of diffLines) {
      if (entry.type === "add") additions++;
      else if (entry.type === "remove") deletions++;
    }
    return { additions, deletions };
  }, [diffLines]);

  if (!isOpen || !note) return null;

  const handleRestore = (index) => {
    const snapshot = snapshots[index];
    if (!snapshot) return;
    if (confirmingIndex === index) {
      onRestore?.(snapshot.content);
      setConfirmingIndex(null);
    } else {
      setConfirmingIndex(index);
    }
  };

  const handleClose = () => {
    setConfirmingIndex(null);
    setSelectedIndex(0);
    setViewMode("diff");
    onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Note history"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="modal-scrim animate-fade-in pointer-events-none" aria-hidden="true" />

      <div className="relative z-10 w-full max-w-5xl max-h-[85vh] flex flex-col glass-panel modal-panel animate-fade-in">
        {/* Header */}
        <div className="modal-header shrink-0 border-b border-border pb-4">
          <div className="min-w-0 flex-1">
            <h2 className="modal-title">Note history</h2>
            <p className="modal-subtitle truncate">
              {note.name} &mdash; {snapshots.length} snapshot{snapshots.length !== 1 ? "s" : ""}{" "}
              saved
            </p>
          </div>
          <button onClick={handleClose} className="icon-btn" aria-label="Close">
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
        </div>

        {loadingSnapshots || snapshots.length === 0 ? (
          <Loadable
            loading={loadingSnapshots}
            label="Loading history"
            className="flex-1 min-h-0 flex overflow-hidden"
            placeholder={
              <>
                <div className="w-56 shrink-0 p-2">
                  <SkeletonRows count={6} rowHeight={44} />
                </div>
                <div className="flex-1 p-6">
                  <SkeletonLines count={8} heading={false} />
                </div>
              </>
            }
          >
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon="history"
                title="No history yet"
                body="A snapshot is kept each time this note is saved. Save it once to start its history."
              />
            </div>
          </Loadable>
        ) : (
          <div className="flex-1 min-h-0 flex overflow-hidden">
            {/* Snapshot list sidebar */}
            <div className="w-56 shrink-0 border-e border-border flex flex-col gap-px overflow-y-auto p-2">
              {snapshots.map((snapshot, index) => (
                <button
                  key={snapshot.savedAt + String(index)}
                  onClick={() => {
                    setSelectedIndex(index);
                    setConfirmingIndex(null);
                  }}
                  className={`w-full rounded-control px-3 py-2 text-start transition-colors ${
                    selectedIndex === index
                      ? "bg-item-hover text-text-primary"
                      : "text-text-secondary hover:bg-item-hover hover:text-text-primary"
                  }`}
                >
                  <div className="truncate text-[13px] font-semibold">
                    {`Save ${snapshots.length - index}`}
                  </div>
                  <div
                    className="mt-0.5 truncate text-[12px] text-text-muted"
                    title={new Date(snapshot.savedAt).toLocaleString()}
                  >
                    {formatRelativeTime(snapshot.savedAt)}
                  </div>
                  <div className="mt-0.5 text-[12px] text-text-muted">
                    {countWords(snapshot.content)} words
                  </div>
                </button>
              ))}
            </div>

            {/* Preview pane */}
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
              {selectedSnapshot && (
                <>
                  {/* Snapshot meta bar */}
                  <div className="px-5 py-3 border-b border-border shrink-0 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-[13px] font-semibold text-text-primary">
                        {`Save ${snapshots.length - selectedIndex}`}
                      </span>
                      <span className="text-[12.5px] text-text-muted">
                        {new Date(selectedSnapshot.savedAt).toLocaleString()}
                      </span>

                      {/* Diff stats */}
                      {viewMode === "diff" && diffStats && (
                        <div className="flex items-center gap-2 font-mono text-[11.5px]">
                          <span className="text-green-500">+{diffStats.additions}</span>
                          <span className="text-danger">−{diffStats.deletions}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* View toggle */}
                      <div className="seg" role="group" aria-label="Snapshot view">
                        <button
                          type="button"
                          onClick={() => setViewMode("diff")}
                          aria-pressed={viewMode === "diff"}
                        >
                          Diff
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode("raw")}
                          aria-pressed={viewMode === "raw"}
                        >
                          Raw
                        </button>
                      </div>

                      <button
                        onClick={() => handleRestore(selectedIndex)}
                        className={`btn btn-sm ${confirmingIndex === selectedIndex ? "btn-primary" : ""}`}
                      >
                        {confirmingIndex === selectedIndex
                          ? "Click again to confirm"
                          : "Restore this version"}
                      </button>
                    </div>
                  </div>

                  {/* Content area */}
                  {viewMode === "diff" ? (
                    <DiffView diffLines={diffLines} />
                  ) : (
                    <pre
                      className="flex-1 overflow-auto whitespace-pre-wrap p-5 font-mono text-[12px] leading-relaxed text-text-secondary"
                      dir="auto"
                    >
                      {selectedSnapshot.content || (
                        <span className="italic text-text-muted">(empty note)</span>
                      )}
                    </pre>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NoteHistoryModal;
