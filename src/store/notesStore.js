import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  readMarkdownFile,
  createFolderOnDisk,
  createMarkdownFileOnDisk,
  renameEntryOnDisk,
  deleteEntryOnDisk,
  moveEntryOnDisk,
  readWorkspaceFiles,
  scanWorkspaceAttachments,
  writeMarkdownFileOnDisk,
} from "../utils/fileSystem";
import { setAttachmentIndex } from "../utils/attachments";
import { resolveTemplateById } from "../data/templates";
import { addMinutes, calculateNextRun } from "../utils/schedule";
import { buildDailyNoteContent, formatDailyNoteTitle } from "../utils/dailyNotes";
import { getNoteProperties } from "../utils/frontmatter";
import useSettingsStore, { parseIgnorePatterns, normalizeSaveMode } from "./settingsStore";
// History and drafts live on disk (see utils/sideStore.js). They used to sit in
// `localStorage`, where they shared a ~5 MB quota and failed silently.
import {
  addNoteHistorySnapshot,
  removeNoteHistory,
  moveNoteHistory,
  getDraftCacheEntry,
  setDraftCacheEntry,
  removeDraftCacheEntry,
  moveDraftCacheEntry,
  clearDraftCache,
  clearNoteHistory,
  ensureDraftsHydrated,
} from "../utils/sideStore";

export { getNoteHistorySnapshots } from "../utils/sideStore";

// Safe as a static import: settingsStore pulls nothing from here, so there is
// no cycle. Read at scan time rather than captured, so editing the patterns and
// refreshing picks up the change without a reload.
const getIgnorePatterns = () => parseIgnorePatterns(useSettingsStore.getState().ignorePatterns);

/**
 * Refresh the index of media files the vault's notes can embed.
 *
 * Kicked off without awaiting: the notes are what the UI is waiting on, and an
 * image that resolves a moment after the tree appears is invisible to the user.
 * Failures are already swallowed inside the scan — a missing index costs broken
 * images, never a failed workspace load.
 */
const refreshAttachmentIndex = (folderPath) => {
  if (!folderPath) {
    setAttachmentIndex([], null);
    return;
  }
  scanWorkspaceAttachments(folderPath, getIgnorePatterns()).then((files) => {
    // The workspace may have been switched while the walk was running.
    if (useNotesStore.getState().rootFolderPath === folderPath) {
      setAttachmentIndex(files, folderPath);
    }
  });
};

// Special ID for the Settings tab
export const SETTINGS_TAB_ID = "settings::special";

const normalizePath = (value) => (value ? value.replace(/\\/g, "/") : "");
const buildId = (type, path) => `${type}::${normalizePath(path)}`;
const buildViewId = () =>
  `view::${Date.now().toString(36)}::${Math.random().toString(36).slice(2, 8)}`;
const stripExtension = (name) => name.replace(/\.(md|markdown|txt)$/i, "") || name;
const sanitizeNoteTitle = (value) =>
  value
    ? value
        .replace(/[\\/:*?"<>|]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";
const normalizeItemNameInput = (value) =>
  Array.from((value || "").normalize("NFC"))
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .trim();
const folderNameFromPath = (path) => {
  const normalized = normalizePath(path);
  if (!normalized) return path;
  const parts = normalized.split("/");
  return parts[parts.length - 1] || path;
};

const stripCodeBlocks = (content) => {
  if (!content) return "";
  // Remove fenced code blocks
  let stripped = content.replace(/```[\s\S]*?```/g, "");
  // Remove inline code
  stripped = stripped.replace(/`[^`\n]+`/g, "");
  return stripped;
};

// Extract hashtags from markdown content
const extractTags = (content) => {
  if (!content) return [];
  const cleanContent = stripCodeBlocks(content);
  // Match #word (but not ##heading or ###heading)
  // Must be preceded by space, newline, or start of string
  // Must be followed by space, punctuation, or end of string
  const tagRegex = /(?:^|[\s])#([a-zA-Z0-9_-]+)(?=[\s.,;!?)]|$)/g;
  const tags = new Set();
  let match;

  while ((match = tagRegex.exec(cleanContent)) !== null) {
    const tag = match[1].toLowerCase();
    tags.add(tag);
  }

  getNoteProperties(content).tags.forEach((tag) => {
    const normalized = normalizeTagValue(tag);
    if (normalized) tags.add(normalized);
  });

  return Array.from(tags).sort();
};

const normalizeTagValue = (value) => {
  const cleaned = (value || "")
    .trim()
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
  return cleaned;
};

const replaceTagInContent = (content, sourceTag, targetTag = null) => {
  if (!content || !sourceTag) return content;

  const normalizedSource = normalizeTagValue(sourceTag);
  const normalizedTarget = targetTag ? normalizeTagValue(targetTag) : null;
  const tagRegex = /(^|[\s])#([a-zA-Z0-9_-]+)(?=[\s.,;!?)]|$)/gm;

  let changed = false;
  const next = content.replace(tagRegex, (full, prefix, tagName) => {
    if ((tagName || "").toLowerCase() !== normalizedSource) {
      return full;
    }

    changed = true;
    if (!normalizedTarget) {
      return prefix;
    }

    return `${prefix}#${normalizedTarget}`;
  });

  if (!changed) return content;
  return next;
};

const normalizeLinkTarget = (value) => (value ? value.trim().toLowerCase() : "");
const buildNoteLinkKey = (name) => normalizeLinkTarget(stripExtension(name || ""));

const extractWikiLinks = (content) => {
  if (!content) return [];

  const cleanContent = stripCodeBlocks(content);
  const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
  const links = [];
  const seen = new Set();
  let match;

  while ((match = wikiLinkRegex.exec(cleanContent)) !== null) {
    const inner = match[1].trim();
    if (!inner) continue;

    const [targetRaw, aliasRaw] = inner.split("|");
    const target = stripExtension((targetRaw || "").trim());
    if (!target) continue;

    const key = buildNoteLinkKey(target);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    links.push({
      key,
      target,
      alias: aliasRaw ? aliasRaw.trim() : null,
    });
  }

  return links;
};

const ensureNoteMetadata = (item) => {
  if (!item || item.type !== "note") {
    return item;
  }

  const linkKey = item.linkKey || buildNoteLinkKey(item.name);
  const links = item.links || extractWikiLinks(item.content);
  const tags = item.tags || extractTags(item.content);
  const properties = item.properties || getNoteProperties(item.content);

  return {
    ...item,
    linkKey,
    links,
    tags,
    properties,
  };
};

