import JSZip from 'jszip';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { writeFile } from '@tauri-apps/plugin-fs';

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
