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
        className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
          open
            ? "bg-overlay-light text-text-primary"
            : "text-text-secondary hover:bg-overlay-subtle hover:text-text-primary"
        }`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full z-40 mt-1.5 w-56 overflow-hidden rounded-xl border border-border bg-bg-sidebar/95 py-1.5 shadow-2xl backdrop-blur-md animate-fade-in"
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
              className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-start text-[13px] transition-colors ${
                item.disabled
                  ? "cursor-not-allowed text-text-muted opacity-50"
                  : item.active
                    ? "text-accent hover:bg-overlay-subtle"
                    : "text-text-secondary hover:bg-overlay-subtle hover:text-text-primary"
              }`}
            >
              <svg
                className="h-4 w-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
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
