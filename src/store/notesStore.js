import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  readMarkdownFile,
  createFolderOnDisk,
  createMarkdownFileOnDisk,
  renameEntryOnDisk,
  deleteEntryOnDisk,
  moveEntryOnDisk,
  scanFolder,
  writeMarkdownFileOnDisk
} from '../utils/fileSystem';

const normalizePath = (value) => (value ? value.replace(/\\/g, '/') : '');
const buildId = (type, path) => `${type}::${normalizePath(path)}`;
const stripExtension = (name) => name.replace(/\.(md|markdown|txt)$/i, '') || name;
const sanitizeNoteTitle = (value) =>
  (value ? value.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() : '');
const folderNameFromPath = (path) => {
  const normalized = normalizePath(path);
  if (!normalized) return path;
  const parts = normalized.split('/');
  return parts[parts.length - 1] || path;
};

// Extract hashtags from markdown content
const extractTags = (content) => {
  if (!content) return [];
  // Match #word (but not ##heading or ###heading)
  // Must be preceded by space, newline, or start of string
  // Must be followed by space, punctuation, or end of string
  const tagRegex = /(?:^|[\s])#([a-zA-Z0-9_-]+)(?=[\s.,;!?)]|$)/g;
  const tags = new Set();
  let match;
  
  while ((match = tagRegex.exec(content)) !== null) {
    const tag = match[1].toLowerCase();
    tags.add(tag);
  }
  
  return Array.from(tags).sort();
};

const normalizeLinkTarget = (value) => (value ? value.trim().toLowerCase() : '');
const buildNoteLinkKey = (name) => normalizeLinkTarget(stripExtension(name || ''));

const extractWikiLinks = (content) => {
  if (!content) return [];

  const wikiLinkRegex = /\[\[([^\[\]]+)\]\]/g;
  const links = [];
  const seen = new Set();
  let match;

  while ((match = wikiLinkRegex.exec(content)) !== null) {
    const inner = match[1].trim();
    if (!inner) continue;

    const [targetRaw, aliasRaw] = inner.split('|');
    const target = stripExtension((targetRaw || '').trim());
    if (!target) continue;

    const key = buildNoteLinkKey(target);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    links.push({
      key,
      target,
      alias: aliasRaw ? aliasRaw.trim() : null
    });
  }

  return links;
};

const ensureNoteMetadata = (item) => {
  if (!item || item.type !== 'note') {
    return item;
  }

  const linkKey = item.linkKey || buildNoteLinkKey(item.name);
  const links = item.links || extractWikiLinks(item.content);

  return {
    ...item,
    linkKey,
    links
  };
};

const collectAncestorIds = (itemId, items) => {
  const result = [];
  const parentMap = new Map(items.map((item) => [item.id, item.parentId]));
  let current = itemId;
  const guard = new Set();
  while (current && parentMap.has(current)) {
    if (guard.has(current)) break;
    guard.add(current);
    const parent = parentMap.get(current);
    if (!parent) break;
    result.push(parent);
    current = parent;
  }
  return result;
};

const createNameReservationSet = (names) => {
  const result = new Set();
  names
    .filter(Boolean)
    .forEach((name) => result.add(name.toLowerCase()));
  return result;
};

const reserveUniqueName = (baseName, reservedNames) => {
  let candidate = baseName;
  let counter = 1;
  while (reservedNames.has(candidate.toLowerCase())) {
    candidate = `${baseName} ${counter}`;
    counter += 1;
  }
  reservedNames.add(candidate.toLowerCase());
  return candidate;
};

const pendingWriteTimers = new Map();

const scheduleNoteWrite = (filePath, content) => {
  if (!filePath) return;
  const key = normalizePath(filePath);
  const existing = pendingWriteTimers.get(key);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(async () => {
    try {
      await writeMarkdownFileOnDisk(filePath, content);
    } catch (error) {
      console.error('Failed to save note to disk:', error);
    } finally {
      pendingWriteTimers.delete(key);
    }
  }, 500);

  pendingWriteTimers.set(key, timer);
};

const cancelPendingNoteWrite = (filePath) => {
  if (!filePath) return;
  const key = normalizePath(filePath);
  const timer = pendingWriteTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    pendingWriteTimers.delete(key);
  }
};

