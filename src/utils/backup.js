import JSZip from 'jszip';
import { exists, mkdir, readFile, readTextFile, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
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

// ─── Settings JSON export / import ───────────────────────────────────────────

/**
 * Export the provided settings object as a .json file chosen by the user.
 * @param {object} settings  Plain settings object (from settingsStore)
 * @returns {Promise<string|null>} Saved file path, or null if cancelled
 */
export async function exportSettingsAsJson(settings) {
  const date = new Date().toISOString().slice(0, 10);
  const savePath = await save({
    defaultPath: `marky-settings-${date}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (!savePath) return null;

  const filePath = typeof savePath === 'string' ? savePath : savePath.path;
  await writeTextFile(filePath, JSON.stringify(settings, null, 2));
  return filePath;
}

/**
 * Let the user pick a previously-exported settings JSON and return its parsed
 * contents. Returns null if the user cancels.
 * @returns {Promise<object|null>}
 */
export async function importSettingsFromJson() {
  const selected = await open({
    multiple: false,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (!selected) return null;

  const filePath = typeof selected === 'string' ? selected : selected.path;
  const raw = await readTextFile(filePath);
  return JSON.parse(raw);
}

// ─── Templates collection export / import ────────────────────────────────────

/**
 * Export an array of custom templates as a .json file chosen by the user.
 * @param {Array} templates  customTemplates array from notesStore
 * @returns {Promise<string|null>}
 */
export async function exportTemplatesAsJson(templates) {
  const date = new Date().toISOString().slice(0, 10);
  const savePath = await save({
    defaultPath: `marky-templates-${date}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (!savePath) return null;

  const filePath = typeof savePath === 'string' ? savePath : savePath.path;
  const payload = {
    exportedAt: new Date().toISOString(),
    version: '1.0',
    templates,
  };
  await writeTextFile(filePath, JSON.stringify(payload, null, 2));
  return filePath;
}

/**
 * Let the user pick a previously-exported templates JSON.
 * Returns the parsed templates array, or null on cancel.
 * @returns {Promise<Array|null>}
 */
export async function importTemplatesFromJson() {
  const selected = await open({
    multiple: false,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (!selected) return null;

  const filePath = typeof selected === 'string' ? selected : selected.path;
  const raw = await readTextFile(filePath);
  const parsed = JSON.parse(raw);

  // Accept either a wrapped export { templates: [...] } or a bare array
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.templates)) return parsed.templates;
  throw new Error('Invalid templates file format');
}

// ─── Batch export ─────────────────────────────────────────────────────────────

/**
 * Build a standalone HTML string for a single note (consistent with ExportModal styles).
 * @param {string} noteName
 * @param {string} markdownContent
 * @param {Function} markedParser  The `marked` function
 */
function buildNoteHTML(noteName, markdownContent, markedParser) {
  const htmlContent = markedParser(markdownContent || '');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${noteName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif; line-height: 1.6; color: #1e1e1e; max-width: 800px; margin: 0 auto; padding: 40px 20px; background: #ffffff; }
    h1, h2, h3, h4, h5, h6 { margin-top: 24px; margin-bottom: 16px; font-weight: 600; line-height: 1.25; color: #1a1a1a; }
    h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
    h3 { font-size: 1.25em; } h4 { font-size: 1em; }
    p { margin-bottom: 16px; }
    a { color: #0969da; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { background-color: rgba(175,184,193,0.2); padding: 0.2em 0.4em; border-radius: 6px; font-size: 85%; font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace; }
    pre { background-color: #f6f8fa; border-radius: 6px; padding: 16px; overflow: auto; margin-bottom: 16px; }
    pre code { background-color: transparent; padding: 0; font-size: 100%; }
    blockquote { border-left: 4px solid #d0d7de; padding-left: 16px; color: #656d76; margin-bottom: 16px; }
    ul, ol { margin-bottom: 16px; padding-left: 2em; } li { margin-bottom: 4px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
    table th, table td { border: 1px solid #d0d7de; padding: 6px 13px; }
    table th { background-color: #f6f8fa; font-weight: 600; }
    hr { height: 0.25em; padding: 0; margin: 24px 0; background-color: #d0d7de; border: 0; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;
}

/**
 * Batch-export a set of notes bundled into a ZIP archive saved to a user-chosen path.
 *
 * @param {Array}    notes           Note items: { name, filePath, content? }
 * @param {'md'|'html'} format       Output format for each note
 * @param {string}   rootFolderPath  Workspace root — used to compute relative paths
 * @param {Function} markedParser    The `marked` function (injected to avoid circular deps)
 * @param {string}   [zipName]       Optional override for the saved zip filename
 * @returns {Promise<string|null>}   Saved zip path, or null if user cancelled
 */
export async function batchExportNotes(notes, format, rootFolderPath, markedParser, zipName) {
  if (!notes || notes.length === 0) throw new Error('No notes to export');

  const zip = new JSZip();

  for (const note of notes) {
    let content = note.content;
    if (content === undefined || content === null) {
      try {
        content = await readTextFile(note.filePath);
      } catch {
        content = '';
      }
    }

    // Preserve folder structure inside the zip using relative paths
    let relativePath = note.filePath || note.name;
    if (rootFolderPath && relativePath.startsWith(rootFolderPath)) {
      relativePath = relativePath.slice(rootFolderPath.length).replace(/^[/\\]+/, '');
    }

    if (format === 'html') {
      const htmlPath = relativePath.replace(/\.(md|markdown|txt)$/i, '.html');
      zip.file(htmlPath, buildNoteHTML(note.name, content, markedParser));
    } else {
      const mdPath = relativePath.endsWith('.md') ? relativePath : `${relativePath}.md`;
      zip.file(mdPath, content);
    }
  }

  const zipData = await zip.generateAsync({ type: 'uint8array' });

  const date = new Date().toISOString().slice(0, 10);
  const defaultName = zipName || `marky-export-${date}.zip`;

  const savePath = await save({
    defaultPath: defaultName,
    filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
  });
  if (!savePath) return null;

  const filePath = typeof savePath === 'string' ? savePath : savePath.path;
  await writeFile(filePath, zipData);
  return filePath;
}
