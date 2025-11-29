import { useState, useCallback, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import useNotesStore from '../store/notesStore';
import {
  openMarkdownFile,
  saveMarkdownFile,
  openFolder,
  readMarkdownFile,
  watchFolder,
  stopWatching
} from '../utils/fileSystem';

const TreeItem = ({ item, level = 0, onContextMenu, draggedItem, setDraggedItem, onItemMove, filteredItems }) => {
  const {
    currentNoteId,
    expandedFolders,
    toggleFolder,
    selectNote,
    getChildren,
    renameItem,
    updateNote
  } = useNotesStore();

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

      // If mouse moved more than threshold, start dragging
      if (!isDraggingRef.current && (deltaX > dragThreshold || deltaY > dragThreshold)) {
        console.log('🎯 Starting drag for:', item.name);
        isDraggingRef.current = true;
        setDraggedItem(item);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      const dragDuration = Date.now() - dragStartTimeRef.current;

      // If we were dragging, don't trigger click
      if (isDraggingRef.current) {
        console.log('🏁 Drag ended');
        setTimeout(() => {
          setDraggedItem(null);
          isDraggingRef.current = false;
        }, 100);
      } else if (dragDuration < 300) {
        // It was a quick click, not a drag
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
      // If content is null (file system note), load it first
      if (item.content === null && item.filePath) {
        try {
          const content = await readMarkdownFile(item.filePath);
          updateNote(item.id, content);
        } catch (error) {
          console.error('Failed to load note:', error);
        }
      }
      selectNote(item.id);
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
    } catch (error) {
      console.error('Failed to rename item:', error);
      alert('Failed to rename: ' + error.message);
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
      console.log('✅ Mouse entered valid drop target:', item.name);
      setIsDragOver(true);

      // Auto-expand folder after hovering for 800ms
      if (isFolder && !isExpanded) {
        if (autoExpandTimeoutRef.current) {
          clearTimeout(autoExpandTimeoutRef.current);
        }
        autoExpandTimeoutRef.current = setTimeout(() => {
          console.log('📂 Auto-expanding folder:', item.name);
          toggleFolder(item.id);
        }, 800);
      }
    }
  };

  const handleMouseLeave = () => {
    setIsDragOver(false);

    // Clear auto-expand timeout
    if (autoExpandTimeoutRef.current) {
      clearTimeout(autoExpandTimeoutRef.current);
      autoExpandTimeoutRef.current = null;
    }
  };

  const handleMouseUp = (e) => {
    if (!draggedItem || !canDrop) return;

    // Stop propagation to prevent handleDropToRoot from firing
    e.stopPropagation();

    console.log('💧 Dropping:', draggedItem.name, 'into:', item.name);
    onItemMove(draggedItem, item);
    setIsDragOver(false);

    // Clear auto-expand timeout
    if (autoExpandTimeoutRef.current) {
      clearTimeout(autoExpandTimeoutRef.current);
      autoExpandTimeoutRef.current = null;
    }
  };

  return (
    <div className={`relative ${isBeingDragged ? 'opacity-50' : 'opacity-100'} transition-opacity duration-200`}>
      {/* Drop indicator */}
      {isDragOver && canDrop && (
        <div className="absolute inset-0 pointer-events-none z-10">
          <div className="absolute inset-0 bg-accent/20 rounded-md animate-pulse" />
          <div className="absolute left-0 right-0 top-0 h-1 bg-accent animate-pulse shadow-lg shadow-accent/50" />
        </div>
      )}

      {/* Hierarchy guide lines */}
      {level > 0 && (
        <div className="absolute left-0 top-0 bottom-0 pointer-events-none">
          {Array.from({ length: level }).map((_, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 w-px bg-white/10"
              style={{ left: `${i * 16 + 16}px` }}
            />
          ))}
        </div>
      )}

      <div
        className={`
          flex items-center px-2 py-1.5 select-none relative
          rounded-md transition-all duration-150
          ${isSelected ? 'bg-white/12 text-white' : 'text-white/80'}
          ${!isBeingDragged && !isRenaming ? 'hover:bg-white/8 cursor-pointer' : ''}
          ${isDragOver && canDrop ? 'bg-accent/30 ring-2 ring-accent shadow-lg shadow-accent/20 scale-[1.02]' : ''}
          ${isBeingDragged ? 'cursor-grabbing' : 'cursor-grab'}
        `}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        onContextMenu={(e) => onContextMenu(e, item)}
        title={item.filePath || item.name}
      >
        {/* Expansion Arrow for Folders */}
        {isFolder && (
          <svg
            className={`w-4 h-4 mr-1 transition-transform text-white/60 ${isExpanded ? 'rotate-90' : ''}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" />
          </svg>
        )}

        {/* Icon */}
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
          <svg className="w-4 h-4 mr-2 ml-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )}

        {/* Name / Rename Input */}
        {isRenaming ? (
          <input
            type="text"
            value={renamingValue}
            onChange={(e) => setRenamingValue(e.target.value)}
            onBlur={handleRename}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-white/10 text-white px-2 py-0.5 rounded outline-none border border-white/30 focus:border-accent"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 text-sm truncate" title={item.filePath || item.name}>
            {item.name}
          </span>
        )}

        {/* File path indicator for saved notes */}
        {item.type === 'note' && item.filePath && (
          <svg className="w-3 h-3 ml-1 text-emerald-300" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
      </div>

      {/* Children */}
      {isFolder && isExpanded && (
        <div>
          {children
            .sort((a, b) => {
              // Folders first, then by order or alphabetically
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
              />
            ))
          }
        </div>
      )}
    </div>
  );
};

const ContextMenu = ({ x, y, item, onClose, onRename }) => {
  const { createNote, createFolder, deleteItem } = useNotesStore();

  const handleAction = async (action) => {
    try {
      if (action === 'newNote') {
        await createNote(item.type === 'folder' ? item.id : item.parentId);
      } else if (action === 'newFolder') {
        await createFolder(item.type === 'folder' ? item.id : item.parentId);
      } else if (action === 'rename') {
        onRename(item);
        return;
      } else if (action === 'delete') {
        await deleteItem(item.id);
      }
    } catch (error) {
      console.error('Context menu action failed:', error);
      alert('Action failed: ' + error.message);
    } finally {
      onClose();
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />
      <div
        className="fixed z-50 bg-titlebar-bg/95 backdrop-blur-2xl border border-white/10 rounded-lg shadow-2xl py-1 min-w-[180px]"
        style={{ left: x, top: y }}
      >
        {item.type === 'folder' && (
          <>
            <button
              className="w-full px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10 flex items-center gap-2 transition-colors"
              onClick={() => handleAction('newNote')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Note
            </button>
            <button
              className="w-full px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10 flex items-center gap-2 transition-colors"
              onClick={() => handleAction('newFolder')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Folder
            </button>
            <div className="h-px bg-white/10 my-1" />
          </>
        )}
        <button
          className="w-full px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10 flex items-center gap-2 transition-colors"
          onClick={() => handleAction('rename')}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Rename
        </button>
        <div className="h-px bg-white/10 my-1" />
        <button
          className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-white/10 flex items-center gap-2 transition-colors"
          onClick={() => handleAction('delete')}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete
        </button>
      </div>
    </>
  );
};

const Sidebar = ({ onSettingsClick }) => {
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
    refreshRootFromDisk
  } = useNotesStore();
  const [contextMenu, setContextMenu] = useState(null);
  const [draggedItem, setDraggedItem] = useState(null);
  const [renamingItem, setRenamingItem] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const dropHandledRef = useRef(false);

  // Search filtering function
  const filterItemsBySearch = useCallback((items, query) => {
    if (!query.trim()) return items;
    
    const searchLower = query.toLowerCase();
    const matchedIds = new Set();
    
    // Find all matching notes and folders
    items.forEach(item => {
      const nameMatch = item.name.toLowerCase().includes(searchLower);
      const contentMatch = item.type === 'note' && item.content && 
                          item.content.toLowerCase().includes(searchLower);
      
      if (nameMatch || contentMatch) {
        matchedIds.add(item.id);
        
        // Add all ancestors to show the path
        let current = item;
        while (current.parentId) {
          matchedIds.add(current.parentId);
          current = items.find(i => i.id === current.parentId);
          if (!current) break;
        }
      }
    });
    
    return items.filter(item => matchedIds.has(item.id));
  }, []);

  // Get root-level items (those with null parentId)
  const filteredItems = searchQuery ? filterItemsBySearch(items, searchQuery) : items;
  const rootItems = filteredItems.filter(item => item.parentId === null);

  const handleContextMenu = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item
    });
  };

  const handleItemMove = async (draggedItem, targetFolder) => {
    if (!draggedItem || !targetFolder) return;
    if (draggedItem.id === targetFolder.id) return;
    if (targetFolder.type !== 'folder') return;

    console.log('📦 Moving:', draggedItem.name, 'into:', targetFolder.name);

    // Set flag to prevent handleDropToRoot from firing
    dropHandledRef.current = true;

    // Clear drag state immediately to prevent double-move
    setDraggedItem(null);

    try {
      await moveItem(draggedItem.id, targetFolder.id);
      console.log('✅ Move successful');
    } catch (error) {
      console.error('❌ Failed to move item:', error);
      alert('Failed to move item: ' + error.message);
    } finally {
      // Reset the flag after a brief delay
      setTimeout(() => {
        dropHandledRef.current = false;
      }, 100);
    }
  };

  const handleNewNote = useCallback(async () => {
    try {
      await createNote(null);
    } catch (error) {
      if (error?.message && /exists/i.test(error.message)) {
        console.warn('Resolved duplicate note name conflict automatically.');
        return;
      }
      console.error('Failed to create note:', error);
      alert('Failed to create note: ' + error.message);
    }
  }, [createNote]);

  const handleNewFolder = useCallback(async () => {
    try {
      await createFolder(null);
    } catch (error) {
      if (error?.message && /exists/i.test(error.message)) {
        console.warn('Resolved duplicate folder name conflict automatically.');
        return;
      }
      console.error('Failed to create folder:', error);
      alert('Failed to create folder: ' + error.message);
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
      console.error('Failed to open file:', error);
      alert('Failed to open file: ' + error.message);
    }
  }, []);

  const handleOpenFolder = useCallback(async () => {
    try {
      const folderData = await openFolder();
      if (folderData) {
        await loadFolderFromSystem(folderData);
      }
    } catch (error) {
      console.error('Failed to open folder:', error);
      alert('Failed to open folder: ' + error.message);
    }
  }, [loadFolderFromSystem]);

  const handleSave = useCallback(async () => {
    try {
      const currentNote = getCurrentNote();
      if (!currentNote) return;

      const savedPath = await saveMarkdownFile(currentNote.content, currentNote.filePath);
      if (savedPath) {
        updateNotePath(currentNote.id, savedPath);
      }
    } catch (error) {
      console.error('Failed to save file:', error);
    }
  }, [getCurrentNote, updateNotePath]);

  const handleRename = (item) => {
    setRenamingItem(item);
  };

  const handleRenameSubmit = async (newName) => {
    const trimmed = newName.trim();
    if (renamingItem && trimmed) {
      try {
        await renameItem(renamingItem.id, trimmed);
      } catch (error) {
        console.error('Failed to rename item:', error);
        alert('Failed to rename: ' + error.message);
      }
    }
    setRenamingItem(null);
  };

  const handleDropToRoot = async () => {
    if (!draggedItem) return;

    // If drop was already handled by a folder, don't process root drop
    if (dropHandledRef.current) {
      console.log('⏭️ Skipping root drop (already handled by folder)');
      setDraggedItem(null);
      return;
    }

    console.log('📦 Moving to root:', draggedItem.name);

    try {
      await moveItemToRoot(draggedItem.id);
      console.log('✅ Move to root successful');
    } catch (error) {
      console.error('❌ Failed to move item:', error);
      alert('Failed to move item: ' + error.message);
    }

    setDraggedItem(null);
  };

  useEffect(() => {
    if (typeof window === 'undefined' || !window.__TAURI__) {
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

      await attach('menu://new-note', handleNewNote);
      await attach('menu://new-folder', handleNewFolder);
      await attach('menu://open-file', handleOpenFile);
      await attach('menu://open-folder', handleOpenFolder);
      await attach('menu://save-note', handleSave);
    };

    registerListeners();

    return () => {
      isMounted = false;
      while (unlisteners.length > 0) {
        const unlisten = unlisteners.pop();
        try {
          unlisten();
        } catch (error) {
          console.error('Failed to cleanup menu listener:', error);
        }
      }
    };
  }, [handleNewNote, handleNewFolder, handleOpenFile, handleOpenFolder, handleSave]);

  // File watcher effect
  useEffect(() => {
    console.log('🔍 File watcher effect triggered. rootFolderPath:', rootFolderPath);

    if (!rootFolderPath) {
      console.log('⏭️ No rootFolderPath set, skipping watcher setup');
      return undefined;
    }

    console.log('✅ Setting up file watcher for:', rootFolderPath);

    let isMounted = true;
    let unlistenFileChange = null;

    const setupWatcher = async () => {
      try {
        console.log('📡 Calling watchFolder with:', rootFolderPath);
        // Start watching the root folder
        await watchFolder(rootFolderPath);
        console.log('👀 Started watching folder:', rootFolderPath);

        // Listen for file change events
        unlistenFileChange = await listen('file-change', async (event) => {
          if (!isMounted) return;

          console.log('📁 File system change detected:', event.payload);

          // Refresh the folder tree from disk
          try {
            await refreshRootFromDisk();
          } catch (error) {
            console.error('Failed to refresh folder after file change:', error);
          }
        });
      } catch (error) {
        console.error('Failed to setup file watcher:', error);
      }
    };

    setupWatcher();

    return () => {
      isMounted = false;

      // Cleanup listeners
      if (unlistenFileChange) {
        try {
          unlistenFileChange();
        } catch (error) {
          console.error('Failed to cleanup file change listener:', error);
        }
      }

      // Stop watching
      stopWatching().catch((error) => {
        console.error('Failed to stop watching:', error);
      });
    };
  }, [rootFolderPath, refreshRootFromDisk]);

  return (
    <div className="w-64 bg-sidebar-bg border-r border-border flex flex-col">
      {/* Toolbar */}
      <div className="h-12 border-b border-border flex items-center px-3 gap-1.5 bg-titlebar-bg">
        <button
          onClick={handleNewNote}
          className="p-1.5 hover:bg-white/10 rounded-md text-white/70 hover:text-white transition-all"
          title="New Note (⌘N)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <button
          onClick={handleNewFolder}
          className="p-1.5 hover:bg-white/10 rounded-md text-white/70 hover:text-white transition-all"
          title="New Folder"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
        </button>
        <div className="w-px h-5 bg-white/10 mx-1" />
        <button
          onClick={handleOpenFile}
          className="p-1.5 hover:bg-white/10 rounded-md text-white/70 hover:text-white transition-all"
          title="Open File (⌘O)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </button>
        <button
          onClick={handleOpenFolder}
          className="p-1.5 hover:bg-white/10 rounded-md text-white/70 hover:text-white transition-all"
          title="Open Folder"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </button>
        <button
          onClick={handleSave}
          className="p-1.5 hover:bg-white/10 rounded-md text-white/70 hover:text-white transition-all"
          title="Save (⌘S)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
        </button>
      </div>

      {/* Search Bar */}
      <div className="px-3 py-2 border-b border-border bg-editor-bg">
        <div className="relative">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes..."
            className="w-full pl-9 pr-8 py-1.5 bg-sidebar-bg border border-border rounded text-sm text-white placeholder-text-muted outline-none focus:border-accent transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded text-text-muted hover:text-white transition-colors"
              title="Clear search"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {searchQuery && (
          <div className="mt-1.5 text-xs text-text-muted">
            {filteredItems.filter(i => i.type === 'note').length} note{filteredItems.filter(i => i.type === 'note').length !== 1 ? 's' : ''} found
          </div>
        )}
      </div>

      {/* Tree View */}
      <div
        className={`flex-1 overflow-y-auto px-2 py-2 transition-colors duration-200 ${
          draggedItem ? 'bg-white/5' : ''
        }`}
        onMouseUp={draggedItem ? handleDropToRoot : undefined}
      >
        {rootItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted text-sm">
            <svg className="w-12 h-12 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <p>No files or folders</p>
            <p className="text-xs mt-1">Create a new note or open a folder</p>
          </div>
        ) : (
          rootItems.map(item => (
            <TreeItem
              key={item.id}
              item={item}
              level={0}
              onContextMenu={handleContextMenu}
              draggedItem={draggedItem}
              setDraggedItem={setDraggedItem}
              onItemMove={handleItemMove}
              filteredItems={searchQuery ? filteredItems : null}
            />
          ))
        )}
      </div>

      {/* Settings Button */}
      <div className="h-12 border-t border-border flex items-center px-3 bg-titlebar-bg">
        <button
          onClick={onSettingsClick}
          className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/10 rounded-md text-white/70 hover:text-white text-sm w-full transition-all"
          title="Open settings"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </button>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          item={contextMenu.item}
          onClose={() => setContextMenu(null)}
          onRename={handleRename}
        />
      )}

      {/* Rename Dialog */}
      {renamingItem && (
        <RenameDialog
          item={renamingItem}
          onSubmit={handleRenameSubmit}
          onCancel={() => setRenamingItem(null)}
        />
      )}
    </div>
  );
};

const RenameDialog = ({ item, onSubmit, onCancel }) => {
  const [newName, setNewName] = useState(item.name);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await onSubmit(newName);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-titlebar-bg border border-border rounded-lg shadow-2xl p-6 w-96">
        <h2 className="text-lg font-semibold text-white mb-4">
          Rename {item.type === 'folder' ? 'Folder' : 'Note'}
        </h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-3 py-2 bg-editor-bg border border-border rounded text-white outline-none focus:border-accent transition-colors"
            placeholder="Enter new name"
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-border hover:bg-border/80 text-white rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-accent hover:bg-accent/80 text-white rounded transition-colors"
              disabled={!newName.trim()}
            >
              Rename
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Sidebar;
