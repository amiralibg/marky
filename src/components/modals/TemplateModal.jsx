import { useMemo, useRef, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import useNotesStore from "../../store/notesStore";
import useUIStore from "../../store/uiStore";
import {
  builtInTemplates,
  resolveTemplateContent,
  resolveTemplateTitle,
} from "../../data/templates";
import { exportTemplatesAsJson, importTemplatesFromJson } from "../../utils/backup";
import useModalAccessibility from "../../hooks/useModalAccessibility";

const TemplateModal = ({ isOpen, onClose, onSelectTemplate, onScheduleTemplate }) => {
  const { customTemplates, addCustomTemplate, deleteCustomTemplate } = useNotesStore();
  const { addNotification } = useUIStore();
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isExportingTemplates, setIsExportingTemplates] = useState(false);
  const [isImportingTemplates, setIsImportingTemplates] = useState(false);
  const dialogRef = useRef(null);
  const [pendingDeleteTemplateId, setPendingDeleteTemplateId] = useState(null);
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    icon: "📝",
    description: "",
    content: "",
  });

  const allTemplates = useMemo(() => {
    const mappedBuiltIns = builtInTemplates.map((template) => ({
      ...template,
      type: "builtin",
    }));

    const mappedCustom = customTemplates.map((template) => ({
      ...template,
      type: "custom",
    }));

    return [...mappedBuiltIns, ...mappedCustom];
  }, [customTemplates]);
  useModalAccessibility(isOpen, dialogRef);

  if (!isOpen) return null;

  const handleExportTemplates = async () => {
    if (customTemplates.length === 0) {
      addNotification("No custom templates to export", "warning");
      return;
    }
    setIsExportingTemplates(true);
    try {
      const path = await exportTemplatesAsJson(customTemplates);
      if (path) {
        addNotification(
          `Exported ${customTemplates.length} template${customTemplates.length !== 1 ? "s" : ""}`,
          "success"
        );
      }
    } catch (err) {
      console.error("Export templates failed:", err);
      addNotification("Export failed: " + err.message, "error");
    } finally {
      setIsExportingTemplates(false);
    }
  };

  const handleImportTemplates = async () => {
    setIsImportingTemplates(true);
    try {
      const imported = await importTemplatesFromJson();
      if (!imported || imported.length === 0) return;

      let addedCount = 0;
      for (const template of imported) {
        if (template && template.name && template.content !== undefined) {
          addCustomTemplate({ ...template, id: undefined });
          addedCount++;
        }
      }
      addNotification(`Imported ${addedCount} template${addedCount !== 1 ? "s" : ""}`, "success");
    } catch (err) {
      console.error("Import templates failed:", err);
      addNotification("Import failed: " + err.message, "error");
    } finally {
      setIsImportingTemplates(false);
    }
  };

  const buildResolvedTemplate = (template) => {
    if (!template) return null;
    return {
      ...template,
      content: resolveTemplateContent(template),
      suggestedTitle: resolveTemplateTitle(template),
    };
  };

  const handleSelect = () => {
    if (!selectedTemplate) return;

    const resolvedTemplate = buildResolvedTemplate(selectedTemplate);

    onSelectTemplate(resolvedTemplate);

    setSelectedTemplate(null);
    setShowCreateForm(false);
    onClose();
  };

  const handleSchedule = () => {
    if (!selectedTemplate || !onScheduleTemplate) return;

    const resolvedTemplate = buildResolvedTemplate(selectedTemplate);
    onScheduleTemplate(resolvedTemplate);
    setSelectedTemplate(null);
    setShowCreateForm(false);
    onClose();
  };

  const handleTemplateClick = (template) => {
    setSelectedTemplate(template);
    setShowCreateForm(false);
  };

  const handleCreateCustom = () => {
    const { name, content } = newTemplate;
    if (!name || !content) return;

    addCustomTemplate(newTemplate);
    setNewTemplate({ name: "", icon: "📝", description: "", content: "" });
    setShowCreateForm(false);
  };

  const handleDeleteCustom = (event, templateId) => {
    event.stopPropagation();
    setPendingDeleteTemplateId(templateId);
  };

  const confirmDeleteCustom = () => {
    if (pendingDeleteTemplateId) {
      deleteCustomTemplate(pendingDeleteTemplateId);
      if (selectedTemplate?.id === pendingDeleteTemplateId) {
        setSelectedTemplate(null);
      }
    }
    setPendingDeleteTemplateId(null);
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fadeIn"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          ref={dialogRef}
          className="glass-panel border-glass-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col pointer-events-auto animate-slideUp"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="template-modal-title"
          tabIndex={-1}
        >
          <div className="border-b border-glass-border px-6 py-4 flex items-center justify-between">
            <div>
              <h2 id="template-modal-title" className="text-xl font-semibold text-text-primary">
                Choose a Template
              </h2>
              <p className="text-sm text-text-muted mt-1">Select a template to start your note</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-overlay-light rounded-lg transition-colors"
              title="Close"
            >
              <svg
                className="w-5 h-5 text-text-secondary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {showCreateForm ? (
              <div className="max-w-2xl mx-auto space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    Template Name
                  </label>
                  <input
                    type="text"
                    value={newTemplate.name}
                    onChange={(event) =>
                      setNewTemplate({ ...newTemplate, name: event.target.value })
                    }
                    className="w-full px-3 py-2 bg-overlay-subtle border border-overlay-light rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                    placeholder="My Custom Template"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    Icon (emoji)
                  </label>
                  <input
                    type="text"
                    value={newTemplate.icon}
                    onChange={(event) =>
                      setNewTemplate({ ...newTemplate, icon: event.target.value })
                    }
                    className="w-full px-3 py-2 bg-overlay-subtle border border-overlay-light rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                    placeholder="📝"
                    maxLength={2}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    Description
                  </label>
                  <input
                    type="text"
                    value={newTemplate.description}
                    onChange={(event) =>
                      setNewTemplate({ ...newTemplate, description: event.target.value })
                    }
                    className="w-full px-3 py-2 bg-overlay-subtle border border-overlay-light rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                    placeholder="Brief description of this template"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    Template Content
                  </label>
                  <textarea
                    value={newTemplate.content}
                    onChange={(event) =>
                      setNewTemplate({ ...newTemplate, content: event.target.value })
                    }
                    className="w-full h-48 px-3 py-2 bg-overlay-subtle border border-overlay-light rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent font-mono text-sm resize-none"
                    placeholder="# Template Title\n\nYour template content here..."
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      setShowCreateForm(false);
                      setNewTemplate({ name: "", icon: "📝", description: "", content: "" });
                    }}
                    className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-overlay-light rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateCustom}
                    disabled={!newTemplate.name || !newTemplate.content}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      newTemplate.name && newTemplate.content
                        ? "bg-accent text-text-primary hover:bg-accent/90"
                        : "bg-white/10 text-text-muted cursor-not-allowed"
                    }`}
                  >
                    Save Template
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
                    Templates
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleImportTemplates}
                      disabled={isImportingTemplates || isExportingTemplates}
                      className="px-3 py-1.5 text-xs bg-overlay-subtle hover:bg-overlay-light border border-overlay-light text-text-secondary rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Import templates from JSON"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M20 12v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m12-4l-4-4m0 0L8 8m4-4v12"
                        />
                      </svg>
                      {isImportingTemplates ? "Importing..." : "Import"}
                    </button>
                    <button
                      onClick={handleExportTemplates}
                      disabled={isExportingTemplates || isImportingTemplates}
                      className="px-3 py-1.5 text-xs bg-overlay-subtle hover:bg-overlay-light border border-overlay-light text-text-secondary rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Export custom templates to JSON"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        />
                      </svg>
                      {isExportingTemplates ? "Exporting..." : "Export"}
                    </button>
                    <button
                      onClick={() => setShowCreateForm(true)}
                      className="px-3 py-1.5 text-xs bg-accent text-text-primary hover:bg-accent/90 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      Create Custom
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {allTemplates.map((template) => {
                    const isSelected = selectedTemplate?.id === template.id;
                    return (
                      <button
                        key={template.id}
                        onClick={() => handleTemplateClick(template)}
                        className={`p-4 rounded-lg border-2 text-left transition-all relative ${
                          isSelected
                            ? "border-accent bg-accent/10"
                            : "border-overlay-light bg-overlay-subtle hover:bg-overlay-light hover:border-overlay-medium"
                        }`}
                        title={template.name}
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-3xl">{template.icon}</span>
                          <div className="flex-1 min-w-0">
                            <h3
                              className="font-semibold text-text-primary mb-1"
                              title={template.name}
                            >
                              {template.name}
                            </h3>
                            <p
                              className="text-xs text-text-muted truncate"
                              title={template.description || ""}
                            >
                              {template.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            {template.type === "custom" && (
                              <button
                                onClick={(event) => handleDeleteCustom(event, template.id)}
                                className="p-1 hover:bg-red-500/20 rounded transition-colors"
                                title="Delete custom template"
                              >
                                <svg
                                  className="w-4 h-4 text-red-400"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              </button>
                            )}
                            {isSelected && (
                              <svg
                                className="w-5 h-5 text-accent shrink-0"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="border-t border-overlay-light px-6 py-4 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-overlay-light rounded-lg transition-colors"
            >
              Cancel
            </button>
            {onScheduleTemplate && (
              <button
                onClick={handleSchedule}
                disabled={!selectedTemplate}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors border ${
                  selectedTemplate
                    ? "border-accent text-accent hover:bg-accent/10"
                    : "border-overlay-light text-text-muted cursor-not-allowed"
                }`}
              >
                Schedule Recurring
              </button>
            )}
            <button
              onClick={handleSelect}
              disabled={!selectedTemplate}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                selectedTemplate
                  ? "bg-accent text-text-primary hover:bg-accent/90"
                  : "bg-white/10 text-text-muted cursor-not-allowed"
              }`}
            >
              Use Template
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
      <ConfirmDialog
        isOpen={Boolean(pendingDeleteTemplateId)}
        title="Delete Template"
        message="Delete this custom template? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmDeleteCustom}
        onCancel={() => setPendingDeleteTemplateId(null)}
      />
    </>
  );
};

export default TemplateModal;
