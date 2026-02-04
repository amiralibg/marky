import {
  useState,
  useCallback,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import useNotesStore from "../store/notesStore";
import useUIStore from "../store/uiStore";

import {
  openMarkdownFile,
  saveMarkdownFile,
  openFolder,
  readMarkdownFile,
  watchFolder,
  stopWatching,
  copyEntriesToFolder,
} from "../utils/fileSystem";

import TreeItem from "./Sidebar/TreeItem";
import ContextMenu from "./Sidebar/ContextMenu";
import BacklinkItem from "./Sidebar/BacklinkItem";

// Helper to find the folder element at given coordinates
const findFolderAtPosition = (x, y, sidebarElement) => {
  if (!sidebarElement) return null;

  // Get all folder elements within the sidebar
  const folderElements = sidebarElement.querySelectorAll("[data-folder-path]");

  for (const el of folderElements) {
    const rect = el.getBoundingClientRect();
    if (
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    ) {
      return {
        id: el.dataset.folderId,
        path: el.dataset.folderPath,
        name: el.dataset.folderName,
        element: el,
      };
    }
  }

  return null;
};

const Sidebar = forwardRef(
  ({ onSettingsClick, onOpenGraph, onOpenTemplate, onRenameItem }, ref) => {
    const {
      items,
      createNote,
      createFolder,
      getCurrentNote,
      updateNotePath,
      loadFolderFromSystem,
      moveItem,
      moveItemToRoot,
      renameItem,
      rootFolderPath,
      refreshRootFromDisk,
      getRecentNotes,
      getBacklinks,
      selectNote,
      getPinnedNotes,
      isPinned,
      toggleTagFilter,
      selectedTags,
      clearTagFilters,
      isLoading,
      loadingProgress,
    } = useNotesStore();
    const { addNotification } = useUIStore();
    const [contextMenu, setContextMenu] = useState(null);
    const [draggedItem, setDraggedItem] = useState(null);
    const [dragPosition, setDragPosition] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [showRecentNotes, setShowRecentNotes] = useState(false);
    const [showPinnedNotes, setShowPinnedNotes] = useState(true);
    const [showTags, setShowTags] = useState(false);
    const [showBacklinks, setShowBacklinks] = useState(true);
    const [sortBy, setSortBy] = useState("name-asc"); // 'name-asc', 'name-desc', 'date-desc', 'date-asc'
    const [showSortMenu, setShowSortMenu] = useState(false);
    const [dropTargetFolder, setDropTargetFolder] = useState(null);
    const [isExternalDragging, setIsExternalDragging] = useState(false);
    const dropHandledRef = useRef(false);
    const dropTargetRef = useRef(null);
    const sidebarRef = useRef(null);
    const currentNote = getCurrentNote();
    const backlinks = currentNote ? getBacklinks(currentNote.id) : [];

    // Compute all tags from items - this will re-compute when items change
    const allTags = items
      .filter((item) => item.type === "note" && item.content)
      .reduce((acc, note) => {
        const tags = (
          note.content.match(/(?:^|[\s])#([a-zA-Z0-9_-]+)/g) || []
        ).map((t) => t.trim().substring(1).toLowerCase());
        tags.forEach((tag) => {
          acc[tag] = (acc[tag] || 0) + 1;
        });
        return acc;
      }, {});

    const allTagsArray = Object.entries(allTags)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);

    // Search filtering function
    const filterItemsBySearch = useCallback((items, query) => {
      if (!query.trim()) return items;

      const searchLower = query.toLowerCase();
      const matchedIds = new Set();

      // Find all matching notes and folders
      items.forEach((item) => {
        const nameMatch = item.name.toLowerCase().includes(searchLower);
        const contentMatch =
          item.type === "note" &&
          item.content &&
          item.content.toLowerCase().includes(searchLower);

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
    let filteredItems = items;

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
            // Add ancestors
            let current = item;
            while (current.parentId) {
              tagFilteredNotes.add(current.parentId);
              current = items.find((i) => i.id === current.parentId);
              if (!current) break;
            }
          }
        }
      });
      filteredItems = items.filter((item) => tagFilteredNotes.has(item.id));
    }

    // Then apply search filtering
    if (searchQuery) {
      filteredItems = filterItemsBySearch(filteredItems, searchQuery);
    }

    let rootItems = filteredItems.filter((item) => item.parentId === null);

    // Sort items based on sortBy state
    rootItems = rootItems.sort((a, b) => {
      // Always keep folders first
      if (a.type !== b.type) {
        return a.type === "folder" ? -1 : 1;
      }

      switch (sortBy) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "date-desc":
          return (
            new Date(b.updatedAt || b.createdAt) -
            new Date(a.updatedAt || a.createdAt)
          );
        case "date-asc":
          return (
            new Date(a.updatedAt || a.createdAt) -
            new Date(b.updatedAt || b.createdAt)
          );
        default:
          return a.name.localeCompare(b.name);
      }
    });

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
      if (
        targetFolder &&
        targetFolder.type === "folder" &&
        targetFolder.filePath
      ) {
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
        addNotification("Failed to create folder: " + error.message, "error");
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
        alert("Failed to open file: " + error.message);
      }
    }, []);

    const handleOpenFolder = useCallback(async () => {
      try {
        const folderData = await openFolder();
        if (folderData) {
          await loadFolderFromSystem(folderData);
        }
      } catch (error) {
        console.error("Failed to open folder:", error);
        alert("Failed to open folder: " + error.message);
      }
    }, [loadFolderFromSystem]);

    // Expose methods to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        handleNewNote,
        handleNewFolder,
        handleOpenFolder,
      }),
      [handleNewNote, handleNewFolder, handleOpenFolder],
    );

    const handleSave = useCallback(async () => {
      try {
        const currentNote = getCurrentNote();
        if (!currentNote) return;

        const savedPath = await saveMarkdownFile(
          currentNote.content,
          currentNote.filePath,
        );
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

    const handleDropToRoot = async () => {
      if (!draggedItem) return;

      // If drop was already handled by a folder, don't process root drop
      if (dropHandledRef.current) {
        setDraggedItem(null);
        return;
      }

      try {
        await moveItemToRoot(draggedItem.id);
      } catch (error) {
        console.error("❌ Failed to move item:", error);
        alert("Failed to move item: " + error.message);
      }

      setDraggedItem(null);
    };

    // Track mouse position while dragging for ghost element
    useEffect(() => {
      if (!draggedItem) {
        setDragPosition(null);
        return;
      }

      const handleMouseMove = (e) => {
        setDragPosition({ x: e.clientX, y: e.clientY });
      };

      document.addEventListener("mousemove", handleMouseMove);
      return () => document.removeEventListener("mousemove", handleMouseMove);
    }, [draggedItem]);

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
            console.error(
              `Failed to register menu listener for ${eventName}:`,
              error,
            );
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

    // File watcher effect
    useEffect(() => {
      if (!rootFolderPath) {
        return undefined;
      }

      let isMounted = true;
      let unlistenFileChange = null;
      let unlistenRecentNote = null;
      let debounceTimer = null;

      // Debounced refresh to handle rapid file changes (git operations, etc.)
      const debouncedRefresh = () => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(async () => {
          if (!isMounted) return;
          try {
            await refreshRootFromDisk();
            addNotification("Workspace synced", "success");
          } catch (error) {
            console.error("Failed to refresh folder after file change:", error);
          }
        }, 300); // 300ms debounce for rapid file changes
      };

      const setupWatcher = async () => {
        try {
          // Start watching the root folder
          await watchFolder(rootFolderPath);
          console.log("📂 File watcher started:", rootFolderPath);

          // Listen for file change events
          unlistenFileChange = await listen("file-change", async (event) => {
            if (!isMounted) return;
            console.log("📝 File change detected:", event.payload);

            // Debounced refresh to handle rapid changes gracefully
            debouncedRefresh();
          });

          // Listen for recent note clicks from dock menu
          unlistenRecentNote = await listen(
            "open-recent-note",
            async (event) => {
              if (!isMounted) return;

              const filePath = event.payload;

              // Find the note by file path
              const { items, selectNote } = useNotesStore.getState();
              const note = items.find(
                (item) => item.filePath === filePath && item.type === "note",
              );

              if (note) {
                selectNote(note.id);
              }
            },
          );
        } catch (error) {
          console.error("Failed to setup file watcher:", error);
        }
      };

      setupWatcher();

      return () => {
        isMounted = false;

        // Clear debounce timer
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }

        // Cleanup listeners
        if (unlistenFileChange) {
          try {
            unlistenFileChange();
          } catch (error) {
            console.error("Failed to cleanup file change listener:", error);
          }
        }

        if (unlistenRecentNote) {
          try {
            unlistenRecentNote();
          } catch (error) {
            console.error("Failed to cleanup recent note listener:", error);
          }
        }

        // Stop watching
        stopWatching().catch((error) => {
          console.error("Failed to stop watching:", error);
        });
      };
    }, [rootFolderPath, refreshRootFromDisk]);

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
                  sidebarRef.current,
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
                  sidebarRef.current,
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
                      "success",
                    );
                  }
                } else if (rootFolderPath) {
                  // If no specific folder target, copy to root
                  await copyEntriesToFolder(paths, rootFolderPath);
                  await refreshRootFromDisk();
                  addNotification(
                    `Copied ${paths.length} item(s) to workspace root`,
                    "success",
                  );
                } else {
                  addNotification(
                    "Open a workspace folder first to drop files into it",
                    "info",
                  );
                }
              } catch (error) {
                console.error("Failed to copy files:", error);
                addNotification(
                  "Failed to copy files: " + error.message,
                  "error",
                );
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
                <svg
                  className="w-3 h-3"
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
              </button>
            )}
          </div>
          {searchQuery && (
            <div className="mt-2 text-xs text-text-muted px-1">
              Found {filteredItems.filter((i) => i.type === "note").length}{" "}
              notes
            </div>
          )}
          {/* Sort Options */}
          {!searchQuery && rootFolderPath && (
            <div className="mt-2 relative">
              <button
                onClick={() => setShowSortMenu(!showSortMenu)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-text-muted hover:text-text-secondary hover:bg-overlay-subtle rounded-md transition-colors"
              >
                <div className="flex items-center gap-2">
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
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
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowSortMenu(false)}
                  />
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
                      <span className="truncate">{note.name}</span>
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
                        <span className="truncate">{recent.name}</span>
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
                  {selectedTags.length > 0 && (
                    <button
                      onClick={clearTagFilters}
                      className="w-full mb-1.5 text-[10px] text-accent hover:text-accent-hover text-left flex items-center gap-1"
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
                      Clear filters
                    </button>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {allTagsArray.map(({ tag, count }) => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => toggleTagFilter(tag)}
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
                    <BacklinkItem
                      key={backlink.id}
                      backlink={backlink}
                      onNavigate={selectNote}
                    />
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
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
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
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
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
          className={`flex-1 overflow-y-auto px-3 py-2 space-y-0.5 custom-scrollbar bg-transparent relative
            ${draggedItem ? "bg-overlay-subtle/50 rounded-lg mx-2" : ""}
            ${isExternalDragging && !dropTargetFolder ? "ring-2 ring-accent/40 ring-inset rounded-lg bg-accent/5" : ""}
          `}
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
                <div className="w-full max-w-[200px] space-y-2">
                  <p className="text-sm text-center">{loadingProgress.phase}</p>
                  <div className="w-full h-1.5 bg-overlay-subtle rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all duration-200"
                      style={{ width: `${Math.round((loadingProgress.current / loadingProgress.total) * 100)}%` }}
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
                  <p className="font-semibold text-text-primary text-sm">
                    Workspace is empty
                  </p>
                  <p className="text-[11px] mt-1 text-text-muted leading-relaxed">
                    Open a folder to see your markdown notes or create a new one
                    to start writing.
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
                    onClick={() => loadFolderFromSystem({ folderPath: null })} // Trigger system dialog
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
                filteredItems={
                  searchQuery || selectedTags.length > 0 ? filteredItems : null
                }
              />
            ))
          )}
        </div>

        {/* Bottom Actions (Settings) */}
        <div className="mt-auto border-t border-border bg-bg-base/30 backdrop-blur-sm p-2 shrink-0">
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
              <span className="text-[10px] text-text-muted">
                Preferences & automations
              </span>
            </div>
          </button>
        </div>

        {/* Drag Ghost */}
        {draggedItem && dragPosition && (
          <div
            className="fixed z-50 pointer-events-none flex items-center gap-2 px-3 py-1.5 bg-bg-sidebar border border-overlay-medium rounded-md shadow-lg text-sm text-text-primary max-w-[200px]"
            style={{
              left: dragPosition.x + 12,
              top: dragPosition.y - 12,
            }}
          >
            {draggedItem.type === "folder" ? (
              <svg className="w-3.5 h-3.5 text-sky-400/80 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            )}
            <span className="truncate">{draggedItem.name}</span>
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
      </div>
    );
  },
);

Sidebar.displayName = "Sidebar";

export default Sidebar;
