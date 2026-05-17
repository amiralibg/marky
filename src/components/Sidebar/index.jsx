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
import useSettingsStore from "../../store/settingsStore";
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
import BacklinkItem from "./BacklinkItem";
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
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;

    if (!isRootLevel) {
      if (a.order !== undefined && b.order !== undefined) {
        return a.order - b.order;
      }
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
      createNote,
      getCurrentNote,
      updateNotePath,
      loadFolderFromSystem,
      moveItem,
      moveItemToRoot,
      rootFolderPath,
      refreshRootFromDisk,
      getRecentNotes,
      getBrokenWikiLinks,
      getBacklinks,
      selectNote,
      getPinnedNotes,
      expandedFolders,
      toggleTagFilter,
      selectedTags,
      clearTagFilters,
      isLoading,
      loadingProgress,
      recentWorkspaces,
    } = useNotesStore();
    const sidebarDensity = useSettingsStore((state) => state.sidebarDensity);
    const { addNotification, setShowWorkspaceModal, appUpdate } = useUIStore();
    const [contextMenu, setContextMenu] = useState(null);
    const [draggedItem, setDraggedItem] = useState(null);
    const [dragPosition, setDragPosition] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [showRecentNotes, setShowRecentNotes] = useState(false);
    const [showPinnedNotes, setShowPinnedNotes] = useState(true);
    const [showTags, setShowTags] = useState(false);
    const [showBrokenLinks, setShowBrokenLinks] = useState(true);
    const [showBacklinks, setShowBacklinks] = useState(true);
    const [tagSortMode, setTagSortMode] = useState("frequency"); // 'frequency' | 'alpha' | 'recent'
    const [sortBy, setSortBy] = useState("name-asc"); // 'name-asc', 'name-desc', 'date-desc', 'date-asc'
    const [showSortMenu, setShowSortMenu] = useState(false);
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
    const backlinks = useMemo(
      () => (currentNote ? getBacklinks(currentNote.id) : []),
      [currentNote?.id, items]
    );
    const brokenWikiLinks = useMemo(() => getBrokenWikiLinks(), [getBrokenWikiLinks, items]);

    // Compute all tags from items - this will re-compute when items change
    const allTagsArray = useMemo(() => {
      const tagCounts = items
        .filter((item) => item.type === "note" && item.content)
        .reduce((acc, note) => {
          const tags = (note.content.match(/(?:^|[\s])#([a-zA-Z0-9_-]+)/g) || []).map((t) =>
            t.trim().substring(1).toLowerCase()
          );
          tags.forEach((tag) => {
            acc[tag] = (acc[tag] || 0) + 1;
          });
          return acc;
        }, {});
      const arr = Object.entries(tagCounts).map(([tag, count]) => ({ tag, count }));
      if (tagSortMode === "alpha") return arr.sort((a, b) => a.tag.localeCompare(b.tag));
      if (tagSortMode === "recent") {
        const recentTagSet = new Map();
        [...items].reverse().forEach((item) => {
          if (item.type !== "note" || !item.tags) return;
          item.tags.forEach((tag) => {
            if (!recentTagSet.has(tag)) recentTagSet.set(tag, recentTagSet.size);
          });
        });
        return arr.sort(
          (a, b) => (recentTagSet.get(a.tag) ?? Infinity) - (recentTagSet.get(b.tag) ?? Infinity)
        );
      }
      return arr.sort((a, b) => b.count - a.count);
    }, [items, tagSortMode]);

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

    const handleItemMove = async (draggedItem, targetFolder) => {
      if (!draggedItem || !targetFolder) return;
      if (draggedItem.id === targetFolder.id) return;
      if (targetFolder.type !== "folder") return;

      // Moving: draggedItem.name, in to: targetFolder.name

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
        // Reset the flag after a brief delay
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

    const handleCreateBrokenLinkNote = useCallback(
      async (target) => {
        try {
          const noteId = await createNote(null, null, target);
          if (noteId) {
            selectNote(noteId);
            addNotification(`Note "${target}" created`, "success");
          }
        } catch (error) {
          if (error?.message && /exists/i.test(error.message)) {
            return;
          }
          console.error("Failed to create note from broken link:", error);
          if (/workspace/i.test(error.message)) {
            setShowWorkspaceModal(true);
          } else {
            addNotification("Failed to create note: " + error.message, "error");
          }
        }
      },
      [addNotification, createNote, selectNote, setShowWorkspaceModal]
    );

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
      <div className="w-full bg-sidebar-bg flex flex-col h-full bg-linear-to-b from-sidebar-bg to-bg-base/50">
        {/* Search Bar */}
        <div className="px-4 py-3 bg-transparent shrink-0">
          <div className="relative group">
            <svg
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent transition-colors pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
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
              placeholder="Search..."
              className="w-full pl-9 pr-8 py-2 bg-overlay-subtle border border-overlay-subtle rounded-lg text-sm text-white placeholder-text-muted outline-none focus:bg-white/10 focus:border-accent/50 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-overlay-light rounded text-text-muted hover:text-text-primary transition-colors"
                title="Clear search"
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
          {searchQuery && (
            <div className="mt-2 text-xs text-text-muted px-1">
              Found {filteredItems.filter((i) => i.type === "note").length} notes
            </div>
          )}
          {/* Sort Options */}
          {!searchQuery && rootFolderPath && (
            <>
              {/* Workspace switcher header */}
              <div className="mt-4 mb-1 relative">
                <button
                  onClick={() => setShowWorkspaceSwitcher((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-text-muted hover:text-text-secondary hover:bg-overlay-subtle rounded-md transition-colors group"
                  title="Switch workspace"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <svg
                      className="w-3 h-3 shrink-0"
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
                    <span
                      className="font-medium truncate text-text-secondary"
                      title={rootFolderPath}
                    >
                      {rootFolderPath.split("/").filter(Boolean).pop() || rootFolderPath}
                    </span>
                  </div>
                  <svg
                    className={`w-3 h-3 shrink-0 transition-transform ${showWorkspaceSwitcher ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
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
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowWorkspaceSwitcher(false)}
                    />
                    <div className="absolute left-0 right-0 z-20 mt-1 bg-bg-sidebar border border-glass-border rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                      {recentWorkspaces.length > 1 && (
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
                                    addNotification(
                                      "Could not open workspace: " + err.message,
                                      "error"
                                    );
                                  }
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-text-secondary hover:bg-overlay-light hover:text-text-primary transition-colors"
                              >
                                <svg
                                  className="w-3.5 h-3.5 shrink-0 text-text-muted"
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
                                <span className="truncate" title={ws.path || ws.name}>
                                  {ws.name}
                                </span>
                              </button>
                            ))}
                          <div className="mx-3 my-1 border-t border-glass-border" />
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
              <div className="mt-2 relative">
                <button
                  onClick={() => setShowSortMenu(!showSortMenu)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-text-muted hover:text-text-secondary hover:bg-overlay-subtle rounded-md transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"
                      />
                    </svg>
                    <span>
                      Sort:{" "}
                      {sortBy === "name-asc"
                        ? "Name (A-Z)"
                        : sortBy === "name-desc"
                          ? "Name (Z-A)"
                          : sortBy === "date-desc"
                            ? "Date (Newest)"
                            : "Date (Oldest)"}
                    </span>
                  </div>
                  <svg
                    className={`w-3 h-3 transition-transform ${showSortMenu ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                {showSortMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)} />
                    <div className="absolute left-0 right-0 top-full mt-1 glass-panel rounded-lg shadow-xl py-1 z-20 animate-in fade-in zoom-in-95 duration-100">
                      <button
                        onClick={() => {
                          setSortBy("name-asc");
                          setShowSortMenu(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-xs transition-colors ${sortBy === "name-asc" ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-overlay-light hover:text-text-primary"}`}
                      >
                        Name (A-Z)
                      </button>
                      <button
                        onClick={() => {
                          setSortBy("name-desc");
                          setShowSortMenu(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-xs transition-colors ${sortBy === "name-desc" ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-overlay-light hover:text-text-primary"}`}
                      >
                        Name (Z-A)
                      </button>
                      <button
                        onClick={() => {
                          setSortBy("date-desc");
                          setShowSortMenu(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-xs transition-colors ${sortBy === "date-desc" ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-overlay-light hover:text-text-primary"}`}
                      >
                        Date (Newest First)
                      </button>
                      <button
                        onClick={() => {
                          setSortBy("date-asc");
                          setShowSortMenu(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-xs transition-colors ${sortBy === "date-asc" ? "bg-accent/10 text-accent" : "text-text-secondary hover:bg-overlay-light hover:text-text-primary"}`}
                      >
                        Date (Oldest First)
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Quick Actions (Pinned, Recent, etc) */}
        <div className="px-2 pb-2 shrink-0 space-y-1">
          {/* Pinned Section */}
          {!searchQuery && getPinnedNotes().length > 0 && (
            <div className="mb-0.5">
              <button
                onClick={() => setShowPinnedNotes(!showPinnedNotes)}
                className="w-full px-2 py-1.5 flex items-center justify-between text-[11px] font-bold text-text-muted hover:text-text-secondary uppercase tracking-wider transition-colors rounded hover:bg-overlay-subtle group"
              >
                <div className="flex items-center gap-1.5">
                  <svg
                    className="w-3 h-3 opacity-50 group-hover:opacity-100"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  <span>Pinned</span>
                </div>
                <svg
                  className={`w-3 h-3 transition-transform opacity-50 group-hover:opacity-100 ${showPinnedNotes ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {showPinnedNotes && (
                <div className="space-y-0.5 mt-0.5">
                  {getPinnedNotes().map((note) => (
                    <button
                      key={note.id}
                      onClick={() => selectNote(note.id)}
                      className="w-full px-3 py-1.5 text-left text-sm text-text-secondary hover:text-text-primary hover:bg-overlay-subtle rounded-md transition-colors flex items-center gap-2 group"
                    >
                      <span className="truncate" title={note.name}>
                        {note.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Recent Section */}
          {!searchQuery && getRecentNotes().length > 0 && (
            <div className="mb-0.5">
              <button
                onClick={() => setShowRecentNotes(!showRecentNotes)}
                className="w-full px-2 py-1.5 flex items-center justify-between text-[11px] font-bold text-text-muted hover:text-text-secondary uppercase tracking-wider transition-colors rounded hover:bg-overlay-subtle group"
              >
                <div className="flex items-center gap-1.5">
                  <svg
                    className="w-3 h-3 opacity-50 group-hover:opacity-100"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>Recent</span>
                </div>
                <svg
                  className={`w-3 h-3 transition-transform opacity-50 group-hover:opacity-100 ${showRecentNotes ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {showRecentNotes && (
                <div className="space-y-0.5 mt-0.5">
                  {getRecentNotes()
                    .slice(0, 5)
                    .map((recent) => (
                      <button
                        key={recent.id}
                        onClick={() => selectNote(recent.id)}
                        className="w-full px-3 py-1.5 text-left text-sm text-text-secondary hover:text-text-primary hover:bg-overlay-subtle rounded-md transition-colors flex items-center gap-2 group"
                        title={recent.filePath || recent.name}
                      >
                        <span className="truncate" title={recent.filePath || recent.name}>
                          {recent.name}
                        </span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Tags Section */}
          {!searchQuery && allTagsArray.length > 0 && (
            <div className="mb-0.5">
              <button
                onClick={() => setShowTags(!showTags)}
                className="w-full px-2 py-1.5 flex items-center justify-between text-[11px] font-bold text-text-muted hover:text-text-secondary uppercase tracking-wider transition-colors rounded hover:bg-overlay-subtle group"
              >
                <div className="flex items-center gap-1.5">
                  <svg
                    className="w-3 h-3 opacity-50 group-hover:opacity-100"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                    />
                  </svg>
                  <span>Tags</span>
                  {selectedTags.length > 0 && (
                    <span className="ml-1 px-1 py-px bg-accent/20 text-accent text-[9px] rounded-full">
                      {selectedTags.length}
                    </span>
                  )}
                </div>
                <svg
                  className={`w-3 h-3 transition-transform opacity-50 group-hover:opacity-100 ${showTags ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {showTags && (
                <div className="px-2 mt-1">
                  {/* Sort mode tabs */}
                  <div className="flex items-center gap-1 mb-2">
                    {[
                      { id: "frequency", label: "#" },
                      { id: "alpha", label: "A–Z" },
                      { id: "recent", label: "Recent" },
                    ].map(({ id, label }) => (
                      <button
                        key={id}
                        onClick={() => setTagSortMode(id)}
                        className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                          tagSortMode === id
                            ? "bg-accent/15 text-accent border border-accent/20"
                            : "text-text-muted hover:text-text-secondary hover:bg-overlay-subtle border border-transparent"
                        }`}
                        title={
                          id === "frequency"
                            ? "Sort by frequency"
                            : id === "alpha"
                              ? "Sort A–Z"
                              : "Sort by recent use"
                        }
                      >
                        {label}
                      </button>
                    ))}
                    {selectedTags.length > 0 && (
                      <button
                        onClick={clearTagFilters}
                        className="ml-auto text-[10px] text-accent hover:text-accent-hover flex items-center gap-0.5"
                        title="Clear tag filters"
                      >
                        <svg
                          className="w-2.5 h-2.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {allTagsArray.map(({ tag, count }) => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => toggleTagFilter(tag)}
                          title={`${count} note${count !== 1 ? "s" : ""}`}
                          className={`
                          px-2 py-0.5 text-[10px] rounded-full border transition-all
                          ${
                            isSelected
                              ? "bg-accent/10 border-accent/20 text-accent"
                              : "bg-overlay-subtle border-overlay-subtle text-text-muted hover:text-text-secondary hover:border-overlay-light"
                          }
                        `}
                        >
                          #{tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Broken Links Section */}
          {!searchQuery && brokenWikiLinks.length > 0 && (
            <div className="mb-0.5">
              <button
                onClick={() => setShowBrokenLinks(!showBrokenLinks)}
                className="w-full px-2 py-1.5 flex items-center justify-between text-[11px] font-bold text-text-muted hover:text-text-secondary uppercase tracking-wider transition-colors rounded hover:bg-overlay-subtle group"
              >
                <div className="flex items-center gap-1.5">
                  <svg
                    className="w-3 h-3 opacity-50 group-hover:opacity-100"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13.828 10.172a4 4 0 00-5.656 0l-1 1a4 4 0 105.656 5.656l.172-.172m2-2 1-1m-2-2a4 4 0 015.656-5.656l1 1a4 4 0 01-5.656 5.656l-.172-.172M8 12h8"
                    />
                  </svg>
                  <span>Broken Links</span>
                  <span className="ml-1 px-1 py-px bg-amber-500/15 text-amber-400 text-[9px] rounded-full">
                    {brokenWikiLinks.length}
                  </span>
                </div>
                <svg
                  className={`w-3 h-3 transition-transform opacity-50 group-hover:opacity-100 ${showBrokenLinks ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {showBrokenLinks && (
                <div className="space-y-1 mt-1 px-2">
                  {brokenWikiLinks.map((link) => (
                    <div
                      key={link.key}
                      className="rounded-lg border border-overlay-subtle bg-overlay-subtle/60 p-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p
                            className="text-xs font-medium text-text-primary truncate"
                            title={link.target}
                          >
                            [[{link.target}]]
                          </p>
                          <p className="text-[10px] text-text-muted">
                            Referenced by {link.sources.length} note
                            {link.sources.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <button
                          onClick={() => handleCreateBrokenLinkNote(link.target)}
                          className="shrink-0 px-2 py-1 text-[10px] rounded-md bg-accent/10 text-accent hover:bg-accent/20 border border-accent/15 transition-colors"
                          title={`Create ${link.target}`}
                        >
                          Create
                        </button>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {link.sources.slice(0, 3).map((source) => (
                          <button
                            key={source.id}
                            onClick={() => selectNote(source.id)}
                            className="max-w-full truncate px-1.5 py-0.5 text-[10px] rounded bg-bg-base/60 text-text-muted hover:text-text-secondary hover:bg-overlay-light transition-colors"
                            title={`Open ${source.name}`}
                          >
                            {source.name}
                          </button>
                        ))}
                        {link.sources.length > 3 && (
                          <span className="px-1.5 py-0.5 text-[10px] text-text-muted">
                            +{link.sources.length - 3}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Backlinks Section */}
          {!searchQuery && currentNote && backlinks.length > 0 && (
            <div className="mb-0.5">
              <button
                onClick={() => setShowBacklinks(!showBacklinks)}
                className="w-full px-2 py-1.5 flex items-center justify-between text-[11px] font-bold text-text-muted hover:text-text-secondary uppercase tracking-wider transition-colors rounded hover:bg-overlay-subtle group"
              >
                <div className="flex items-center gap-1.5">
                  <svg
                    className="w-3 h-3 opacity-50 group-hover:opacity-100"
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
                  <span>Backlinks</span>
                  <span className="ml-1 px-1 py-px bg-accent/20 text-accent text-[9px] rounded-full">
                    {backlinks.length}
                  </span>
                </div>
                <svg
                  className={`w-3 h-3 transition-transform opacity-50 group-hover:opacity-100 ${showBacklinks ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {showBacklinks && (
                <div className="space-y-0.5 mt-0.5">
                  {backlinks.map((backlink) => (
                    <BacklinkItem key={backlink.id} backlink={backlink} onNavigate={selectNote} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Navigation Buttons Row */}
          {!searchQuery && (
            <div className="grid grid-cols-2 gap-1 px-1 mb-3 pt-2">
              <button
                onClick={handleOpenFile}
                className="flex items-center justify-center gap-2 px-2 py-2 bg-overlay-subtle hover:bg-overlay-light rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary transition-colors border border-overlay-subtle"
                title="Open File (⌘O)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v8a2 2 0 01-2 2H5z"
                  />
                </svg>
                Open
              </button>
              <button
                onClick={onOpenGraph}
                className="flex items-center justify-center gap-2 px-2 py-2 bg-overlay-subtle hover:bg-overlay-light rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary transition-colors border border-overlay-subtle"
                title="Graph View"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
                  />
                </svg>
                Graph
              </button>
            </div>
          )}
        </div>

        {/* Main Folder Tree */}
        <div
          ref={sidebarRef}
          data-sidebar-tree-root="true"
          className={`flex-1 overflow-y-auto px-3 py-2 space-y-0.5 custom-scrollbar bg-transparent relative transition-all duration-150
            ${draggedItem ? "rounded-lg mx-2" : ""}
            ${isRootDropActive ? "bg-accent/8 ring-2 ring-accent/50 ring-inset rounded-lg shadow-[inset_0_0_24px_rgba(var(--color-accent-rgb,99,102,241),0.08)]" : ""}
            ${isExternalDragging && !dropTargetFolder ? "ring-2 ring-accent/50 ring-inset rounded-lg bg-accent/8 shadow-[inset_0_0_24px_rgba(var(--color-accent-rgb,99,102,241),0.08)]" : ""}
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
                      isExternalDragging={isExternalDragging}
                      onRequestDelete={requestDeleteItem}
                      onMoveItemOut={handleMoveItemOut}
                      onMoveItemIn={handleMoveItemIn}
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
                isExternalDragging={isExternalDragging}
                onRequestDelete={requestDeleteItem}
                onMoveItemOut={handleMoveItemOut}
                onMoveItemIn={handleMoveItemIn}
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

          <button
            onClick={onSettingsClick}
            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-overlay-light rounded-lg text-text-primary transition-all group"
            title="Settings"
          >
            <div className="p-1.5 bg-overlay-subtle rounded-md group-hover:bg-overlay-light transition-colors">
              <svg
                className="w-4 h-4 text-text-secondary group-hover:text-text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <div className="flex flex-col items-start gap-0.5">
              <span className="text-sm font-medium">Settings</span>
              <span className="text-[10px] text-text-muted">Preferences & automations</span>
            </div>
          </button>
        </div>

        {/* Drag Ghost */}
        {draggedItem && dragPosition && (
          <div
            className={`fixed z-50 pointer-events-none flex items-center gap-2 px-3 py-1.5 rounded-md shadow-lg text-sm max-w-60 transition-colors duration-100 ${
              isRootDropActive
                ? "bg-accent/15 border border-accent/40 text-accent"
                : "bg-bg-sidebar border border-overlay-medium text-text-primary"
            }`}
            style={{
              left: dragPosition.x + 12,
              top: dragPosition.y - 12,
            }}
          >
            {draggedItem.type === "folder" ? (
              <svg
                className="w-3.5 h-3.5 text-sky-400/80 shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
            ) : (
              <svg
                className="w-3.5 h-3.5 text-text-muted shrink-0"
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
      </div>
    );
  }
);

Sidebar.displayName = "Sidebar";

export default Sidebar;
