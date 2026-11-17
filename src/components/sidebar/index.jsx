import {
  useState,
  useCallback,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  useMemo,
} from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { editorAcceptsDrop, toLogicalPosition } from "../../utils/externalDrop";
import useNotesStore from "../../store/notesStore";
import useSettingsStore, {
  THEMES,
  formatShortcutHint,
  normalizeSaveMode,
} from "../../store/settingsStore";
import useUIStore from "../../store/uiStore";
import { checkForAppUpdate, installAppUpdate, restartApp } from "../../utils/appUpdater";
import { openEmptyWindow, openVaultInNewWindow } from "../../utils/vaultWindows";

import {
  openMarkdownFile,
  saveMarkdownFile,
  openFolder,
  copyEntriesToFolder,
  readMarkdownFile,
} from "../../utils/fileSystem";

import TreeItem from "./TreeItem";
import ContextMenu from "./ContextMenu";
import ConfirmDialog from "../modals/ConfirmDialog";
import { scrollItemIntoView } from "../../utils/scrollItemIntoView";
import { listenForWindow } from "../../utils/windowEvents";
import {
  pruneSelection,
  resolveSelectionTargets,
  selectRangeIds,
  resolvePasteDestination,
  filterPasteTargets,
  selectFolderContents,
} from "./treeSelection";
import { sortSidebarItems } from "../../utils/sidebarSort";
import { UpdateIcon } from "../icons/AppUpdateIcon";
import { WindowIcon } from "../icons";
import EmptyState from "../ui/EmptyState";
import { LoadingState, SkeletonRows } from "../ui/Loading";

