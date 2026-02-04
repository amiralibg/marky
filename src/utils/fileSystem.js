import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';

/**
 * Open a markdown file using native file picker
 * @returns {Promise<{content: string, path: string} | null>}
 */
export async function openMarkdownFile() {
  try {
    const selected = await open({
      multiple: false,
      filters: [{
        name: 'Markdown',
        extensions: ['md', 'markdown', 'txt']
      }]
    });

    if (!selected) return null;

    // selected is a string path in Tauri v2
    const filePath = typeof selected === 'string' ? selected : selected.path;
    const content = await readTextFile(filePath);
    const fileName = filePath.split('/').pop();

    return {
      content,
      path: filePath,
      name: fileName
    };
  } catch (error) {
    console.error('Error opening file:', error);
    throw error;
  }
}

/**
 * Save current note content to a file
 * @param {string} content - The markdown content to save
 * @param {string} [existingPath] - Optional existing file path to save to
 * @returns {Promise<string | null>} The saved file path
 */
export async function saveMarkdownFile(content, existingPath = null) {
  try {
    let filePath = existingPath;

    // If no existing path, show save dialog
    if (!filePath) {
      const selected = await save({
        filters: [{
          name: 'Markdown',
          extensions: ['md']
        }],
        defaultPath: 'untitled.md'
      });

      // selected is a string path in Tauri v2
      filePath = typeof selected === 'string' ? selected : selected?.path;
    }

    if (!filePath) return null;

    await writeTextFile(filePath, content);

    return filePath;
  } catch (error) {
    console.error('Error saving file:', error);
    throw error;
  }
}

/**
 * Open a folder and scan for markdown files
 * @returns {Promise<{folderPath: string, files: Array} | null>}
 */
export async function openFolder() {
  try {
    const selected = await open({
      multiple: false,
      directory: true
    });

    if (!selected) return null;

    // selected is a string path in Tauri v2
    const folderPath = typeof selected === 'string' ? selected : selected.path;

    // Call Rust backend to scan folder
    const files = await invoke('scan_folder_for_markdown', {
      folderPath: folderPath
    });

    return {
      folderPath: folderPath,
      folderName: folderPath.split('/').pop() || 'Folder',
      files
    };
  } catch (error) {
    console.error('Error opening folder:', error);
    throw error;
  }
}

/**
 * Scan a folder path for markdown files without prompting the user
 * @param {string} folderPath
 * @returns {Promise<Array>}
 */
export async function scanFolder(folderPath) {
  try {
    const files = await invoke('scan_folder_for_markdown', { folderPath });
    return files;
  } catch (error) {
    console.error('Error scanning folder:', error);
    throw error;
  }
}

/**
 * Read a markdown file from disk
 * @param {string} filePath - Absolute path to the file
 * @returns {Promise<string>} File content
 */
export async function readMarkdownFile(filePath) {
  try {
    const content = await readTextFile(filePath);
    return content;
  } catch (error) {
    console.error('Error reading file:', error);
    throw error;
  }
}

/**
 * Create a folder on disk
 * @param {string} parentFolderPath
 * @param {string} folderName
 * @returns {Promise<string>} Newly created folder path
 */
export async function createFolderOnDisk(parentFolderPath, folderName) {
  try {
    const newPath = await invoke('create_folder', {
      parentFolderPath,
      folderName
    });
    return newPath;
  } catch (error) {
    console.error('Error creating folder:', error);
    throw error;
  }
}

/**
 * Create a markdown file on disk
 * @param {string} parentFolderPath
 * @param {string} fileName
 * @param {string} [content]
 * @returns {Promise<string>} Newly created file path
 */
export async function createMarkdownFileOnDisk(parentFolderPath, fileName, content = '') {
  try {
    const newPath = await invoke('create_markdown_file', {
      parentFolderPath,
      fileName,
      content
    });
    return newPath;
  } catch (error) {
    console.error('Error creating markdown file:', error);
    throw error;
  }
}

/**
 * Rename a file or folder on disk
 * @param {string} sourcePath
 * @param {string} newName
 * @returns {Promise<string>} New path after rename
 */
export async function renameEntryOnDisk(sourcePath, newName) {
  try {
    const newPath = await invoke('rename_entry', {
      sourcePath,
      newName
    });
    return newPath;
  } catch (error) {
    console.error('Error renaming entry:', error);
    throw error;
  }
}

/**
 * Delete a file or folder on disk
 * @param {string} targetPath
 * @returns {Promise<void>}
 */
export async function deleteEntryOnDisk(targetPath) {
  try {
    await invoke('delete_entry', {
      targetPath
    });
  } catch (error) {
    console.error('Error deleting entry:', error);
    throw error;
  }
}

/**
 * Move a file or folder to a different parent directory
 * @param {string} sourcePath
 * @param {string} destFolderPath
 * @returns {Promise<string>} New path after move
 */
export async function moveEntryOnDisk(sourcePath, destFolderPath) {
  try {
    const newPath = await invoke('move_entry', {
      sourcePath,
      destFolderPath
    });
    return newPath;
  } catch (error) {
    console.error('Error moving entry:', error);
    throw error;
  }
}

/**
 * Persist a markdown file to disk without opening dialogs
 * @param {string} filePath
 * @param {string} content
 * @returns {Promise<void>}
 */
export async function writeMarkdownFileOnDisk(filePath, content) {
  try {
    await writeTextFile(filePath, content ?? '');
  } catch (error) {
    console.error('Error writing markdown file:', error);
    throw error;
  }
}

/**
 * Start watching a folder for file system changes
 * @param {string} folderPath
 * @returns {Promise<void>}
 */
export async function watchFolder(folderPath) {
  try {
    await invoke('watch_folder', { folderPath });
  } catch (error) {
    console.error('Error starting folder watch:', error);
    throw error;
  }
}

/**
 * Stop watching for file system changes
 * @returns {Promise<void>}
 */
export async function stopWatching() {
  try {
    await invoke('stop_watching');
  } catch (error) {
    console.error('Error stopping folder watch:', error);
    throw error;
  }
}

/**
 * Copy files or folders from external sources to a target folder
 * @param {Array<string>} sourcePaths - Array of file/folder paths to copy
 * @param {string} destFolderPath - Destination folder path
 * @returns {Promise<Array<string>>} Array of new paths after copy
 */
export async function copyEntriesToFolder(sourcePaths, destFolderPath) {
  try {
    const newPaths = await invoke('copy_entries_to_folder', {
      sourcePaths,
      destFolderPath
    });
    return newPaths;
  } catch (error) {
    console.error('Error copying entries:', error);
    throw error;
  }
}

/**
 * Check if running in Tauri environment
 * @returns {boolean}
 */
export function isTauriApp() {
  return typeof window !== 'undefined' && window.__TAURI__ !== undefined;
}
