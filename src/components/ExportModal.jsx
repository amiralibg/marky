import { useRef, useState } from 'react';
import { marked } from 'marked';
import useUIStore from '../store/uiStore';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { buildStandaloneHtml, exportMarkdownToPdf } from '../utils/noteExport';
import useModalAccessibility from '../hooks/useModalAccessibility';

const ExportModal = ({ isOpen, onClose, note }) => {
  const [exportFormat, setExportFormat] = useState('html');
  const [isExporting, setIsExporting] = useState(false);
  const { addNotification } = useUIStore();
  const dialogRef = useRef(null);
  useModalAccessibility(isOpen, dialogRef);

  if (!isOpen || !note) return null;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      if (exportFormat === 'html') {
        const html = buildStandaloneHtml(note.name, note.content || '', marked);
        const filePath = await save({
          defaultPath: `${note.name}.html`,
          filters: [{
            name: 'HTML',
            extensions: ['html']
          }]
        });

        if (filePath) {
          await writeTextFile(filePath, html);
          addNotification('Exported successfully!', 'success');
          onClose();
        }
      } else if (exportFormat === 'pdf') {
        const filePath = await exportMarkdownToPdf(note.name, note.content || '');
        if (filePath) {
          addNotification('PDF exported successfully!', 'success');
          onClose();
        }
      } else if (exportFormat === 'copy-html') {
        const htmlContent = marked(note.content || '');
        await writeText(htmlContent);
        addNotification('Formatted HTML copied to clipboard!', 'success');
        onClose();
      } else if (exportFormat === 'markdown') {
        const filePath = await save({
          defaultPath: `${note.name}.md`,
          filters: [{
            name: 'Markdown',
            extensions: ['md', 'markdown']
          }]
        });

        if (filePath) {
          await writeTextFile(filePath, note.content || '');
          addNotification('Exported successfully!', 'success');
          onClose();
        }
      }
    } catch (error) {
      console.error('Export failed:', error);
      addNotification('Export failed: ' + error.message, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fadeIn"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          ref={dialogRef}
          className="glass-panel border-glass-border rounded-xl shadow-2xl w-full max-w-md pointer-events-auto animate-slideUp"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-modal-title"
          tabIndex={-1}
        >
          {/* Header */}
          <div className="border-b border-glass-border px-6 py-4 flex items-center justify-between">
            <div>
              <h2 id="export-modal-title" className="text-xl font-semibold text-text-primary">
                Export Note
              </h2>
              <p className="text-sm text-text-muted mt-1" title={note.name}>
                {note.name}
              </p>
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

          {/* Export Options */}
          <div className="p-6 space-y-3">
            <button
              onClick={() => setExportFormat('html')}
              className={`w-full p-4 rounded-lg border-2 text-left transition-all ${exportFormat === 'html'
                ? 'border-accent bg-accent/10'
                : 'border-overlay-subtle bg-overlay-subtle hover:bg-overlay-light hover:border-overlay-light'
                }`}
            >
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                <div className="flex-1">
                  <h3 className="font-semibold text-text-primary">HTML File</h3>
                  <p className="text-xs text-text-muted">Standalone HTML with inline styles</p>
                </div>
                {exportFormat === 'html' && (
                  <svg className="w-5 h-5 text-accent" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </button>

            <button
              onClick={() => setExportFormat('pdf')}
              className={`w-full p-4 rounded-lg border-2 text-left transition-all ${exportFormat === 'pdf'
                ? 'border-accent bg-accent/10'
                : 'border-overlay-subtle bg-overlay-subtle hover:bg-overlay-light hover:border-overlay-light'
                }`}
            >
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <div className="flex-1">
                  <h3 className="font-semibold text-text-primary">PDF File</h3>
                  <p className="text-xs text-text-muted">Generate and save a real PDF document</p>
                </div>
                {exportFormat === 'pdf' && (
                  <svg className="w-5 h-5 text-accent" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </button>

            <button
              onClick={() => setExportFormat('copy-html')}
              className={`w-full p-4 rounded-lg border-2 text-left transition-all ${exportFormat === 'copy-html'
                ? 'border-accent bg-accent/10'
                : 'border-overlay-subtle bg-overlay-subtle hover:bg-overlay-light hover:border-overlay-light'
                }`}
            >
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <div className="flex-1">
                  <h3 className="font-semibold text-text-primary">Copy HTML</h3>
                  <p className="text-xs text-text-muted">Copy formatted HTML to clipboard</p>
                </div>
                {exportFormat === 'copy-html' && (
                  <svg className="w-5 h-5 text-accent" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </button>

            <button
              onClick={() => setExportFormat('markdown')}
              className={`w-full p-4 rounded-lg border-2 text-left transition-all ${exportFormat === 'markdown'
                ? 'border-accent bg-accent/10'
                : 'border-overlay-subtle bg-overlay-subtle hover:bg-overlay-light hover:border-overlay-light'
                }`}
            >
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div className="flex-1">
                  <h3 className="font-semibold text-text-primary">Markdown File</h3>
                  <p className="text-xs text-text-muted">Export as .md file</p>
                </div>
                {exportFormat === 'markdown' && (
                  <svg className="w-5 h-5 text-accent" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </button>
          </div>

          {/* Footer */}
          <div className="border-t border-glass-border px-6 py-4 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-overlay-light rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors shadow-lg shadow-accent/20 ${isExporting
                ? 'bg-overlay-light text-text-muted cursor-not-allowed'
                : 'bg-accent text-white hover:bg-accent-hover'
                }`}
            >
              {isExporting ? 'Exporting...' : 'Export'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(20px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>
    </>
  );
};

export default ExportModal;
