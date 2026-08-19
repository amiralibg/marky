import { copyEntriesToFolder, ensureFolderExists, writeAttachmentFile } from "./fileSystem";
import {
  addIndexedAttachment,
  baseNameOf,
  isImagePath,
  DEFAULT_ATTACHMENT_FOLDER,
  buildImageMarkdown,
  buildPastedImageName,
  dirNameOf,
  extensionForMime,
  joinPath,
  sanitizeAttachmentName,
} from "./attachments";

export { DEFAULT_ATTACHMENT_FOLDER };

// What a webview calls a bitmap that came off the clipboard rather than out of
// a file — there is no real name to preserve, so these get a timestamped one.
const GENERIC_NAMES = new Set(["image.png", "image.jpeg", "image.jpg", "image", "blob"]);

/**
 * Where a new attachment goes: the configured folder under the workspace root,
 * or — for a note opened on its own, outside any workspace — beside the note.
 *
 * @returns {string|null} null when there is nowhere to write (an unsaved note)
 */
export const resolveAttachmentFolder = ({ notePath, vaultRoot, attachmentFolder }) => {
  const folder = (attachmentFolder ?? DEFAULT_ATTACHMENT_FOLDER)
    .trim()
    .replace(/^[./\\]+/, "")
    .replace(/[/\\]+$/, "");
  const base = vaultRoot || (notePath ? dirNameOf(notePath) : null);
  if (!base) return null;
  return folder ? joinPath(base, folder) : base;
};

const nameFor = (file) => {
  const raw = (file?.name || "").trim();
  if (!raw || GENERIC_NAMES.has(raw.toLowerCase())) {
    return { fileName: buildPastedImageName(file?.type), alt: "" };
  }
  const fileName = sanitizeAttachmentName(raw);
  // A name with no extension still needs one, or nothing will know how to open it.
  const withExtension = fileName.includes(".")
    ? fileName
    : `${fileName}.${extensionForMime(file?.type)}`;
  return { fileName: withExtension, alt: withExtension.replace(/\.[^.]+$/, "") };
};

/**
 * Write an image from the clipboard (or a drop) into the vault and return the
 * markdown that links to it.
 *
 * The link is relative, so the note stays portable — the whole point of keeping
 * images inside the vault rather than referencing wherever they came from.
 *
 * @param {{file: File, notePath: string|null, vaultRoot: string|null, attachmentFolder?: string}} params
 * @returns {Promise<{path: string, markdown: string}>}
 */
export const saveImageAttachment = async ({ file, notePath, vaultRoot, attachmentFolder }) => {
  const folder = resolveAttachmentFolder({ notePath, vaultRoot, attachmentFolder });
  if (!folder) {
    throw new Error("Save this note to a folder before adding images to it.");
  }

  const { fileName, alt } = nameFor(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const savedPath = await writeAttachmentFile(folder, fileName, bytes);

  // Index it now: the preview renders long before the workspace watcher gets
  // round to rescanning, and an image that appears only after a refresh reads
  // as a failed paste.
  addIndexedAttachment(savedPath);

  return { path: savedPath, markdown: buildImageMarkdown(savedPath, notePath, alt) };
};

/** The image files among a set of dropped paths. */
export const imagePathsIn = (paths = []) => paths.filter((path) => isImagePath(path));

/**
 * Copy files dragged in from outside into the vault and return the markdown
 * that links them.
 *
 * Copied on the Rust side rather than read into JS and written back: a dropped
 * photo can be tens of megabytes, and none of those bytes need to cross the
 * bridge to end up in a folder.
 *
 * @param {{paths: string[], notePath: string|null, vaultRoot: string|null, attachmentFolder?: string}} params
 * @returns {Promise<{paths: string[], markdown: string[]}>}
 */
export const copyDroppedImages = async ({ paths, notePath, vaultRoot, attachmentFolder }) => {
  const images = imagePathsIn(paths);
  if (images.length === 0) return { paths: [], markdown: [] };

  const folder = resolveAttachmentFolder({ notePath, vaultRoot, attachmentFolder });
  if (!folder) {
    throw new Error("Save this note to a folder before adding images to it.");
  }

  // A fresh vault has no attachments folder until the first image lands in it,
  // and the copy refuses a destination that is not already there.
  await ensureFolderExists(folder);

  const copied = await copyEntriesToFolder(images, folder);
  copied.forEach(addIndexedAttachment);

  return {
    paths: copied,
    markdown: copied.map((path) =>
      buildImageMarkdown(path, notePath, baseNameOf(path).replace(/\.[^.]+$/, ""))
    ),
  };
};
