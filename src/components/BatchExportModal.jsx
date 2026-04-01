import { useState, useMemo } from 'react';
import { marked } from 'marked';
import useNotesStore from '../store/notesStore';
import useUIStore from '../store/uiStore';
import { batchExportNotes } from '../utils/backup';

const BatchExportModal = ({ isOpen, onClose }) => {
  const { items, rootFolderPath } = useNotesStore();
  const { addNotification } = useUIStore();

  const [format, setFormat] = useState('md');
  const [scope, setScope] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isExporting, setIsExporting] = useState(false);

  const allNotes = useMemo(
    () => items.filter((item) => item.type === 'note' && item.filePath),
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

  const notesToExport = scope === 'all' ? allNotes : allNotes.filter((n) => selectedIds.has(n.id));

  const handleExport = async () => {
    if (notesToExport.length === 0) {
      addNotification('No notes selected for export', 'warning');
      return;
    }

    setIsExporting(true);
    try {
      const folderName = rootFolderPath ? rootFolderPath.split('/').pop() : 'notes';
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
          `Exported ${notesToExport.length} note${notesToExport.length !== 1 ? 's' : ''} as ${format.toUpperCase()}`,
          'success'
        );
        onClose();
      }
    } catch (err) {
      console.error('Batch export failed:', err);
      addNotification('Export failed: ' + err.message, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const allSelected = selectedIds.size === allNotes.length && allNotes.length > 0;
  const someSelected = selectedIds.size > 0 && !allSelected;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fadeIn"
        onClick={onClose}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="glass-panel border-glass-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col pointer-events-auto animate-slideUp"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b border-glass-border px-6 py-4 flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-xl font-semibold text-text-primary">Batch Export</h2>
              <p className="text-sm text-text-muted mt-1">Export multiple notes as a ZIP archive</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-overlay-light rounded-lg transition-colors"
              title="Close"
            >
              <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Options */}
          <div className="px-6 pt-5 pb-3 shrink-0 space-y-4">
            {/* Format */}
            <div>
              <p className="text-sm font-medium text-text-secondary mb-2">Output format</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setFormat('md')}
                  className={`flex-1 py-2 px-4 rounded-lg border-2 text-sm font-medium transition-all ${
                    format === 'md'
                      ? 'border-accent bg-accent/10 text-text-primary'
                      : 'border-overlay-light bg-overlay-subtle text-text-secondary hover:bg-overlay-light'
                  }`}
                >
                  Markdown (.md)
                </button>
                <button
                  onClick={() => setFormat('html')}
                  className={`flex-1 py-2 px-4 rounded-lg border-2 text-sm font-medium transition-all ${
                    format === 'html'
                      ? 'border-accent bg-accent/10 text-text-primary'
                      : 'border-overlay-light bg-overlay-subtle text-text-secondary hover:bg-overlay-light'
                  }`}
                >
                  HTML (.html)
                </button>
              </div>
            </div>

            {/* Scope */}
            <div>
              <p className="text-sm font-medium text-text-secondary mb-2">Which notes</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setScope('all')}
                  className={`flex-1 py-2 px-4 rounded-lg border-2 text-sm font-medium transition-all ${
                    scope === 'all'
                      ? 'border-accent bg-accent/10 text-text-primary'
                      : 'border-overlay-light bg-overlay-subtle text-text-secondary hover:bg-overlay-light'
                  }`}
                >
                  All notes ({allNotes.length})
                </button>
                <button
                  onClick={() => setScope('selected')}
                  className={`flex-1 py-2 px-4 rounded-lg border-2 text-sm font-medium transition-all ${
                    scope === 'selected'
                      ? 'border-accent bg-accent/10 text-text-primary'
                      : 'border-overlay-light bg-overlay-subtle text-text-secondary hover:bg-overlay-light'
                  }`}
                >
                  Selected ({selectedIds.size})
                </button>
              </div>
            </div>
          </div>

          {/* Note list (shown when scope === 'selected') */}
          {scope === 'selected' && (
            <div className="flex-1 overflow-y-auto px-6 pb-2 min-h-0 custom-scrollbar">
              <div className="flex items-center gap-2 mb-2 py-1 border-b border-glass-border">
                <input
                  type="checkbox"
                  id="select-all"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected; }}
                  onChange={toggleAll}
                  className="rounded accent-accent"
                />
                <label htmlFor="select-all" className="text-xs text-text-muted cursor-pointer select-none">
                  Select all
                </label>
              </div>
              <ul className="space-y-1">
                {allNotes.map((note) => (
                  <li key={note.id}>
                    <label className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-overlay-light cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(note.id)}
                        onChange={() => toggleNote(note.id)}
                        className="rounded accent-accent shrink-0"
                      />
                      <span
                        className="text-sm text-text-primary truncate"
                        title={note.name}
                      >
                        {note.name}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-overlay-light px-6 py-4 flex justify-between items-center shrink-0">
            <p className="text-xs text-text-muted">
              {notesToExport.length} note{notesToExport.length !== 1 ? 's' : ''} will be exported into a ZIP
            </p>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-overlay-light rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={isExporting || notesToExport.length === 0}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                  isExporting || notesToExport.length === 0
                    ? 'bg-overlay-light text-text-muted cursor-not-allowed'
                    : 'bg-accent hover:bg-accent/80 text-white'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {isExporting ? 'Exporting...' : 'Export ZIP'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        .animate-slideUp { animation: slideUp 0.3s ease-out; }
      `}</style>
    </>
  );
};

export default BatchExportModal;
