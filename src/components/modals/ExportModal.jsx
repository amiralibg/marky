import { useRef, useState } from "react";
import { marked } from "marked";
import useUIStore from "../../store/uiStore";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { buildStandaloneHtml, exportMarkdownToPdf } from "../../utils/noteExport";
import useModalAccessibility from "../../hooks/useModalAccessibility";
import { isHtmlDocument } from "../../utils/documentKind";
import { BusyButton } from "../ui/Loading";

const EXPORT_FORMATS = [
  {
    id: "html",
    label: "HTML file",
    hint: "Standalone HTML with inline styles",
    icon: "m8 7-5 5 5 5M16 7l5 5-5 5",
  },
  {
    id: "pdf",
    label: "PDF file",
    hint: "Generate and save a real PDF document",
    icon: "M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8zM14 3.5V8h4.5",
  },
  {
    id: "copy-html",
    label: "Copy HTML",
    hint: "Copy formatted HTML to the clipboard",
    icon: "M9 9.5h9.5V19a1.5 1.5 0 0 1-1.5 1.5H10.5A1.5 1.5 0 0 1 9 19zM15 9.5V5a1.5 1.5 0 0 0-1.5-1.5H7A1.5 1.5 0 0 0 5.5 5v8.5A1.5 1.5 0 0 0 7 15h2",
  },
  {
    id: "markdown",
    label: "Markdown file",
    hint: "Export as a .md file",
    icon: "M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8zM14 3.5V8h4.5M9 12.5h6M9 16h4",
  },
];

// An HTML document is already a page: the markdown conversions do not apply,
// so it is offered as itself — a copy of the file, or its source on the
// clipboard.
const HTML_DOCUMENT_FORMATS = [
  {
    id: "html-copy",
    label: "HTML file",
    hint: "A copy of this document, exactly as it is",
    icon: "m8 7-5 5 5 5M16 7l5 5-5 5",
  },
  {
    id: "copy-source",
    label: "Copy source",
    hint: "Copy the document's HTML to the clipboard",
    icon: "M9 9.5h9.5V19a1.5 1.5 0 0 1-1.5 1.5H10.5A1.5 1.5 0 0 1 9 19zM15 9.5V5a1.5 1.5 0 0 0-1.5-1.5H7A1.5 1.5 0 0 0 5.5 5v8.5A1.5 1.5 0 0 0 7 15h2",
  },
];

const ExportModal = ({ isOpen, onClose, note }) => {
  const isHtml = isHtmlDocument(note);
  const formats = isHtml ? HTML_DOCUMENT_FORMATS : EXPORT_FORMATS;
  const [exportFormat, setExportFormat] = useState(isHtml ? "html-copy" : "html");
  const [isExporting, setIsExporting] = useState(false);
  const { addNotification } = useUIStore();
  const dialogRef = useRef(null);
  useModalAccessibility(isOpen, dialogRef);

  if (!isOpen || !note) return null;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      if (exportFormat === "html-copy") {
        const filePath = await save({
          defaultPath: `${note.name}.html`,
          filters: [{ name: "HTML", extensions: ["html", "htm"] }],
        });
        if (filePath) {
          await writeTextFile(filePath, note.content || "");
          addNotification("Exported successfully!", "success");
          onClose();
        }
      } else if (exportFormat === "copy-source") {
        await writeText(note.content || "");
        addNotification("HTML copied to clipboard", "success");
        onClose();
      } else if (exportFormat === "html") {
        const html = buildStandaloneHtml(note.name, note.content || "", marked);
        const filePath = await save({
          defaultPath: `${note.name}.html`,
          filters: [
            {
              name: "HTML",
              extensions: ["html"],
            },
          ],
        });

        if (filePath) {
          await writeTextFile(filePath, html);
          addNotification("Exported successfully!", "success");
          onClose();
        }
      } else if (exportFormat === "pdf") {
        const filePath = await exportMarkdownToPdf(note.name, note.content || "");
        if (filePath) {
          addNotification("PDF exported successfully!", "success");
          onClose();
        }
      } else if (exportFormat === "copy-html") {
        const htmlContent = marked(note.content || "");
        await writeText(htmlContent);
        addNotification("Formatted HTML copied to clipboard!", "success");
        onClose();
      } else if (exportFormat === "markdown") {
        const filePath = await save({
          defaultPath: `${note.name}.md`,
          filters: [
            {
              name: "Markdown",
              extensions: ["md", "markdown"],
            },
          ],
        });

        if (filePath) {
          await writeTextFile(filePath, note.content || "");
          addNotification("Exported successfully!", "success");
          onClose();
        }
      }
    } catch (error) {
      console.error("Export failed:", error);
      addNotification("Export failed: " + error.message, "error");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <div className="modal-scrim z-50 animate-fade-in" onClick={onClose} aria-hidden="true" />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          ref={dialogRef}
          className="glass-panel modal-panel w-full max-w-[440px] pointer-events-auto animate-fade-in"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-modal-title"
          tabIndex={-1}
        >
          <div className="modal-header">
            <div className="min-w-0 flex-1">
              <h2 id="export-modal-title" className="modal-title">
                {isHtml ? "Export document" : "Export note"}
              </h2>
              <p className="modal-subtitle truncate" title={note.name} dir="auto">
                {note.name}
              </p>
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

          <div className="px-4 pt-3" role="radiogroup" aria-label="Export format">
            {formats.map((format) => {
              const selected = exportFormat === format.id;
              return (
                <button
                  key={format.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setExportFormat(format.id)}
                  className={`palette-row min-h-[52px] ${selected ? "is-selected" : ""}`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d={format.icon} />
                  </svg>
                  <span className="min-w-0 flex-1">
                    <span className="block text-text-primary">{format.label}</span>
                    <span className="block text-[12.5px] font-normal text-text-muted">
                      {format.hint}
                    </span>
                  </span>
                  <span
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${
                      selected
                        ? "bg-accent"
                        : "shadow-[inset_0_0_0_1.5px_var(--color-border-light)]"
                    }`}
                    aria-hidden="true"
                  >
                    {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="modal-footer pt-4">
            <button type="button" onClick={onClose} className="btn">
              Cancel
            </button>
            <BusyButton onClick={handleExport} busy={isExporting} className="btn btn-primary">
              Export
            </BusyButton>
          </div>
        </div>
      </div>
    </>
  );
};

export default ExportModal;
