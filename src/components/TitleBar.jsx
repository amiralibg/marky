import { useRef, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import useNotesStore from '../store/notesStore';

const TitleBar = ({
  sidebarWidth,
  showSidebar,
  onNewNote,
  onNewFolder,
  onToggleSidebar
}) => {
  const { openNoteIds, currentNoteId, selectNote, closeNote, items } = useNotesStore();
  const scrollRef = useRef(null);

  const openNotes = openNoteIds
    .map(id => items.find(item => item.id === id))
    .filter(Boolean);

  useEffect(() => {
    const activeTab = scrollRef.current?.querySelector('.active-tab');
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [currentNoteId]);

  const handleMouseDown = async (e) => {
    // Only handle left mouse button
    if (e.buttons !== 1) return;

    // Don't drag if clicking on interactive elements
    if (e.target.closest('button, input, [data-no-drag]')) return;

    if (e.detail === 2) {
      // Double click to maximize/restore
      await getCurrentWindow().toggleMaximize();
    } else {
      // Single click to start dragging
      await getCurrentWindow().startDragging();
    }
  };

  return (
    <div
      className="h-8 bg-titlebar-bg border-b border-border flex select-none shrink-0"
      onMouseDown={handleMouseDown}
    >
      {/* Left section - Sidebar header area */}
      <div
        className="flex items-center shrink-0 border-r border-border"
        style={{
          width: showSidebar ? `${sidebarWidth}px` : 'auto',
          paddingLeft: '80px' // Space for macOS traffic lights
        }}
      >
        {/* Toggle sidebar button when hidden */}
        {!showSidebar && (
          <button
            onClick={onToggleSidebar}
            className="p-1.5 hover:bg-overlay-light rounded-md text-text-secondary hover:text-text-primary transition-all ml-2"
            title="Show Sidebar"
            data-no-drag
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        {showSidebar && (
          <>
            <div className="font-semibold text-text-primary tracking-tight text-sm">
              Marky
            </div>
            <div className="flex items-center gap-0.5 ml-auto mr-2">
              <button
                onClick={onNewNote}
                className="p-1.5 hover:bg-overlay-light rounded-md text-text-secondary hover:text-text-primary transition-all"
                title="New Note (⌘N)"
                data-no-drag
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <button
                onClick={onNewFolder}
                className="p-1.5 hover:bg-overlay-light rounded-md text-text-secondary hover:text-text-primary transition-all"
                title="New Folder"
                data-no-drag
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Right section - Tabs area */}
      <div className="flex-1 flex items-center min-w-0 overflow-hidden">
        {/* Tabs */}
        {openNotes.length > 0 && (
          <div
            ref={scrollRef}
            className="flex overflow-x-auto no-scrollbar scroll-smooth"
            data-no-drag
          >
            {openNotes.map((note) => {
              const isActive = note.id === currentNoteId;
              return (
                <div
                  key={note.id}
                  className={`
                    group flex items-center gap-2 px-3 h-8 border-r border-border cursor-pointer transition-all duration-200 min-w-[100px] max-w-[180px]
                    ${isActive
                      ? 'bg-bg-editor text-accent active-tab'
                      : 'text-text-secondary hover:bg-item-hover hover:text-text-primary'
                    }
                  `}
                  onClick={() => selectNote(note.id)}
                >
                  <svg
                    className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-accent' : 'text-text-muted'}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>

                  <span className="text-xs font-medium truncate flex-1">
                    {note.name}
                  </span>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeNote(note.id);
                    }}
                    className={`
                      p-0.5 rounded-md hover:bg-overlay-light transition-colors shrink-0
                      ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                    `}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty draggable space - takes remaining width */}
        <div className="flex-1 h-full" />
      </div>
    </div>
  );
};

export default TitleBar;
