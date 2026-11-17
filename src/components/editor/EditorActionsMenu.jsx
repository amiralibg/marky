import { useEffect, useRef, useState } from "react";

/**
 * The editor header used to carry Properties / Contents / Save / History /
 * Export as five separate buttons. They now live behind one "⋯" so the header
 * reads as breadcrumb + view mode and nothing else; every action here also has
 * a keyboard shortcut or a command-palette entry.
 */
const EditorActionsMenu = ({ items }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const visible = items.filter(Boolean);
  if (visible.length === 0) return null;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More note actions"
        title="More actions"
        className="icon-btn"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5.5" cy="12" r="1.4" />
          <circle cx="12" cy="12" r="1.4" />
          <circle cx="18.5" cy="12" r="1.4" />
        </svg>
      </button>

      {/* Frosted, like every surface that floats above the sheet. */}
      {open && (
        <div
          role="menu"
          className="glass-panel absolute end-0 top-full z-40 mt-2 w-60 rounded-card p-1.5 animate-fade-in"
        >
          {visible.map((item) => (
            <button
              key={item.id}
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              title={item.title}
              className={`menu-item ${item.disabled ? "opacity-50" : ""}`}
            >
              <svg
                className={item.active ? "text-accent!" : ""}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d={item.iconPath} />
              </svg>
              <span className="flex-1 truncate">{item.label}</span>
              {item.shortcut && (
                <span className="shrink-0 font-mono text-[11px] text-text-muted">
                  {item.shortcut}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default EditorActionsMenu;
