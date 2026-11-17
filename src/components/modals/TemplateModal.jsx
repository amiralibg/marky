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
import { TemplateGlyph } from "../icons";
import { BusyButton } from "../ui/Loading";

const TemplateModal = ({
  isOpen,
  onClose,
  onSelectTemplate,
  onScheduleTemplate,
  // Opened from "New schedule" rather than "New from template": the picker is
  // the first step of building a schedule, so it starts in recurring mode.
  scheduleByDefault = false,
}) => {
  const { customTemplates, addCustomTemplate, deleteCustomTemplate } = useNotesStore();
  const { addNotification } = useUIStore();
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isExportingTemplates, setIsExportingTemplates] = useState(false);
  const [isImportingTemplates, setIsImportingTemplates] = useState(false);
  const dialogRef = useRef(null);
  const [pendingDeleteTemplateId, setPendingDeleteTemplateId] = useState(null);
  const [scheduleOn, setScheduleOn] = useState(scheduleByDefault);
  const [scheduleFreq, setScheduleFreq] = useState("daily");
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    icon: "note",
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

  const schedulePreview = useMemo(() => {
    const fmt = { daily: "YYYY-MM-DD", weekly: "YYYY-[W]ww", monthly: "YYYY-MM" }[scheduleFreq];
    const base = (selectedTemplate?.name || "Note").replace(/ /g, "-");
    return `Journal/${base}-${fmt}.md`;
  }, [scheduleFreq, selectedTemplate]);

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
    setNewTemplate({ name: "", icon: "note", description: "", content: "" });
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
      <div className="modal-scrim z-50 animate-fade-in" onClick={onClose} aria-hidden="true" />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          ref={dialogRef}
          className="glass-panel modal-panel w-full max-w-4xl max-h-[88vh] flex flex-col pointer-events-auto animate-fade-in"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="template-modal-title"
          tabIndex={-1}
        >
          <div className="modal-header shrink-0 pb-4">
            <div className="min-w-0 flex-1">
              <h2 id="template-modal-title" className="modal-title">
                New note
              </h2>
              <p className="modal-subtitle">
                Start from a template, or set one to repeat on a schedule.
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

          {showCreateForm ? (
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <div className="max-w-2xl mx-auto space-y-4">
                <div>
                  <label className="field-label">Name</label>
                  <input
                    type="text"
                    value={newTemplate.name}
                    onChange={(event) =>
                      setNewTemplate({ ...newTemplate, name: event.target.value })
                    }
                    className="field"
                    placeholder="My template"
                  />
                </div>
                <div>
                  <label className="field-label">Icon</label>
                  <input
                    type="text"
                    value={newTemplate.icon}
                    onChange={(event) =>
                      setNewTemplate({ ...newTemplate, icon: event.target.value })
                    }
                    className="field"
                    placeholder="note"
                    maxLength={2}
                  />
                </div>
                <div>
                  <label className="field-label">Description</label>
                  <input
                    type="text"
                    value={newTemplate.description}
                    onChange={(event) =>
                      setNewTemplate({ ...newTemplate, description: event.target.value })
                    }
                    className="field"
                    placeholder="Brief description of this template"
                  />
                </div>
                <div>
                  <label className="field-label">Content</label>
                  <textarea
                    value={newTemplate.content}
                    onChange={(event) =>
                      setNewTemplate({ ...newTemplate, content: event.target.value })
                    }
                    className="field h-48 font-mono text-[13px]"
                    placeholder="# Template Title\n\nYour template content here..."
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      setShowCreateForm(false);
                      setNewTemplate({ name: "", icon: "note", description: "", content: "" });
                    }}
                    className="btn"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateCustom}
                    disabled={!newTemplate.name || !newTemplate.content}
                    className="btn btn-primary"
                  >
                    Save template
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex overflow-hidden min-h-0">
              {/* Left: template grid */}
              <div className="flex-[1.4] overflow-y-auto p-6 custom-scrollbar">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="side-label">Templates</h3>
                  <div className="flex items-center gap-1.5">
                    <BusyButton
                      onClick={handleImportTemplates}
                      busy={isImportingTemplates}
                      disabled={isExportingTemplates}
                      className="btn btn-sm"
                      title="Import templates from JSON"
                    >
                      Import
                    </BusyButton>
                    <BusyButton
                      onClick={handleExportTemplates}
                      busy={isExportingTemplates}
                      disabled={isImportingTemplates}
                      className="btn btn-sm"
                      title="Export custom templates to JSON"
                    >
                      Export
                    </BusyButton>
                    <button onClick={() => setShowCreateForm(true)} className="btn btn-sm">
                      New template
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {allTemplates.map((template) => {
                    const isSelected = selectedTemplate?.id === template.id;
                    return (
                      <button
                        key={template.id}
                        onClick={() => handleTemplateClick(template)}
                        className={`group flex items-start gap-3 rounded-card p-3.5 text-start transition-[background-color,box-shadow] duration-150 ${
                          isSelected
                            ? "bg-accent-dim shadow-[0_0_0_1.5px_var(--color-accent)]"
                            : "shadow-[0_0_0_1px_var(--color-border)] hover:bg-item-hover"
                        }`}
                        title={template.name}
                      >
                        <span
                          className={`shrink-0 ${isSelected ? "text-accent" : "text-text-muted"}`}
                        >
                          <TemplateGlyph icon={template.icon} className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-text-primary truncate">
                            {template.name}
                          </span>
                          <span className="block text-xs text-text-muted truncate mt-0.5">
                            {template.description}
                          </span>
                        </span>
                        {template.type === "custom" && (
                          <button
                            onClick={(event) => handleDeleteCustom(event, template.id)}
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-control text-text-muted opacity-0 transition-[opacity,background-color,color] group-hover:opacity-100 focus-visible:opacity-100 hover:bg-danger/10 hover:text-danger"
                            title="Delete custom template"
                          >
                            <svg
                              className="w-4 h-4"
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
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right: recurring panel */}
              <div className="w-78 shrink-0 border-s border-border p-6 flex flex-col">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold text-text-primary flex items-center gap-2">
                    <svg
                      className="w-[15px] h-[15px] text-accent"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.8}
                      viewBox="0 0 24 24"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17 2l4 4-4 4" />
                      <path d="M3 11V9a4 4 0 014-4h14M7 22l-4-4 4-4" />
                      <path d="M21 13v2a4 4 0 01-4 4H3" />
                    </svg>
                    Make it recurring
                  </span>
                  <button
                    onClick={() => onScheduleTemplate && setScheduleOn((v) => !v)}
                    disabled={!onScheduleTemplate}
                    role="switch"
                    aria-checked={scheduleOn}
                    aria-label="Make this template recurring"
                    className="switch"
                  />
                </div>
                <p className="mb-5 text-[12.5px] leading-relaxed text-text-muted">
                  Marky will create this template in a folder on a set rhythm.
                </p>

                {scheduleOn ? (
                  <div className="space-y-4">
                    <div>
                      <p className="field-label">Repeat</p>
                      <div className="seg flex w-full" role="group" aria-label="Repeat">
                        {["daily", "weekly", "monthly"].map((freq) => (
                          <button
                            key={freq}
                            type="button"
                            onClick={() => setScheduleFreq(freq)}
                            aria-pressed={scheduleFreq === freq}
                            className="flex-1 capitalize"
                          >
                            {freq}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-card bg-accent-dim p-3">
                      <div className="mb-1 text-[12px] font-semibold text-accent">Next file</div>
                      <div className="font-mono text-[12.5px] leading-relaxed text-text-primary">
                        {schedulePreview}
                      </div>
                    </div>
                    <p className="text-xs text-text-muted leading-relaxed">
                      Choose the folder, time, and start date in the next step.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center px-2 py-8 text-center text-text-muted">
                    <svg
                      className="mb-3 h-[30px] w-[30px]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.6}
                      viewBox="0 0 24 24"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                    <div className="text-[13px] leading-relaxed">
                      Flip this on to make a
                      <br />
                      daily, weekly, or monthly note.
                    </div>
                  </div>
                )}

                <div className="mt-auto pt-5">
                  {scheduleOn ? (
                    <button
                      onClick={handleSchedule}
                      disabled={!selectedTemplate}
                      className="btn btn-primary w-full"
                    >
                      Create schedule
                    </button>
                  ) : (
                    <button
                      onClick={handleSelect}
                      disabled={!selectedTemplate}
                      className="btn btn-primary w-full"
                    >
                      Use template
                    </button>
                  )}
                  <button onClick={onClose} className="btn mt-2 w-full">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        isOpen={Boolean(pendingDeleteTemplateId)}
        title="Delete template"
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
