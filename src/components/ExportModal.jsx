import { useState } from 'react';
import { marked } from 'marked';
import useUIStore from '../store/uiStore';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';

const ExportModal = ({ isOpen, onClose, note }) => {
  const [exportFormat, setExportFormat] = useState('html');
  const [isExporting, setIsExporting] = useState(false);
  const { addNotification } = useUIStore();

  if (!isOpen || !note) return null;

  const generateHTML = () => {
    const htmlContent = marked(note.content || '');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${note.name}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
      line-height: 1.6;
      color: #1e1e1e;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #ffffff;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 24px;
      margin-bottom: 16px;
      font-weight: 600;
      line-height: 1.25;
      color: #1a1a1a;
    }
    h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
    h3 { font-size: 1.25em; }
    h4 { font-size: 1em; }
    p { margin-bottom: 16px; }
    a { color: #0969da; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code {
      background-color: rgba(175, 184, 193, 0.2);
      padding: 0.2em 0.4em;
      border-radius: 6px;
      font-size: 85%;
      font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
    }
    pre {
      background-color: #f6f8fa;
      border-radius: 6px;
      padding: 16px;
      overflow: auto;
      margin-bottom: 16px;
    }
    pre code {
      background-color: transparent;
      padding: 0;
      font-size: 100%;
    }
    blockquote {
      border-left: 4px solid #d0d7de;
      padding-left: 16px;
      color: #656d76;
      margin-bottom: 16px;
    }
    ul, ol {
      margin-bottom: 16px;
      padding-left: 2em;
    }
    li { margin-bottom: 4px; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 16px;
    }
    table th, table td {
      border: 1px solid #d0d7de;
      padding: 6px 13px;
    }
    table th {
      background-color: #f6f8fa;
      font-weight: 600;
    }
    hr {
      height: 0.25em;
      padding: 0;
      margin: 24px 0;
      background-color: #d0d7de;
      border: 0;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    input[type="checkbox"] {
      margin-right: 0.5em;
    }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;
  };

  const generatePDFHTML = () => {
    const htmlContent = marked(note.content || '');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${note.name}</title>
  <style>
    @page { margin: 2cm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
      line-height: 1.6;
      color: #000;
      font-size: 12pt;
    }
    h1 { font-size: 24pt; margin-top: 0; margin-bottom: 16px; }
    h2 { font-size: 20pt; margin-top: 20px; margin-bottom: 12px; }
    h3 { font-size: 16pt; margin-top: 16px; margin-bottom: 10px; }
    h4 { font-size: 14pt; margin-top: 14px; margin-bottom: 8px; }
    p { margin-bottom: 12px; }
    code {
      background-color: #f0f0f0;
      padding: 2px 4px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 10pt;
    }
    pre {
      background-color: #f6f6f6;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 12px;
      overflow-x: auto;
      page-break-inside: avoid;
    }
    pre code {
      background-color: transparent;
      padding: 0;
      font-size: 9pt;
    }
    blockquote {
      border-left: 4px solid #ccc;
      padding-left: 12px;
      color: #666;
      margin: 12px 0;
    }
    ul, ol { padding-left: 24px; margin-bottom: 12px; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 12px;
      page-break-inside: avoid;
    }
    table th, table td {
      border: 1px solid #ddd;
      padding: 6px 10px;
      text-align: left;
    }
    table th { background-color: #f0f0f0; font-weight: bold; }
    img { max-width: 100%; height: auto; page-break-inside: avoid; }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      if (exportFormat === 'html') {
        const html = generateHTML();
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
        // For PDF, we'll generate HTML and let the user print to PDF
        const pdfHTML = generatePDFHTML();
        const filePath = await save({
          defaultPath: `${note.name}-print.html`,
          filters: [{
            name: 'HTML',
            extensions: ['html']
          }]
        });

        if (filePath) {
          await writeTextFile(filePath, pdfHTML);
          addNotification('HTML file created for PDF export! Open it and Print > Save as PDF', 'info', 5000);
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
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="glass-panel border-glass-border rounded-xl shadow-2xl w-full max-w-md pointer-events-auto animate-slideUp"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b border-glass-border px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-text-primary">Export Note</h2>
              <p className="text-sm text-text-muted mt-1">{note.name}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
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
                : 'border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/10'
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
                : 'border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/10'
                }`}
            >
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <div className="flex-1">
                  <h3 className="font-semibold text-text-primary">PDF (via Print)</h3>
                  <p className="text-xs text-text-muted">Create HTML optimized for printing to PDF</p>
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
                : 'border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/10'
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
                : 'border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/10'
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
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-white/10 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors shadow-lg shadow-accent/20 ${isExporting
                ? 'bg-white/10 text-text-muted cursor-not-allowed'
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
