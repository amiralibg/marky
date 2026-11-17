import { useState, useMemo } from "react";
import { marked } from "marked";
import useNotesStore from "../../store/notesStore";
import useUIStore from "../../store/uiStore";
import { batchExportNotes } from "../../utils/backup";
import { BusyButton } from "../ui/Loading";

const BatchExportModal = ({ isOpen, onClose }) => {
  const { items, rootFolderPath } = useNotesStore();
  const { addNotification } = useUIStore();

  const [format, setFormat] = useState("md");
  const [scope, setScope] = useState("all");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isExporting, setIsExporting] = useState(false);

  const allNotes = useMemo(
    () => items.filter((item) => item.type === "note" && item.filePath),
    [items]
  );

  if (!isOpen) return null;

  const toggleNote = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === allNotes.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allNotes.map((n) => n.id)));
    }
  };

  const notesToExport = scope === "all" ? allNotes : allNotes.filter((n) => selectedIds.has(n.id));

  const handleExport = async () => {
    if (notesToExport.length === 0) {
      addNotification("No notes selected for export", "warning");
      return;
    }

    setIsExporting(true);
    try {
      const folderName = rootFolderPath ? rootFolderPath.split("/").pop() : "notes";
      const date = new Date().toISOString().slice(0, 10);
      const zipName = `${folderName}-export-${date}.zip`;

      const savedPath = await batchExportNotes(
        notesToExport,
        format,
        rootFolderPath,
        marked,
        zipName
      );

      if (savedPath) {
        addNotification(
          `Exported ${notesToExport.length} note${notesToExport.length !== 1 ? "s" : ""} as ${format.toUpperCase()}`,
          "success"
        );
        onClose();
      }
    } catch (err) {
      console.error("Batch export failed:", err);
      addNotification("Export failed: " + err.message, "error");
    } finally {
      setIsExporting(false);
    }
  };

  const allSelected = selectedIds.size === allNotes.length && allNotes.length > 0;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const segment = (active, onClick, label) => (
    <button type="button" aria-pressed={active} onClick={onClick} className="flex-1">
      {label}
    </button>
  );

  return (
    <>
      <div className="modal-scrim z-50 animate-fade-in" onClick={onClose} aria-hidden="true" />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="glass-panel modal-panel w-full max-w-[560px] max-h-[80vh] flex flex-col pointer-events-auto animate-fade-in"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="batch-export-title"
        >
          <div className="modal-header shrink-0">
            <div className="min-w-0 flex-1">
              <h2 id="batch-export-title" className="modal-title">
                Batch export
              </h2>
              <p className="modal-subtitle">Export several notes as one ZIP archive.</p>
            </div>
            <button type="button" onClick={onClose} className="icon-btn" aria-label="Close">
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

          <div className="shrink-0 space-y-4 px-6 pt-4 pb-3">
            <div>
              <p className="field-label">Format</p>
              <div className="seg flex w-full" role="group" aria-label="Format">
                {segment(format === "md", () => setFormat("md"), "Markdown (.md)")}
                {segment(format === "html", () => setFormat("html"), "HTML (.html)")}
              </div>
            </div>
            <div>
              <p className="field-label">Notes</p>
              <div className="seg flex w-full" role="group" aria-label="Notes">
                {segment(scope === "all", () => setScope("all"), `All notes (${allNotes.length})`)}
                {segment(
                  scope === "selected",
                  () => setScope("selected"),
                  `Selected (${selectedIds.size})`
                )}
              </div>
            </div>
          </div>

          {scope === "selected" && (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
              <label className="palette-row min-h-9 cursor-pointer text-[13px]">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                  className="h-4 w-4 accent-accent"
                />
                <span className="text-text-muted">Select all</span>
              </label>
              <ul>
                {allNotes.map((note) => (
                  <li key={note.id}>
                    <label className="palette-row min-h-9 cursor-pointer text-[13.5px]">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(note.id)}
                        onChange={() => toggleNote(note.id)}
                        className="h-4 w-4 shrink-0 accent-accent"
                      />
                      <span className="truncate text-text-primary" title={note.name} dir="auto">
                        {note.name}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="modal-footer shrink-0 justify-between">
            <p className="ps-1 text-[12.5px] text-text-muted">
              {notesToExport.length} note{notesToExport.length !== 1 ? "s" : ""} in the ZIP
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="btn">
                Cancel
              </button>
              <BusyButton
                onClick={handleExport}
                busy={isExporting}
                disabled={notesToExport.length === 0}
                className="btn btn-primary"
              >
                Export ZIP
              </BusyButton>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default BatchExportModal;