const recalculateNoteMetadata = (item) => {
  if (!item || item.type !== "note") {
    return item;
  }

  return {
    ...item,
    linkKey: buildNoteLinkKey(item.name),
    links: extractWikiLinks(item.content),
    tags: extractTags(item.content),
    properties: getNoteProperties(item.content),
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
  names.filter(Boolean).forEach((name) => result.add(name.toLowerCase()));
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
const pendingMetadataTimers = new Map();

const scheduleMetadataUpdate = (noteId, content) => {
  const existing = pendingMetadataTimers.get(noteId);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    try {
      const state = useNotesStore.getState();
      state.updateNoteMetadata(noteId, content);
    } catch (error) {
      console.error("Failed to update note metadata:", error);
    } finally {
      pendingMetadataTimers.delete(noteId);
    }
  }, 1000); // Wait 1 second after typing stops

  pendingMetadataTimers.set(noteId, timer);
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

// ── Auto-save scheduling ──────────────────────────────────────────
// This lives in the store rather than in the editor component on purpose. When
// it was a `useEffect`, its cleanup ran on every note switch and cancelled the
// pending write — so switching tabs within the delay window left the note dirty
// and the file on disk stale. The store outlives any mounted editor, so a note
// you have navigated away from still reaches disk.

const getSaveMode = () => normalizeSaveMode(useSettingsStore.getState().saveMode);

const getAutosaveDelay = () => {
  const delay = useSettingsStore.getState().autosaveDelay;
  return Number.isFinite(delay) && delay > 0 ? delay : 2000;
};

/** Writes that have been started but not yet settled, keyed by normalized path. */
const inFlightSaves = new Map();

/**
 * The editor keeps the text you are typing in local component state and pushes
 * it into the store on a short debounce, so a keystroke does not re-render the
 * tree. That means the store can briefly be a few characters behind the screen
 * — and a save fired from outside the editor (leaving the window, quitting)
 * would write those stale bytes. The mounted editor registers a flusher here,
 * and every save path drains it first.
 */
let pendingEditFlusher = null;

export const registerPendingEditFlusher = (flush) => {
  pendingEditFlusher = flush;
  return () => {
    if (pendingEditFlusher === flush) pendingEditFlusher = null;
  };
};

const drainPendingEditorEdits = () => {
  try {
    pendingEditFlusher?.();
  } catch (error) {
    console.error("Failed to flush pending editor edits:", error);
  }
};

/** Scratch buffers currently being turned into files, so it happens once. */
const materializingScratchIds = new Set();

/**
 * Give a scratch buffer a real file so auto-save has somewhere to write.
 *
 * A note that exists only in memory is the one place saving would still be the
 * user's problem, so the first thing typed into one turns it into an ordinary
 * Markdown file in the vault — the same thing New Note does, just deferred
 * until there is something worth keeping. With no vault open there is nowhere
 * to put it, and the buffer stays in memory until it is saved by hand.
 */
const materializeScratchNote = (noteId) => {
  if (materializingScratchIds.has(noteId)) return;
  if (getSaveMode() !== "auto") return;

  const state = useNotesStore.getState();
  if (!state.rootFolderPath || !state.rootFolderId) return;

  const note = state.items.find((item) => item.id === noteId && item.type === "note");
  if (!note || note.filePath) return;
  // An empty buffer is not yet a note; naming a file after nothing is worse
  // than waiting for the first keystroke.
  if (!(note.content || "").trim()) return;

  materializingScratchIds.add(noteId);

  (async () => {
    try {
      const current = useNotesStore.getState();
      const rootPath = current.rootFolderPath;
      if (!rootPath) return;

      const siblings = current.items.filter(
        (entry) => entry.parentId === current.rootFolderId && entry.type === "note"
      );
      const reserved = createNameReservationSet(siblings.map((entry) => entry.name));
      // The note's own name is whatever the buffer was called ("Untitled"),
      // which is exactly what Obsidian uses until you rename it.
      const desiredBase = sanitizeNoteTitle(note.name) || "Untitled";

      let candidate = reserveUniqueName(desiredBase, reserved);
      let attempt = 0;
      while (attempt < 100) {
        try {
          const newPath = await createMarkdownFileOnDisk(
            rootPath,
            `${candidate}.md`,
            note.content || ""
          );
          useNotesStore.getState().updateNotePath(noteId, newPath);
          // Keystrokes that landed while the file was being created are still
          // only in memory, and the file was written from the older snapshot.
          scheduleAutoSave(buildId("note", newPath), newPath);
          return;
        } catch (error) {
          if (error?.message && /exists/i.test(error.message)) {
            candidate = reserveUniqueName(desiredBase, reserved);
            attempt += 1;
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      // Not fatal: the buffer keeps its text and stays saveable by hand.
      console.error("Failed to turn scratch note into a file:", error);
    } finally {
      materializingScratchIds.delete(noteId);
    }
  })();
};

/**
 * Schedule `noteId` to be written after the configured idle delay. Repeated
 * calls (i.e. every keystroke) push the write out; the note is written once,
 * once typing stops.
 */
const scheduleAutoSave = (noteId, filePath) => {
  if (!filePath || getSaveMode() !== "auto") return;
  const key = normalizePath(filePath);
  cancelPendingNoteWrite(filePath);

  const timer = setTimeout(() => {
    pendingWriteTimers.delete(key);
    // Failures surface through the store's `saveError`; there is no user
    // gesture here to attach a rejection to.
    useNotesStore
      .getState()
      .saveNoteToDisk(noteId)
      .catch(() => {});
  }, getAutosaveDelay());

  pendingWriteTimers.set(key, timer);
};

const cancelAllPendingMetadataUpdates = () => {
  pendingMetadataTimers.forEach((timer) => {
    clearTimeout(timer);
  });
  pendingMetadataTimers.clear();
};

/**
 * Notes whose bytes on disk cannot have changed since we last read them, keyed
 * by normalized path.
 *
 * The workspace refresh runs on *every* watcher event — including the ones
 * Marky's own saves produce — and it used to re-read every file in the vault
 * each time. Comparing the scan's `modified`/`size` against what we already
 * hold turns that into reading only what actually changed.
 *
 * A file is only reused when both stats match and are non-zero: a `0` means the
 * platform gave us no metadata, and the safe reading of "unknown" is "re-read".
 */
const buildReusableContentMap = (previousItems = []) => {
  const map = new Map();
  for (const item of previousItems) {
    if (item.type !== "note" || !item.normalizedPath) continue;
    if (item.content == null || !item.modified || !item.size) continue;
    map.set(item.normalizedPath, item);
  }
  return map;
};

/**
 * The stats for notes we already hold content for, in the shape the Rust bulk
 * read expects. Sending these lets it skip re-reading files that cannot have
 * changed and return `content: null` for them instead.
 */
const buildKnownFiles = (items = []) =>
  items
    .filter(
      (item) =>
        item.type === "note" && item.filePath && item.content != null && item.modified && item.size
    )
    .map((item) => ({ path: item.filePath, modified: item.modified, size: item.size }));

const buildItemsFromFolderData = async (
  { folderPath, folderName, files },
  onProgress,
  previousItems = []
) => {
  const reusable = buildReusableContentMap(previousItems);
  const now = new Date().toISOString();
  const normalizedRoot = normalizePath(folderPath);
  const rootId = buildId("folder", folderPath);
  const inferredName = folderName || folderNameFromPath(folderPath);
  const items = [
    {
      id: rootId,
      name: inferredName,
      parentId: null,
      type: "folder",
      filePath: folderPath,
      normalizedPath: normalizedRoot,
      content: null,
      createdAt: now,
    },
  ];

  const pathToId = new Map([[normalizedRoot, rootId]]);

  const sortedEntries = [...files].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    return a.path.toLowerCase().localeCompare(b.path.toLowerCase());
  });

  // Contents arrive with the walk, in the same payload. An entry whose
  // `content` is null was unchanged since we last read it, so the cached copy
  // stands — that is what keeps a single save from re-reading the whole vault.
  // Anything still missing (a file that appeared without stats, or a read that
  // failed on the Rust side) falls back to empty rather than blocking the load.
  const noteContentMap = new Map();
  const noteEntries = sortedEntries.filter((entry) => !entry.is_dir);
  const total = noteEntries.length;
  let loaded = 0;

  for (const entry of noteEntries) {
    if (entry.content != null) {
      noteContentMap.set(entry.path, entry.content);
    } else {
      const cached = reusable.get(normalizePath(entry.path));
      noteContentMap.set(entry.path, cached ? cached.content : "");
    }
    loaded++;
    if (onProgress) onProgress({ current: loaded, total, phase: "Loading notes" });
  }

  sortedEntries.forEach((entry) => {
    const normalizedEntry = normalizePath(entry.path);
    const parentNormalized = normalizedEntry.split("/").slice(0, -1).join("/");
    const parentId = pathToId.get(parentNormalized) || rootId;

    if (entry.is_dir) {
      const folderId = buildId("folder", entry.path);
      items.push({
        id: folderId,
        name: entry.name,
        parentId,
        type: "folder",
        filePath: entry.path,
        normalizedPath: normalizedEntry,
        content: null,
        createdAt: now,
      });
      pathToId.set(normalizedEntry, folderId);
    } else {
      const noteId = buildId("note", entry.path);
      const noteContent = noteContentMap.get(entry.path) || "";
      items.push({
        id: noteId,
        name: stripExtension(entry.name),
        parentId,
        type: "note",
        filePath: entry.path,
        normalizedPath: normalizedEntry,
        content: noteContent,
        createdAt: now,
        updatedAt: now,
        linkKey: buildNoteLinkKey(entry.name),
        links: extractWikiLinks(noteContent),
        // Carried so the next refresh can tell whether this file changed.
        modified: entry.modified,
        size: entry.size,
      });
    }
  });

  return { items, rootId };
};

const resolveFolderPath = (folderId, items, rootFolderPath) => {
  if (!folderId) return rootFolderPath;
  const folder = items.find((item) => item.id === folderId && item.type === "folder");
  return folder ? folder.filePath : null;
};

const useNotesStore = create(
  persist(
    (set, get) => ({
      items: [],
      currentNoteId: null,
      openNoteIds: [], // Currently open tabs
      dirtyNoteIds: [], // Notes not yet written to disk (not persisted)
      recoveredDrafts: {}, // { [noteId]: { filePath, recoveredAt, savedAt } }
      saveError: null, // { noteId, message } — last write that failed
      lastSavedAt: null, // ISO timestamp of the most recent successful write
      sidebarWidth: 280, // Saved sidebar width
      editorSplitRatio: 50, // Saved split ratio percentage
      expandedFolders: [],
      rootFolderPath: null,
      rootFolderId: null,
      isLoading: false,
      loadingProgress: null, // { current: number, total: number, phase: string }
      lastDeletedSnapshot: null, // { items: Array<{filePath, content, type, name, parentPath}> }
      recentNotes: [], // Array of {id, name, filePath, lastOpenedAt}
      pinnedNotes: [], // Array of note IDs that are pinned
      selectedTags: [], // Array of tag strings for filtering
      savedWorkspaceViews: [], // Array of saved sidebar search/tag/sort view presets
      customTemplates: [], // Array of {id, name, icon, description, content}
      scheduledNotes: [], // Array of scheduled note configurations
      recentWorkspaces: [], // Array of { path, name, lastOpenedAt }

      setRootFolder: async (folderData) => {
        set({ isLoading: true, loadingProgress: null });
        await ensureDraftsHydrated();
        // Callers hand over the folder's identity; reading it happens here so
        // the user's ignore patterns are applied on the very first open too.
        const files =
          folderData.files ??
          (await readWorkspaceFiles(folderData.folderPath, getIgnorePatterns()));
        const { items: fsItems, rootId } = await buildItemsFromFolderData(
          { ...folderData, files },
          (progress) => {
            set({ loadingProgress: progress });
          }
        );
        const previousItems = get().items;
        const scannedPaths = new Set(
          fsItems.filter((item) => item.normalizedPath).map((item) => item.normalizedPath)
        );
        // Keep unsaved scratch buffers and loose files (and their tabs) when a
        // vault is opened, so opening a workspace doesn't close what you're editing.
        const preservedItems = previousItems.filter(
          (item) => !item.filePath || (item.isLoose && !scannedPaths.has(item.normalizedPath))
        );
        const preservedIds = new Set(preservedItems.map((item) => item.id));
        const combinedItems = [...fsItems, ...preservedItems].map(ensureNoteMetadata);
        set((current) => ({
          rootFolderPath: folderData.folderPath,
          rootFolderId: rootId,
          items: combinedItems,
          currentNoteId: preservedIds.has(current.currentNoteId) ? current.currentNoteId : null,
          openNoteIds: current.openNoteIds.filter((id) => preservedIds.has(id)),
          expandedFolders: [rootId],
          isLoading: false,
          loadingProgress: null,
        }));

        // Record in recent workspaces (most-recent first, capped at 10)
        const workspacePath = normalizePath(folderData.folderPath);
        const workspaceName =
          folderData.folderName || workspacePath.split("/").pop() || workspacePath;
        set((state) => {
          const filtered = state.recentWorkspaces.filter(
            (ws) => normalizePath(ws.path) !== workspacePath
          );
          return {
            recentWorkspaces: [
              {
                path: folderData.folderPath,
                name: workspaceName,
                lastOpenedAt: new Date().toISOString(),
              },
              ...filtered,
            ].slice(0, 10),
          };
        });

        return rootId;
      },

      loadFolderFromSystem: (folderData) => get().setRootFolder(folderData),

      // Rebuild the index of embeddable media in the workspace. Called when the
      // workspace changes — including the restore on launch, which never goes
      // through `setRootFolder` because the tree is rehydrated from storage.
      refreshAttachmentIndex: () => refreshAttachmentIndex(get().rootFolderPath),

      refreshRootFromDisk: async (options = {}) => {
        const { focusPath, ensureExpandedPath, silent = false } = options;
        const state = get();
        const { rootFolderPath } = state;
        if (!rootFolderPath) return [];

        // `silent` keeps the tree mounted (no loading spinner) so the sidebar
        // scroll position survives in-place refreshes like drag-moves.
        if (!silent) set({ isLoading: true, loadingProgress: null });
        try {
          // Drafts must be in memory before the item map below reads them
          // synchronously; a no-op once hydrated.
          await ensureDraftsHydrated();
          const files = await readWorkspaceFiles(
            rootFolderPath,
            getIgnorePatterns(),
            buildKnownFiles(state.items)
          );
          const folderData = {
            folderPath: rootFolderPath,
            folderName: folderNameFromPath(rootFolderPath),
            files,
          };
          const previousItems = state.items;
          const { items: fsItems, rootId } = await buildItemsFromFolderData(
            folderData,
            silent
              ? undefined
              : (progress) => {
                  set({ loadingProgress: progress });
                },
            previousItems
          );
          // Paths that the fresh disk scan already covers — used to avoid keeping a
          // duplicate loose entry for a file that now lives inside the vault.
          const scannedPaths = new Set(
            fsItems.filter((item) => item.normalizedPath).map((item) => item.normalizedPath)
          );
          // Preserve unsaved scratch buffers (no filePath) and loose files opened
          // from outside the vault, so a rescan/refresh never wipes them.
          const ephemeralItems = previousItems.filter(
            (item) => !item.filePath || (item.isLoose && !scannedPaths.has(item.normalizedPath))
          );
          // Preserve manual sibling order (set by drag-reorder) across disk refreshes.
          const previousOrderById = new Map(
            previousItems
              .filter((item) => item.order !== undefined)
              .map((item) => [item.id, item.order])
          );
          const previousNotesById = new Map(
            previousItems.filter((item) => item.type === "note").map((item) => [item.id, item])
          );
          const dirtyNoteIdsSet = new Set(state.dirtyNoteIds);
          const nextRecoveredDrafts = {};
          const recoveredDirtyIds = new Set(state.dirtyNoteIds);

          const combinedItems = fsItems
            .map((item) => {
              const draftEntry = item.type === "note" ? getDraftCacheEntry(item.filePath) : null;

              if (
                item.type === "note" &&
                draftEntry &&
                draftEntry.content !== (item.content || "")
              ) {
                nextRecoveredDrafts[item.id] = {
                  filePath: item.filePath,
                  recoveredAt: new Date().toISOString(),
                  savedAt: draftEntry.updatedAt,
                };
                recoveredDirtyIds.add(item.id);
                return ensureNoteMetadata({
                  ...item,
                  content: draftEntry.content,
                  updatedAt: draftEntry.updatedAt || item.updatedAt || new Date().toISOString(),
                });
              }

              // A note with edits not yet on disk keeps the editor's text. The
              // pending write is what disk is about to say anyway, usually
              // within a couple of seconds — reloading here would yank text out
              // from under whoever is typing.
              if (item.type === "note" && dirtyNoteIdsSet.has(item.id)) {
                const previousNote = previousNotesById.get(item.id);
                if (previousNote) {
                  return ensureNoteMetadata({
                    ...item,
                    content: previousNote.content || "",
                    updatedAt: previousNote.updatedAt,
                  });
                }
              }

              if (item.type === "note") {
                return ensureNoteMetadata({
                  ...item,
                });
              }
              return ensureNoteMetadata(item);
            })
            .concat(ephemeralItems.map(ensureNoteMetadata))
            .map((item) =>
              previousOrderById.has(item.id)
                ? { ...item, order: previousOrderById.get(item.id) }
                : item
            );
          const validFolderIds = new Set(
            combinedItems.filter((item) => item.type === "folder").map((item) => item.id)
          );
          const expandedSet = new Set(
            state.expandedFolders.filter((folderId) => validFolderIds.has(folderId))
          );
          expandedSet.add(rootId);

          const applyExpand = (path) => {
            if (!path) return;
            const folderId = buildId("folder", path);
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
          let openNoteIds = state.openNoteIds.filter(
            (id) => id === SETTINGS_TAB_ID || findItemById(id)
          );

          if (focusPath) {
            const normalizedFocus = normalizePath(focusPath);
            const target = combinedItems.find((item) => item.normalizedPath === normalizedFocus);
            if (target && target.type === "note") {
              currentNoteId = target.id;
              if (!state.openNoteIds.includes(target.id)) {
                openNoteIds = [...openNoteIds, target.id];
              }
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
            currentNoteId,
            openNoteIds,
            dirtyNoteIds: Array.from(recoveredDirtyIds),
            recoveredDrafts: nextRecoveredDrafts,
          });

          // Images added or removed outside Marky show up on the same refresh
          // the watcher already triggers for notes.
          refreshAttachmentIndex(rootFolderPath);

          return combinedItems;
        } finally {
          if (!silent) set({ isLoading: false, loadingProgress: null });
        }
      },

      createFolder: async (parentId = null) => {
        const state = get();
        const { rootFolderPath, rootFolderId } = state;

        if (!rootFolderPath || !rootFolderId) {
          throw new Error("Select a workspace folder before creating new folders.");
        }

        const resolvedParentId = parentId || rootFolderId;
        const parentPath = resolveFolderPath(resolvedParentId, state.items, rootFolderPath);
        if (!parentPath) {
          throw new Error("Parent folder not found");
        }

        const folderSiblings = state.items.filter(
          (entry) => entry.parentId === resolvedParentId && entry.type === "folder"
        );
        const reservedFolderNames = createNameReservationSet(
          folderSiblings.map((entry) => entry.name)
        );
        let candidateName = reserveUniqueName("New Folder", reservedFolderNames);
        let attempt = 0;
        let lastError = null;
        while (attempt < 100) {
          try {
            const newPath = await createFolderOnDisk(parentPath, candidateName);
            await get().refreshRootFromDisk({
              ensureExpandedPath: parentPath,
              focusPath: newPath,
            });
            return buildId("folder", newPath);
          } catch (error) {
            lastError = error;
            if (error?.message && /exists/i.test(error.message)) {
              candidateName = reserveUniqueName("New Folder", reservedFolderNames);
              attempt += 1;
              continue;
            }
            throw error;
          }
        }

        throw lastError || new Error("Unable to create folder");
      },

      createNote: async (parentId = null, templateContent = null, noteName = null) => {
        const state = get();
        const { rootFolderPath, rootFolderId } = state;

        if (!rootFolderPath || !rootFolderId) {
          throw new Error("Select a workspace folder before creating new notes.");
        }

        const resolvedParentId = parentId || rootFolderId;
        const parentPath = resolveFolderPath(resolvedParentId, state.items, rootFolderPath);
        if (!parentPath) {
          throw new Error("Parent folder not found");
        }

        const noteSiblings = state.items.filter(
          (entry) => entry.parentId === resolvedParentId && entry.type === "note"
        );
        const reservedNoteNames = createNameReservationSet(noteSiblings.map((entry) => entry.name));
        const desiredBase = sanitizeNoteTitle(noteName) || "New Note";
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
            newPath = await createMarkdownFileOnDisk(parentPath, fileName, initialContent);
            break;
          } catch (error) {
            lastError = error;
            if (error?.message && /exists/i.test(error.message)) {
              noteBaseName = reserveUniqueName("New Note", reservedNoteNames);
              attempt += 1;
              continue;
            }
            throw error;
          }
        }

        if (!newPath) {
          throw lastError || new Error("Unable to create note");
        }

        await get().refreshRootFromDisk({
          ensureExpandedPath: parentPath,
          focusPath: newPath,
        });

        try {
          const content = await readMarkdownFile(newPath);
          set((current) => ({
            items: current.items.map((item) =>
              item.filePath === newPath ? ensureNoteMetadata({ ...item, content }) : item
            ),
          }));
        } catch (error) {
          console.error("Failed to read new note content:", error);
        }

        const noteId = buildId("note", newPath);
        set({ currentNoteId: noteId });
        return noteId;
      },

      createDailyNote: async (date = new Date(), parentId = null) => {
        const title = formatDailyNoteTitle(date);
        const existing = get().findNoteByLinkTarget(title);
        if (existing) {
          get().selectNote(existing.id);
          return existing.id;
        }

        return get().createNote(parentId, buildDailyNoteContent(date), title);
      },

      loadNoteFromFile: (fileData, parentId = null) => {
        const { content, path, name } = fileData;
        const normalized = normalizePath(path);

        // De-dupe: if this file is already open (loose or in-tree), just focus it.
        const existing = get().items.find(
          (item) => item.type === "note" && item.normalizedPath === normalized
        );
        if (existing) {
          set((current) => ({
            currentNoteId: existing.id,
            openNoteIds: current.openNoteIds.includes(existing.id)
              ? current.openNoteIds
              : [...current.openNoteIds, existing.id],
          }));
          return existing.id;
        }

        const timestamp = new Date().toISOString();
        const noteId = Date.now();

        const newNote = {
          id: noteId,
          name: stripExtension(name) || "Untitled",
          parentId,
          type: "note",
          // A loose file lives outside the vault tree: no parent, opened in place.
          isLoose: !parentId,
          content,
          filePath: path,
          normalizedPath: normalized,
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        const enrichedNote = ensureNoteMetadata(newNote);

        set((current) => ({
          items: [...current.items, enrichedNote],
          currentNoteId: enrichedNote.id,
          openNoteIds: current.openNoteIds.includes(noteId)
            ? current.openNoteIds
            : [...current.openNoteIds, noteId],
          expandedFolders: parentId
            ? Array.from(new Set([...current.expandedFolders, parentId]))
            : current.expandedFolders,
        }));

        return noteId;
      },

      // Create an in-memory, unsaved "scratch" note (no file path). Used when
      // there is no vault, or for quick throwaway buffers. Saving triggers Save-As.
      createScratchNote: () => {
        const timestamp = new Date().toISOString();
        const noteId = Date.now();
        const newNote = ensureNoteMetadata({
          id: noteId,
          name: "Untitled",
          parentId: null,
          type: "note",
          isLoose: true,
          content: "",
          filePath: null,
          normalizedPath: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        set((current) => ({
          items: [...current.items, newNote],
          currentNoteId: noteId,
          openNoteIds: current.openNoteIds.includes(noteId)
            ? current.openNoteIds
            : [...current.openNoteIds, noteId],
        }));

        return noteId;
      },

      updateNote: (noteId, content) => {
        // PERFORMANCE: Update content immediately WITHOUT expensive metadata extraction
        set((current) => {
          // Mark note as dirty (has unsaved changes)
          const dirtyNoteIds = current.dirtyNoteIds.includes(noteId)
            ? current.dirtyNoteIds
            : [...current.dirtyNoteIds, noteId];
          const nextItems = current.items.map((item) =>
            item.id === noteId && item.type === "note"
              ? {
                  ...item,
                  content,
                  updatedAt: new Date().toISOString(),
                }
              : item
          );
          const nextNote = nextItems.find((item) => item.id === noteId && item.type === "note");
          if (nextNote?.filePath) {
            setDraftCacheEntry(nextNote.filePath, content, nextNote.updatedAt);
            // Queued from inside `set` so the scheduler always sees the content
            // it is about to write already in the store.
            scheduleAutoSave(noteId, nextNote.filePath);
          } else if (nextNote) {
            materializeScratchNote(noteId);
          }

          return {
            items: nextItems,
            dirtyNoteIds,
          };
        });

        // Debounce expensive metadata extraction (tags, links)
        scheduleMetadataUpdate(noteId, content);
      },

      updateNoteMetadata: (noteId, content) => {
        // This does the expensive regex operations, called after typing stops
        set((current) => ({
          items: current.items.map((item) =>
            item.id === noteId && item.type === "note"
              ? recalculateNoteMetadata({
                  ...item,
                  content,
                })
              : item
          ),
        }));
      },

      /**
       * Write one note to disk, whether or not it is the one on screen.
       *
       * Deduplicated per path: a save that arrives while another is in flight
       * for the same file joins it rather than racing it, which matters once
       * the idle timer, a tab switch and a window close can all fire at once.
       */
      saveNoteToDisk: async (noteId, { forceSnapshot = false } = {}) => {
        const state = get();
        const note = state.items.find((item) => item.id === noteId && item.type === "note");

        if (!note?.filePath) {
          throw new Error("Cannot save: note has no file path");
        }

        // Any scheduled write is now redundant — this one carries the same text.
        cancelPendingNoteWrite(note.filePath);

        const key = normalizePath(note.filePath);
        const existing = inFlightSaves.get(key);
        if (existing) return existing;

        const pending = (async () => {
          try {
            await writeMarkdownFileOnDisk(note.filePath, note.content);

            // Record history snapshot before clearing dirty state. Throttled
            // inside, except at the boundaries that are worth a snapshot on
            // their own: leaving the note, closing it, an explicit save.
            addNoteHistorySnapshot(note.filePath, note.content, { force: forceSnapshot });

            // Clear dirty state for this note
            set((current) => ({
              dirtyNoteIds: current.dirtyNoteIds.filter((id) => id !== note.id),
              recoveredDrafts: Object.fromEntries(
                Object.entries(current.recoveredDrafts).filter(([id]) => id !== String(note.id))
              ),
              saveError: null,
              lastSavedAt: new Date().toISOString(),
            }));
            removeDraftCacheEntry(note.filePath);

            return true;
          } catch (error) {
            console.error("Failed to save note to disk:", error);
            // The note stays dirty and its draft stays cached, so nothing is
            // lost — but a silent failure in auto mode would be invisible, so
            // the error is parked where the UI can surface it.
            set({ saveError: { noteId, message: error?.message || String(error) } });
            throw error;
          } finally {
            inFlightSaves.delete(key);
          }
        })();

        inFlightSaves.set(key, pending);
        return pending;
      },

      saveCurrentNoteToDisk: async () =>
        get().saveNoteToDisk(get().currentNoteId, { forceSnapshot: true }),

      /**
       * Write `noteId` now if it has unsaved changes, skipping the idle delay.
       * Used on the ways out of a note — switching tabs, closing one, leaving
       * the window, quitting — so the file on disk is never behind the editor.
       */
      flushNoteSave: async (noteId) => {
        drainPendingEditorEdits();
        const state = get();
        if (!noteId || !state.dirtyNoteIds.includes(noteId)) return false;
        const note = state.items.find((item) => item.id === noteId && item.type === "note");
        if (!note?.filePath) return false;
        try {
          await state.saveNoteToDisk(noteId, { forceSnapshot: true });
          return true;
        } catch {
          return false;
        }
      },

      /** Write every note with unsaved changes. Used on window close and quit. */
      flushAllPendingSaves: async () => {
        drainPendingEditorEdits();
        const state = get();
        const dirty = state.dirtyNoteIds.filter((noteId) => {
          const note = state.items.find((item) => item.id === noteId && item.type === "note");
          return Boolean(note?.filePath);
        });
        if (dirty.length === 0) return 0;
        const results = await Promise.allSettled(
          dirty.map((noteId) => state.saveNoteToDisk(noteId))
        );
        return results.filter((result) => result.status === "fulfilled").length;
      },

      clearSaveError: () => set({ saveError: null }),

      updateNotePath: (noteId, filePath) => {
        const normalized = normalizePath(filePath);
        const replacementId = buildId("note", filePath);
        const state = get();
        const existing = state.items.find((item) => item.id === noteId && item.type === "note");
        if (existing?.filePath) {
          cancelPendingNoteWrite(existing.filePath);
          moveDraftCacheEntry(existing.filePath, filePath);
          moveNoteHistory(existing.filePath, filePath);
        }

        set((state) => {
          const items = state.items.map((item) =>
            item.id === noteId && item.type === "note"
              ? ensureNoteMetadata({
                  ...item,
                  id: replacementId,
                  filePath,
                  normalizedPath: normalized,
                  updatedAt: new Date().toISOString(),
                })
              : item
          );

          const currentNoteId =
            state.currentNoteId === noteId ? replacementId : state.currentNoteId;
          const recoveredDrafts = Object.fromEntries(
            Object.entries(state.recoveredDrafts).map(([id, draft]) => {
              if (id !== String(noteId)) return [id, draft];
              return [String(replacementId), { ...draft, filePath }];
            })
          );

          // Saving a scratch/loose buffer changes its id (Date.now -> path-based),
          // so keep the open tab pointing at the new id.
          const openNoteIds = state.openNoteIds.map((id) => (id === noteId ? replacementId : id));

          // The same goes for pending changes: a dirty entry left under the old
          // id is one nothing will ever look up again, and the note would sit
          // unwritten until the next keystroke happened to re-mark it.
          const dirtyNoteIds = Array.from(
            new Set(state.dirtyNoteIds.map((id) => (id === noteId ? replacementId : id)))
          );

          return { items, currentNoteId, openNoteIds, recoveredDrafts, dirtyNoteIds };
        });
      },

      renameItem: async (itemId, newName) => {
        const trimmed = normalizeItemNameInput(newName);
        if (!trimmed) return;

        const state = get();
        const item = state.items.find((entry) => entry.id === itemId);
        if (!item) return;

        if (!item.filePath) {
          set((current) => ({
            items: current.items.map((entry) =>
              entry.id === itemId ? { ...entry, name: trimmed } : entry
            ),
          }));
          return;
        }

        if (item.type === "note") {
          const extMatch = item.filePath.match(/(\.[^./\\]+)$/);
          const defaultExtension = extMatch ? extMatch[1] : ".md";
          if (/[/\\]/.test(trimmed)) {
            throw new Error("Name cannot contain path separators");
          }

          let fileName = trimmed;
          if (!fileName.includes(".")) {
            fileName = `${fileName}${defaultExtension}`;
          }

          const parentPath = resolveFolderPath(item.parentId, state.items, state.rootFolderPath);

          const newPath = await renameEntryOnDisk(item.filePath, fileName);

          await get().refreshRootFromDisk({
            ensureExpandedPath: parentPath,
            focusPath: newPath,
          });

          try {
            const content = await readMarkdownFile(newPath);
            set((current) => ({
              items: current.items.map((entry) =>
                entry.filePath === newPath ? { ...entry, content } : entry
              ),
            }));
          } catch (error) {
            console.error("Failed to load renamed note:", error);
          }

          set({ currentNoteId: buildId("note", newPath) });
        } else {
          const newPath = await renameEntryOnDisk(item.filePath, trimmed);

          await get().refreshRootFromDisk({
            ensureExpandedPath: newPath,
          });
        }
      },

      deleteItem: async (itemId) => {
        const state = get();
        const item = state.items.find((entry) => entry.id === itemId);
        if (!item) return;

        // Drop the side storage for the item *and everything under it*. Deleting
        // a folder used to clear only its own draft, and history was never
        // cleared at all — so every deleted note left its snapshots behind
        // forever. Back when this lived in localStorage those orphans were a
        // large part of what filled the quota.
        const sideStorePaths = (() => {
          const collect = (id) => {
            const children = state.items.filter((entry) => entry.parentId === id);
            return [id, ...children.flatMap((child) => collect(child.id))];
          };
          return collect(itemId)
            .map((id) => state.items.find((entry) => entry.id === id))
            .filter((entry) => entry?.type === "note" && entry.filePath)
            .map((entry) => entry.filePath);
        })();

        for (const path of sideStorePaths) {
          cancelPendingNoteWrite(path);
          removeDraftCacheEntry(path);
          removeNoteHistory(path);
        }

        if (!item.filePath) {
          const collectDescendants = (id, items) => {
            const children = items.filter((entry) => entry.parentId === id);
            return [id, ...children.flatMap((child) => collectDescendants(child.id, items))];
          };

          const idsToRemove = collectDescendants(itemId, state.items);

          set((current) => {
            const remaining = current.items.filter((entry) => !idsToRemove.includes(entry.id));
            let nextCurrent = current.currentNoteId;
            if (idsToRemove.includes(current.currentNoteId)) {
              const firstNote = remaining.find((entry) => entry.type === "note");
              nextCurrent = firstNote ? firstNote.id : null;
            }
            return {
              items: remaining,
              currentNoteId: nextCurrent,
            };
          });
          return;
        }

        // Snapshot items for undo (file-backed items only)
        const collectDescendants = (id, items) => {
          const children = items.filter((entry) => entry.parentId === id);
          return [id, ...children.flatMap((child) => collectDescendants(child.id, items))];
        };
        const idsToSnapshot = collectDescendants(itemId, state.items);
        const snapshotItems = [];

        for (const id of idsToSnapshot) {
          const entry = state.items.find((e) => e.id === id);
          if (!entry || !entry.filePath) continue;

          if (entry.type === "note") {
            let content = entry.content || "";
            if (!content && entry.filePath) {
              try {
                content = await readMarkdownFile(entry.filePath);
              } catch {
                /* file may already be gone */
              }
            }
            snapshotItems.push({
              filePath: entry.filePath,
              content,
              type: "note",
              name: entry.name,
            });
          } else {
            snapshotItems.push({ filePath: entry.filePath, type: "folder", name: entry.name });
          }
        }

        if (snapshotItems.length > 0) {
          set({ lastDeletedSnapshot: snapshotItems });
        }

        const parentPath = resolveFolderPath(item.parentId, state.items, state.rootFolderPath);
        const deletedWasCurrent = state.currentNoteId === itemId;

        await deleteEntryOnDisk(item.filePath);
        await get().refreshRootFromDisk({
          ensureExpandedPath: parentPath || state.rootFolderPath,
        });

        if (deletedWasCurrent) {
          const updatedState = get();
          if (!updatedState.currentNoteId) {
            const normalizedRoot = normalizePath(updatedState.rootFolderPath);
            const fallback = updatedState.items.find(
              (entry) =>
                entry.type === "note" &&
                entry.filePath &&
                normalizePath(entry.filePath).startsWith(normalizedRoot)
            );
            if (fallback) {
              set({ currentNoteId: fallback.id });
            }
          }
        }
      },

      undoLastDelete: async () => {
        const state = get();
        const snapshot = state.lastDeletedSnapshot;
        if (!snapshot || snapshot.length === 0) return false;

        try {
          // Restore folders first (sorted by path depth so parents are created first)
          const folders = snapshot
            .filter((s) => s.type === "folder")
            .sort((a, b) => a.filePath.split("/").length - b.filePath.split("/").length);

          for (const folder of folders) {
            const parts = folder.filePath.replace(/\/$/, "").split("/");
            const folderName = parts.pop();
            const parentPath = parts.join("/");
            try {
              await createFolderOnDisk(parentPath, folderName);
            } catch {
              /* folder might already exist */
            }
          }

          // Restore notes
          const notes = snapshot.filter((s) => s.type === "note");
          for (const note of notes) {
            try {
              await writeMarkdownFileOnDisk(note.filePath, note.content);
            } catch (err) {
              console.error("Failed to restore note:", note.filePath, err);
            }
          }

          set({ lastDeletedSnapshot: null });

          // Refresh to pick up restored files
          await get().refreshRootFromDisk();
          return true;
        } catch (error) {
          console.error("Failed to undo delete:", error);
          return false;
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
            ),
          }));
          return itemId;
        }

        cancelPendingNoteWrite(item.filePath);

        if (!rootFolderPath || !destinationId) {
          return itemId;
        }

        const targetPath = resolveFolderPath(destinationId, state.items, rootFolderPath);
        if (!targetPath) {
          throw new Error("Destination folder not found");
        }

        if (item.type === "folder") {
          const normalizedSource = normalizePath(item.filePath);
          const normalizedTarget = normalizePath(targetPath);
          if (normalizedTarget.startsWith(`${normalizedSource}/`)) {
            throw new Error("Cannot move a folder into itself");
          }
        }

        const newPath = await moveEntryOnDisk(item.filePath, targetPath);

        await get().refreshRootFromDisk({
          ensureExpandedPath: targetPath,
          focusPath: item.type === "note" ? newPath : undefined,
          silent: true,
        });

        if (item.type === "note") {
          try {
            const content = await readMarkdownFile(newPath);
            set((current) => ({
              items: current.items.map((entry) =>
                entry.filePath === newPath ? { ...entry, content } : entry
              ),
            }));
          } catch (error) {
            console.error("Failed to read moved note:", error);
          }
        }

        return buildId(item.type === "note" ? "note" : "folder", newPath);
      },

      moveItemToRoot: async (itemId) => {
        const { rootFolderId } = get();
        if (!rootFolderId) {
          set((state) => ({
            items: state.items.map((entry) =>
              entry.id === itemId ? { ...entry, parentId: null } : entry
            ),
          }));
          return itemId;
        }
        return get().moveItem(itemId, rootFolderId);
      },

      reorderItems: (itemId, newParentId, newIndex) => {
        set((state) => {
          const items = state.items.map((entry) => ({ ...entry }));
          const item = items.find((entry) => entry.id === itemId);
          if (!item) return state;

          item.parentId = newParentId ?? null;

          // Sort siblings by their current display order so the inserted index
          // matches what the user sees (manual order first, then name).
          const siblings = items
            .filter(
              (entry) => (entry.parentId ?? null) === (newParentId ?? null) && entry.id !== itemId
            )
            .sort((a, b) => {
              const ao = a.order ?? Number.MAX_SAFE_INTEGER;
              const bo = b.order ?? Number.MAX_SAFE_INTEGER;
              if (ao !== bo) return ao - bo;
              return a.name.localeCompare(b.name);
            });

          const idx = Math.max(0, Math.min(newIndex, siblings.length));
          siblings.splice(idx, 0, item);
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
            : [...state.expandedFolders, folderId],
        }));
      },

      selectNote: (noteId) => {
        const state = get();

        // Leaving a note is a save point. Without this, switching tabs inside
        // the idle window left the edit in memory only and the file on disk
        // behind — invisible until git or another editor read the stale copy.
        if (state.currentNoteId && state.currentNoteId !== noteId) {
          void state.flushNoteSave(state.currentNoteId);
        }

        if (!noteId) {
          set({ currentNoteId: null });
          return;
        }

        const note = state.items.find((item) => item.id === noteId && item.type === "note");

        if (note) {
          // Update recent notes list
          const recentNotes = state.recentNotes.filter((r) => r.id !== noteId);
          recentNotes.unshift({
            id: note.id,
            name: note.name,
            filePath: note.filePath,
            lastOpenedAt: new Date().toISOString(),
          });

          // Keep only last 10 recent notes
          const trimmedRecent = recentNotes.slice(0, 10);

          // Manage open tabs
          const openNoteIds = state.openNoteIds.includes(noteId)
            ? state.openNoteIds
            : [...state.openNoteIds, noteId];

          set({
            currentNoteId: noteId,
            recentNotes: trimmedRecent,
            openNoteIds,
          });
        } else {
          // Handle special tabs (like settings) or notes not in items
          const openNoteIds = state.openNoteIds.includes(noteId)
            ? state.openNoteIds
            : [...state.openNoteIds, noteId];

          set({
            currentNoteId: noteId,
            openNoteIds,
          });
        }
      },

      closeNote: (noteId) => {
        // A closing tab is the last chance to write it: a loose note is dropped
        // from the store entirely below.
        void get().flushNoteSave(noteId);

        set((state) => {
          const openNoteIds = state.openNoteIds.filter((id) => id !== noteId);
          let currentNoteId = state.currentNoteId;

          // If we closed the active note, switch to another one if available
          if (currentNoteId === noteId) {
            currentNoteId = openNoteIds.length > 0 ? openNoteIds[openNoteIds.length - 1] : null;
          }

          // Loose files / scratch buffers only exist while open — closing the tab
          // removes them entirely (vault notes stay in the tree).
          const closed = state.items.find((item) => item.id === noteId);
          if (closed?.isLoose) {
            return {
              openNoteIds,
              currentNoteId,
              items: state.items.filter((item) => item.id !== noteId),
              dirtyNoteIds: state.dirtyNoteIds.filter((id) => id !== noteId),
            };
          }

          return { openNoteIds, currentNoteId };
        });
      },

      setSidebarWidth: (width) => {
        set({ sidebarWidth: width });
      },

      setEditorSplitRatio: (ratio) => {
        set({ editorSplitRatio: ratio });
      },

      getCurrentNote: () => {
        const { items, currentNoteId } = get();
        return items.find((item) => item.id === currentNoteId && item.type === "note") || null;
      },

      isNoteDirty: (noteId) => {
        return get().dirtyNoteIds.includes(noteId);
      },

      clearNoteDirty: (noteId) => {
        const note = get().items.find((item) => item.id === noteId && item.type === "note");
        if (note?.filePath) {
          removeDraftCacheEntry(note.filePath);
        }
        set((current) => ({
          dirtyNoteIds: current.dirtyNoteIds.filter((id) => id !== noteId),
          recoveredDrafts: Object.fromEntries(
            Object.entries(current.recoveredDrafts).filter(([id]) => id !== String(noteId))
          ),
        }));
      },

      getRecoveredDraft: (noteId) => {
        return get().recoveredDrafts[noteId] || null;
      },

      discardRecoveredDraft: (noteId) => {
        const state = get();
        const note = state.items.find((item) => item.id === noteId && item.type === "note");
        if (note?.filePath) {
          removeDraftCacheEntry(note.filePath);
        }

        set((current) => ({
          dirtyNoteIds: current.dirtyNoteIds.filter((id) => id !== noteId),
          recoveredDrafts: Object.fromEntries(
            Object.entries(current.recoveredDrafts).filter(([id]) => id !== String(noteId))
          ),
        }));

        state.refreshRootFromDisk?.({
          preserveSelection: true,
        });
      },

      getChildren: (parentId) => {
        const { items } = get();
        return items.filter((item) => item.parentId === parentId);
      },

      getFolders: () => {
        const { items } = get();
        return items.filter((item) => item.type === "folder");
      },

      getNotes: () => {
        const { items } = get();
        return items.filter((item) => item.type === "note");
      },

      findNoteByLinkTarget: (target) => {
        const key = buildNoteLinkKey(target);
        if (!key) return null;

        const { items } = get();
        return (
          items.find(
            (item) => item.type === "note" && (item.linkKey || buildNoteLinkKey(item.name)) === key
          ) || null
        );
      },

      getOutgoingLinks: (noteId) => {
        const { items } = get();
        const note = items.find((item) => item.id === noteId && item.type === "note");
        if (!note) return [];

        const notesByKey = new Map();
        items.forEach((item) => {
          if (item.type === "note" && item.linkKey) {
            notesByKey.set(item.linkKey, item);
          } else if (item.type === "note") {
            const fallbackKey = buildNoteLinkKey(item.name);
            if (fallbackKey) {
              notesByKey.set(fallbackKey, ensureNoteMetadata(item));
            }
          }
        });

        const links = note.links || extractWikiLinks(note.content);

        return links.map((link) => ({
          ...link,
          note: notesByKey.get(link.key) || null,
        }));
      },

      getBrokenWikiLinks: () => {
        const { items } = get();
        const notes = items.filter((item) => item.type === "note");
        const existingKeys = new Set(
          notes.map((note) => note.linkKey || buildNoteLinkKey(note.name)).filter(Boolean)
        );
        const brokenByKey = new Map();

        notes.forEach((note) => {
          const links = note.links || extractWikiLinks(note.content);

          links.forEach((link) => {
            if (!link.key || existingKeys.has(link.key)) return;

            const entry = brokenByKey.get(link.key) || {
              key: link.key,
              target: link.target,
              alias: link.alias || null,
              sources: [],
            };

            if (!entry.sources.some((source) => source.id === note.id)) {
              entry.sources.push({
                id: note.id,
                name: note.name,
                filePath: note.filePath,
              });
            }

            brokenByKey.set(link.key, entry);
          });
        });

        return Array.from(brokenByKey.values()).sort((a, b) => a.target.localeCompare(b.target));
      },

      getBacklinks: (noteId) => {
        const { items } = get();
        const target = items.find((item) => item.id === noteId && item.type === "note");
        if (!target) return [];

        const targetKey = target.linkKey || buildNoteLinkKey(target.name);
        if (!targetKey) return [];

        return items
          .filter((item) => {
            if (item.type !== "note" || item.id === noteId) return false;
            const links = item.links || extractWikiLinks(item.content);
            return links.some((link) => link.key === targetKey);
          })
          .sort((a, b) => a.name.localeCompare(b.name));
      },

      getRecentNotes: () => {
        const { recentNotes, items } = get();
        // Filter out notes that no longer exist
        return recentNotes
          .map((recent) => {
            const note = items.find((item) => item.id === recent.id);
            // `recentNotes` persists only the light fields (id, name, path,
            // timestamp). Content comes from the live item so callers can show a
            // real excerpt; it is `null` until the workspace finishes loading.
            return note
              ? { ...recent, exists: true, content: note.content }
              : { ...recent, exists: false };
          })
          .filter((r) => r.exists);
      },

      togglePinNote: (noteId) => {
        set((state) => {
          const isPinned = state.pinnedNotes.includes(noteId);
          return {
            pinnedNotes: isPinned
              ? state.pinnedNotes.filter((id) => id !== noteId)
              : [...state.pinnedNotes, noteId],
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
          .filter((item) => item.type === "note" && pinnedNotes.includes(item.id))
          .sort((a, b) => a.name.localeCompare(b.name));
      },

      // Tag-related functions
      getAllTags: () => {
        const { items } = get();
        const tagCounts = {};

        items
          .filter((item) => item.type === "note" && item.tags)
          .forEach((note) => {
            note.tags.forEach((tag) => {
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
        const note = items.find((item) => item.id === noteId && item.type === "note");
        return note?.tags || [];
      },

      toggleTagFilter: (tag) => {
        set((state) => {
          const isSelected = state.selectedTags.includes(tag);
          return {
            selectedTags: isSelected
              ? state.selectedTags.filter((t) => t !== tag)
              : [...state.selectedTags, tag],
          };
        });
      },

      clearTagFilters: () => {
        set({ selectedTags: [] });
      },

      setTagFilters: (tags = []) => {
        const normalizedTags = Array.from(
          new Set(tags.map((tag) => normalizeTagValue(tag)).filter(Boolean))
        );
        set({ selectedTags: normalizedTags });
      },

      getSavedWorkspaceViews: () => {
        const workspacePath = normalizePath(get().rootFolderPath);
        if (!workspacePath) return [];
        return get()
          .savedWorkspaceViews.filter((view) => normalizePath(view.workspacePath) === workspacePath)
          .sort(
            (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
          );
      },

      saveWorkspaceView: ({ name, searchQuery = "", selectedTags = [], sortBy = "name-asc" }) => {
        const workspacePath = normalizePath(get().rootFolderPath);
        const trimmedName = (name || "").trim().replace(/\s+/g, " ");
        if (!workspacePath || !trimmedName) return null;

        const normalizedTags = Array.from(
          new Set(selectedTags.map((tag) => normalizeTagValue(tag)).filter(Boolean))
        );
        const now = new Date().toISOString();

        let savedView = null;
        set((state) => {
          const existing = state.savedWorkspaceViews.find(
            (view) =>
              normalizePath(view.workspacePath) === workspacePath &&
              view.name.toLowerCase() === trimmedName.toLowerCase()
          );

          savedView = {
            id: existing?.id || buildViewId(),
            name: trimmedName,
            workspacePath,
            searchQuery: searchQuery.trim(),
            selectedTags: normalizedTags,
            sortBy,
            createdAt: existing?.createdAt || now,
            updatedAt: now,
          };

          return {
            savedWorkspaceViews: existing
              ? state.savedWorkspaceViews.map((view) =>
                  view.id === existing.id ? savedView : view
                )
              : [savedView, ...state.savedWorkspaceViews],
          };
        });

        return savedView;
      },

      deleteWorkspaceView: (viewId) => {
        set((state) => ({
          savedWorkspaceViews: state.savedWorkspaceViews.filter((view) => view.id !== viewId),
        }));
      },

      applyTagOperation: async ({ action, sourceTag, targetTag }) => {
        const normalizedSource = normalizeTagValue(sourceTag);
        const normalizedTarget = normalizeTagValue(targetTag);

        if (!normalizedSource) {
          throw new Error("Source tag is required");
        }

        if ((action === "rename" || action === "merge") && !normalizedTarget) {
          throw new Error("Target tag is required");
        }

        if ((action === "rename" || action === "merge") && normalizedSource === normalizedTarget) {
          throw new Error("Source and target tag are the same");
        }

        const state = get();
        const notes = state.items.filter(
          (item) => item.type === "note" && typeof item.content === "string"
        );
        const desiredTarget = action === "delete" ? null : normalizedTarget;

        const candidates = notes
          .map((note) => {
            const nextContent = replaceTagInContent(note.content, normalizedSource, desiredTarget);
            if (nextContent === note.content) return null;
            return { note, nextContent };
          })
          .filter(Boolean);

        if (candidates.length === 0) {
          return {
            changedNotes: 0,
            failedNotes: 0,
            sourceTag: normalizedSource,
            targetTag: desiredTarget,
          };
        }

        const successfulUpdates = new Map();
        let failedNotes = 0;

        for (const candidate of candidates) {
          const { note, nextContent } = candidate;
          try {
            if (note.filePath) {
              cancelPendingNoteWrite(note.filePath);
              await writeMarkdownFileOnDisk(note.filePath, nextContent);
            }
            successfulUpdates.set(note.id, nextContent);
          } catch (error) {
            failedNotes += 1;
            console.error(`Failed to apply tag operation to note ${note.name}:`, error);
          }
        }

        if (successfulUpdates.size > 0) {
          set((current) => {
            const updatedItems = current.items.map((item) => {
              if (item.type !== "note") return item;
              const nextContent = successfulUpdates.get(item.id);
              if (nextContent === undefined) return item;

              return ensureNoteMetadata({
                ...item,
                content: nextContent,
                updatedAt: new Date().toISOString(),
              });
            });

            const dirtyNoteIds = current.dirtyNoteIds.filter((id) => !successfulUpdates.has(id));
            const selectedTags = current.selectedTags.filter((tag) => tag !== normalizedSource);
            if (
              desiredTarget &&
              current.selectedTags.includes(normalizedSource) &&
              !selectedTags.includes(desiredTarget)
            ) {
              selectedTags.push(desiredTarget);
            }

            return {
              items: updatedItems,
              dirtyNoteIds,
              selectedTags,
            };
          });
        }

        return {
          changedNotes: successfulUpdates.size,
          failedNotes,
          sourceTag: normalizedSource,
          targetTag: desiredTarget,
        };
      },

      // Custom template management
      addCustomTemplate: (template) => {
        set((state) => ({
          customTemplates: [
            ...state.customTemplates,
            {
              ...template,
              id: `custom-${Date.now()}`,
              isCustom: true,
            },
          ],
        }));
      },

      deleteCustomTemplate: (templateId) => {
        set((state) => ({
          customTemplates: state.customTemplates.filter((t) => t.id !== templateId),
        }));
      },

      updateCustomTemplate: (templateId, updates) => {
        set((state) => ({
          customTemplates: state.customTemplates.map((t) =>
            t.id === templateId ? { ...t, ...updates } : t
          ),
        }));
      },

      addScheduledNote: (config) => {
        const now = new Date();
        const schedule = {
          id: `schedule-${Date.now()}`,
          templateId: config.templateId,
          templateType: config.templateType || null,
          templateName: config.templateName || "Template",
          templateIcon: config.templateIcon || "note",
          noteName: config.noteName ? config.noteName.trim() : null,
          folderId: config.folderId || null,
          frequency: config.frequency,
          timeOfDay: config.timeOfDay || "09:00",
          daysOfWeek: Array.isArray(config.daysOfWeek) ? config.daysOfWeek : [],
          dayOfMonth: config.dayOfMonth || null,
          startDate: config.startDate || null,
          enabled: true,
          createdAt: now.toISOString(),
          lastRunAt: null,
          nextRunAt: null,
        };

        const nextRun = calculateNextRun(schedule, now);
        schedule.nextRunAt = nextRun ? nextRun.toISOString() : null;

        set((state) => ({
          scheduledNotes: [...state.scheduledNotes, schedule],
        }));

        return schedule.id;
      },

      updateScheduledNote: (scheduleId, updates = {}) => {
        set((state) => {
          let changed = false;
          const schedules = state.scheduledNotes.map((schedule) => {
            if (schedule.id !== scheduleId) {
              return schedule;
            }

            changed = true;
            const merged = { ...schedule, ...updates };
            const needsRecalculate = [
              "frequency",
              "timeOfDay",
              "daysOfWeek",
              "dayOfMonth",
              "startDate",
            ].some((key) => key in updates);

            if (needsRecalculate || ("enabled" in updates && updates.enabled)) {
              const nextRun = calculateNextRun(merged, new Date());
              merged.nextRunAt = nextRun ? nextRun.toISOString() : null;
            }

            if ("enabled" in updates && !updates.enabled) {
              merged.nextRunAt = null;
            }

            return merged;
          });

          return changed ? { scheduledNotes: schedules } : {};
        });
      },

      deleteScheduledNote: (scheduleId) => {
        set((state) => ({
          scheduledNotes: state.scheduledNotes.filter((schedule) => schedule.id !== scheduleId),
        }));
      },

      setScheduledNoteEnabled: (scheduleId, enabled) => {
        set((state) => {
          let changed = false;
          const schedules = state.scheduledNotes.map((schedule) => {
            if (schedule.id !== scheduleId) {
              return schedule;
            }

            changed = true;
            const next = { ...schedule, enabled };
            if (enabled) {
              const nextRun = calculateNextRun(next, new Date());
              next.nextRunAt = nextRun ? nextRun.toISOString() : null;
            } else {
              next.nextRunAt = null;
            }
            return next;
          });

          return changed ? { scheduledNotes: schedules } : {};
        });
      },

      processDueSchedules: async () => {
        const state = get();
        const schedules = state.scheduledNotes;
        if (!schedules || schedules.length === 0) {
          return;
        }

        const now = new Date();
        const updatedSchedules = [];
        let hasChanges = false;

        for (const schedule of schedules) {
          if (!schedule.enabled) {
            updatedSchedules.push(schedule);
            continue;
          }

          let nextRun = schedule.nextRunAt ? new Date(schedule.nextRunAt) : null;
          if (!nextRun || Number.isNaN(nextRun.getTime())) {
            const recalculated = calculateNextRun(schedule, now);
            const repairedSchedule = {
              ...schedule,
              nextRunAt: recalculated ? recalculated.toISOString() : null,
            };
            updatedSchedules.push(repairedSchedule);
            hasChanges = true;
            continue;
          }

          if (nextRun > now) {
            updatedSchedules.push(schedule);
            continue;
          }

          let currentSchedule = { ...schedule };
          let safetyCounter = 0;
          const MAX_RUNS = 3;

          while (nextRun && nextRun <= now && safetyCounter < MAX_RUNS) {
            const template = resolveTemplateById(schedule.templateId, state.customTemplates);

            if (!template) {
              currentSchedule = {
                ...currentSchedule,
                enabled: false,
                nextRunAt: null,
              };
              hasChanges = true;
              break;
            }

            const noteName =
              schedule.noteName || template.suggestedTitle || template.name || "New Note";

            try {
              await get().createNote(schedule.folderId, template.content, noteName);
            } catch (error) {
              console.error("Failed to create scheduled note:", error);
              break;
            }

            const executedAt = new Date().toISOString();
            currentSchedule = {
              ...currentSchedule,
              lastRunAt: executedAt,
            };

            const recalculated = calculateNextRun(currentSchedule, addMinutes(nextRun, 1));
            currentSchedule.nextRunAt = recalculated ? recalculated.toISOString() : null;
            nextRun = recalculated ? new Date(recalculated) : null;
            safetyCounter += 1;
            hasChanges = true;

            if (!nextRun) {
              break;
            }
          }

          updatedSchedules.push(currentSchedule);
        }

        if (hasChanges) {
          set({ scheduledNotes: updatedSchedules });
        }
      },

      getFilteredByTags: () => {
        const { items, selectedTags } = get();

        if (selectedTags.length === 0) {
          return items;
        }

        // Return notes that contain ALL selected tags (AND logic)
        return items.filter((item) => {
          if (item.type !== "note" || !item.content) return false;

          const noteTags = extractTags(item.content);
          return selectedTags.every((tag) => noteTags.includes(tag));
        });
      },

      resetStore: () => {
        cancelAllPendingNoteWrites();
        cancelAllPendingMetadataUpdates();
        set({
          items: [],
          currentNoteId: null,
          expandedFolders: [],
          rootFolderPath: null,
          rootFolderId: null,
          isLoading: false,
          recentNotes: [],
          pinnedNotes: [],
          openNoteIds: [],
          dirtyNoteIds: [],
          recoveredDrafts: {},
          sidebarWidth: 280,
          editorSplitRatio: 50,
          selectedTags: [],
          savedWorkspaceViews: [],
          customTemplates: [],
          scheduledNotes: [],
        });

        if (typeof window !== "undefined") {
          try {
            window.localStorage.removeItem("marky-storage");
            clearDraftCache();
            clearNoteHistory();
          } catch (error) {
            console.error("Failed to clear persisted store:", error);
          }
        }
      },
    }),
    {
      name: "marky-storage",
      partialize: (state) => ({
        // Vault-backed notes persist as metadata only. Their content is re-read
        // from disk by `refreshRootFromDisk` on the very next launch, so keeping
        // it here wrote the entire vault into localStorage's ~5 MB bucket on
        // every store change — for data that was then thrown away. Unsaved work
        // is not at risk: `dirtyNoteIds` isn't persisted, so the in-session
        // recovery path can't fire on a cold start, and drafts come back from
        // the on-disk draft store instead.
        //
        // Scratch buffers and loose files keep their content: they have no file
        // on disk to reload from.
        items: state.items.map((item) =>
          item.type === "note" && item.filePath && !item.isLoose ? { ...item, content: null } : item
        ),
        currentNoteId: state.currentNoteId,
        expandedFolders: state.expandedFolders,
        rootFolderPath: state.rootFolderPath,
        rootFolderId: state.rootFolderId,
        recentNotes: state.recentNotes,
        pinnedNotes: state.pinnedNotes,
        openNoteIds: state.openNoteIds,
        sidebarWidth: state.sidebarWidth,
        editorSplitRatio: state.editorSplitRatio,
        recentWorkspaces: state.recentWorkspaces,
        savedWorkspaceViews: state.savedWorkspaceViews,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Loose files (opened from anywhere) and scratch buffers live in `items`
        // independent of any vault, so they restore automatically. Keep only those
        // when we drop the vault below.
        const looseItems = (state.items || []).filter((item) => !item.filePath || item.isLoose);
        const looseIds = new Set(looseItems.map((item) => item.id));

        if (!state.rootFolderPath) return; // no vault: keep whatever was persisted (loose files)

        // Dynamically read the setting so we don't create a circular dep
        const { openRecentOnStartup } = window.__markySettings?.getState?.() ?? {};
        const shouldReopen = openRecentOnStartup !== false; // default true if setting not yet loaded
        if (shouldReopen) {
          state.refreshRootFromDisk?.();
        } else {
          // Drop the persisted workspace (so the home screen shows) but keep loose files.
          state.rootFolderPath = null;
          state.rootFolderId = null;
          state.items = looseItems;
          state.openNoteIds = (state.openNoteIds || []).filter((id) => looseIds.has(id));
          state.currentNoteId = looseIds.has(state.currentNoteId) ? state.currentNoteId : null;
        }
      },
    }
  )
);

if (typeof window !== "undefined") {
  window.useNotesStore = useNotesStore;
}

export default useNotesStore;
