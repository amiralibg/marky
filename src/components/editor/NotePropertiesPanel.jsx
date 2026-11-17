import { useEffect, useMemo, useState } from "react";
import { getNoteProperties, mergeNoteProperties } from "../../utils/frontmatter";

const joinList = (value) => (Array.isArray(value) ? value.join(", ") : "");

const splitList = (value) =>
  (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const NotePropertiesPanel = ({ markdown, onApply, onClose }) => {
  const properties = useMemo(() => getNoteProperties(markdown), [markdown]);
  const [aliases, setAliases] = useState(joinList(properties.aliases));
  const [tags, setTags] = useState(joinList(properties.tags));
  const [status, setStatus] = useState(properties.status || "");
  const [type, setType] = useState(properties.type || "");

  useEffect(() => {
    setAliases(joinList(properties.aliases));
    setTags(joinList(properties.tags));
    setStatus(properties.status || "");
    setType(properties.type || "");
  }, [properties.aliases, properties.status, properties.tags, properties.type]);

  const handleApply = () => {
    const nextMarkdown = mergeNoteProperties(markdown, {
      aliases: splitList(aliases),
      tags: splitList(tags),
      status: status.trim(),
      type: type.trim(),
    });
    onApply(nextMarkdown);
  };

  const fields = [
    {
      id: "note-aliases",
      label: "Aliases",
      value: aliases,
      onChange: setAliases,
      placeholder: "Draft, Working title",
    },
    {
      id: "note-status",
      label: "Status",
      value: status,
      onChange: setStatus,
      placeholder: "draft, active, archived",
    },
    {
      id: "note-type",
      label: "Type",
      value: type,
      onChange: setType,
      placeholder: "project, meeting, reference",
    },
    {
      id: "note-tags",
      label: "Tags",
      value: tags,
      onChange: setTags,
      placeholder: "writing, idea, project",
    },
  ];

  return (
    <aside
      className="glass-panel absolute top-4 end-4 z-20 w-80 max-w-[calc(100%-2rem)] rounded-card overflow-hidden animate-fade-in"
      role="region"
      aria-label="Note properties"
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-1">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Note properties</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Edit YAML metadata without touching raw frontmatter.
          </p>
        </div>
        <button
          onClick={onClose}
          className="icon-btn -me-1.5 -mt-1"
          aria-label="Close note properties"
          title="Close properties"
        >
          <svg
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-3">
        {fields.map((field) => (
          <label key={field.id} htmlFor={field.id} className="block">
            <span className="text-xs font-medium text-text-secondary">{field.label}</span>
            <input
              id={field.id}
              value={field.value}
              onChange={(event) => field.onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleApply();
                }
              }}
              placeholder={field.placeholder}
              className="mt-1 h-9 w-full rounded-card bg-item-hover px-3 text-[13px] text-text-primary placeholder:text-text-muted transition-colors focus:bg-bg-editor focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
          </label>
        ))}

        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-[11px] text-text-muted">
            {properties.hasFrontmatter ? "Frontmatter found" : "Creates frontmatter on apply"}
          </span>
          <button
            onClick={handleApply}
            className="h-8 px-3.5 text-[13px] font-semibold rounded-full bg-accent text-white hover:bg-accent-hover transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </aside>
  );
};

export default NotePropertiesPanel;