const cancelAllPendingNoteWrites = () => {
  pendingWriteTimers.forEach((timer) => {
    clearTimeout(timer);
  });
  pendingWriteTimers.clear();
};

const buildItemsFromFolderData = async ({ folderPath, folderName, files }) => {
  const now = new Date().toISOString();
  const normalizedRoot = normalizePath(folderPath);
  const rootId = buildId('folder', folderPath);
  const inferredName = folderName || folderNameFromPath(folderPath);
  const items = [
    {
      id: rootId,
      name: inferredName,
      parentId: null,
      type: 'folder',
      filePath: folderPath,
      normalizedPath: normalizedRoot,
      content: null,
      createdAt: now
    }
  ];

  const pathToId = new Map([[normalizedRoot, rootId]]);

  const sortedEntries = [...files].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    return a.path.toLowerCase().localeCompare(b.path.toLowerCase());
  });

  // Load all note contents in parallel for tag extraction
  const noteContentMap = new Map();
  const noteLoadPromises = sortedEntries
    .filter(entry => !entry.is_dir)
    .map(async (entry) => {
      try {
        const content = await readMarkdownFile(entry.path);
        noteContentMap.set(entry.path, content);
      } catch (error) {
        console.error(`Failed to load note content for ${entry.path}:`, error);
        noteContentMap.set(entry.path, ''); // Use empty string as fallback
      }
    });
  
  await Promise.all(noteLoadPromises);

  sortedEntries.forEach((entry) => {
    const normalizedEntry = normalizePath(entry.path);
    const parentNormalized = normalizedEntry.split('/').slice(0, -1).join('/');
    const parentId = pathToId.get(parentNormalized) || rootId;

    if (entry.is_dir) {
      const folderId = buildId('folder', entry.path);
      items.push({
        id: folderId,
        name: entry.name,
        parentId,
        type: 'folder',
        filePath: entry.path,
        normalizedPath: normalizedEntry,
        content: null,
        createdAt: now
      });
      pathToId.set(normalizedEntry, folderId);
    } else {
      const noteId = buildId('note', entry.path);
      const noteContent = noteContentMap.get(entry.path) || '';
      items.push({
        id: noteId,
        name: stripExtension(entry.name),
        parentId,
        type: 'note',
        filePath: entry.path,
        normalizedPath: normalizedEntry,
        content: noteContent,
        createdAt: now,
        updatedAt: now,
        linkKey: buildNoteLinkKey(entry.name),
        links: extractWikiLinks(noteContent)
      });
    }
  });

  return { items, rootId };
};

const resolveFolderPath = (folderId, items, rootFolderPath) => {
  if (!folderId) return rootFolderPath;
  const folder = items.find((item) => item.id === folderId && item.type === 'folder');
  return folder ? folder.filePath : null;
};

