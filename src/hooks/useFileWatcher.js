import { useEffect, useRef, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { watchFolder, stopWatching } from '../utils/fileSystem';
import useNotesStore from '../store/notesStore';
import useUIStore from '../store/uiStore';

/**
 * Hook to manage file system watching for the workspace
 * Automatically watches the root folder and refreshes when files change externally
 *
 * Features:
 * - Debounced refresh (300ms) to handle rapid changes (git operations)
 * - Shows notification on successful refresh
 * - Automatically starts watching when a folder is loaded
 * - Stops watching when component unmounts or folder changes
 */
export function useFileWatcher() {
  const rootFolderPath = useNotesStore((state) => state.rootFolderPath);
  const refreshRootFromDisk = useNotesStore((state) => state.refreshRootFromDisk);
  const addNotification = useUIStore((state) => state.addNotification);

  const unlistenRef = useRef(null);
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
        addNotification('Workspace synced', 'success');
      } catch (error) {
        console.error('Failed to refresh workspace:', error);
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
        console.log('📂 File watcher started:', rootFolderPath);

        // Listen for file change events from Rust backend
        const unlisten = await listen('file-change', (event) => {
          if (!mounted) return;

          console.log('📝 File change detected:', event.payload);

          // Debounced refresh to handle rapid changes gracefully
          debouncedRefresh();
        });

        unlistenRef.current = unlisten;
      } catch (error) {
        console.error('❌ Failed to start file watcher:', error);
      }
    };

    const stopWatchingAndCleanup = async () => {
      // Clear any pending debounced refresh
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      // Stop listening to events
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }

      // Stop the Rust watcher
      if (isWatchingRef.current) {
        try {
          await stopWatching();
          isWatchingRef.current = false;
          console.log('⏹️ File watcher stopped');
        } catch (error) {
          console.error('❌ Failed to stop file watcher:', error);
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
    isWatching: isWatchingRef.current
  };
}
