import { useState, useMemo } from "react";
import { getNoteHistorySnapshots } from "../store/notesStore";
import { computeLineDiff } from "../utils/diff";

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
      <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
        <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-green-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-text-primary">No changes</p>
        <p className="text-xs text-text-muted max-w-xs">
          This snapshot is identical to the current note content.
        </p>
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

  const snapshots = useMemo(() => {
    if (!note?.filePath) return [];
    // Skip the latest snapshot (index 0) — it matches the current saved content
    return getNoteHistorySnapshots(note.filePath).slice(1);
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
      aria-label="Note History"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative z-10 w-full max-w-5xl max-h-[85vh] flex flex-col bg-bg-sidebar border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Note History</h2>
            <p className="text-xs text-text-muted mt-0.5">
              {note.name} &mdash; {snapshots.length} snapshot{snapshots.length !== 1 ? "s" : ""}{" "}
              saved
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-overlay-subtle rounded-md transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {snapshots.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
            <div className="w-12 h-12 rounded-full bg-overlay-subtle flex items-center justify-center">
              <svg
                className="w-6 h-6 text-text-muted"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-text-primary">No history yet</p>
            <p className="text-xs text-text-muted max-w-xs">
              Snapshots are saved automatically each time you save this note. Save it once to start
              building history.
            </p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex overflow-hidden">
            {/* Snapshot list sidebar */}
            <div className="w-56 shrink-0 border-r border-border flex flex-col overflow-y-auto custom-scrollbar">
              {snapshots.map((snapshot, index) => (
                <button
                  key={snapshot.savedAt + String(index)}
                  onClick={() => {
                    setSelectedIndex(index);
                    setConfirmingIndex(null);
                  }}
                  className={`w-full text-left px-4 py-3 border-b border-border/50 transition-colors ${
                    selectedIndex === index
                      ? "bg-accent/10 text-accent"
                      : "text-text-secondary hover:bg-overlay-subtle hover:text-text-primary"
                  }`}
                >
                  <div className="text-xs font-medium truncate">
                    {`Save ${snapshots.length - index}`}
                  </div>
                  <div
                    className="text-[11px] text-text-muted mt-0.5 truncate"
                    title={new Date(snapshot.savedAt).toLocaleString()}
                  >
                    {formatRelativeTime(snapshot.savedAt)}
                  </div>
                  <div className="text-[11px] text-text-muted mt-0.5">
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
                      <span className="text-xs font-medium text-text-primary">
                        {`Save ${snapshots.length - selectedIndex}`}
                      </span>
                      <span className="text-xs text-text-muted">
                        {new Date(selectedSnapshot.savedAt).toLocaleString()}
                      </span>

                      {/* Diff stats */}
                      {viewMode === "diff" && diffStats && (
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="text-green-400">+{diffStats.additions}</span>
                          <span className="text-red-400">−{diffStats.deletions}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* View toggle */}
                      <div className="flex items-center gap-0.5 bg-overlay-subtle rounded-md p-0.5 border border-overlay-subtle">
                        <button
                          onClick={() => setViewMode("diff")}
                          className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                            viewMode === "diff"
                              ? "bg-accent/15 text-accent"
                              : "text-text-secondary hover:text-text-primary"
                          }`}
                        >
                          Diff
                        </button>
                        <button
                          onClick={() => setViewMode("raw")}
                          className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                            viewMode === "raw"
                              ? "bg-accent/15 text-accent"
                              : "text-text-secondary hover:text-text-primary"
                          }`}
                        >
                          Raw
                        </button>
                      </div>

                      <button
                        onClick={() => handleRestore(selectedIndex)}
                        className={`shrink-0 px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                          confirmingIndex === selectedIndex
                            ? "bg-accent text-white hover:bg-accent/90"
                            : "bg-overlay-subtle text-text-primary border border-border hover:bg-overlay-light"
                        }`}
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
                    <pre className="flex-1 overflow-auto p-5 text-xs text-text-secondary font-mono whitespace-pre-wrap leading-relaxed custom-scrollbar">
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
