import { useState, useRef, useEffect } from "react";
import useNotesStore from "../../store/notesStore";
import useSettingsStore from "../../store/settingsStore";
import useUIStore from "../../store/uiStore";

const TreeItem = ({
  item,
  level = 0,
  onContextMenu,
  draggedItem,
  setDraggedItem,
  onItemMove,
  filteredItems,
  onSelect,
  onSetDropTarget,
  onClearDropTarget,
  dropTargetFolderId,
  isExternalDragging,
  onRequestDelete,
  onMoveItemOut,
  onMoveItemIn,
  renderChildren = true,
  treeIndex = null,
  virtualTree = null,
}) => {
  const {
    currentNoteId,
    expandedFolders,
    toggleFolder,
    selectNote,
    getChildren,
    renameItem,
    isPinned,
    getBacklinks,
  } = useNotesStore();
  const sidebarDensity = useSettingsStore((state) => state.sidebarDensity);
  const showSidebarMetadata = useSettingsStore((state) => state.showSidebarMetadata);
  const { addNotification } = useUIStore();

  const [isRenaming, setIsRenaming] = useState(false);
  const [renamingValue, setRenamingValue] = useState(item.name);
  const [isDragOver, setIsDragOver] = useState(false);
  const autoExpandTimeoutRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragStartTimeRef = useRef(null);

  const isFolder = item.type === "folder";
  const isExpanded = expandedFolders.includes(item.id);

  // Use filtered children if search is active
  const allChildren = isFolder ? getChildren(item.id) : [];
  const children = filteredItems
    ? allChildren.filter((child) => filteredItems.some((fi) => fi.id === child.id))
    : allChildren;

  const isSelected = item.type === "note" && currentNoteId === item.id;
  const isBeingDragged = draggedItem?.id === item.id;

  // Get cached tags from store
  const noteTags = item.type === "note" ? item.tags || [] : [];

  // Get backlinks count for notes
  const backlinksCount = item.type === "note" ? getBacklinks(item.id).length : 0;

  // Helper to check if target is a descendant of source
  function isDescendantOf(targetId, sourceId, getChildrenFn) {
    const childrenOfSource = getChildrenFn(sourceId);
    for (const child of childrenOfSource) {
      if (child.id === targetId) return true;
      if (child.type === "folder" && isDescendantOf(targetId, child.id, getChildrenFn)) {
        return true;
      }
    }
    return false;
  }

  const canDrop =
    isFolder &&
    draggedItem &&
    draggedItem.id !== item.id &&
    !isDescendantOf(item.id, draggedItem.id, getChildren);

  // Determine if this folder is the current external drop target
  const isExternalDropTarget = isFolder && dropTargetFolderId === item.id && isExternalDragging;

  // Show visual feedback for internal drag or external drop target
  const showDropHighlight = (isDragOver && canDrop) || isExternalDropTarget;
  const isCompactDensity = sidebarDensity === "compact";
  const isSpaciousDensity = sidebarDensity === "spacious";
  const rowDensityClass = isCompactDensity
    ? "px-1.5 py-0.5 my-1 min-h-7 rounded-[5px]"
    : isSpaciousDensity
      ? "px-1.5 py-0.5 my-2 min-h-9 rounded-lg"
      : "px-1.5 py-0.5 my-1 min-h-8 rounded-md";
  const nameDensityClass = isCompactDensity
    ? "text-xs leading-4"
    : isSpaciousDensity
      ? "text-sm leading-5 font-medium"
      : "text-sm";
  const chevronClass = isCompactDensity ? "w-3.5 h-3.5 mr-0.5" : "w-4 h-4 mr-1";
  const iconClass = isCompactDensity
    ? "w-3.5 h-3.5 mr-1.5"
    : isSpaciousDensity
      ? "w-4.5 h-4.5 mr-2.5"
      : "w-4 h-4 mr-2";
  const noteIconIndentClass = isCompactDensity ? "ml-4" : isSpaciousDensity ? "ml-6" : "ml-5";
  const showInlineMetadata = showSidebarMetadata && !isCompactDensity;

  // Auto-expand folder when it's an external drop target
  useEffect(() => {
    if (isExternalDropTarget && isFolder && !isExpanded) {
      // Clear any existing timeout
      if (autoExpandTimeoutRef.current) {
        clearTimeout(autoExpandTimeoutRef.current);
      }
      // Auto-expand after 600ms of hovering
      autoExpandTimeoutRef.current = setTimeout(() => {
        toggleFolder(item.id);
      }, 600);
    }

    return () => {
      if (autoExpandTimeoutRef.current) {
        clearTimeout(autoExpandTimeoutRef.current);
        autoExpandTimeoutRef.current = null;
      }
    };
  }, [isExternalDropTarget, isFolder, isExpanded, item.id, toggleFolder]);

  const handleMouseDown = (e) => {
    if (isRenaming) return;
    if (e.button !== 0) return;

    isDraggingRef.current = false;
    dragStartTimeRef.current = Date.now();

    const startX = e.clientX;
    const startY = e.clientY;
    const dragThreshold = 5;

    const handleMouseMove = (moveEvent) => {
      const deltaX = Math.abs(moveEvent.clientX - startX);
      const deltaY = Math.abs(moveEvent.clientY - startY);

      if (!isDraggingRef.current && (deltaX > dragThreshold || deltaY > dragThreshold)) {
        isDraggingRef.current = true;
        setDraggedItem(item);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);

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

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
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
      addNotification(
        `${item.type === "note" ? "Note" : "Folder"} renamed successfully`,
        "success"
      );
    } catch (error) {
      console.error("Failed to rename item:", error);
      addNotification("Failed to rename: " + error.message, "error");
      setRenamingValue(item.name);
    }

    setIsRenaming(false);
  };

  const beginRename = () => {
    setRenamingValue(item.name);
    setIsRenaming(true);
  };

  const handleRenameKeyDown = (e) => {
    if (e.key === "Enter") {
      handleRename();
    } else if (e.key === "Escape") {
      setRenamingValue(item.name);
      setIsRenaming(false);
    }
  };

  const getVisibleTreeRows = (currentRow) => {
    const treeRoot = currentRow.closest("[data-sidebar-tree-root='true']") || document;
    return Array.from(treeRoot.querySelectorAll("[data-treeitem-row='true']"));
  };

  const focusTreeRowByOffset = (currentRow, offset) => {
    if (virtualTree) {
      virtualTree.focusIndex(virtualTree.index + offset);
      return;
    }

    const rows = getVisibleTreeRows(currentRow);
    const currentIndex = rows.indexOf(currentRow);
    if (currentIndex === -1) return;
    const nextIndex = Math.max(0, Math.min(rows.length - 1, currentIndex + offset));
    rows[nextIndex]?.focus();
  };

  const focusTreeBoundary = (currentRow, direction) => {
    if (virtualTree) {
      virtualTree.focusIndex(direction === "start" ? 0 : virtualTree.rows.length - 1);
      return;
    }

    const rows = getVisibleTreeRows(currentRow);
    if (rows.length === 0) return;
    (direction === "start" ? rows[0] : rows[rows.length - 1])?.focus();
  };

  const focusParentTreeRow = (currentRow) => {
    if (virtualTree) {
      const currentLevel = virtualTree.rows[virtualTree.index]?.level ?? 0;
      for (let i = virtualTree.index - 1; i >= 0; i -= 1) {
        if ((virtualTree.rows[i]?.level ?? 0) < currentLevel) {
          virtualTree.focusIndex(i);
          return;
        }
      }
      return;
    }

    const rows = getVisibleTreeRows(currentRow);
    const currentIndex = rows.indexOf(currentRow);
    if (currentIndex <= 0) return;

    const currentLevel = Number.parseInt(currentRow.dataset.level || "0", 10);
    for (let i = currentIndex - 1; i >= 0; i -= 1) {
      const candidateLevel = Number.parseInt(rows[i].dataset.level || "0", 10);
      if (candidateLevel < currentLevel) {
        rows[i].focus();
        return;
      }
    }
  };

  const handleRowKeyDown = (e) => {
    if (isRenaming) return;

    if (e.key === "F2") {
      e.preventDefault();
      beginRename();
      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      const isTextInputTarget =
        e.target instanceof HTMLElement &&
        e.target.closest("input, textarea, [contenteditable='true']");
      if (!isTextInputTarget && onRequestDelete) {
        e.preventDefault();
        onRequestDelete(item);
        return;
      }
    }

    if (e.altKey && e.shiftKey && e.key === "ArrowLeft") {
      e.preventDefault();
      onMoveItemOut?.(item);
      return;
    }

    if (e.altKey && e.shiftKey && e.key === "ArrowRight") {
      e.preventDefault();
      onMoveItemIn?.(item, e.currentTarget, virtualTree?.index ?? null);
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusTreeRowByOffset(e.currentTarget, 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusTreeRowByOffset(e.currentTarget, -1);
        break;
      case "Home":
        e.preventDefault();
        focusTreeBoundary(e.currentTarget, "start");
        break;
      case "End":
        e.preventDefault();
        focusTreeBoundary(e.currentTarget, "end");
        break;
      case "ArrowRight":
        e.preventDefault();
        if (isFolder && !isExpanded) {
          toggleFolder(item.id);
        } else {
          focusTreeRowByOffset(e.currentTarget, 1);
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (isFolder && isExpanded) {
          toggleFolder(item.id);
        } else {
          focusParentTreeRow(e.currentTarget);
        }
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        handleClick();
        break;
      default:
        break;
    }
  };

  const handleRowFocus = (e) => {
    if (!virtualTree) {
      e.currentTarget.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
        }, 600);
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

  const handleDoubleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    beginRename();
  };

  return (
    <div className={`relative ${isBeingDragged ? "opacity-40" : ""} transition-opacity`}>
      {/* Drop indicator line */}
      {showDropHighlight && (
        <div
          className="absolute left-0 right-0 top-0 h-0.5 bg-accent z-20 pointer-events-none"
          style={{ marginLeft: `${level * 16 + 8}px` }}
        />
      )}

      {/* Tree indent lines */}
      {level > 0 && (
        <div className="absolute left-0 top-0 bottom-0 pointer-events-none">
          {Array.from({ length: level }).map((_, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 w-px bg-overlay-light/50"
              style={{ left: `${i * 16 + 16}px` }}
            />
          ))}
        </div>
      )}

      <div
        className={`
          flex items-center select-none relative
          ${rowDensityClass} transition-all duration-150
          ${isSelected ? "bg-accent/15 text-accent shadow-[inset_2px_0_0_var(--color-accent)]" : "text-text-secondary"}
          ${!isBeingDragged && !isRenaming ? "hover:bg-overlay-subtle hover:text-text-primary hover:shadow-sm cursor-pointer" : ""}
          ${showDropHighlight ? "bg-accent/10 text-accent" : ""}
          ${isBeingDragged ? "cursor-grabbing" : "cursor-grab"}
          focus:outline-none focus:bg-accent/10 focus:text-text-primary focus:ring-2 focus:ring-accent/60 focus:ring-inset
          focus-visible:outline-none
        `}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        data-treeitem-row="true"
        data-tree-index={treeIndex ?? undefined}
        data-item-id={item.id}
        data-level={level}
        {...(isFolder
          ? {
              "data-folder-id": item.id,
              "data-folder-path": item.filePath,
              "data-folder-name": item.name,
            }
          : {})}
        tabIndex={isRenaming ? -1 : 0}
        role="treeitem"
        aria-expanded={isFolder ? isExpanded : undefined}
        onMouseDown={handleMouseDown}
        onKeyDown={handleRowKeyDown}
        onFocus={handleRowFocus}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => onContextMenu(e, item)}
        title={item.filePath || item.name}
      >
        {/* Folder chevron */}
        {isFolder && (
          <svg
            className={`${chevronClass} transition-transform duration-150 text-text-muted ${isExpanded ? "rotate-90" : ""}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" />
          </svg>
        )}

        {/* Icon */}
        {isFolder ? (
          <svg
            className={`${iconClass} transition-colors ${showDropHighlight ? "text-accent" : "text-sky-400/80"}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
        ) : (
          <div className="flex items-center">
            <svg
              className={`${iconClass} ${noteIconIndentClass} text-text-muted`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            {showSidebarMetadata && isPinned(item.id) && (
              <svg
                className={`${isCompactDensity ? "w-2.5 h-2.5 mr-0.5" : "w-3 h-3 mr-1"} text-amber-400`}
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            )}
          </div>
        )}

        {/* Name */}
        {isRenaming ? (
          <input
            type="text"
            value={renamingValue}
            onChange={(e) => setRenamingValue(e.target.value)}
            onBlur={handleRename}
            onKeyDown={handleRenameKeyDown}
            className="flex-1 bg-overlay-light text-text-primary px-2 py-0.5 rounded outline-none border border-overlay-medium focus:border-accent text-sm"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <span
              className={`flex-1 ${nameDensityClass} truncate`}
              title={item.filePath || item.name}
            >
              {item.name}
            </span>

            {/* Backlinks badge */}
            {showInlineMetadata && item.type === "note" && backlinksCount > 0 && (
              <div
                className={`${isSpaciousDensity ? "ml-3 rounded-full bg-overlay-subtle px-1.5 py-0.5" : "ml-2"} flex items-center gap-0.5 shrink-0`}
                title={`${backlinksCount} backlink${backlinksCount !== 1 ? "s" : ""}`}
              >
                <svg
                  className="w-3 h-3 text-purple-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
                <span className="text-[10px] text-purple-400 font-medium">{backlinksCount}</span>
              </div>
            )}

            {/* Tags */}
            {showInlineMetadata && item.type === "note" && noteTags.length > 0 && (
              <div
                className={`${isSpaciousDensity ? "gap-1.5 ml-3" : "gap-1 ml-2"} flex items-center`}
              >
                {noteTags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className={`${isSpaciousDensity ? "px-1.5 py-0.5 rounded-md" : "px-1 py-0.5 rounded"} text-[10px] bg-accent/20 text-accent`}
                    title={`#${tag}`}
                  >
                    #{tag}
                  </span>
                ))}
                {noteTags.length > 2 && (
                  <span className="text-[10px] text-text-muted">+{noteTags.length - 2}</span>
                )}
              </div>
            )}
          </>
        )}

        {/* Saved indicator */}
        {showInlineMetadata && item.type === "note" && item.filePath && (
          <svg
            className={`${isSpaciousDensity ? "w-3.5 h-3.5 ml-1.5" : "w-3 h-3 ml-1"} text-emerald-400/70`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </div>

      {/* Children */}
      {renderChildren && isFolder && isExpanded && (
        <div>
          {children
            .sort((a, b) => {
              if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
              if (a.order !== undefined && b.order !== undefined) {
                return a.order - b.order;
              }
              return a.name.localeCompare(b.name);
            })
            .map((child) => (
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
                onSetDropTarget={onSetDropTarget}
                onClearDropTarget={onClearDropTarget}
                dropTargetFolderId={dropTargetFolderId}
                isExternalDragging={isExternalDragging}
                onRequestDelete={onRequestDelete}
                onMoveItemOut={onMoveItemOut}
                onMoveItemIn={onMoveItemIn}
                renderChildren={renderChildren}
              />
            ))}
        </div>
      )}
    </div>
  );
};

export default TreeItem;
