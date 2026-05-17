import { useMemo } from "react";
import { computeLineDiff } from "../../utils/diff";

const buildSideBySideRows = (diffLines) => {
  let draftLine = 0;
  let diskLine = 0;

  return diffLines.map((entry, index) => {
    if (entry.type === "equal") {
      draftLine += 1;
      diskLine += 1;
      return {
        id: index,
        type: "equal",
        draftLine,
        diskLine,
        draftText: entry.line,
        diskText: entry.line,
      };
    }

    if (entry.type === "remove") {
      draftLine += 1;
      return {
        id: index,
        type: "remove",
        draftLine,
        diskLine: "",
        draftText: entry.line,
        diskText: "",
      };
    }

    diskLine += 1;
    return {
      id: index,
      type: "add",
      draftLine: "",
      diskLine,
      draftText: "",
      diskText: entry.line,
    };
  });
};

const lineClass = (type, side) => {
  if (type === "equal") return "bg-transparent";
  if (side === "draft" && type === "remove") return "bg-red-500/10 text-red-100";
  if (side === "disk" && type === "add") return "bg-green-500/10 text-green-100";
  return "bg-overlay-subtle/50 text-text-muted";
};

const ConflictCompareModal = ({
  isOpen,
  noteName,
  localContent,
  diskContent,
  detectedAt,
  onClose,
  onUseDisk,
  onKeepLocal,
}) => {
  const diffLines = useMemo(
    () => computeLineDiff(localContent || "", diskContent || ""),
    [localContent, diskContent]
  );

  const rows = useMemo(() => buildSideBySideRows(diffLines), [diffLines]);

  const stats = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    diffLines.forEach((entry) => {
      if (entry.type === "add") additions += 1;
      if (entry.type === "remove") deletions += 1;
    });
    return { additions, deletions };
  }, [diffLines]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Compare conflicting note versions"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />

      <div className="relative z-10 w-full max-w-6xl max-h-[88vh] flex flex-col bg-bg-sidebar border border-border rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-border shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-text-primary">Compare Conflict</h2>
            <p className="text-xs text-text-muted mt-1 truncate">
              {noteName || "Untitled note"}
              {detectedAt ? ` - detected ${new Date(detectedAt).toLocaleString()}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-overlay-subtle rounded-md transition-colors"
            aria-label="Close conflict comparison"
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

        <div className="px-5 py-3 border-b border-border bg-overlay-subtle/40 shrink-0 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-xs text-text-secondary">
            Review your unsaved draft beside the version currently on disk before choosing a
            resolution.
            <span className="ml-3 text-red-300">-{stats.deletions} draft-only</span>
            <span className="ml-2 text-green-300">+{stats.additions} disk-only</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onUseDisk}
              className="px-3 py-1.5 text-xs rounded-md border border-overlay-light bg-overlay-subtle text-text-primary hover:bg-overlay-light transition-colors"
            >
              Load Disk Version
            </button>
            <button
              onClick={onKeepLocal}
              className="px-3 py-1.5 text-xs rounded-md bg-amber-500 text-black hover:bg-amber-400 transition-colors font-medium"
            >
              Overwrite Disk With Draft
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 border-b border-border bg-bg-base/80 shrink-0">
          <div className="px-4 py-2 border-r border-border">
            <p className="text-xs font-semibold text-text-primary">Current Draft</p>
            <p className="text-[11px] text-text-muted">Unsaved content in Marky</p>
          </div>
          <div className="px-4 py-2">
            <p className="text-xs font-semibold text-text-primary">Disk Version</p>
            <p className="text-[11px] text-text-muted">External file content</p>
          </div>
        </div>

        {rows.length === 0 ? (
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
            <p className="text-sm font-medium text-text-primary">No content differences</p>
            <p className="text-xs text-text-muted max-w-xs">
              The draft and disk version currently match.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto custom-scrollbar">
            <div className="min-w-[900px]">
              {rows.map((row) => (
                <div key={row.id} className="grid grid-cols-2 border-b border-border/40">
                  <div
                    className={`grid grid-cols-[3rem_1fr] border-r border-border/70 ${lineClass(row.type, "draft")}`}
                  >
                    <div className="px-2 py-1 text-right text-[11px] text-text-muted bg-black/10 select-none">
                      {row.draftLine}
                    </div>
                    <pre className="px-3 py-1 text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
                      {row.draftText || "\u00A0"}
                    </pre>
                  </div>
                  <div className={`grid grid-cols-[3rem_1fr] ${lineClass(row.type, "disk")}`}>
                    <div className="px-2 py-1 text-right text-[11px] text-text-muted bg-black/10 select-none">
                      {row.diskLine}
                    </div>
                    <pre className="px-3 py-1 text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
                      {row.diskText || "\u00A0"}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConflictCompareModal;
