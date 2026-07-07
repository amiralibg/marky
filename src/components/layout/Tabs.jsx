import { useRef, useEffect } from "react";
import useNotesStore from "../../store/notesStore";

const FileIcon = () => (
  <svg
    className="w-3.5 h-3.5 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
    <path d="M14 3v5h5" />
  </svg>
);

const Tabs = () => {
  const { openNoteIds, currentNoteId, selectNote, closeNote, items, isNoteDirty } = useNotesStore();
  const scrollRef = useRef(null);

  const openNotes = openNoteIds.map((id) => items.find((item) => item.id === id)).filter(Boolean);

  useEffect(() => {
    const activeTab = scrollRef.current?.querySelector(".active-tab");
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }, [currentNoteId]);

  if (openNotes.length === 0) return null;

  return (
    <div className="flex h-11 items-center gap-0.5 overflow-x-auto border-b border-border bg-bg-base px-3">
      <div
        ref={scrollRef}
        className="flex shrink-0 items-center gap-0.5 rounded-[10px] bg-overlay-subtle p-[3px]"
      >
        {openNotes.map((note) => {
          const isActive = note.id === currentNoteId;
          const isDirty = isNoteDirty?.(note.id);
          return (
            <div
              key={note.id}
              onClick={() => selectNote(note.id)}
              title={note.name}
              className={`group flex h-[30px] shrink-0 cursor-pointer items-center gap-[7px] rounded-[7px] px-[11px] transition-all duration-200 ${
                isActive
                  ? "active-tab bg-bg-editor font-semibold text-text-primary shadow-[0_1px_3px_rgba(20,20,15,0.14),0_0_0_1px_var(--color-border)]"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {isDirty ? (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
              ) : (
                <span className={isActive ? "text-accent" : "text-text-muted"}>
                  <FileIcon />
                </span>
              )}
              <span className="whitespace-nowrap text-[13px]">{note.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeNote(note.id);
                }}
                aria-label={`Close ${note.name}`}
                className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] text-text-muted transition-colors hover:bg-overlay-light hover:text-text-primary"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Tabs;
