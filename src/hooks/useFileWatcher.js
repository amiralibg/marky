import { useEffect, useRef, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { watchFolder, stopWatching } from "../utils/fileSystem";
import useNotesStore from "../store/notesStore";
import useUIStore from "../store/uiStore";

const logWatcherDebug = (...args) => {
  if (!import.meta.env.DEV) return;
  console.debug(...args);
};

/**
 * Hook to manage file system watching for the workspace
 * Automatically watches the root folder and refreshes when files change externally
 *
 * Features:
 * - Debounced refresh (300ms) to handle rapid changes (git operations)
 * - Reports sync errors without noisy success notifications
 * - Automatically starts watching when a folder is loaded
 * - Stops watching when component unmounts or folder changes
 */
export function useFileWatcher() {
  const rootFolderPath = useNotesStore((state) => state.rootFolderPath);
  const refreshRootFromDisk = useNotesStore((state) => state.refreshRootFromDisk);
  const addNotification = useUIStore((state) => state.addNotification);

  const unlistenFileChangeRef = useRef(null);
  const unlistenRecentNoteRef = useRef(null);
  const isWatchingRef = useRef(false);
  const debounceTimerRef = useRef(null);

  // Debounced refresh to avoid hammering during rapid changes (git operations, etc.)
  const debouncedRefresh = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        await refreshRootFromDisk();
      } catch (error) {
        console.error("Failed to refresh workspace:", error);
        addNotification("Failed to sync workspace: " + error.message, "error");
      }
    }, 300); // 300ms debounce for rapid file changes
  }, [refreshRootFromDisk, addNotification]);

  useEffect(() => {
    let mounted = true;

    const startWatching = async () => {
      if (!rootFolderPath || isWatchingRef.current) {
        return;
      }

      try {
        // Start watching the folder
        await watchFolder(rootFolderPath);
        isWatchingRef.current = true;
        logWatcherDebug("File watcher started:", rootFolderPath);

        // Listen for file change events from Rust backend
        unlistenFileChangeRef.current = await listen("file-change", (event) => {
          if (!mounted) return;

          logWatcherDebug("File change detected:", event.payload);

          // Debounced refresh to handle rapid changes gracefully
          debouncedRefresh();
        });

        unlistenRecentNoteRef.current = await listen("open-recent-note", (event) => {
          if (!mounted) return;

          const filePath = event.payload;
          const { items, selectNote } = useNotesStore.getState();
          const note = items.find((item) => item.filePath === filePath && item.type === "note");

          if (note) {
            selectNote(note.id);
          }
        });
      } catch (error) {
        console.error("Failed to start file watcher:", error);
      }
    };

    const stopWatchingAndCleanup = async () => {
      // Clear any pending debounced refresh
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      // Stop listening to events
      if (unlistenFileChangeRef.current) {
        unlistenFileChangeRef.current();
        unlistenFileChangeRef.current = null;
      }

      if (unlistenRecentNoteRef.current) {
        unlistenRecentNoteRef.current();
        unlistenRecentNoteRef.current = null;
      }

      // Stop the Rust watcher
      if (isWatchingRef.current) {
        try {
          await stopWatching();
          isWatchingRef.current = false;
          logWatcherDebug("File watcher stopped");
        } catch (error) {
          console.error("Failed to stop file watcher:", error);
        }
      }
    };

    // Start watching when a folder is loaded
    if (rootFolderPath) {
      startWatching();
    }

    // Cleanup on unmount or when folder changes
    return () => {
      mounted = false;
      stopWatchingAndCleanup();
    };
  }, [rootFolderPath, debouncedRefresh]);

  return {
    isWatching: isWatchingRef.current,
  };
}