const VIRTUAL_TREE_THRESHOLD = 250;
// Row height plus the 1px gap between rows — keep in step with
// `rowDensityClass` in TreeItem.jsx.
const TREE_ROW_HEIGHTS = {
  compact: 29,
  comfortable: 33,
  spacious: 41,
};
const VIRTUAL_TREE_OVERSCAN = 8;

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
  (
    {
      onSettingsClick,
      onOpenGraph,
      onOpenTemplate,
      onOpenScheduled,
      onRenameItem,
      onOpenCommandPalette,
    },
    ref
  ) => {
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
      createScratchNote,
      openNoteIds,
      closeNote,
      currentNoteId,
      revealRequest,
      clearReveal,
      pinnedNotes,
      scheduledNotes,
      clearTagFilters,
    } = useNotesStore();
    const sidebarDensity = useSettingsStore((state) => state.sidebarDensity);
    const themeId = useSettingsStore((state) => state.themeId);
    const isAutoSave = useSettingsStore((state) => normalizeSaveMode(state.saveMode) === "auto");
    const toggleColorScheme = useSettingsStore((state) => state.toggleColorScheme);
    // The field filters the tree; the hint names the shortcut that searches
    // the whole vault (note contents too), so the faster path is in view.
    const searchKeymap = useSettingsStore((state) => state.keymaps?.search);
    const searchShortcut = useMemo(() => formatShortcutHint(searchKeymap), [searchKeymap]);
    const { addNotification, setShowWorkspaceModal, appUpdate } = useUIStore();
    const [contextMenu, setContextMenu] = useState(null);
    // Right-click on the empty space below the tree: paste and create live
    // here, at the workspace root. A trimmed-down cousin of the row menu.
    const [emptyMenu, setEmptyMenu] = useState(null);
    // The Files header's "+": what to create (note, HTML document, folder).
    const [newMenu, setNewMenu] = useState(null);
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
    // A delete confirmation always works on a list, so the one-row case and the
    // multi-select case share a single dialog and a single code path.
    const [pendingDeleteItems, setPendingDeleteItems] = useState([]);
    const [pinnedOpen, setPinnedOpen] = useState(true);
    const [looseFilesOpen, setLooseFilesOpen] = useState(true);

    // Multi-select in the tree: Ctrl/Cmd-click adds a row, Shift-click takes the
    // run from the anchor to the row clicked — the gestures Finder, VS Code and
    // Obsidian all use. Delete and drag then act on the whole set.
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const selectionAnchorRef = useRef(null);
    // Tree clipboard for Cut/Copy/Paste. Rows only (paths come along on them);
    // cut rows render dimmed until they are pasted or the clipboard is replaced.
    const [clipboard, setClipboard] = useState(null);
    // The one row that should drop into its inline rename field right now —
    // set by the reveal effect when a create asked to be named immediately.
    const [inlineRenameId, setInlineRenameId] = useState(null);
    // Held in a ref because the reveal effect runs above the definition of the
    // virtualized-scroll helper it occasionally needs.
    const focusTreeIndexRef = useRef(null);
    const [treeScrollTop, setTreeScrollTop] = useState(0);
    const [treeViewportHeight, setTreeViewportHeight] = useState(0);
    const dropHandledRef = useRef(false);
    const dropTargetRef = useRef(null);
    const sidebarRef = useRef(null);
    const currentNote = getCurrentNote();
    // Loose files: opened from anywhere / unsaved scratch buffers, shown in an
    // "OPEN" group above the vault tree (VSCode-style), independent of any vault.
    const looseOpenFiles = items.filter(
      (item) => item.type === "note" && item.isLoose && openNoteIds.includes(item.id)
    );
    const workspaceName = rootFolderPath
      ? rootFolderPath.split("/").filter(Boolean).pop() || rootFolderPath
      : "";
    // "/Users/name/Documents/My Vault" → "~/Documents/My Vault"
    const displayWorkspacePath = rootFolderPath
      ? rootFolderPath.replace(/^\/(Users|home)\/[^/]+/, "~")
      : "";
    // Under auto-save a note is "dirty" only for the second or two between a
    // keystroke and the write, so counting it would show a number that flickers
    // while you type and means nothing to the reader.
    const dirtyCount = isAutoSave ? 0 : dirtyNoteIds?.length || 0;
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

    const pinnedIdSet = useMemo(() => new Set(pinnedNotes), [pinnedNotes]);

    // Pinned notes that still exist, in pin order — the source for the
    // "Pinned" quick-nav section.
    const pinnedItems = useMemo(
      () => items.filter((item) => item.type === "note" && pinnedIdSet.has(item.id)),
      [items, pinnedIdSet]
    );

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

    const clearTreeSelection = useCallback(() => {
      setSelectedIds((current) => (current.size ? new Set() : current));
      selectionAnchorRef.current = null;
    }, []);

    const toggleTreeSelection = useCallback((item) => {
      setSelectedIds((current) => {
        const next = new Set(current);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
      selectionAnchorRef.current = item.id;
    }, []);

    const selectTreeRange = useCallback(
      (item) => {
        // The anchor is the last row clicked without Shift.
        const order = flattenedTreeRows.map((row) => row.item.id);
        const range = selectRangeIds(order, selectionAnchorRef.current, item.id);
        if (range.length === 1) selectionAnchorRef.current = item.id;
        setSelectedIds(new Set(range));
      },
      [flattenedTreeRows]
    );

    /**
     * What a click on a row means. Returns true when the click was a selection
     * gesture and the row should not also open or expand.
     */
    const handleRowActivate = useCallback(
      (item, modifiers = {}) => {
        if (modifiers.clear) {
          clearTreeSelection();
          return true;
        }
        if (modifiers.meta) {
          toggleTreeSelection(item);
          return true;
        }
        if (modifiers.shift) {
          selectTreeRange(item);
          return true;
        }
        clearTreeSelection();
        selectionAnchorRef.current = item.id;
        return false;
      },
      [clearTreeSelection, selectTreeRange, toggleTreeSelection]
    );

    // Rows that were deleted or moved out from under the selection would
    // otherwise keep it non-empty forever, with nothing on screen to show it.
    useEffect(() => {
      setSelectedIds((current) => pruneSelection(current, items));
    }, [items]);

    /**
     * The items a selection-aware action should act on.
     *
     * A row inside the selection acts on the whole selection; a row outside it
     * acts on itself alone, which is what right-clicking elsewhere means
     * everywhere else. Descendants of a selected folder are dropped: the folder
     * takes them with it, and deleting them twice would fail the second time.
     */
    const resolveActionTargets = useCallback(
      (item) => resolveSelectionTargets(items, selectedIds, item),
      [items, selectedIds]
    );

    // ---- Cut / Copy / Paste ------------------------------------------------
    // Cut stores rows; Paste reuses the store's move actions for cut (so open
    // tabs and note ids follow the file) and the disk copy command for copy.

    const handleTreeCut = useCallback(
      (item) => {
        const targets = resolveActionTargets(item);
        if (targets.length === 0 || targets.some((entry) => !entry.filePath)) return;
        setClipboard({ mode: "cut", items: targets });
      },
      [resolveActionTargets]
    );

    const handleTreeCopy = useCallback(
      (item) => {
        const targets = resolveActionTargets(item);
        if (targets.length === 0 || targets.some((entry) => !entry.filePath)) return;
        setClipboard({ mode: "copy", items: targets });
      },
      [resolveActionTargets]
    );

    const handleTreePaste = useCallback(
      async (item) => {
        if (!clipboard?.items?.length) return;

        const destination = resolvePasteDestination(items, item);
        // A folder cannot be pasted into itself or its own descendants, and a
        // cut row pasted in place is not a move — both are dropped up front.
        const targets = filterPasteTargets(clipboard.items, destination, clipboard.mode);
        if (targets.length === 0) {
          addNotification("Nothing to paste here", "info", 2000);
          setClipboard(null);
          return;
        }

        try {
          if (clipboard.mode === "copy") {
            const destPath = destination?.filePath ?? rootFolderPath;
            await copyEntriesToFolder(
              targets.map((entry) => entry.filePath),
              destPath
            );
            await refreshRootFromDisk();
            addNotification(
              `Copied ${targets.length} item${targets.length !== 1 ? "s" : ""}`,
              "success",
              2200
            );
          } else {
            for (const entry of targets) {
              if (destination) await moveItem(entry.id, destination.id);
              else await moveItemToRoot(entry.id);
            }
            if (targets.length > 1) {
              addNotification(`Moved ${targets.length} items`, "success", 2200);
            }
            // Cut is a one-shot gesture everywhere: the clipboard empties.
            setClipboard(null);
          }
          clearTreeSelection();
        } catch (error) {
          console.error("Failed to paste:", error);
          addNotification("Failed to paste: " + error.message, "error");
        }
      },
      [
        clipboard,
        items,
        rootFolderPath,
        copyEntriesToFolder,
        refreshRootFromDisk,
        moveItem,
        moveItemToRoot,
        addNotification,
        clearTreeSelection,
      ]
    );

    const handleTreeSelectAll = useCallback(
      (item) => {
        const ids = selectFolderContents(items, item);
        if (ids.length === 0) return;
        setSelectedIds(new Set(ids));
        selectionAnchorRef.current = ids[0];
      },
      [items]
    );

    // Paste with nothing selected lands at the workspace root. Bound at window
    // level because after a copy the focus is often on <body> — no row has it,
    // and the row-level ⌘V would never fire.
    useEffect(() => {
      const handleWindowKeyDown = (event) => {
        if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
        if (event.key.toLowerCase() !== "v") return;
        if (!clipboard?.items?.length) return;
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          (target.closest("input, textarea") || target.isContentEditable)
        ) {
          return; // text paste stays text paste
        }
        event.preventDefault();
        handleTreePaste(null);
      };
      window.addEventListener("keydown", handleWindowKeyDown);
      return () => window.removeEventListener("keydown", handleWindowKeyDown);
    }, [clipboard, handleTreePaste]);

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
      // Right-clicking outside the selection drops it, so the menu never offers
      // to act on rows the click did not touch.
      if (selectedIds.size > 0 && !selectedIds.has(item.id)) clearTreeSelection();
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

      // Dragging a row that is part of a selection carries the whole selection.
      const moving = resolveActionTargets(draggedItem).filter(
        (entry) => entry.id !== targetFolder.id
      );

      try {
        for (const entry of moving) {
          await moveItem(entry.id, targetFolder.id);
        }
        if (moving.length > 1) {
          addNotification(`Moved ${moving.length} items`, "success", 2200);
          clearTreeSelection();
        }
      } catch (error) {
        console.error("Failed to move item:", error);
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

      // A multi-row drag has no single insertion point to honour, so dropping
      // one between rows moves the whole selection into that row's parent
      // rather than reordering one item and stranding the rest.
      const moving = resolveActionTargets(dragged);
      if (moving.length > 1) {
        try {
          for (const entry of moving) {
            if (entry.id === reference.id) continue;
            if (targetParentId === null) await moveItemToRoot(entry.id);
            else await moveItem(entry.id, targetParentId);
          }
          addNotification(`Moved ${moving.length} items`, "success", 2200);
          clearTreeSelection();
        } catch (error) {
          console.error("Failed to move items:", error);
          addNotification("Failed to move items: " + error.message, "error");
        } finally {
          restoreTreeScroll(scrollTop);
          setTimeout(() => {
            dropHandledRef.current = false;
          }, 100);
        }
        return;
      }

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
        // With no vault there's nowhere to save a template-based note, so create an
        // in-memory scratch buffer (saved later via Save-As). VSCode-style.
        if (!rootFolderPath) {
          createScratchNote();
          return;
        }
        // Show template modal instead of creating directly
        onOpenTemplate(null);
      } catch (error) {
        console.error("Failed to create note:", error);
      }
    }, [onOpenTemplate, rootFolderPath, createScratchNote]);

    // A minimal page beside the notes, in the root or in `parentId`.
    const handleNewHtmlDocument = useCallback(
      async (parentId = null) => {
        if (!rootFolderPath) {
          setShowWorkspaceModal(true);
          return;
        }
        try {
          await useNotesStore.getState().createHtmlDocument(parentId);
        } catch (error) {
          console.error("Failed to create HTML document:", error);
          addNotification("Failed to create document: " + error.message, "error");
        }
      },
      [rootFolderPath, setShowWorkspaceModal, addNotification]
    );

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

    // Opening a vault in its own window rather than switching this one: both
    // windows keep their own tabs, sidebar and watcher (see `vaultWindows.js`).
    const handleOpenInNewWindow = useCallback(
      async (folderPath, folderName) => {
        try {
          await openVaultInNewWindow(folderPath, folderName);
        } catch (error) {
          console.error("Failed to open vault window:", error);
          addNotification("Couldn't open that vault in a new window", "error");
        }
      },
      [addNotification]
    );

    const handleNewWindow = useCallback(async () => {
      try {
        await openEmptyWindow();
      } catch (error) {
        console.error("Failed to open a new window:", error);
        addNotification("Couldn't open a new window", "error");
      }
    }, [addNotification]);

    const handleOpenFolderInNewWindow = useCallback(async () => {
      try {
        // `openFolder` only picks the folder; the new window reads it itself.
        const folderData = await openFolder();
        if (folderData) {
          await handleOpenInNewWindow(folderData.folderPath, folderData.folderName);
        }
      } catch (error) {
        console.error("Failed to open folder in new window:", error);
        addNotification("Failed to open folder: " + error.message, "error");
      }
    }, [addNotification, handleOpenInNewWindow]);

    // Expose methods to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        handleNewNote,
        handleNewHtmlDocument,
        handleNewFolder,
        handleOpenFolder,
        handleOpenFolderInNewWindow,
        handleNewWindow,
      }),
      [
        handleNewNote,
        handleNewHtmlDocument,
        handleNewFolder,
        handleOpenFolder,
        handleOpenFolderInNewWindow,
        handleNewWindow,
      ]
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
      (targets) => {
        const list = Array.isArray(targets) ? targets : [];
        if (list.length === 0) return "";

        if (list.length > 1) {
          const noteCount = list.filter((entry) => entry.type === "note").length;
          const folderCount = list.length - noteCount;
          const parts = [];
          if (noteCount > 0) parts.push(`${noteCount} note${noteCount !== 1 ? "s" : ""}`);
          if (folderCount > 0) parts.push(`${folderCount} folder${folderCount !== 1 ? "s" : ""}`);
          return `Are you sure you want to delete ${parts.join(" and ")}? Anything inside the folders goes too. This action cannot be undone.`;
        }

        const item = list[0];

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

    const requestDeleteItem = useCallback(
      (item) => {
        const targets = resolveActionTargets(item);
        if (targets.length === 0) return;
        setPendingDeleteItems(targets);
      },
      [resolveActionTargets]
    );

    const handleDeleteItems = useCallback(
      async (targets) => {
        const list = Array.isArray(targets) ? targets : [];
        if (list.length === 0) return;

        const { undoLastDelete, deleteItem } = useNotesStore.getState();
        const failures = [];
        let deleted = 0;

        for (const item of list) {
          try {
            await deleteItem(item.id);
            deleted += 1;
          } catch (error) {
            console.error("Delete failed:", error);
            failures.push(item.name);
          }
        }

        clearTreeSelection();
        setPendingDeleteItems([]);

        if (failures.length > 0) {
          addNotification(
            `Could not delete ${failures.length === 1 ? failures[0] : `${failures.length} items`}`,
            "error"
          );
        }

        if (deleted === 0) return;

        // Undo restores the last delete only, so it is offered for a single
        // item rather than implying it can bring a whole batch back.
        const single = deleted === 1 && list.length === 1 ? list[0] : null;
        const canUndo = Boolean(single?.filePath);

        addNotification(
          single
            ? `${single.type === "note" ? "Note" : "Folder"} deleted`
            : `${deleted} item${deleted !== 1 ? "s" : ""} deleted`,
          "success",
          canUndo ? 5000 : 3000,
          canUndo
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
      },
      [addNotification, clearTreeSelection]
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

      const moving = resolveActionTargets(draggedItem);

      try {
        for (const entry of moving) {
          await moveItemToRoot(entry.id);
        }
        if (moving.length > 1) {
          addNotification(`Moved ${moving.length} items`, "success", 2200);
          clearTreeSelection();
        }
      } catch (error) {
        console.error("Failed to move item:", error);
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

    // Scroll a newly created folder or note into view and mark it, so creating
    // one in a large or scrolled vault visibly does something. Matches what
    // VS Code and Obsidian do when they add a row to the explorer.
    useEffect(() => {
      if (!revealRequest?.id) return;

      // A request for a row that never appears — created in a folder the user
      // collapsed a moment later — would otherwise sit there and steal focus on
      // some unrelated tree change much later.
      if (Date.now() - revealRequest.nonce > 5000) {
        clearReveal();
        return;
      }

      const index = flattenedTreeRows.findIndex((row) => row.item.id === revealRequest.id);
      if (index === -1) {
        // The row is not on screen yet (its parent may still be expanding); the
        // next tree render will bring this effect back with the row in place.
        return;
      }

      setSelectedIds(new Set([revealRequest.id]));
      selectionAnchorRef.current = revealRequest.id;

      // Creates ask to be named on arrival; the row opens its inline field as
      // soon as it exists. Cleared again by the row once renaming begins.
      if (revealRequest.rename) setInlineRenameId(revealRequest.id);

      const viewport = sidebarRef.current;
      if (viewport) {
        requestAnimationFrame(() => {
          const row = viewport.querySelector(`[data-item-id="${CSS.escape(revealRequest.id)}"]`);
          if (row) {
            scrollItemIntoView(viewport, row);
            row.focus({ preventScroll: true });
          } else if (useVirtualizedTree) {
            // Virtualized rows outside the rendered window have no element to
            // scroll to, so go by index and let the row focus itself once drawn.
            focusTreeIndexRef.current?.(index);
          }
        });
      }

      clearReveal();
    }, [revealRequest, flattenedTreeRows, useVirtualizedTree, clearReveal]);

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

    focusTreeIndexRef.current = focusTreeIndex;

    useEffect(() => {
      // `window.__TAURI__` only exists when `withGlobalTauri` is enabled, which
      // it is not — so this whole block used to return early and the File menu's
      // items were never wired to anything. `__TAURI_INTERNALS__` is the object
      // the API modules themselves go through, and it is always there.
      if (typeof window === "undefined" || !window.__TAURI_INTERNALS__) {
        return undefined;
      }

      let isMounted = true;
      const unlisteners = [];

      const registerListeners = async () => {
        const attach = async (eventName, handler) => {
          try {
            // Addressed to the focused window, so this listener names itself.
            const unlisten = await listenForWindow(eventName, async () => {
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
        await attach("menu://new-window", handleNewWindow);
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
      handleNewWindow,
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

            // Shared with the editor (utils/externalDrop.js) — the conversion to
            // CSS pixels is platform-dependent in a way that is easy to get
            // wrong, and folder targeting here needs the same answer the drop
            // caret uses.
            const toLogical = toLogicalPosition;

            if (type === "enter") {
              // Files entered the window — start showing drop feedback, unless
              // they entered over the editor, which handles its own.
              const { position, paths } = event.payload;
              if (editorAcceptsDrop(toLogical(position), paths)) return;
              setIsExternalDragging(true);
            } else if (type === "over") {
              // User is hovering files over the window
              const { position, paths } = event.payload;
              const logicalPos = toLogical(position);

              // Images held over the editor are the editor's to take — it draws
              // its own drop caret. Highlighting the sidebar as well would
              // point at the wrong destination.
              if (editorAcceptsDrop(logicalPos, paths)) {
                setIsExternalDragging(false);
                dropTargetRef.current = null;
                setDropTargetFolder(null);
                return;
              }

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

              // Dropped into the note being edited — the editor copies the
              // images in and links them itself.
              if (editorAcceptsDrop(logicalPos, paths)) {
                dropTargetRef.current = null;
                setDropTargetFolder(null);
                dropHandledRef.current = false;
                return;
              }

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
                  // Dropped onto a specific vault folder → copy into the vault.
                  await copyEntriesToFolder(paths, targetFolder.filePath);
                  await refreshRootFromDisk();
                  addNotification(
                    `Copied ${paths.length} item(s) to ${targetFolder.name}`,
                    "success"
                  );
                } else {
                  // Dropped on the editor / empty sidebar → open in place (no copy).
                  const openablePaths = paths.filter((p) => /\.(md|markdown|txt|mdx)$/i.test(p));
                  if (openablePaths.length === 0) {
                    addNotification(
                      "Drop a Markdown or text file to open it, or drop onto a vault folder to import.",
                      "info"
                    );
                  } else {
                    const { loadNoteFromFile } = useNotesStore.getState();
                    let lastId = null;
                    for (const filePath of openablePaths) {
                      try {
                        const content = await readMarkdownFile(filePath);
                        const fileName = filePath.split(/[/\\]/).pop();
                        lastId = loadNoteFromFile(
                          { content, path: filePath, name: fileName },
                          null
                        );
                      } catch (readError) {
                        console.error("Failed to open dropped file:", filePath, readError);
                        addNotification(
                          `Couldn't open ${filePath.split(/[/\\]/).pop()}: ${readError.message}`,
                          "error"
                        );
                      }
                    }
                    if (lastId) selectNote(lastId);
                  }
                }
              } catch (error) {
                console.error("Failed to handle dropped files:", error);
                addNotification("Failed to open files: " + error.message, "error");
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
    }, [rootFolderPath, refreshRootFromDisk, addNotification, selectNote]);

    return (
      // No fill of its own: the sidebar is part of the desk, which the app shell
      // paints (and makes see-through when the window is translucent).
      <aside className="w-full flex flex-col h-full" aria-label="Workspace sidebar">
        {/* Workspace Switcher — the vault's name beside an accent monogram */}
        <div className="px-3 pt-1 shrink-0 relative">
          <button
            onClick={() => setShowWorkspaceSwitcher((v) => !v)}
            className="w-full flex items-center gap-3 p-2 rounded-card hover:bg-item-hover transition-colors text-text-primary"
            title="Switch workspace"
            aria-expanded={showWorkspaceSwitcher}
          >
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-control bg-accent text-[15px] font-bold leading-none text-white"
              aria-hidden="true"
            >
              {(workspaceName || "Marky").trim().charAt(0).toUpperCase()}
            </span>
            <span className="flex-1 min-w-0 flex flex-col text-start">
              <span className="text-[14px] font-[650] leading-tight tracking-[-0.01em] truncate">
                {workspaceName || "Marky"}
              </span>
              {displayWorkspacePath && (
                <span className="text-[12px] leading-tight text-text-muted truncate">
                  {displayWorkspacePath}
                </span>
              )}
            </span>
            <svg
              className={`w-4 h-4 shrink-0 text-text-muted motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-soft ${showWorkspaceSwitcher ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {showWorkspaceSwitcher && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowWorkspaceSwitcher(false)} />
              <div className="glass-panel absolute inset-x-3 z-20 mt-1 rounded-card p-1.5 animate-fade-in">
                {recentWorkspaces.filter((ws) => ws.path !== rootFolderPath).length > 0 && (
                  <>
                    <p className="side-label px-2.5 pt-1.5 pb-1">Recent</p>
                    {recentWorkspaces
                      .filter((ws) => ws.path !== rootFolderPath)
                      .map((ws) => (
                        <div
                          key={ws.path}
                          className="group flex items-stretch rounded-control text-text-secondary transition-colors hover:bg-item-hover"
                        >
                          <button
                            onClick={async () => {
                              setShowWorkspaceSwitcher(false);
                              try {
                                // No `files`: the store reads the folder itself,
                                // so the ignore patterns apply here too.
                                await loadFolderFromSystem({
                                  folderPath: ws.path,
                                  folderName: ws.name,
                                });
                              } catch (err) {
                                addNotification(
                                  "Could not open workspace: " + err.message,
                                  "error"
                                );
                              }
                            }}
                            className="flex-1 min-w-0 flex min-h-8 items-center gap-2 ps-2.5 pe-1 text-start text-[13px] font-medium hover:text-text-primary transition-colors"
                          >
                            <span className="truncate" title={ws.path || ws.name}>
                              {ws.name}
                            </span>
                          </button>
                          {/* Kept out of the switch button so one click swaps
                              this window's vault and the other opens a second
                              window — the two are easy to confuse otherwise. */}
                          <button
                            onClick={() => {
                              setShowWorkspaceSwitcher(false);
                              handleOpenInNewWindow(ws.path, ws.name);
                            }}
                            className="shrink-0 px-2.5 flex items-center text-text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-text-primary transition-[opacity,color]"
                            title="Open in a new window"
                            aria-label={`Open ${ws.name} in a new window`}
                          >
                            <WindowIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    <div className="menu-separator" />
                  </>
                )}
                <button
                  onClick={() => {
                    setShowWorkspaceSwitcher(false);
                    handleOpenFolder();
                  }}
                  className="menu-item"
                >
                  <svg
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Open another folder…
                </button>
                <button
                  onClick={() => {
                    setShowWorkspaceSwitcher(false);
                    handleNewWindow();
                  }}
                  className="menu-item"
                >
                  <WindowIcon />
                  New empty window
                </button>
                <button
                  onClick={() => {
                    setShowWorkspaceSwitcher(false);
                    handleOpenFolderInNewWindow();
                  }}
                  className="menu-item"
                >
                  <WindowIcon />
                  Open a folder in a new window…
                </button>
              </div>
            </>
          )}
        </div>

        {/* Search — a 36px full pill, fill only */}
        <div className="px-3 pt-2 pb-3 shrink-0">
          <div className="relative group">
            <svg
              className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search"
              aria-label="Search notes and folders in sidebar"
              className="w-full h-9 ps-9 pe-12 bg-pill rounded-full text-[13.5px] text-text-primary placeholder-text-muted outline-none transition-shadow focus:shadow-[0_0_0_2px_var(--color-accent-dim)]"
            />
            {!searchQuery && searchShortcut && (
              <kbd
                className="absolute end-3.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-text-muted font-mono pointer-events-none"
                aria-hidden="true"
              >
                {searchShortcut}
              </kbd>
            )}
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute end-1.5 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-full text-text-muted hover:bg-item-hover hover:text-text-primary transition-colors"
                title="Clear search"
                aria-label="Clear sidebar search"
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Quick Nav */}
        {!searchQuery && (
          <nav className="px-3 flex flex-col gap-px shrink-0">
            <button
              onClick={() => selectNote(null)}
              aria-current={!currentNote ? "page" : undefined}
              className={`side-row ${!currentNote ? "is-active" : ""}`}
            >
              <svg
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                viewBox="0 0 24 24"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
              </svg>
              Home
            </button>
            <button onClick={onOpenGraph} className="side-row">
              <svg
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
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
            {scheduledNotes.length > 0 && (
              <button onClick={onOpenScheduled} className="side-row">
                <svg
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  viewBox="0 0 24 24"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M3 9h18M8 3v4M16 3v4" />
                </svg>
                <span className="flex-1 truncate">Scheduled</span>
                <span className="text-[11.5px] font-medium tabular-nums text-text-muted">
                  {scheduledNotes.length}
                </span>
              </button>
            )}
            {pinnedItems.length > 0 && (
              <>
                <button
                  onClick={() => setPinnedOpen((prev) => !prev)}
                  aria-expanded={pinnedOpen}
                  className={`side-row ${pinnedOpen ? "text-text-primary" : ""}`}
                >
                  <svg
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    viewBox="0 0 24 24"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 4h6l-.8 6 3 3.2H6.8l3-3.2zM12 13.5V20" />
                  </svg>
                  <span className="flex-1 truncate">Pinned</span>
                  <span className="text-[11.5px] font-medium tabular-nums text-text-muted">
                    {pinnedItems.length}
                  </span>
                  <svg
                    className={`w-3! h-3! shrink-0 text-text-muted motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-soft ${pinnedOpen ? "rotate-90" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
                {pinnedOpen && (
                  <div className="flex flex-col gap-px ps-[26px]">
                    {pinnedItems.map((note) => (
                      <button
                        key={note.id}
                        onClick={() => selectNote(note.id)}
                        title={note.name}
                        aria-current={note.id === currentNoteId ? "page" : undefined}
                        className={`side-row ${note.id === currentNoteId ? "is-active" : ""}`}
                      >
                        <span className="truncate">{note.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </nav>
        )}

        {/* Open files (loose / unsaved) — shown above the vault tree */}
        {!searchQuery && looseOpenFiles.length > 0 && (
          // Capped so a long OPEN list scrolls on its own instead of squeezing
          // the file tree below it down to a sliver.
          <div className="shrink-0 flex flex-col min-h-0 max-h-[35%]">
            <button
              type="button"
              onClick={() => setLooseFilesOpen((prev) => !prev)}
              aria-expanded={looseFilesOpen}
              className="group/open shrink-0 mx-3 px-2.5 pt-5 pb-1.5 flex items-center gap-1.5 text-start"
            >
              <span className="side-label group-hover/open:text-text-secondary transition-colors">
                Open
              </span>
              <span className="text-[12px] font-medium tabular-nums text-text-muted">
                {looseOpenFiles.length}
              </span>
              <svg
                className={`ms-auto w-3 h-3 shrink-0 text-text-muted motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-soft ${looseFilesOpen ? "rotate-90" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
            {looseFilesOpen && (
              <div className="min-h-0 overflow-y-auto px-3 pb-1 flex flex-col gap-px">
                {looseOpenFiles.map((file) => {
                  const isActive = file.id === currentNoteId;
                  const isDirty = !isAutoSave && dirtyNoteIds.includes(file.id);
                  const locationHint = file.filePath
                    ? file.filePath
                        .replace(/^\/(Users|home)\/[^/]+/, "~")
                        .split(/[/\\]/)
                        .slice(0, -1)
                        .join("/")
                    : "Unsaved";
                  return (
                    <div
                      key={file.id}
                      onClick={() => selectNote(file.id)}
                      title={file.filePath || file.name}
                      className={`group side-row cursor-pointer ${isActive ? "is-active" : ""}`}
                    >
                      {isDirty ? (
                        <span
                          className="w-1.5 h-1.5 shrink-0 rounded-full bg-accent"
                          aria-hidden="true"
                        />
                      ) : (
                        <svg
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          viewBox="0 0 24 24"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z" />
                          <path d="M14 3.5V8h4.5M9 12.5h6M9 16h4" />
                        </svg>
                      )}
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      {locationHint && (
                        <span className="shrink-0 max-w-[7rem] truncate text-[11px] font-normal text-text-muted group-hover:hidden">
                          {locationHint}
                        </span>
                      )}
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          closeNote(file.id);
                        }}
                        className="grid h-6 w-6 -me-1.5 shrink-0 place-items-center rounded-control opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-text-muted hover:bg-item-hover hover:text-text-primary transition-[opacity,background-color,color]"
                        title="Close"
                        aria-label={`Close ${file.name}`}
                      >
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          viewBox="0 0 24 24"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Section header */}
        <div className="mx-3 ps-2.5 pe-1 pt-5 pb-1.5 flex items-center justify-between shrink-0">
          <span className="side-label">
            {searchQuery
              ? `${filteredItems.filter((i) => i.type === "note").length} results`
              : rootFolderPath
                ? "Files"
                : "Vault"}
          </span>
          {!searchQuery && (
            <button
              onClick={(event) => {
                // Without a vault there is only one thing to make: a scratch note.
                if (!rootFolderPath) {
                  handleNewNote();
                  return;
                }
                const rect = event.currentTarget.getBoundingClientRect();
                setNewMenu({ x: rect.left, y: rect.bottom + 6 });
              }}
              className="icon-btn -my-1 h-6! w-6!"
              title="New"
              aria-label="New"
              aria-haspopup={rootFolderPath ? "menu" : undefined}
              aria-expanded={rootFolderPath ? Boolean(newMenu) : undefined}
            >
              <svg
                className="w-3.5! h-3.5!"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          )}
        </div>

        {/* Main Folder Tree */}
        <div
          ref={sidebarRef}
          data-sidebar-tree-root="true"
          role="tree"
          aria-label="Workspace notes and folders"
          className={`flex-1 overflow-y-auto mx-1.5 px-1.5 pb-2 custom-scrollbar relative rounded-card transition-colors duration-150
            ${isRootDropActive || (isExternalDragging && !dropTargetFolder) ? "bg-accent-dim" : "bg-transparent"}
          `}
          onScroll={
            useVirtualizedTree
              ? (event) => setTreeScrollTop(event.currentTarget.scrollTop)
              : undefined
          }
          onMouseDown={(event) => {
            // Clicking the empty space under the tree drops the selection, the
            // same as clicking a single row does.
            if (!(event.target instanceof Element)) return;
            if (event.target.closest("[data-treeitem-row='true']")) return;
            clearTreeSelection();
          }}
          onContextMenu={(event) => {
            // Right-clicking empty space is still a gesture worth answering:
            // paste-to-root and create live here.
            if (!(event.target instanceof Element)) return;
            if (event.target.closest("[data-treeitem-row='true']")) return;
            event.preventDefault();
            setContextMenu(null);
            setEmptyMenu({ x: event.clientX, y: event.clientY });
          }}
          onMouseMove={draggedItem ? handleTreeMouseMove : undefined}
          onMouseLeave={draggedItem ? handleTreeMouseLeave : undefined}
          onMouseUp={draggedItem ? handleDropToRoot : undefined}
        >
          {isLoading ? (
            <LoadingState label="Loading the vault" className="pt-1">
              <SkeletonRows count={9} rowHeight={virtualTreeRowHeight} />
              {loadingProgress && loadingProgress.total > 0 && (
                <div className="px-2.5 pt-4">
                  <p className="text-[12px] text-text-muted tabular-nums">
                    {loadingProgress.phase} · {loadingProgress.current} of {loadingProgress.total}
                  </p>
                  <div className="mt-2 h-1 rounded-full bg-overlay-light overflow-hidden">
                    <div
                      className="h-full rounded-full bg-text-muted transition-[width] duration-200"
                      style={{
                        width: `${Math.round((loadingProgress.current / loadingProgress.total) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </LoadingState>
          ) : rootItems.length === 0 ? (
            isTreeFiltered && items.length > 0 ? (
              <EmptyState
                compact
                icon="filter"
                title="No notes match"
                body={
                  searchQuery
                    ? `Nothing in this vault matches “${searchQuery}”${selectedTags.length ? " with those tags" : ""}.`
                    : "No notes carry all of the selected tags."
                }
                action={{
                  label: "Clear filter",
                  onClick: () => {
                    setSearchQuery("");
                    clearTagFilters();
                  },
                }}
              />
            ) : rootFolderPath ? (
              <EmptyState
                compact
                icon="doc"
                title="This vault is empty"
                body="Notes and folders you create here show up in this list."
                action={{ label: "New note", onClick: handleNewNote }}
              />
            ) : (
              <EmptyState
                compact
                icon="vault"
                title="No vault open"
                body="Pick a folder of notes to work in, or start a scratch note."
                action={{ label: "Open a folder", onClick: handleOpenFolder }}
              />
            )
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
                      selectedIds={selectedIds}
                      onRowActivate={handleRowActivate}
                      filteredItems={null}
                      isCut={
                        clipboard?.mode === "cut" &&
                        clipboard.items.some((entry) => entry.id === row.item.id)
                      }
                      onCut={handleTreeCut}
                      onCopy={handleTreeCopy}
                      onPaste={handleTreePaste}
                      onSelectAll={handleTreeSelectAll}
                      requestRename={inlineRenameId === row.item.id}
                      onRenameHandled={() => setInlineRenameId(null)}
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
                selectedIds={selectedIds}
                onRowActivate={handleRowActivate}
                filteredItems={isTreeFiltered ? filteredItems : null}
                isCut={
                  clipboard?.mode === "cut" && clipboard.items.some((entry) => entry.id === item.id)
                }
                onCut={handleTreeCut}
                onCopy={handleTreeCopy}
                onPaste={handleTreePaste}
                onSelectAll={handleTreeSelectAll}
                requestRename={inlineRenameId === item.id}
                onRenameHandled={() => setInlineRenameId(null)}
              />
            ))
          )}
        </div>

        {/* Bottom Actions (Settings) */}
        {/* Footer — no rule and no fill: the save state and the app-level
            actions sit straight on the desk. */}
        <div className="mt-auto px-3 pt-2 pb-2 shrink-0">
          {["available", "downloading", "installing", "installed", "error"].includes(
            appUpdate.status
          ) && (
            <div className="mb-2 rounded-card bg-accent-dim p-3">
              <div className="flex items-start gap-2">
                <div className="mt-0.5 p-1.5 rounded-control bg-accent/15 text-accent shrink-0">
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
                  {/* Updater errors can carry a long unbroken URL, which has no
                      normal break opportunity and spills out of the card.
                      break-words splits it; line-clamp keeps one bad message
                      from pushing the buttons off-screen, with the full text
                      still available on hover. */}
                  <div
                    className="mt-0.5 text-[11px] leading-relaxed text-text-muted break-words line-clamp-3"
                    title={appUpdate.message || undefined}
                  >
                    {appUpdate.message || "A Marky update is ready."}
                  </div>
                </div>
              </div>

              {typeof appUpdate.progress === "number" && (
                <div className="mt-3">
                  <div className="h-1.5 rounded-full bg-overlay-light overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-300"
                      style={{ width: `${Math.max(0, Math.min(100, appUpdate.progress))}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-text-muted text-end">
                    {Math.round(appUpdate.progress)}%
                  </div>
                </div>
              )}

              {appUpdate.status === "available" && (
                <button
                  onClick={() => installAppUpdate()}
                  className="mt-3 w-full h-8 rounded-full bg-accent text-white text-[12.5px] font-semibold hover:bg-accent-hover transition-colors"
                >
                  Download & Install
                </button>
              )}

              {appUpdate.status === "installed" && (
                <button
                  onClick={restartApp}
                  className="mt-3 w-full h-8 rounded-full bg-accent text-white text-[12.5px] font-semibold hover:bg-accent-hover transition-colors"
                >
                  Restart Marky
                </button>
              )}

              {appUpdate.status === "error" && (
                <button
                  onClick={() => checkForAppUpdate({ silent: false })}
                  className="mt-3 w-full h-8 rounded-full bg-item-hover text-text-secondary text-[12.5px] font-semibold hover:bg-press transition-colors"
                >
                  Try Again
                </button>
              )}
            </div>
          )}

          {/* One quiet row instead of five: save state on the leading edge, the
              app-level actions as icons on the trailing one. Every action
              keeps its label as a tooltip and an accessible name. */}
          <div className="flex items-center gap-1 px-1">
            <span
              className="flex min-w-0 flex-1 items-center gap-2 ps-1.5 text-[12px] text-text-muted"
              title={
                dirtyCount > 0
                  ? `${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}`
                  : `All changes saved locally${lastSavedLabel ? ` · ${lastSavedLabel}` : ""}`
              }
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  dirtyCount > 0 ? "bg-amber-500" : "bg-[#35a36b]"
                }`}
                aria-hidden="true"
              />
              <span className="truncate">{dirtyCount > 0 ? `${dirtyCount} unsaved` : "Saved"}</span>
            </span>

            <button
              onClick={onOpenCommandPalette}
              className="icon-btn"
              title="Command palette (⌘K)"
              aria-label="Command palette"
            >
              <svg
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                viewBox="0 0 24 24"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 6h16M4 12h10M4 18h7" />
              </svg>
            </button>
            <button
              onClick={() => onOpenTemplate(null)}
              className="icon-btn"
              title="Templates"
              aria-label="Templates"
            >
              <svg
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                viewBox="0 0 24 24"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <path d="M4 9h16" />
              </svg>
            </button>
            <button
              onClick={toggleColorScheme}
              className="icon-btn"
              title={isDarkTheme ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={isDarkTheme ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDarkTheme ? (
                <svg
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  viewBox="0 0 24 24"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19" />
                </svg>
              ) : (
                <svg
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  viewBox="0 0 24 24"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 12.8A8 8 0 1111.2 3a6.2 6.2 0 009.8 9.8z" />
                </svg>
              )}
            </button>
            <button
              onClick={onSettingsClick}
              className="icon-btn"
              title="Settings"
              aria-label="Settings"
            >
              <svg
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                viewBox="0 0 24 24"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>
        </div>

        {/* Drag Ghost */}
        {draggedItem && dragPosition && (
          <div
            className={`glass-panel fixed left-0 top-0 z-50 pointer-events-none flex items-center gap-2 h-8 px-3 rounded-control text-[13px] font-medium max-w-60 will-change-transform transition-colors duration-100 ${
              isRootDropActive ? "text-accent" : "text-text-primary"
            }`}
            style={{
              transform: `translate3d(${dragPosition.x + 12}px, ${dragPosition.y - 12}px, 0) rotate(-3deg) scale(1.03)`,
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
            selectionCount={
              selectedIds.has(contextMenu.item.id) && selectedIds.size > 1 ? selectedIds.size : 0
            }
            onDeleteSelection={() => requestDeleteItem(contextMenu.item)}
            onCut={handleTreeCut}
            onCopy={handleTreeCopy}
            onPaste={handleTreePaste}
            onSelectAll={handleTreeSelectAll}
            canPaste={(clipboard?.items?.length ?? 0) > 0}
            onClose={() => setContextMenu(null)}
            onRename={handleRename}
            onShowTemplate={(parentId) => {
              onOpenTemplate(parentId);
            }}
            onNewHtmlDocument={handleNewHtmlDocument}
          />
        )}
        {/* The Files header's "+" menu */}
        {newMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setNewMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setNewMenu(null);
              }}
            />
            <div
              role="menu"
              aria-label="New"
              className="fixed z-50 glass-panel rounded-card p-1.5 min-w-[208px] animate-fade-in"
              style={{ left: newMenu.x, top: newMenu.y }}
            >
              <button
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  setNewMenu(null);
                  handleNewNote();
                }}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8zM14 3.5V8h4.5M9 12.5h6M9 16h4" />
                </svg>
                New note
              </button>
              <button
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  setNewMenu(null);
                  handleNewHtmlDocument(null);
                }}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8zM14 3.5V8h4.5M10.5 12 8.5 14.2l2 2.3M13.5 12l2 2.2-2 2.3" />
                </svg>
                New HTML document
              </button>
              <button
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  setNewMenu(null);
                  handleNewFolder();
                }}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2zM12 10.5v5M9.5 13h5" />
                </svg>
                New folder
              </button>
            </div>
          </>
        )}
        {/* Empty-space menu (workspace root): paste, create */}
        {emptyMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setEmptyMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setEmptyMenu(null);
              }}
            />
            <div
              className="fixed z-50 glass-panel rounded-card p-1.5 min-w-[208px] animate-fade-in"
              style={{ left: emptyMenu.x, top: emptyMenu.y }}
            >
              <button
                disabled={!clipboard?.items?.length}
                className="menu-item"
                onClick={() => {
                  handleTreePaste(null);
                  setEmptyMenu(null);
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 3h6v3H9zM7 5H5a2 2 0 00-2 2v13a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2h-2"
                  />
                </svg>
                Paste at root
                <span className="ms-auto text-[11px] font-mono text-text-muted">⌘V</span>
              </button>
              <div className="menu-separator" />
              <button
                className="menu-item"
                onClick={() => {
                  handleNewNote();
                  setEmptyMenu(null);
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                className="menu-item"
                onClick={() => {
                  handleNewHtmlDocument(null);
                  setEmptyMenu(null);
                }}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8zM14 3.5V8h4.5M10.5 12 8.5 14.2l2 2.3M13.5 12l2 2.2-2 2.3" />
                </svg>
                New HTML document
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  handleNewFolder();
                  setEmptyMenu(null);
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                  />
                </svg>
                New Folder
              </button>
            </div>
          </>
        )}

        <ConfirmDialog
          isOpen={pendingDeleteItems.length > 0}
          title={
            pendingDeleteItems.length > 1
              ? `Delete ${pendingDeleteItems.length} items`
              : `Delete ${pendingDeleteItems[0]?.type === "folder" ? "folder" : "note"}`
          }
          message={getDeleteMessage(pendingDeleteItems)}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={() => handleDeleteItems(pendingDeleteItems)}
          onCancel={() => setPendingDeleteItems([])}
        />
      </aside>
    );
  }
);

Sidebar.displayName = "Sidebar";

export default Sidebar;
