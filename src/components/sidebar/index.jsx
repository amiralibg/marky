import {
  useState,
  useCallback,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  useMemo,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import useNotesStore from "../../store/notesStore";
import useSettingsStore, { THEMES } from "../../store/settingsStore";
import useUIStore from "../../store/uiStore";
import { checkForAppUpdate, installAppUpdate } from "../../utils/appUpdater";

import {
  openMarkdownFile,
  saveMarkdownFile,
  openFolder,
  copyEntriesToFolder,
} from "../../utils/fileSystem";

import TreeItem from "./TreeItem";
import ContextMenu from "./ContextMenu";
import ConfirmDialog from "../modals/ConfirmDialog";
import { UpdateIcon } from "../icons/AppUpdateIcon";

const VIRTUAL_TREE_THRESHOLD = 250;
const TREE_ROW_HEIGHTS = {
  compact: 28,
  comfortable: 36,
  spacious: 44,
};
const VIRTUAL_TREE_OVERSCAN = 8;

const sortSidebarItems = (entries, sortBy, isRootLevel = false) => {
  const items = [...entries];
  return items.sort((a, b) => {
    // Manual drag order wins outright (and may interleave files/folders). Once a
    // sibling group has been reordered, reorderItems stamps every sibling with an
    // `order`, so this branch drives the whole group.
    const ao = a.order;
    const bo = b.order;
    if (ao !== undefined && bo !== undefined) return ao - bo;
    if (ao !== undefined) return -1;
    if (bo !== undefined) return 1;

    // No manual order yet: folders first, then by the active sort setting.
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;

    if (!isRootLevel) {
      return a.name.localeCompare(b.name);
    }

    switch (sortBy) {
      case "name-desc":
        return b.name.localeCompare(a.name);
      case "date-desc":
        return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
      case "date-asc":
        return new Date(a.updatedAt || a.createdAt) - new Date(b.updatedAt || b.createdAt);
      case "name-asc":
      default:
        return a.name.localeCompare(b.name);
    }
  });
};

// Helper to find the folder element at given coordinates
const findFolderAtPosition = (x, y, sidebarElement) => {
  if (!sidebarElement) return null;

  const folderElements = Array.from(
    sidebarElement.querySelectorAll("[data-treeitem-row='true'][data-folder-path]")
  );
  const matchingElements = folderElements.filter((el) => {
    const rect = el.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  });

  if (matchingElements.length === 0) {
    return null;
  }

  matchingElements.sort((a, b) => {
    const aRect = a.getBoundingClientRect();
    const bRect = b.getBoundingClientRect();
    return aRect.width * aRect.height - bRect.width * bRect.height;
  });

  const target = matchingElements[0];
  return {
    id: target.dataset.folderId,
    path: target.dataset.folderPath,
    name: target.dataset.folderName,
    element: target,
  };
};

const Sidebar = forwardRef(
  ({ onSettingsClick, onOpenGraph, onOpenTemplate, onRenameItem }, ref) => {
    const {
      items,
      createFolder,
      getCurrentNote,
      updateNotePath,
      loadFolderFromSystem,
      moveItem,
      moveItemToRoot,
      reorderItems,
      rootFolderPath,
      refreshRootFromDisk,
      selectNote,
      expandedFolders,
      selectedTags,
      isLoading,
      loadingProgress,
      recentWorkspaces,
      dirtyNoteIds,
    } = useNotesStore();
    const sidebarDensity = useSettingsStore((state) => state.sidebarDensity);
    const themeId = useSettingsStore((state) => state.themeId);
    const toggleColorScheme = useSettingsStore((state) => state.toggleColorScheme);
    const { addNotification, setShowWorkspaceModal, appUpdate } = useUIStore();
    const [contextMenu, setContextMenu] = useState(null);
    const [draggedItem, setDraggedItem] = useState(null);
    const [dragPosition, setDragPosition] = useState(null);
    // Single shared "drop into this folder" target for internal drags (one highlight at a time)
    const [internalDropTargetId, setInternalDropTargetId] = useState(null);
    // Reorder drop indicator: { id, position: 'before' | 'after' }
    const [reorderTarget, setReorderTarget] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy] = useState("name-asc"); // 'name-asc', 'name-desc', 'date-desc', 'date-asc'
    const [showWorkspaceSwitcher, setShowWorkspaceSwitcher] = useState(false);
    const [dropTargetFolder, setDropTargetFolder] = useState(null);
    const [isExternalDragging, setIsExternalDragging] = useState(false);
    const [isRootDropActive, setIsRootDropActive] = useState(false);
    const [pendingDeleteItem, setPendingDeleteItem] = useState(null);
    const [treeScrollTop, setTreeScrollTop] = useState(0);
    const [treeViewportHeight, setTreeViewportHeight] = useState(0);
    const dropHandledRef = useRef(false);
    const dropTargetRef = useRef(null);
    const sidebarRef = useRef(null);
    const currentNote = getCurrentNote();
    const workspaceName = rootFolderPath
      ? rootFolderPath.split("/").filter(Boolean).pop() || rootFolderPath
      : "";
    // "/Users/name/Documents/My Vault" → "~/Documents/My Vault"
    const displayWorkspacePath = rootFolderPath
      ? rootFolderPath.replace(/^\/(Users|home)\/[^/]+/, "~")
      : "";
    const dirtyCount = dirtyNoteIds?.length || 0;
    const isDarkTheme = useMemo(
      () => THEMES.find((t) => t.id === themeId)?.type === "dark",
      [themeId]
    );
    const lastSavedLabel = useMemo(() => {
      const timestamps = items
        .filter((item) => item.type === "note" && (item.updatedAt || item.createdAt))
        .map((item) => new Date(item.updatedAt || item.createdAt).getTime());
      if (timestamps.length === 0) return "";
      const ageMs = Date.now() - Math.max(...timestamps);
      if (ageMs < 90 * 1000) return "just now";
      if (ageMs < 60 * 60 * 1000) return `${Math.round(ageMs / 60000)}m ago`;
      if (ageMs < 24 * 60 * 60 * 1000) return `${Math.round(ageMs / 3600000)}h ago`;
      return `${Math.round(ageMs / 86400000)}d ago`;
    }, [items]);

    // Search filtering function
    const filterItemsBySearch = useCallback((items, query) => {
      if (!query.trim()) return items;

      const searchLower = query.toLowerCase();
      const matchedIds = new Set();

      // Find all matching notes and folders
      items.forEach((item) => {
        const nameMatch = item.name.toLowerCase().includes(searchLower);
        const contentMatch =
          item.type === "note" && item.content && item.content.toLowerCase().includes(searchLower);

        if (nameMatch || contentMatch) {
          matchedIds.add(item.id);

          // Add all ancestors to show the path
          let current = item;
          while (current.parentId) {
            matchedIds.add(current.parentId);
            current = items.find((i) => i.id === current.parentId);
            if (!current) break;
          }
        }
      });

      return items.filter((item) => matchedIds.has(item.id));
    }, []);

    // Apply combined filters: search + tags
    const filteredItems = useMemo(() => {
      let result = items;

      // Apply tag filtering first
      if (selectedTags.length > 0) {
        const tagFilteredNotes = new Set();
        items.forEach((item) => {
          if (item.type === "note" && item.content) {
            const noteTags =
              item.content
                .match(/(?:^|[\s])#([a-zA-Z0-9_-]+)/g)
                ?.map((t) => t.trim().substring(1).toLowerCase()) || [];
            if (selectedTags.every((tag) => noteTags.includes(tag))) {
              tagFilteredNotes.add(item.id);
              let current = item;
              while (current.parentId) {
                tagFilteredNotes.add(current.parentId);
                current = items.find((i) => i.id === current.parentId);
                if (!current) break;
              }
            }
          }
        });
        result = items.filter((item) => tagFilteredNotes.has(item.id));
      }

      // Then apply search filtering
      if (searchQuery) {
        result = filterItemsBySearch(result, searchQuery);
      }

      return result;
    }, [items, selectedTags, searchQuery, filterItemsBySearch]);

    const isTreeFiltered = searchQuery || selectedTags.length > 0;
    const treeSourceItems = useMemo(
      () => (isTreeFiltered ? filteredItems : items),
      [filteredItems, isTreeFiltered, items]
    );

    const treeChildrenByParent = useMemo(() => {
      const childrenMap = new Map();
      treeSourceItems.forEach((item) => {
        const key = item.parentId ?? "__root__";
        const bucket = childrenMap.get(key) || [];
        bucket.push(item);
        childrenMap.set(key, bucket);
      });
      return childrenMap;
    }, [treeSourceItems]);

    const rootItems = useMemo(() => {
      return sortSidebarItems(treeChildrenByParent.get("__root__") || [], sortBy, true);
    }, [treeChildrenByParent, sortBy]);

    const flattenedTreeRows = useMemo(() => {
      const rows = [];
      const expandedSet = new Set(expandedFolders);

      const visit = (branchItems, level) => {
        branchItems.forEach((entry) => {
          rows.push({ item: entry, level });
          if (entry.type === "folder" && expandedSet.has(entry.id)) {
            const children = sortSidebarItems(
              treeChildrenByParent.get(entry.id) || [],
              sortBy,
              false
            );
            visit(children, level + 1);
          }
        });
      };

      visit(rootItems, 0);
      return rows;
    }, [expandedFolders, rootItems, sortBy, treeChildrenByParent]);

    const useVirtualizedTree = flattenedTreeRows.length > VIRTUAL_TREE_THRESHOLD;
    const virtualTreeRowHeight = TREE_ROW_HEIGHTS[sidebarDensity] || TREE_ROW_HEIGHTS.comfortable;
    const virtualStartIndex = useVirtualizedTree
      ? Math.max(0, Math.floor(treeScrollTop / virtualTreeRowHeight) - VIRTUAL_TREE_OVERSCAN)
      : 0;
    const virtualEndIndex = useVirtualizedTree
      ? Math.min(
          flattenedTreeRows.length,
          Math.ceil((treeScrollTop + treeViewportHeight) / virtualTreeRowHeight) +
            VIRTUAL_TREE_OVERSCAN
        )
      : flattenedTreeRows.length;
    const virtualRows = useVirtualizedTree
      ? flattenedTreeRows.slice(virtualStartIndex, virtualEndIndex)
      : flattenedTreeRows;

    const handleContextMenu = (e, item) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        item,
      });
    };

    // Moving an item rebuilds the tree from disk, which remounts the moved row
    // and (for large virtualized trees) drops the scroll container to the top.
    // Reassert the captured scrollTop across several frames so it survives the
    // async re-scan, the virtual-row recompute, and the length-change effect.
    const restoreTreeScroll = (top) => {
      let frame = 0;
      const tick = () => {
        const viewport = sidebarRef.current;
        if (viewport) {
          if (Math.abs(viewport.scrollTop - top) > 1) viewport.scrollTop = top;
          setTreeScrollTop(top);
        }
        if (frame++ < 8) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    const handleItemMove = async (draggedItem, targetFolder) => {
      if (!draggedItem || !targetFolder) return;
      if (draggedItem.id === targetFolder.id) return;
      if (targetFolder.type !== "folder") return;

      const scrollTop = sidebarRef.current?.scrollTop ?? 0;

      // Set flag to prevent handleDropToRoot from firing
      dropHandledRef.current = true;

      // Clear drag state immediately to prevent double-move
      setDraggedItem(null);
      setIsRootDropActive(false);

      try {
        await moveItem(draggedItem.id, targetFolder.id);
      } catch (error) {
        console.error("❌ Failed to move item:", error);
        addNotification("Failed to move item: " + error.message, "error");
      } finally {
        restoreTreeScroll(scrollTop);
        // Reset the flag after a brief delay
        setTimeout(() => {
          dropHandledRef.current = false;
        }, 100);
      }
    };

    const handleReorder = async (dragged, reference, position) => {
      if (!dragged || !reference || dragged.id === reference.id) return;

      const scrollTop = sidebarRef.current?.scrollTop ?? 0;

      // Prevent the empty-space root-drop handler from also firing on this mouseup.
      dropHandledRef.current = true;
      setDraggedItem(null);
      setReorderTarget(null);

      const targetParentId = reference.parentId ?? null;
      const sameParent = (dragged.parentId ?? null) === targetParentId;

      try {
        if (sameParent) {
          // In-place reorder among existing siblings.
          const isRootLevel = targetParentId === null;
          const siblings = sortSidebarItems(
            (treeChildrenByParent.get(targetParentId ?? "__root__") || []).filter(
              (entry) => entry.id !== dragged.id
            ),
            sortBy,
            isRootLevel
          );
          let refIndex = siblings.findIndex((entry) => entry.id === reference.id);
          if (refIndex === -1) refIndex = siblings.length - 1;
          reorderItems(dragged.id, targetParentId, position === "after" ? refIndex + 1 : refIndex);
        } else if (targetParentId === null) {
          // Dropped at the edge of a root item => move to workspace root.
          await moveItemToRoot(dragged.id);
        } else {
          // Move into the folder that owns the reference row.
          await moveItem(dragged.id, targetParentId);
        }
      } catch (error) {
        console.error("Failed to move item:", error);
        addNotification("Failed to move item: " + error.message, "error");
      } finally {
        if (!sameParent) restoreTreeScroll(scrollTop);
        setTimeout(() => {
          dropHandledRef.current = false;
        }, 100);
      }
    };

    const handleSetDropTarget = (targetFolder) => {
      // Set the drop target for the Tauri file drop event to use
      if (targetFolder && targetFolder.type === "folder" && targetFolder.filePath) {
        dropTargetRef.current = targetFolder;
        setDropTargetFolder(targetFolder);
      }
    };

    const handleClearDropTarget = () => {
      dropTargetRef.current = null;
      setDropTargetFolder(null);
    };

    const handleNewNote = useCallback(async () => {
      try {
        // Show template modal instead of creating directly
        onOpenTemplate(null);
      } catch (error) {
        console.error("Failed to open template modal:", error);
      }
    }, [onOpenTemplate]);

    const handleNewFolder = useCallback(async () => {
      try {
        await createFolder(null);
      } catch (error) {
        if (error?.message && /exists/i.test(error.message)) {
          return;
        }
        console.error("Failed to create folder:", error);
        if (/workspace/i.test(error.message)) {
          setShowWorkspaceModal(true);
        } else {
          addNotification("Failed to create folder: " + error.message, "error");
        }
      }
    }, [createFolder]);

    const handleOpenFile = useCallback(async () => {
      try {
        const fileData = await openMarkdownFile();
        if (fileData) {
          const { loadNoteFromFile, selectNote } = useNotesStore.getState();
          const noteId = loadNoteFromFile(fileData, null);
          if (noteId) {
            selectNote(noteId);
          }
        }
      } catch (error) {
        console.error("Failed to open file:", error);
        addNotification("Failed to open file: " + error.message, "error");
      }
    }, [addNotification]);

    const handleOpenFolder = useCallback(async () => {
      try {
        const folderData = await openFolder();
        if (folderData) {
          await loadFolderFromSystem(folderData);
        }
      } catch (error) {
        console.error("Failed to open folder:", error);
        addNotification("Failed to open folder: " + error.message, "error");
      }
    }, [addNotification, loadFolderFromSystem]);

    // Expose methods to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        handleNewNote,
        handleNewFolder,
        handleOpenFolder,
      }),
      [handleNewNote, handleNewFolder, handleOpenFolder]
    );

    const handleSave = useCallback(async () => {
      try {
        const currentNote = getCurrentNote();
        if (!currentNote) return;

        const savedPath = await saveMarkdownFile(currentNote.content, currentNote.filePath);
        if (savedPath) {
          updateNotePath(currentNote.id, savedPath);
        }
      } catch (error) {
        console.error("Failed to save file:", error);
      }
    }, [getCurrentNote, updateNotePath]);

    const handleCloseNote = useCallback(() => {
      const { selectNote } = useNotesStore.getState();
      selectNote(null);
    }, []);

    const handleRename = (item) => {
      onRenameItem(item);
    };

    const getFolderMoveTarget = useCallback(
      (item, currentRow, rowIndex = null) => {
        const descendants = new Set();
        const collectDescendants = (parentId) => {
          items
            .filter((entry) => entry.parentId === parentId)
            .forEach((entry) => {
              descendants.add(entry.id);
              if (entry.type === "folder") {
                collectDescendants(entry.id);
              }
            });
        };

        if (item.type === "folder") {
          collectDescendants(item.id);
        }

        if (Number.isInteger(rowIndex)) {
          for (let index = rowIndex - 1; index >= 0; index -= 1) {
            const candidate = flattenedTreeRows[index]?.item;
            if (!candidate || candidate.type !== "folder") continue;
            if (candidate.id === item.id || descendants.has(candidate.id)) continue;
            return candidate;
          }
          return null;
        }

        const treeRoot =
          currentRow?.closest("[data-sidebar-tree-root='true']") || sidebarRef.current;
        if (!treeRoot) return null;

        const rows = Array.from(treeRoot.querySelectorAll("[data-treeitem-row='true']"));
        const currentIndex = rows.indexOf(currentRow);
        if (currentIndex <= 0) return null;

        for (let index = currentIndex - 1; index >= 0; index -= 1) {
          const candidateId = rows[index]?.dataset?.itemId;
          const candidate = items.find((entry) => entry.id === candidateId);
          if (!candidate || candidate.type !== "folder") continue;
          if (candidate.id === item.id || descendants.has(candidate.id)) continue;
          return candidate;
        }

        return null;
      },
      [flattenedTreeRows, items]
    );

    const handleMoveItemOut = useCallback(
      async (item) => {
        if (!item?.parentId) return;

        const parent = items.find((entry) => entry.id === item.parentId);
        if (!parent) return;

        try {
          if (parent.parentId) {
            await moveItem(item.id, parent.parentId);
          } else {
            await moveItemToRoot(item.id);
          }
        } catch (error) {
          console.error("Failed to move item outward:", error);
          addNotification("Failed to move item: " + error.message, "error");
        }
      },
      [addNotification, items, moveItem, moveItemToRoot]
    );

    const handleMoveItemIn = useCallback(
      async (item, currentRow, rowIndex = null) => {
        const targetFolder = getFolderMoveTarget(item, currentRow, rowIndex);
        if (!targetFolder) {
          addNotification("No valid previous folder to move into", "info", 1800);
          return;
        }

        try {
          await moveItem(item.id, targetFolder.id);
        } catch (error) {
          console.error("Failed to move item inward:", error);
          addNotification("Failed to move item: " + error.message, "error");
        }
      },
      [addNotification, getFolderMoveTarget, moveItem]
    );

    const getDeleteMessage = useCallback(
      (item) => {
        if (!item) return;

        const collectDescendants = (id) => {
          const children = items.filter((entry) => entry.parentId === id);
          let noteCount = 0;
          let folderCount = 0;

          children.forEach((child) => {
            if (child.type === "note") {
              noteCount += 1;
            } else if (child.type === "folder") {
              folderCount += 1;
              const descendantCounts = collectDescendants(child.id);
              noteCount += descendantCounts.noteCount;
              folderCount += descendantCounts.folderCount;
            }
          });

          return { noteCount, folderCount };
        };

        if (item.type !== "folder") {
          return `Are you sure you want to delete "${item.name}"? This action cannot be undone.`;
        }

        const { noteCount, folderCount } = collectDescendants(item.id);
        const parts = [];
        if (noteCount > 0) parts.push(`${noteCount} note${noteCount !== 1 ? "s" : ""}`);
        if (folderCount > 0) parts.push(`${folderCount} subfolder${folderCount !== 1 ? "s" : ""}`);
        return parts.length > 0
          ? `Are you sure you want to delete "${item.name}" and its ${parts.join(" and ")}? This action cannot be undone.`
          : `Are you sure you want to delete "${item.name}"? This action cannot be undone.`;
      },
      [items]
    );

    const requestDeleteItem = useCallback((item) => {
      if (!item) return;
      setPendingDeleteItem(item);
    }, []);

    const handleDeleteItem = useCallback(
      async (item) => {
        if (!item) return;

        try {
          const { undoLastDelete } = useNotesStore.getState();
          const hasFilePath = Boolean(item.filePath);
          await useNotesStore.getState().deleteItem(item.id);

          addNotification(
            `${item.type === "note" ? "Note" : "Folder"} deleted`,
            "success",
            hasFilePath ? 5000 : 3000,
            hasFilePath
              ? {
                  label: "Undo",
                  callback: async () => {
                    const restored = await undoLastDelete();
                    addNotification(
                      restored ? "Delete undone" : "Failed to undo delete",
                      restored ? "success" : "error"
                    );
                  },
                }
              : null
          );
        } catch (error) {
          console.error("Delete failed:", error);
          addNotification("Delete failed: " + error.message, "error");
        } finally {
          setPendingDeleteItem(null);
        }
      },
      [addNotification]
    );

    const handleDropToRoot = async (event) => {
      if (!draggedItem) return;

      const rowTarget =
        event?.target instanceof Element
          ? event.target.closest("[data-treeitem-row='true']")
          : null;

      if (rowTarget || !isRootDropActive) {
        setIsRootDropActive(false);
        return;
      }

      // If drop was already handled by a folder, don't process root drop
      if (dropHandledRef.current) {
        setDraggedItem(null);
        setIsRootDropActive(false);
        return;
      }

      try {
        await moveItemToRoot(draggedItem.id);
      } catch (error) {
        console.error("❌ Failed to move item:", error);
        addNotification("Failed to move item: " + error.message, "error");
      }

      setDraggedItem(null);
      setIsRootDropActive(false);
    };

    // Track mouse position while dragging for ghost element
    useEffect(() => {
      if (!draggedItem) {
        setDragPosition(null);
        setIsRootDropActive(false);
        setInternalDropTargetId(null);
        setReorderTarget(null);
        return;
      }

      const handleMouseMove = (e) => {
        setDragPosition({ x: e.clientX, y: e.clientY });
      };

      document.addEventListener("mousemove", handleMouseMove);
      return () => document.removeEventListener("mousemove", handleMouseMove);
    }, [draggedItem]);

    const handleTreeMouseMove = useCallback(
      (event) => {
        if (!draggedItem) return;

        const rowTarget =
          event.target instanceof Element
            ? event.target.closest("[data-treeitem-row='true']")
            : null;

        const nextValue = !rowTarget;
        setIsRootDropActive((current) => (current === nextValue ? current : nextValue));
      },
      [draggedItem]
    );

    const handleTreeMouseLeave = useCallback(() => {
      setIsRootDropActive(false);
    }, []);

    useEffect(() => {
      const viewport = sidebarRef.current;
      if (!viewport) return undefined;

      const updateViewport = () => {
        setTreeViewportHeight(viewport.clientHeight);
      };

      updateViewport();

      const observer = new ResizeObserver(updateViewport);
      observer.observe(viewport);

      return () => {
        observer.disconnect();
      };
    }, [useVirtualizedTree]);

    useEffect(() => {
      const viewport = sidebarRef.current;
      if (!viewport) return;

      if (!useVirtualizedTree) {
        setTreeScrollTop(0);
        return;
      }

      setTreeScrollTop(viewport.scrollTop);
    }, [flattenedTreeRows.length, useVirtualizedTree]);

    const focusTreeIndex = useCallback(
      (index) => {
        const viewport = sidebarRef.current;
        if (!viewport || flattenedTreeRows.length === 0) return;

        const clampedIndex = Math.max(0, Math.min(flattenedTreeRows.length - 1, index));
        const targetTop = clampedIndex * virtualTreeRowHeight;
        const targetBottom = targetTop + virtualTreeRowHeight;
        const visibleTop = viewport.scrollTop;
        const visibleBottom = visibleTop + viewport.clientHeight;

        if (targetTop < visibleTop) {
          viewport.scrollTop = targetTop;
        } else if (targetBottom > visibleBottom) {
          viewport.scrollTop = targetBottom - viewport.clientHeight;
        }

        setTreeScrollTop(viewport.scrollTop);

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            viewport.querySelector(`[data-tree-index="${clampedIndex}"]`)?.focus();
          });
        });
      },
      [flattenedTreeRows.length, virtualTreeRowHeight]
    );

    useEffect(() => {
      if (typeof window === "undefined" || !window.__TAURI__) {
        return undefined;
      }

      let isMounted = true;
      const unlisteners = [];

      const registerListeners = async () => {
        const attach = async (eventName, handler) => {
          try {
            const unlisten = await listen(eventName, async () => {
              try {
                await handler();
              } catch (error) {
                console.error(`Menu action ${eventName} failed:`, error);
              }
            });

            if (isMounted) {
              unlisteners.push(unlisten);
            } else {
              unlisten();
            }
          } catch (error) {
            console.error(`Failed to register menu listener for ${eventName}:`, error);
          }
        };

        await attach("menu://new-note", handleNewNote);
        await attach("menu://new-folder", handleNewFolder);
        await attach("menu://open-file", handleOpenFile);
        await attach("menu://open-folder", handleOpenFolder);
        await attach("menu://save-note", handleSave);
        await attach("menu://close-note", handleCloseNote);
      };

      registerListeners();

      return () => {
        isMounted = false;
        while (unlisteners.length > 0) {
          const unlisten = unlisteners.pop();
          try {
            unlisten();
          } catch (error) {
            console.error("Failed to cleanup menu listener:", error);
          }
        }
      };
    }, [
      handleNewNote,
      handleNewFolder,
      handleOpenFile,
      handleOpenFolder,
      handleSave,
      handleCloseNote,
    ]);

    // Prevent browser default drag-drop behavior (opening files)
    useEffect(() => {
      const preventDefaults = (e) => {
        e.preventDefault();
        e.stopPropagation();
      };

      // Prevent browser from opening dropped files
      document.addEventListener("dragover", preventDefaults);
      document.addEventListener("drop", preventDefaults);

      return () => {
        document.removeEventListener("dragover", preventDefaults);
        document.removeEventListener("drop", preventDefaults);
      };
    }, []);

    // Tauri file drop listener using onDragDropEvent API (Tauri v2)
    useEffect(() => {
      let unlisten = null;

      const setupFileDropListener = async () => {
        try {
          const webview = getCurrentWebview();

          if (!webview) {
            return;
          }

          unlisten = await webview.onDragDropEvent(async (event) => {
            const { type } = event.payload;

            // Tauri v2 returns PhysicalPosition — convert to logical (CSS) pixels
            // so coordinates match getBoundingClientRect() on HiDPI/Retina displays
            const toLogical = (position) => {
              if (!position) return null;
              const scale = window.devicePixelRatio || 1;
              return { x: position.x / scale, y: position.y / scale };
            };

            if (type === "enter") {
              // Files entered the window — start showing drop feedback
              setIsExternalDragging(true);
            } else if (type === "over") {
              // User is hovering files over the window
              const { position } = event.payload;
              const logicalPos = toLogical(position);

              setIsExternalDragging(true);

              // Find folder at cursor position
              if (logicalPos && sidebarRef.current) {
                const folderAtPos = findFolderAtPosition(
                  logicalPos.x,
                  logicalPos.y,
                  sidebarRef.current
                );
                if (folderAtPos) {
                  const targetFolder = {
                    id: folderAtPos.id,
                    filePath: folderAtPos.path,
                    name: folderAtPos.name,
                    type: "folder",
                  };
                  dropTargetRef.current = targetFolder;
                  setDropTargetFolder(targetFolder);
                } else {
                  // Hovering but not on a specific folder - will drop to root
                  dropTargetRef.current = null;
                  setDropTargetFolder(null);
                }
              }
            } else if (type === "drop") {
              // Prevent duplicate processing using ref (persists across StrictMode)
              if (dropHandledRef.current) {
                return;
              }
              dropHandledRef.current = true;

              // User dropped the files
              const { paths, position } = event.payload;
              const logicalPos = toLogical(position);

              // Clear dragging state
              setIsExternalDragging(false);

              if (!paths || paths.length === 0) {
                dropTargetRef.current = null;
                setDropTargetFolder(null);
                // Reset after a short delay to allow for next drop
                setTimeout(() => {
                  dropHandledRef.current = false;
                }, 500);
                return;
              }

              // Get the target folder from the ref or find by position
              let targetFolder = dropTargetRef.current;

              // If we have position data, try to find folder at that position
              if (logicalPos && sidebarRef.current) {
                const folderAtPos = findFolderAtPosition(
                  logicalPos.x,
                  logicalPos.y,
                  sidebarRef.current
                );
                if (folderAtPos) {
                  targetFolder = {
                    id: folderAtPos.id,
                    filePath: folderAtPos.path,
                    name: folderAtPos.name,
                  };
                }
              }

              try {
                if (targetFolder && targetFolder.filePath) {
                  await copyEntriesToFolder(paths, targetFolder.filePath);

                  if (rootFolderPath) {
                    await refreshRootFromDisk();
                    addNotification(
                      `Copied ${paths.length} item(s) to ${targetFolder.name}`,
                      "success"
                    );
                  }
                } else if (rootFolderPath) {
                  // If no specific folder target, copy to root
                  await copyEntriesToFolder(paths, rootFolderPath);
                  await refreshRootFromDisk();
                  addNotification(`Copied ${paths.length} item(s) to workspace root`, "success");
                } else {
                  addNotification("Open a workspace folder first to drop files into it", "info");
                }
              } catch (error) {
                console.error("Failed to copy files:", error);
                addNotification("Failed to copy files: " + error.message, "error");
              } finally {
                dropTargetRef.current = null;
                setDropTargetFolder(null);
                // Reset after a short delay to allow for next drop
                setTimeout(() => {
                  dropHandledRef.current = false;
                }, 500);
              }
            } else if (type === "leave") {
              // Files left the window
              setIsExternalDragging(false);
              dropTargetRef.current = null;
              setDropTargetFolder(null);
            }
          });
        } catch (error) {
          console.error("Failed to setup file drop listener:", error);
        }
      };

      setupFileDropListener();

      return () => {
        if (unlisten) {
          unlisten();
        }
      };
    }, [rootFolderPath, refreshRootFromDisk, addNotification]);

    return (
      <aside className="w-full bg-sidebar-bg flex flex-col h-full" aria-label="Workspace sidebar">
        {/* Workspace Switcher */}
        <div className="px-2.5 pt-2 pb-1 shrink-0 relative">
          <button
            onClick={() => setShowWorkspaceSwitcher((v) => !v)}
            className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-overlay-subtle transition-colors text-text-primary"
            title="Switch workspace"
            aria-expanded={showWorkspaceSwitcher}
          >
            <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-overlay-subtle border border-border text-text-secondary">
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
            </span>
            <span className="flex-1 min-w-0 flex flex-col text-left">
              <span className="text-[13.5px] font-semibold tracking-[-0.01em] truncate">
                {workspaceName || "Marky"}
              </span>
              {displayWorkspacePath && (
                <span className="text-[10.5px] text-text-muted font-mono truncate">
                  {displayWorkspacePath}
                </span>
              )}
            </span>
            <svg
              className={`w-3 h-3 shrink-0 text-text-muted transition-transform ${showWorkspaceSwitcher ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          {showWorkspaceSwitcher && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowWorkspaceSwitcher(false)} />
              <div className="absolute left-2.5 right-2.5 z-20 mt-1 bg-sidebar-bg border border-border rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                {recentWorkspaces.filter((ws) => ws.path !== rootFolderPath).length > 0 && (
                  <>
                    <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                      Recent
                    </p>
                    {recentWorkspaces
                      .filter((ws) => ws.path !== rootFolderPath)
                      .map((ws) => (
                        <button
                          key={ws.path}
                          onClick={async () => {
                            setShowWorkspaceSwitcher(false);
                            try {
                              const { invoke } = await import("@tauri-apps/api/core");
                              const files = await invoke("scan_folder_for_markdown", {
                                folderPath: ws.path,
                              });
                              await loadFolderFromSystem({
                                folderPath: ws.path,
                                folderName: ws.name,
                                files,
                              });
                            } catch (err) {
                              addNotification("Could not open workspace: " + err.message, "error");
                            }
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-text-secondary hover:bg-overlay-light hover:text-text-primary transition-colors"
                        >
                          <span className="truncate" title={ws.path || ws.name}>
                            {ws.name}
                          </span>
                        </button>
                      ))}
                    <div className="mx-3 my-1 border-t border-border" />
                  </>
                )}
                <button
                  onClick={() => {
                    setShowWorkspaceSwitcher(false);
                    handleOpenFolder();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-accent hover:bg-accent/10 transition-colors"
                >
                  <svg
                    className="w-3.5 h-3.5 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Open another folder…
                </button>
              </div>
            </>
          )}
        </div>

        {/* Search */}
        <div className="px-2.5 pb-1 shrink-0">
          <div className="relative group">
            <svg
              className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search"
              aria-label="Search notes and folders in sidebar"
              className="w-full pl-8 pr-10 py-[7px] bg-bg-base border border-border rounded-lg text-[13px] text-text-primary placeholder-text-muted outline-none focus:border-accent/50 transition-all"
            />
            {!searchQuery && (
              <span
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-text-muted font-mono pointer-events-none"
                aria-hidden="true"
              >
                ⌘K
              </span>
            )}
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-overlay-light rounded text-text-muted hover:text-text-primary transition-colors"
                title="Clear search"
                aria-label="Clear sidebar search"
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
            )}
          </div>
        </div>

        {/* Quick Nav */}
        {!searchQuery && (
          <nav className="px-2 pb-1 flex flex-col gap-px shrink-0">
            <button
              onClick={() => selectNote(null)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                !currentNote
                  ? "bg-accent-dim text-accent"
                  : "text-text-secondary hover:bg-overlay-subtle hover:text-text-primary"
              }`}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                viewBox="0 0 24 24"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 11l9-8 9 8M5 10v10h14V10" />
              </svg>
              Home
            </button>
            <button
              onClick={onOpenGraph}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] text-text-secondary hover:bg-overlay-subtle hover:text-text-primary transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                viewBox="0 0 24 24"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="5" cy="6" r="2.4" />
                <circle cx="18" cy="9" r="2.4" />
                <circle cx="9" cy="18" r="2.4" />
                <path d="M7 7l9 1.5M7.5 16l1-7.5" />
              </svg>
              Graph
            </button>
            <button
              onClick={() => onOpenTemplate(null)}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] text-text-secondary hover:bg-overlay-subtle hover:text-text-primary transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                viewBox="0 0 24 24"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M3 9h18M8 3v4M16 3v4" />
              </svg>
              Scheduled
            </button>
          </nav>
        )}

        {/* Section header */}
        <div className="px-3.5 pt-3 pb-1 flex items-center justify-between shrink-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            {searchQuery
              ? `${filteredItems.filter((i) => i.type === "note").length} results`
              : "Files"}
          </span>
          {!searchQuery && (
            <button
              onClick={handleNewNote}
              className="text-text-muted hover:text-text-primary text-base leading-none p-1 -m-1 transition-colors"
              title="New note"
              aria-label="New note"
            >
              +
            </button>
          )}
        </div>

        {/* Main Folder Tree */}
        <div
          ref={sidebarRef}
          data-sidebar-tree-root="true"
          role="tree"
          aria-label="Workspace notes and folders"
          className={`flex-1 overflow-y-auto px-3 py-2 space-y-0.5 custom-scrollbar bg-transparent relative rounded-lg transition-colors duration-150
            ${isRootDropActive ? "bg-accent/8 ring-2 ring-accent/50 ring-inset" : ""}
            ${isExternalDragging && !dropTargetFolder ? "ring-2 ring-accent/50 ring-inset bg-accent/8" : ""}
          `}
          onScroll={
            useVirtualizedTree
              ? (event) => setTreeScrollTop(event.currentTarget.scrollTop)
              : undefined
          }
          onMouseMove={draggedItem ? handleTreeMouseMove : undefined}
          onMouseLeave={draggedItem ? handleTreeMouseLeave : undefined}
          onMouseUp={draggedItem ? handleDropToRoot : undefined}
        >
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-text-muted px-4">
              <svg
                className="w-8 h-8 animate-spin text-accent mb-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {loadingProgress ? (
                <div className="w-full max-w-50 space-y-2">
                  <p className="text-sm text-center">{loadingProgress.phase}</p>
                  <div className="w-full h-1.5 bg-overlay-subtle rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all duration-200"
                      style={{
                        width: `${Math.round((loadingProgress.current / loadingProgress.total) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-center text-text-muted">
                    {loadingProgress.current} / {loadingProgress.total}
                  </p>
                </div>
              ) : (
                <p className="text-sm animate-pulse">Scanning folder...</p>
              )}
            </div>
          ) : rootItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-text-muted px-4 animate-in fade-in duration-700">
              <div className="mb-6 relative">
                <div className="absolute inset-0 bg-accent/20 blur-2xl rounded-full" />
                <div className="relative w-16 h-16 bg-overlay-subtle border border-overlay-light rounded-2xl flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-text-secondary opacity-60"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                  </svg>
                </div>
              </div>

              <div className="text-center space-y-4">
                <div>
                  <p className="font-semibold text-text-primary text-sm">Workspace is empty</p>
                  <p className="text-[11px] mt-1 text-text-muted leading-relaxed">
                    Open a folder to see your markdown notes or create a new one to start writing.
                  </p>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <button
                    onClick={handleNewNote}
                    className="w-full py-2 bg-accent/10 hover:bg-accent/20 text-accent text-xs font-semibold rounded-lg border border-accent/20 transition-all flex items-center justify-center gap-2"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    New Note
                  </button>
                  <button
                    onClick={handleOpenFolder}
                    className="w-full py-2 bg-overlay-subtle hover:bg-overlay-light text-text-secondary text-xs font-semibold rounded-lg border border-overlay-subtle transition-all flex items-center justify-center gap-2"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                      />
                    </svg>
                    Open Workspace
                  </button>
                </div>
              </div>
            </div>
          ) : useVirtualizedTree ? (
            <div
              className="relative"
              style={{ height: flattenedTreeRows.length * virtualTreeRowHeight }}
            >
              {virtualRows.map((row, offset) => {
                const treeIndex = virtualStartIndex + offset;
                return (
                  <div
                    key={row.item.id}
                    className="absolute left-0 right-0"
                    style={{
                      top: treeIndex * virtualTreeRowHeight,
                      minHeight: virtualTreeRowHeight,
                    }}
                  >
                    <TreeItem
                      item={row.item}
                      level={row.level}
                      treeIndex={treeIndex}
                      virtualTree={{
                        index: treeIndex,
                        rows: flattenedTreeRows,
                        focusIndex: focusTreeIndex,
                      }}
                      renderChildren={false}
                      onContextMenu={handleContextMenu}
                      draggedItem={draggedItem}
                      setDraggedItem={setDraggedItem}
                      onItemMove={handleItemMove}
                      onSetDropTarget={handleSetDropTarget}
                      onClearDropTarget={handleClearDropTarget}
                      dropTargetFolderId={dropTargetFolder?.id}
                      internalDropTargetId={internalDropTargetId}
                      setInternalDropTargetId={setInternalDropTargetId}
                      isExternalDragging={isExternalDragging}
                      onRequestDelete={requestDeleteItem}
                      onMoveItemOut={handleMoveItemOut}
                      onMoveItemIn={handleMoveItemIn}
                      reorderTarget={reorderTarget}
                      setReorderTarget={setReorderTarget}
                      onReorder={handleReorder}
                      filteredItems={null}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            rootItems.map((item) => (
              <TreeItem
                key={item.id}
                item={item}
                level={0}
                onContextMenu={handleContextMenu}
                draggedItem={draggedItem}
                setDraggedItem={setDraggedItem}
                onItemMove={handleItemMove}
                onSetDropTarget={handleSetDropTarget}
                onClearDropTarget={handleClearDropTarget}
                dropTargetFolderId={dropTargetFolder?.id}
                internalDropTargetId={internalDropTargetId}
                setInternalDropTargetId={setInternalDropTargetId}
                isExternalDragging={isExternalDragging}
                onRequestDelete={requestDeleteItem}
                onMoveItemOut={handleMoveItemOut}
                onMoveItemIn={handleMoveItemIn}
                reorderTarget={reorderTarget}
                setReorderTarget={setReorderTarget}
                onReorder={handleReorder}
                filteredItems={isTreeFiltered ? filteredItems : null}
              />
            ))
          )}
        </div>

        {/* Bottom Actions (Settings) */}
        <div className="mt-auto border-t border-border bg-bg-base/30 backdrop-blur-sm p-2 shrink-0">
          {["available", "downloading", "installing", "installed", "error"].includes(
            appUpdate.status
          ) && (
            <div className="mb-2 rounded-xl border border-accent/20 bg-accent/[0.08] p-3 shadow-sm">
              <div className="flex items-start gap-2">
                <div className="mt-0.5 p-1.5 rounded-lg bg-accent/15 text-accent shrink-0">
                  <UpdateIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-text-primary">
                    {appUpdate.status === "available"
                      ? "Update available"
                      : appUpdate.status === "installed"
                        ? "Restart needed"
                        : appUpdate.status === "error"
                          ? "Update issue"
                          : "Updating Marky"}
                  </div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-text-muted">
                    {appUpdate.message || "A Marky update is ready."}
                  </div>
                </div>
              </div>

              {typeof appUpdate.progress === "number" && (
                <div className="mt-3">
                  <div className="h-1.5 rounded-full bg-overlay-light overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-300"
                      style={{ width: `${Math.max(0, Math.min(100, appUpdate.progress))}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[10px] text-text-muted text-right">
                    {Math.round(appUpdate.progress)}%
                  </div>
                </div>
              )}

              {appUpdate.status === "available" && (
                <button
                  onClick={() => installAppUpdate()}
                  className="mt-3 w-full py-1.5 rounded-lg bg-accent text-bg-base text-xs font-semibold hover:opacity-90 transition-opacity"
                >
                  Download & Install
                </button>
              )}

              {appUpdate.status === "error" && (
                <button
                  onClick={() => checkForAppUpdate({ silent: false })}
                  className="mt-3 w-full py-1.5 rounded-lg bg-overlay-subtle text-text-secondary text-xs font-semibold hover:bg-overlay-light transition-colors"
                >
                  Try Again
                </button>
              )}
            </div>
          )}

          {/* Sync status */}
          <div className="flex items-center gap-2 px-2.5 pt-1.5 pb-2 text-[11.5px] text-text-muted">
            <span
              className={`w-[7px] h-[7px] rounded-full shrink-0 ${
                dirtyCount > 0 ? "bg-amber-500" : "bg-[#3f9d63]"
              }`}
            />
            <span className="truncate">
              {dirtyCount > 0
                ? `${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}`
                : "All changes saved locally"}
            </span>
            {dirtyCount === 0 && lastSavedLabel && (
              <span className="ml-auto font-mono text-[10.5px] shrink-0">{lastSavedLabel}</span>
            )}
          </div>

          <button
            onClick={toggleColorScheme}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] text-text-secondary hover:bg-overlay-light hover:text-text-primary transition-colors"
            title={isDarkTheme ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDarkTheme ? (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                viewBox="0 0 24 24"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19" />
              </svg>
            ) : (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                viewBox="0 0 24 24"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12.8A8 8 0 1111.2 3a6.2 6.2 0 009.8 9.8z" />
              </svg>
            )}
            {isDarkTheme ? "Light" : "Dark"} mode
          </button>
          <button
            onClick={() => onOpenTemplate(null)}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] text-text-secondary hover:bg-overlay-light hover:text-text-primary transition-colors"
            title="Templates"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <path d="M4 9h16" />
            </svg>
            Templates
          </button>
          <button
            onClick={onSettingsClick}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] text-text-secondary hover:bg-overlay-light hover:text-text-primary transition-colors"
            title="Settings"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Settings
          </button>
        </div>

        {/* Drag Ghost */}
        {draggedItem && dragPosition && (
          <div
            className={`fixed left-0 top-0 z-50 pointer-events-none flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm max-w-60 will-change-transform transition-colors duration-100 ${
              isRootDropActive
                ? "bg-accent-dim border border-accent/40 text-accent"
                : "bg-bg-editor border border-border text-text-primary"
            }`}
            style={{
              transform: `translate3d(${dragPosition.x + 12}px, ${dragPosition.y - 12}px, 0) rotate(-3deg) scale(1.03)`,
              boxShadow: "0 10px 26px rgba(25,25,22,.22)",
            }}
          >
            {draggedItem.type === "folder" ? (
              <svg
                className="w-3.5 h-3.5 text-text-muted shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
              >
                <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
            ) : (
              <svg
                className="w-3.5 h-3.5 text-text-muted shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
              >
                <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
                <path d="M14 3v5h5" />
              </svg>
            )}
            <span className="truncate">{draggedItem.name}</span>
            {isRootDropActive && (
              <span className="text-xs text-accent font-medium shrink-0">→ Root</span>
            )}
          </div>
        )}

        {/* Context Menu */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            item={contextMenu.item}
            onClose={() => setContextMenu(null)}
            onRename={handleRename}
            onShowTemplate={(parentId) => {
              onOpenTemplate(parentId);
            }}
          />
        )}
        <ConfirmDialog
          isOpen={Boolean(pendingDeleteItem)}
          title={`Delete ${pendingDeleteItem?.type === "folder" ? "Folder" : "Note"}`}
          message={getDeleteMessage(pendingDeleteItem) || ""}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={() => handleDeleteItem(pendingDeleteItem)}
          onCancel={() => setPendingDeleteItem(null)}
        />
      </aside>
    );
  }
);

Sidebar.displayName = "Sidebar";

export default Sidebar;
