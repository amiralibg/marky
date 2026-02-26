import JSZip from 'jszip';
import { exists, mkdir, readFile, readTextFile, writeFile } from '@tauri-apps/plugin-fs';
import { open, save } from '@tauri-apps/plugin-dialog';

/**
 * Export the current workspace as a .zip file
 * @param {string} rootFolderPath - The workspace root folder path
 * @param {Array} items - The items array from notesStore
 * @param {object} settings - Optional settings to include in backup
 * @returns {Promise<string|null>} The saved file path, or null if cancelled
 */
export async function exportWorkspaceAsZip(rootFolderPath, items, settings = null) {
  if (!rootFolderPath) {
    throw new Error('No workspace folder is open');
  }

  const zip = new JSZip();

  // Collect all note files with their paths
  const notes = items.filter(item => item.type === 'note' && item.filePath);

  for (const note of notes) {
    try {
      const content = await readTextFile(note.filePath);

      // Get relative path from workspace root
      let relativePath = note.filePath;
      if (note.filePath.startsWith(rootFolderPath)) {
        relativePath = note.filePath.slice(rootFolderPath.length);
        // Remove leading separator
        if (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
          relativePath = relativePath.slice(1);
        }
      }

      zip.file(relativePath, content);
    } catch (err) {
      // Skip files that can't be read
      console.warn(`Could not read file for backup: ${note.filePath}`, err);
    }
  }

  // Include settings if provided
  if (settings) {
    zip.file('.marky-settings.json', JSON.stringify(settings, null, 2));
  }

  // Add a manifest
  const manifest = {
    exportedAt: new Date().toISOString(),
    noteCount: notes.length,
    folderCount: items.filter(item => item.type === 'folder').length,
    rootFolder: rootFolderPath,
    version: '1.0',
  };
  zip.file('.marky-manifest.json', JSON.stringify(manifest, null, 2));

  // Generate the zip as a Uint8Array
  const zipData = await zip.generateAsync({ type: 'uint8array' });

  // Prompt user for save location
  const folderName = rootFolderPath.split('/').pop() || 'workspace';
  const date = new Date().toISOString().slice(0, 10);
  const defaultName = `${folderName}-backup-${date}.zip`;

  const savePath = await save({
    defaultPath: defaultName,
    filters: [{
      name: 'Zip Archive',
      extensions: ['zip']
    }]
  });

  if (!savePath) return null;

  const filePath = typeof savePath === 'string' ? savePath : savePath.path;

  // Write the zip file to disk
  await writeFile(filePath, zipData);

  return filePath;
}

const normalizePath = (value = '') => value.replace(/\\/g, '/');

const joinPath = (basePath, relativePath) => {
  const base = normalizePath(basePath).replace(/\/+$/, '');
  const rel = normalizePath(relativePath).replace(/^\/+/, '');
  return `${base}/${rel}`;
};

const sanitizeZipEntryPath = (entryName) => {
  const normalized = normalizePath(entryName || '');
  if (!normalized || normalized.startsWith('/')) return null;

  const segments = normalized
    .split('/')
    .filter(Boolean)
    .filter((segment) => segment !== '.');

  if (segments.length === 0) return null;
  if (segments.some((segment) => segment === '..')) return null;

  return segments.join('/');
};

const getParentPath = (path) => {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf('/');
  return index > 0 ? normalized.slice(0, index) : '';
};

/**
 * Restore a workspace backup zip into a chosen folder.
 * Existing files are skipped by default unless overwriteExisting is true.
 *
 * @returns {Promise<{
 *   zipPath: string,
 *   targetFolderPath: string,
 *   writtenCount: number,
 *   skippedExistingCount: number,
 *   skippedUnsafeCount: number,
 *   manifest: object | null,
 *   settings: object | null
 * } | null>}
 */
export async function restoreWorkspaceFromZip(options = {}) {
  const { overwriteExisting = false } = options;

  const selectedZip = await open({
    multiple: false,
    filters: [{
      name: 'Zip Archive',
      extensions: ['zip']
    }]
  });
  if (!selectedZip) return null;

  const zipPath = typeof selectedZip === 'string' ? selectedZip : selectedZip.path;

  const targetFolderSelected = await open({
    multiple: false,
    directory: true
  });
  if (!targetFolderSelected) return null;

  const targetFolderPath = typeof targetFolderSelected === 'string'
    ? targetFolderSelected
    : targetFolderSelected.path;

  const zipData = await readFile(zipPath);
  const zip = await JSZip.loadAsync(zipData);

  let writtenCount = 0;
  let skippedExistingCount = 0;
  let skippedUnsafeCount = 0;
  let manifest = null;
  let settings = null;

  const entries = Object.values(zip.files);
  for (const entry of entries) {
    if (entry.dir) continue;

    const safeRelativePath = sanitizeZipEntryPath(entry.name);
    if (!safeRelativePath) {
      skippedUnsafeCount += 1;
      continue;
    }

    if (safeRelativePath === '.marky-manifest.json') {
      try {
        manifest = JSON.parse(await entry.async('text'));
      } catch {
        manifest = null;
      }
    }

    if (safeRelativePath === '.marky-settings.json') {
      try {
        settings = JSON.parse(await entry.async('text'));
      } catch {
        settings = null;
      }
    }

    const targetPath = joinPath(targetFolderPath, safeRelativePath);
    const parentPath = getParentPath(targetPath);
    if (parentPath) {
      await mkdir(parentPath, { recursive: true });
    }

    if (!overwriteExisting && await exists(targetPath)) {
      skippedExistingCount += 1;
      continue;
    }

    const data = await entry.async('uint8array');
    await writeFile(targetPath, data);
    writtenCount += 1;
  }

  return {
    zipPath,
    targetFolderPath,
    writtenCount,
    skippedExistingCount,
    skippedUnsafeCount,
    manifest,
    settings,
  };
}
