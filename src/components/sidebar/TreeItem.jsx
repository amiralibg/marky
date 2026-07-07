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
  internalDropTargetId,
  setInternalDropTargetId,
  isExternalDragging,
  onRequestDelete,
  onMoveItemOut,
  onMoveItemIn,
  reorderTarget,
  setReorderTarget,
  onReorder,
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

  // Drop at a row edge to place the dragged item as a sibling of this row.
  // Same parent => reorder in place; different parent => move into this row's
  // parent (e.g. dropping at the edge of a root item moves the item to root).
  const canReorder =
    draggedItem &&
    draggedItem.id !== item.id &&
    !isDescendantOf(item.id, draggedItem.id, getChildren);

  // Determine if this folder is the current external drop target
  const isExternalDropTarget = isFolder && dropTargetFolderId === item.id && isExternalDragging;

  // Only one folder is highlighted at a time (shared target from the sidebar)
  const isInternalDropTarget = canDrop && internalDropTargetId === item.id;

  // Show visual feedback for internal drag or external drop target
  const showDropHighlight = isInternalDropTarget || isExternalDropTarget;
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

  const scheduleAutoExpand = () => {
    if (!isFolder || isExpanded || autoExpandTimeoutRef.current) return;
    // Folder opens after a short hover hold so you can drop inside (motion spec 1c).
    autoExpandTimeoutRef.current = setTimeout(() => {
      toggleFolder(item.id);
      autoExpandTimeoutRef.current = null;
    }, 500);
  };

  const cancelAutoExpand = () => {
    if (autoExpandTimeoutRef.current) {
      clearTimeout(autoExpandTimeoutRef.current);
      autoExpandTimeoutRef.current = null;
    }
  };

  // While dragging, decide between "nest into folder" (mid-row of a folder)
  // and "reorder before/after" (row edges, among same-parent siblings).
  const handleRowDragOver = (e) => {
    if (!draggedItem || isBeingDragged) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = rect.height ? (e.clientY - rect.top) / rect.height : 0.5;

    if (canDrop && fraction > 0.3 && fraction < 0.7) {
      setInternalDropTargetId?.(item.id);
      setReorderTarget?.(null);
      scheduleAutoExpand();
      return;
    }

    cancelAutoExpand();
    setInternalDropTargetId?.(null);

    if (canReorder) {
      setReorderTarget?.({ id: item.id, position: fraction < 0.5 ? "before" : "after" });
    } else {
      setReorderTarget?.(null);
    }
  };

  const handleMouseLeave = () => {
    cancelAutoExpand();
  };

  const handleMouseUp = (e) => {
    if (!draggedItem) return;

    if (reorderTarget?.id === item.id && canReorder) {
      e.stopPropagation();
      onReorder?.(draggedItem, item, reorderTarget.position);
    } else if (canDrop && internalDropTargetId === item.id) {
      e.stopPropagation();
      onItemMove(draggedItem, item);
    }

    setInternalDropTargetId?.(null);
    setReorderTarget?.(null);
    cancelAutoExpand();
  };

  const handleDoubleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    beginRename();
  };

  const metadataParts = [];
  if (isFolder) {
    metadataParts.push(isExpanded ? "expanded" : "collapsed");
    if (children.length > 0) {
      metadataParts.push(`${children.length} item${children.length !== 1 ? "s" : ""}`);
    }
  } else {
    if (isSelected) metadataParts.push("selected");
    if (showSidebarMetadata && isPinned(item.id)) metadataParts.push("pinned");
    if (backlinksCount > 0) {
      metadataParts.push(`${backlinksCount} backlink${backlinksCount !== 1 ? "s" : ""}`);
    }
    if (noteTags.length > 0) {
      metadataParts.push(`tags ${noteTags.join(", ")}`);
    }
  }
  const treeItemLabel = `${isFolder ? "Folder" : "Note"} ${item.name}${
    metadataParts.length ? `, ${metadataParts.join(", ")}` : ""
  }`;

  const showReorderBar = reorderTarget?.id === item.id && canReorder;
  const gapBefore = showReorderBar && reorderTarget.position === "before";
  const gapAfter = showReorderBar && reorderTarget.position === "after";

  return (
    <div
      className={`relative ${isBeingDragged ? "opacity-40" : ""}`}
      style={{ transition: "opacity 200ms ease" }}
    >
      {/* Insertion line — 3px accent bar shown ONLY at the current drop target.
          Rendered conditionally (no fade) so dragging never leaves a trail of
          lines. Sits in the row gap without shifting layout, so the row itself
          stays under the cursor and the drop always lands. */}
      {showReorderBar && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-2 z-10 h-[2.5px] rounded-full bg-accent"
          style={{
            left: `${level * 16 + 12}px`,
            top: gapBefore ? "-1.5px" : "auto",
            bottom: gapAfter ? "-1.5px" : "auto",
            boxShadow: "0 0 0 2px var(--color-bg-sidebar)",
          }}
        />
      )}
      <div
        className={`
          flex items-center select-none relative
          ${rowDensityClass} transition-colors duration-150
          ${isSelected ? "bg-item-active text-text-primary font-medium" : "text-text-secondary"}
          ${!isBeingDragged && !isRenaming ? "hover:bg-item-hover hover:text-text-primary cursor-pointer" : ""}
          ${showDropHighlight ? "bg-accent-dim text-text-primary ring-1 ring-accent/40 ring-inset" : ""}
          ${isBeingDragged ? "cursor-grabbing" : "cursor-grab"}
          focus:outline-none focus:bg-item-hover focus:text-text-primary focus:ring-1 focus:ring-accent/40 focus:ring-inset
          focus-visible:outline-none
        `}
        style={{
          paddingLeft: `${level * 16 + 8}px`,
        }}
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
        aria-label={treeItemLabel}
        aria-level={level + 1}
        aria-selected={!isFolder ? isSelected : undefined}
        onMouseDown={handleMouseDown}
        onKeyDown={handleRowKeyDown}
        onFocus={handleRowFocus}
        onMouseMove={draggedItem ? handleRowDragOver : undefined}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => onContextMenu(e, item)}
        title={item.filePath || item.name}
      >
        {/* Chevron — always rendered to keep icon alignment; invisible for notes */}
        <svg
          className={`${chevronClass} shrink-0 text-text-muted transition-transform duration-150 ${
            isFolder ? (isExpanded ? "rotate-90 opacity-70" : "opacity-70") : "opacity-0"
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>

        {/* Icon */}
        {isFolder ? (
          <svg
            className={`${iconClass} shrink-0 transition-colors ${showDropHighlight ? "text-accent" : "text-text-muted"}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
        ) : (
          <div className="flex items-center shrink-0">
            <svg
              className={`${iconClass} text-text-muted`}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
              <path d="M14 3v5h5" />
            </svg>
            {showSidebarMetadata && isPinned(item.id) && (
              <svg
                className={`${isCompactDensity ? "w-2.5 h-2.5 mr-0.5" : "w-3 h-3 mr-1"} text-accent`}
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
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
            aria-label={`Rename ${item.type} ${item.name}`}
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
                  className="w-3 h-3 text-text-muted"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
                <span className="text-[10px] text-text-muted font-medium">{backlinksCount}</span>
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

        {/* Saved indicator — small accent dot (Paper design) */}
        {showInlineMetadata && item.type === "note" && item.filePath && (
          <span
            className="ml-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70"
            aria-hidden="true"
          />
        )}
      </div>

      {/* Children */}
      {renderChildren && isFolder && isExpanded && (
        <div role="group">
          {children
            .sort((a, b) => {
              // Manual drag order wins (may interleave files/folders).
              const ao = a.order;
              const bo = b.order;
              if (ao !== undefined && bo !== undefined) return ao - bo;
              if (ao !== undefined) return -1;
              if (bo !== undefined) return 1;
              if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
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
                internalDropTargetId={internalDropTargetId}
                setInternalDropTargetId={setInternalDropTargetId}
                isExternalDragging={isExternalDragging}
                onRequestDelete={onRequestDelete}
                onMoveItemOut={onMoveItemOut}
                onMoveItemIn={onMoveItemIn}
                reorderTarget={reorderTarget}
                setReorderTarget={setReorderTarget}
                onReorder={onReorder}
                renderChildren={renderChildren}
              />
            ))}
        </div>
      )}
    </div>
  );
};

export default TreeItem;