const useNotesStore = create(
  persist(
    (set, get) => ({
      items: [],
      currentNoteId: null,
      expandedFolders: [],
      rootFolderPath: null,
      rootFolderId: null,
      isLoading: false,
      recentNotes: [], // Array of {id, name, filePath, lastOpenedAt}
      pinnedNotes: [], // Array of note IDs that are pinned
      selectedTags: [], // Array of tag strings for filtering
      customTemplates: [], // Array of {id, name, icon, description, content}

      setRootFolder: async (folderData) => {
        const { items: fsItems, rootId } = await buildItemsFromFolderData(folderData);
        const normalizedRoot = normalizePath(folderData.folderPath);
        const previousItems = get().items;
        const ephemeralItems = previousItems.filter((item) => !item.filePath);
        const combinedItems = [...fsItems, ...ephemeralItems].map(ensureNoteMetadata);
        const firstNote = combinedItems.find(
          (item) =>
            item.type === 'note' &&
            item.filePath &&
            normalizePath(item.filePath).startsWith(normalizedRoot)
        );

        set({
          rootFolderPath: folderData.folderPath,
          rootFolderId: rootId,
          items: combinedItems,
          currentNoteId: firstNote ? firstNote.id : null,
          expandedFolders: [rootId]
        });

        return rootId;
      },

      loadFolderFromSystem: (folderData) => get().setRootFolder(folderData),

      refreshRootFromDisk: async (options = {}) => {
        const { focusPath, ensureExpandedPath } = options;
        const state = get();
        const { rootFolderPath } = state;
        if (!rootFolderPath) return [];

        set({ isLoading: true });
        try {
          const files = await scanFolder(rootFolderPath);
          const folderData = {
            folderPath: rootFolderPath,
            folderName: folderNameFromPath(rootFolderPath),
            files
          };
          const { items: fsItems, rootId } = await buildItemsFromFolderData(folderData);
          const normalizedRoot = normalizePath(rootFolderPath);
          const previousItems = state.items;
          const ephemeralItems = previousItems.filter((item) => !item.filePath);
          
          // Preserve content of the currently open note to avoid overwriting while typing
          const currentNote = state.currentNoteId 
            ? previousItems.find(item => item.id === state.currentNoteId && item.type === 'note')
            : null;
          
          const combinedItems = fsItems
            .map((item) => {
              if (currentNote && item.id === currentNote.id && item.type === 'note') {
                return ensureNoteMetadata({
                  ...item,
                  content: currentNote.content,
                  updatedAt: currentNote.updatedAt
                });
              }
              return ensureNoteMetadata(item);
            })
            .concat(ephemeralItems.map(ensureNoteMetadata));
          const validFolderIds = new Set(
            combinedItems.filter((item) => item.type === 'folder').map((item) => item.id)
          );
          const expandedSet = new Set(
            state.expandedFolders.filter((folderId) => validFolderIds.has(folderId))
          );
          expandedSet.add(rootId);

          const applyExpand = (path) => {
            if (!path) return;
            const folderId = buildId('folder', path);
            if (!validFolderIds.has(folderId)) return;
            expandedSet.add(folderId);
            collectAncestorIds(folderId, combinedItems).forEach((ancestor) => {
              if (validFolderIds.has(ancestor)) {
                expandedSet.add(ancestor);
              }
            });
          };

          applyExpand(ensureExpandedPath);

          const findItemById = (id) => combinedItems.find((item) => item.id === id);
          let currentNoteId = state.currentNoteId;

          if (focusPath) {
            const normalizedFocus = normalizePath(focusPath);
            const target = combinedItems.find(
              (item) => item.normalizedPath === normalizedFocus
            );
            if (target && target.type === 'note') {
              currentNoteId = target.id;
            } else if (currentNoteId && !findItemById(currentNoteId)) {
              currentNoteId = null;
            }
          } else if (currentNoteId && !findItemById(currentNoteId)) {
            currentNoteId = null;
          }

          set({
            items: combinedItems,
            rootFolderId: rootId,
            expandedFolders: Array.from(expandedSet),
            currentNoteId
          });

          return combinedItems;
        } finally {
          set({ isLoading: false });
        }
      },

      createFolder: async (parentId = null) => {
        const state = get();
        const { rootFolderPath, rootFolderId } = state;

        if (!rootFolderPath || !rootFolderId) {
          throw new Error('Select a workspace folder before creating new folders.');
        }

        const resolvedParentId = parentId || rootFolderId;
        const parentPath = resolveFolderPath(resolvedParentId, state.items, rootFolderPath);
        if (!parentPath) {
          throw new Error('Parent folder not found');
        }

        const folderSiblings = state.items.filter(
          (entry) => entry.parentId === resolvedParentId && entry.type === 'folder'
        );
        const reservedFolderNames = createNameReservationSet(folderSiblings.map((entry) => entry.name));
        let candidateName = reserveUniqueName('New Folder', reservedFolderNames);
        let attempt = 0;
        let lastError = null;
        while (attempt < 100) {
          try {
            const newPath = await createFolderOnDisk(parentPath, candidateName);
            await get().refreshRootFromDisk({
              ensureExpandedPath: parentPath,
              focusPath: newPath
            });
            return buildId('folder', newPath);
          } catch (error) {
            lastError = error;
            if (error?.message && /exists/i.test(error.message)) {
              candidateName = reserveUniqueName('New Folder', reservedFolderNames);
              attempt += 1;
              continue;
            }
            throw error;
          }
        }

        throw lastError || new Error('Unable to create folder');
      },

      createNote: async (parentId = null, templateContent = null, noteName = null) => {
        const state = get();
        const { rootFolderPath, rootFolderId } = state;

        if (!rootFolderPath || !rootFolderId) {
          throw new Error('Select a workspace folder before creating new notes.');
        }

        const resolvedParentId = parentId || rootFolderId;
        const parentPath = resolveFolderPath(resolvedParentId, state.items, rootFolderPath);
        if (!parentPath) {
          throw new Error('Parent folder not found');
        }

        const noteSiblings = state.items.filter(
          (entry) => entry.parentId === resolvedParentId && entry.type === 'note'
        );
        const reservedNoteNames = createNameReservationSet(noteSiblings.map((entry) => entry.name));
        const desiredBase = sanitizeNoteTitle(noteName) || 'New Note';
        let noteBaseName = reserveUniqueName(desiredBase, reservedNoteNames);
        let attempt = 0;
        let lastError = null;
        let newPath = null;

        // Use template content or default
        const initialContent =
          templateContent !== null && templateContent !== undefined
            ? templateContent
            : `# ${noteBaseName}\n\nStart writing...`;

        while (attempt < 100) {
          const fileName = `${noteBaseName}.md`;

          try {
            newPath = await createMarkdownFileOnDisk(
              parentPath,
              fileName,
              initialContent
            );
            break;
          } catch (error) {
            lastError = error;
            if (error?.message && /exists/i.test(error.message)) {
              noteBaseName = reserveUniqueName('New Note', reservedNoteNames);
              attempt += 1;
              continue;
            }
            throw error;
          }
        }

        if (!newPath) {
          throw lastError || new Error('Unable to create note');
        }

        await get().refreshRootFromDisk({
          ensureExpandedPath: parentPath,
          focusPath: newPath
        });

        try {
          const content = await readMarkdownFile(newPath);
          set((current) => ({
            items: current.items.map((item) =>
              item.filePath === newPath
                ? ensureNoteMetadata({ ...item, content })
                : item
            )
          }));
        } catch (error) {
          console.error('Failed to read new note content:', error);
        }

        const noteId = buildId('note', newPath);
        set({ currentNoteId: noteId });
        return noteId;
      },

      loadNoteFromFile: (fileData, parentId = null) => {
        const { content, path, name } = fileData;
        const timestamp = new Date().toISOString();
        const noteId = Date.now();

        const newNote = {
          id: noteId,
          name: stripExtension(name) || 'Untitled',
          parentId,
          type: 'note',
          content,
          filePath: path,
          normalizedPath: normalizePath(path),
          createdAt: timestamp,
          updatedAt: timestamp
        };

        const enrichedNote = ensureNoteMetadata(newNote);

        set((current) => ({
          items: [...current.items, enrichedNote],
          currentNoteId: enrichedNote.id,
          expandedFolders: parentId
            ? Array.from(new Set([...current.expandedFolders, parentId]))
            : current.expandedFolders
        }));

        return noteId;
      },

      updateNote: (noteId, content) => {
        const state = get();
        const note = state.items.find(
          (item) => item.id === noteId && item.type === 'note'
        );

        set((current) => ({
          items: current.items.map((item) =>
            item.id === noteId && item.type === 'note'
              ? ensureNoteMetadata({
                  ...item,
                  content,
                  updatedAt: new Date().toISOString()
                })
              : item
          )
        }));

        if (note?.filePath) {
          scheduleNoteWrite(note.filePath, content);
        }
      },

      updateNotePath: (noteId, filePath) => {
        const normalized = normalizePath(filePath);
        const replacementId = buildId('note', filePath);
        const state = get();
        const existing = state.items.find(
          (item) => item.id === noteId && item.type === 'note'
        );
        if (existing?.filePath) {
          cancelPendingNoteWrite(existing.filePath);
        }

        set((state) => {
          const items = state.items.map((item) =>
            item.id === noteId && item.type === 'note'
              ? ensureNoteMetadata({
                  ...item,
                  id: replacementId,
                  filePath,
                  normalizedPath: normalized,
                  updatedAt: new Date().toISOString()
                })
              : item
          );

          const currentNoteId = state.currentNoteId === noteId ? replacementId : state.currentNoteId;

          return { items, currentNoteId };
        });
      },

      renameItem: async (itemId, newName) => {
        const trimmed = newName?.trim();
        if (!trimmed) return;

        const state = get();
        const item = state.items.find((entry) => entry.id === itemId);
        if (!item) return;

        if (!item.filePath) {
          set((current) => ({
            items: current.items.map((entry) =>
              entry.id === itemId ? { ...entry, name: trimmed } : entry
            )
          }));
          return;
        }

        if (item.type === 'note') {
          const extMatch = item.filePath.match(/(\.[^./\\]+)$/);
          const defaultExtension = extMatch ? extMatch[1] : '.md';
          if (/[/\\]/.test(trimmed)) {
            throw new Error('Name cannot contain path separators');
          }

          let fileName = trimmed;
          if (!fileName.includes('.')) {
            fileName = `${fileName}${defaultExtension}`;
          }

          const parentPath = resolveFolderPath(
            item.parentId,
            state.items,
            state.rootFolderPath
          );

          const newPath = await renameEntryOnDisk(item.filePath, fileName);

          await get().refreshRootFromDisk({
            ensureExpandedPath: parentPath,
            focusPath: newPath
          });

          try {
            const content = await readMarkdownFile(newPath);
            set((current) => ({
              items: current.items.map((entry) =>
                entry.filePath === newPath ? { ...entry, content } : entry
              )
            }));
          } catch (error) {
            console.error('Failed to load renamed note:', error);
          }

          set({ currentNoteId: buildId('note', newPath) });
        } else {
          const newPath = await renameEntryOnDisk(item.filePath, trimmed);

          await get().refreshRootFromDisk({
            ensureExpandedPath: newPath
          });
        }
      },

      deleteItem: async (itemId) => {
        const state = get();
        const item = state.items.find((entry) => entry.id === itemId);
        if (!item) return;

        if (item.filePath) {
          cancelPendingNoteWrite(item.filePath);
        }

        if (!item.filePath) {
          const collectDescendants = (id, items) => {
            const children = items.filter((entry) => entry.parentId === id);
            return [
              id,
              ...children.flatMap((child) => collectDescendants(child.id, items))
            ];
          };

          const idsToRemove = collectDescendants(itemId, state.items);

          set((current) => {
            const remaining = current.items.filter((entry) => !idsToRemove.includes(entry.id));
            let nextCurrent = current.currentNoteId;
            if (idsToRemove.includes(current.currentNoteId)) {
              const firstNote = remaining.find((entry) => entry.type === 'note');
              nextCurrent = firstNote ? firstNote.id : null;
            }
            return {
              items: remaining,
              currentNoteId: nextCurrent
            };
          });
          return;
        }

        const parentPath = resolveFolderPath(
          item.parentId,
          state.items,
          state.rootFolderPath
        );
        const deletedWasCurrent = state.currentNoteId === itemId;

        await deleteEntryOnDisk(item.filePath);
        await get().refreshRootFromDisk({
          ensureExpandedPath: parentPath || state.rootFolderPath
        });

        if (deletedWasCurrent) {
          const updatedState = get();
          if (!updatedState.currentNoteId) {
            const normalizedRoot = normalizePath(updatedState.rootFolderPath);
            const fallback = updatedState.items.find(
              (entry) =>
                entry.type === 'note' &&
                entry.filePath &&
                normalizePath(entry.filePath).startsWith(normalizedRoot)
            );
            if (fallback) {
              set({ currentNoteId: fallback.id });
            }
          }
        }
      },

      moveItem: async (itemId, targetFolderId) => {
        const state = get();
        const item = state.items.find((entry) => entry.id === itemId);
        if (!item) return null;

        const { rootFolderId, rootFolderPath } = state;
        const destinationId = targetFolderId || rootFolderId;

        if (!item.filePath) {
          set((current) => ({
            items: current.items.map((entry) =>
              entry.id === itemId ? { ...entry, parentId: destinationId || null } : entry
            )
          }));
          return itemId;
        }

        cancelPendingNoteWrite(item.filePath);

        if (!rootFolderPath || !destinationId) {
          return itemId;
        }

        const targetPath = resolveFolderPath(destinationId, state.items, rootFolderPath);
        if (!targetPath) {
          throw new Error('Destination folder not found');
        }

        if (item.type === 'folder') {
          const normalizedSource = normalizePath(item.filePath);
          const normalizedTarget = normalizePath(targetPath);
          if (normalizedTarget.startsWith(`${normalizedSource}/`)) {
            throw new Error('Cannot move a folder into itself');
          }
        }

        const newPath = await moveEntryOnDisk(item.filePath, targetPath);

        await get().refreshRootFromDisk({
          ensureExpandedPath: targetPath,
          focusPath: item.type === 'note' ? newPath : undefined
        });

        if (item.type === 'note') {
          try {
            const content = await readMarkdownFile(newPath);
            set((current) => ({
              items: current.items.map((entry) =>
                entry.filePath === newPath ? { ...entry, content } : entry
              )
            }));
          } catch (error) {
            console.error('Failed to read moved note:', error);
          }
        }

        return buildId(item.type === 'note' ? 'note' : 'folder', newPath);
      },

      moveItemToRoot: async (itemId) => {
        const { rootFolderId } = get();
        if (!rootFolderId) {
          set((state) => ({
            items: state.items.map((entry) =>
              entry.id === itemId ? { ...entry, parentId: null } : entry
            )
          }));
          return itemId;
        }
        return get().moveItem(itemId, rootFolderId);
      },

      reorderItems: (itemId, newParentId, newIndex) => {
        set((state) => {
          const items = [...state.items];
          const item = items.find((entry) => entry.id === itemId);

          if (!item) return state;

          item.parentId = newParentId;

          const siblings = items.filter(
            (entry) => entry.parentId === newParentId && entry.id !== itemId
          );

          siblings.splice(newIndex, 0, item);

          siblings.forEach((sibling, index) => {
            sibling.order = index;
          });

          return { items };
        });
      },

      toggleFolder: (folderId) => {
        set((state) => ({
          expandedFolders: state.expandedFolders.includes(folderId)
            ? state.expandedFolders.filter((id) => id !== folderId)
            : [...state.expandedFolders, folderId]
        }));
      },

      selectNote: (noteId) => {
        const state = get();
        const note = state.items.find((item) => item.id === noteId && item.type === 'note');
        
        if (note) {
          // Update recent notes list
          const recentNotes = state.recentNotes.filter(r => r.id !== noteId);
          recentNotes.unshift({
            id: note.id,
            name: note.name,
            filePath: note.filePath,
            lastOpenedAt: new Date().toISOString()
          });
          
          // Keep only last 10 recent notes
          const trimmedRecent = recentNotes.slice(0, 10);
          
          set({ 
            currentNoteId: noteId,
            recentNotes: trimmedRecent
          });
        } else {
          set({ currentNoteId: noteId });
        }
      },

      getCurrentNote: () => {
        const { items, currentNoteId } = get();
        return items.find((item) => item.id === currentNoteId && item.type === 'note') || null;
      },

      getChildren: (parentId) => {
        const { items } = get();
        return items.filter((item) => item.parentId === parentId);
      },

      getFolders: () => {
        const { items } = get();
        return items.filter((item) => item.type === 'folder');
      },

      getNotes: () => {
        const { items } = get();
        return items.filter((item) => item.type === 'note');
      },

      findNoteByLinkTarget: (target) => {
        const key = buildNoteLinkKey(target);
        if (!key) return null;

        const { items } = get();
        return (
          items.find(
            (item) => item.type === 'note' && (item.linkKey || buildNoteLinkKey(item.name)) === key
          ) || null
        );
      },

      getOutgoingLinks: (noteId) => {
        const { items } = get();
        const note = items.find((item) => item.id === noteId && item.type === 'note');
        if (!note) return [];

        const notesByKey = new Map();
        items.forEach((item) => {
          if (item.type === 'note' && item.linkKey) {
            notesByKey.set(item.linkKey, item);
          } else if (item.type === 'note') {
            const fallbackKey = buildNoteLinkKey(item.name);
            if (fallbackKey) {
              notesByKey.set(fallbackKey, ensureNoteMetadata(item));
            }
          }
        });

        const links = note.links || extractWikiLinks(note.content);

        return links.map((link) => ({
          ...link,
          note: notesByKey.get(link.key) || null
        }));
      },

      getBacklinks: (noteId) => {
        const { items } = get();
        const target = items.find((item) => item.id === noteId && item.type === 'note');
        if (!target) return [];

        const targetKey = target.linkKey || buildNoteLinkKey(target.name);
        if (!targetKey) return [];

        return items
          .filter((item) => {
            if (item.type !== 'note' || item.id === noteId) return false;
            const links = item.links || extractWikiLinks(item.content);
            return links.some((link) => link.key === targetKey);
          })
          .sort((a, b) => a.name.localeCompare(b.name));
      },

      getRecentNotes: () => {
        const { recentNotes, items } = get();
        // Filter out notes that no longer exist
        return recentNotes
          .map(recent => {
            const note = items.find(item => item.id === recent.id);
            return note ? { ...recent, exists: true } : { ...recent, exists: false };
          })
          .filter(r => r.exists);
      },

      togglePinNote: (noteId) => {
        set((state) => {
          const isPinned = state.pinnedNotes.includes(noteId);
          return {
            pinnedNotes: isPinned
              ? state.pinnedNotes.filter(id => id !== noteId)
              : [...state.pinnedNotes, noteId]
          };
        });
      },

      isPinned: (noteId) => {
        return get().pinnedNotes.includes(noteId);
      },

      getPinnedNotes: () => {
        const { pinnedNotes, items } = get();
        // Return pinned notes that still exist, sorted by name
        return items
          .filter(item => item.type === 'note' && pinnedNotes.includes(item.id))
          .sort((a, b) => a.name.localeCompare(b.name));
      },

      // Tag-related functions
      getAllTags: () => {
        const { items } = get();
        const tagCounts = {};
        
        items
          .filter(item => item.type === 'note' && item.content)
          .forEach(note => {
            const tags = extractTags(note.content);
            tags.forEach(tag => {
              tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
          });
        
        // Return array of {tag, count} sorted by count descending
        return Object.entries(tagCounts)
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count);
      },

      getNoteTags: (noteId) => {
        const { items } = get();
        const note = items.find(item => item.id === noteId && item.type === 'note');
        return note?.content ? extractTags(note.content) : [];
      },

      toggleTagFilter: (tag) => {
        set((state) => {
          const isSelected = state.selectedTags.includes(tag);
          return {
            selectedTags: isSelected
              ? state.selectedTags.filter(t => t !== tag)
              : [...state.selectedTags, tag]
          };
        });
      },

      clearTagFilters: () => {
        set({ selectedTags: [] });
      },

      // Custom template management
      addCustomTemplate: (template) => {
        set((state) => ({
          customTemplates: [...state.customTemplates, {
            ...template,
            id: `custom-${Date.now()}`,
            isCustom: true
          }]
        }));
      },

      deleteCustomTemplate: (templateId) => {
        set((state) => ({
          customTemplates: state.customTemplates.filter(t => t.id !== templateId)
        }));
      },

      updateCustomTemplate: (templateId, updates) => {
        set((state) => ({
          customTemplates: state.customTemplates.map(t =>
            t.id === templateId ? { ...t, ...updates } : t
          )
        }));
      },

      getFilteredByTags: () => {
        const { items, selectedTags } = get();
        
        if (selectedTags.length === 0) {
          return items;
        }
        
        // Return notes that contain ALL selected tags (AND logic)
        return items.filter(item => {
          if (item.type !== 'note' || !item.content) return false;
          
          const noteTags = extractTags(item.content);
          return selectedTags.every(tag => noteTags.includes(tag));
        });
      },

      resetStore: () => {
        cancelAllPendingNoteWrites();
        set({
          items: [],
          currentNoteId: null,
          expandedFolders: [],
          rootFolderPath: null,
          rootFolderId: null,
          isLoading: false,
          recentNotes: [],
          pinnedNotes: [],
          selectedTags: []
        });

        if (typeof window !== 'undefined') {
          try {
            window.localStorage.removeItem('marky-storage');
          } catch (error) {
            console.error('Failed to clear persisted store:', error);
          }
        }
      }
    }),
    {
      name: 'marky-storage',
      partialize: (state) => ({
        items: state.items,
        currentNoteId: state.currentNoteId,
        expandedFolders: state.expandedFolders,
        rootFolderPath: state.rootFolderPath,
        rootFolderId: state.rootFolderId,
        recentNotes: state.recentNotes,
        pinnedNotes: state.pinnedNotes
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.rootFolderPath) {
          state.refreshRootFromDisk?.();
        }
      }
    }
  )
);

if (typeof window !== 'undefined') {
  window.useNotesStore = useNotesStore;
}

export default useNotesStore;
