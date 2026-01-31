import { useState, useRef } from 'react';
import useNotesStore from '../../store/notesStore';
import useUIStore from '../../store/uiStore';

const TreeItem = ({ item, level = 0, onContextMenu, draggedItem, setDraggedItem, onItemMove, filteredItems, onSelect }) => {
    const {
        currentNoteId,
        expandedFolders,
        toggleFolder,
        selectNote,
        getChildren,
        renameItem,
        updateNote,
        isPinned,
        getBacklinks
    } = useNotesStore();
    const { addNotification } = useUIStore();

    const [isRenaming, setIsRenaming] = useState(false);
    const [renamingValue, setRenamingValue] = useState(item.name);
    const [isDragOver, setIsDragOver] = useState(false);
    const autoExpandTimeoutRef = useRef(null);
    const isDraggingRef = useRef(false);
    const dragStartTimeRef = useRef(null);

    const isFolder = item.type === 'folder';
    const isExpanded = expandedFolders.includes(item.id);

    // Use filtered children if search is active
    const allChildren = isFolder ? getChildren(item.id) : [];
    const children = filteredItems
        ? allChildren.filter(child => filteredItems.some(fi => fi.id === child.id))
        : allChildren;

    const isSelected = item.type === 'note' && currentNoteId === item.id;
    const isBeingDragged = draggedItem?.id === item.id;

    // Get cached tags from store
    const noteTags = item.type === 'note' ? (item.tags || []) : [];

    // Get backlinks count for notes
    const backlinksCount = item.type === 'note' ? getBacklinks(item.id).length : 0;

    // Helper to check if target is a descendant of source (prevent dropping folder into itself)
    function isDescendantOf(targetId, sourceId, getChildrenFn) {
        const childrenOfSource = getChildrenFn(sourceId);
        for (const child of childrenOfSource) {
            if (child.id === targetId) return true;
            if (child.type === 'folder' && isDescendantOf(targetId, child.id, getChildrenFn)) {
                return true;
            }
        }
        return false;
    }

    const canDrop = isFolder && draggedItem && draggedItem.id !== item.id && !isDescendantOf(item.id, draggedItem.id, getChildren);

    const handleMouseDown = (e) => {
        if (isRenaming) return;
        if (e.button !== 0) return; // Only left mouse button

        isDraggingRef.current = false;
        dragStartTimeRef.current = Date.now();

        const startX = e.clientX;
        const startY = e.clientY;
        const dragThreshold = 5; // pixels

        const handleMouseMove = (moveEvent) => {
            const deltaX = Math.abs(moveEvent.clientX - startX);
            const deltaY = Math.abs(moveEvent.clientY - startY);

            if (!isDraggingRef.current && (deltaX > dragThreshold || deltaY > dragThreshold)) {
                isDraggingRef.current = true;
                setDraggedItem(item);
            }
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);

            const dragDuration = Date.now() - dragStartTimeRef.current;

            if (isDraggingRef.current) {
                setTimeout(() => {
                    setDraggedItem(null);
                    isDraggingRef.current = false;
                }, 100);
            } else if (dragDuration < 300) {
                handleClick();
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleClick = async () => {
        if (isDraggingRef.current) return;

        if (isFolder) {
            toggleFolder(item.id);
        } else {
            selectNote(item.id);
            if (onSelect) onSelect();
        }
    };

    const handleRename = async () => {
        const trimmed = renamingValue.trim();
        if (!trimmed) {
            setIsRenaming(false);
            return;
        }

        try {
            await renameItem(item.id, trimmed);
            addNotification(`${item.type === 'note' ? 'Note' : 'Folder'} renamed successfully`, 'success');
        } catch (error) {
            console.error('Failed to rename item:', error);
            addNotification('Failed to rename: ' + error.message, 'error');
            setRenamingValue(item.name);
        }

        setIsRenaming(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleRename();
        } else if (e.key === 'Escape') {
            setRenamingValue(item.name);
            setIsRenaming(false);
        }
    };

    const handleMouseEnter = () => {
        if (!draggedItem || draggedItem.id === item.id) return;

        if (canDrop) {
            setIsDragOver(true);

            if (isFolder && !isExpanded) {
                if (autoExpandTimeoutRef.current) {
                    clearTimeout(autoExpandTimeoutRef.current);
                }
                autoExpandTimeoutRef.current = setTimeout(() => {
                    toggleFolder(item.id);
                }, 800);
            }
        }
    };

    const handleMouseLeave = () => {
        setIsDragOver(false);

        if (autoExpandTimeoutRef.current) {
            clearTimeout(autoExpandTimeoutRef.current);
            autoExpandTimeoutRef.current = null;
        }
    };

    const handleMouseUp = (e) => {
        if (!draggedItem || !canDrop) return;

        e.stopPropagation();
        onItemMove(draggedItem, item);
        setIsDragOver(false);

        if (autoExpandTimeoutRef.current) {
            clearTimeout(autoExpandTimeoutRef.current);
            autoExpandTimeoutRef.current = null;
        }
    };

    return (
        <div className={`relative ${isBeingDragged ? 'opacity-50' : 'opacity-100'} transition-opacity duration-200`}>
            {isDragOver && canDrop && (
                <div className="absolute inset-0 pointer-events-none z-10">
                    <div className="absolute inset-0 bg-accent/20 rounded-md animate-pulse" />
                    <div className="absolute left-0 right-0 top-0 h-1 bg-accent animate-pulse shadow-lg shadow-accent/50" />
                </div>
            )}

            {level > 0 && (
                <div className="absolute left-0 top-0 bottom-0 pointer-events-none">
                    {Array.from({ length: level }).map((_, i) => (
                        <div
                            key={i}
                            className="absolute top-0 bottom-0 w-px bg-overlay-light"
                            style={{ left: `${i * 16 + 16}px` }}
                        />
                    ))}
                </div>
            )}

            <div
                className={`
          flex items-center px-2 py-1.5 select-none relative
          rounded-md transition-all duration-150
          ${isSelected ? 'bg-accent/10 text-accent border-l-2 border-accent' : 'text-text-secondary'}
          ${!isBeingDragged && !isRenaming ? 'hover:bg-item-hover hover:text-text-primary cursor-pointer' : ''}
          ${isDragOver && canDrop ? 'bg-accent/20 ring-1 ring-accent scale-[1.02]' : ''}
          ${isBeingDragged ? 'cursor-grabbing opacity-50' : 'cursor-grab'}
        `}
                style={{ paddingLeft: `${level * 16 + 8}px` }}
                onMouseDown={handleMouseDown}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onMouseUp={handleMouseUp}
                onContextMenu={(e) => onContextMenu(e, item)}
                title={item.filePath || item.name}
            >
                {isFolder && (
                    <svg
                        className={`w-4 h-4 mr-1 transition-transform text-text-muted ${isExpanded ? 'rotate-90' : ''}`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                    >
                        <path d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" />
                    </svg>
                )}

                {isFolder ? (
                    <div className="relative">
                        <svg className={`w-4 h-4 mr-2 transition-colors duration-200 ${isDragOver && canDrop ? 'text-accent' : 'text-sky-300'}`} fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                        </svg>
                        {isDragOver && canDrop && (
                            <svg className="w-3 h-3 absolute -top-1 -right-1 text-accent animate-bounce" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" />
                            </svg>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center">
                        <svg className="w-4 h-4 mr-2 ml-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        {isPinned(item.id) && (
                            <svg className="w-3 h-3 mr-1 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                            </svg>
                        )}
                    </div>
                )}

                {isRenaming ? (
                    <input
                        type="text"
                        value={renamingValue}
                        onChange={(e) => setRenamingValue(e.target.value)}
                        onBlur={handleRename}
                        onKeyDown={handleKeyDown}
                        className="flex-1 bg-overlay-light text-text-primary px-2 py-0.5 rounded outline-none border border-overlay-medium focus:border-accent"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <>
                        <span className="flex-1 text-sm truncate" title={item.filePath || item.name}>
                            {item.name}
                        </span>
                        {item.type === 'note' && backlinksCount > 0 && (
                            <div className="flex items-center gap-0.5 ml-2 shrink-0" title={`${backlinksCount} backlink${backlinksCount !== 1 ? 's' : ''}`}>
                                <svg className="w-3 h-3 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                </svg>
                                <span className="text-[10px] text-purple-400 font-medium">
                                    {backlinksCount}
                                </span>
                            </div>
                        )}
                        {item.type === 'note' && noteTags.length > 0 && (
                            <div className="flex items-center gap-1 ml-2">
                                {noteTags.slice(0, 2).map(tag => (
                                    <span
                                        key={tag}
                                        className="px-1 py-0.5 text-[10px] bg-accent/20 text-accent rounded"
                                        title={`#${tag}`}
                                    >
                                        #{tag}
                                    </span>
                                ))}
                                {noteTags.length > 2 && (
                                    <span className="text-[10px] text-text-muted">
                                        +{noteTags.length - 2}
                                    </span>
                                )}
                            </div>
                        )}
                    </>
                )}

                {item.type === 'note' && item.filePath && (
                    <svg className="w-3 h-3 ml-1 text-emerald-300" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                )}
            </div>

            {isFolder && isExpanded && (
                <div>
                    {children
                        .sort((a, b) => {
                            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
                            if (a.order !== undefined && b.order !== undefined) {
                                return a.order - b.order;
                            }
                            return a.name.localeCompare(b.name);
                        })
                        .map(child => (
                            <TreeItem
                                key={child.id}
                                item={child}
                                level={level + 1}
                                onContextMenu={onContextMenu}
                                draggedItem={draggedItem}
                                setDraggedItem={setDraggedItem}
                                onItemMove={onItemMove}
                                filteredItems={filteredItems}
                                onSelect={onSelect}
                            />
                        ))
                    }
                </div>
            )}
        </div>
    );
};

export default TreeItem;
