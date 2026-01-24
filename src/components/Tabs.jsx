import React, { useRef, useEffect } from 'react';
import useNotesStore from '../store/notesStore';

const Tabs = () => {
    const { openNoteIds, currentNoteId, selectNote, closeNote, items } = useNotesStore();
    const scrollRef = useRef(null);

    const openNotes = openNoteIds
        .map(id => items.find(item => item.id === id))
        .filter(Boolean);

    useEffect(() => {
        // Scroll active tab into view
        const activeTab = scrollRef.current?.querySelector('.active-tab');
        if (activeTab) {
            activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
    }, [currentNoteId]);

    if (openNotes.length === 0) return null;

    return (
        <div className="flex bg-bg-base border-b border-border overflow-hidden">
            <div
                ref={scrollRef}
                className="flex overflow-x-auto no-scrollbar scroll-smooth"
            >
                {openNotes.map((note) => {
                    const isActive = note.id === currentNoteId;
                    return (
                        <div
                            key={note.id}
                            className={`
                group flex items-center gap-2 px-4 py-2 border-r border-border cursor-pointer transition-all duration-200 min-w-[120px] max-w-[200px]
                ${isActive ? 'bg-bg-editor text-accent active-tab' : 'text-text-secondary hover:bg-item-hover hover:text-text-primary'}
              `}
                            onClick={() => selectNote(note.id)}
                        >
                            <svg className={`w-4 h-4 shrink-0 ${isActive ? 'text-accent' : 'text-text-muted'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>

                            <span className="text-sm font-medium truncate flex-1">
                                {note.name}
                            </span>

                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    closeNote(note.id);
                                }}
                                className={`
                  p-0.5 rounded-md hover:bg-overlay-light transition-colors
                  ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                `}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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
