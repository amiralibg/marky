import { EditorView } from "@codemirror/view";

/**
 * Paste and drop an image straight into a note.
 *
 * The webview's own paste handling drops image data on the floor — a bitmap on
 * the clipboard is not text, so nothing was inserted at all. This intercepts
 * the event, hands the file to the caller to write somewhere in the vault, and
 * leaves a markdown link behind.
 */

const imageFilesFrom = (transfer) => {
  if (!transfer) return [];

  // `items` is the reliable source for clipboard bitmaps: WebKit exposes a
  // pasted screenshot there while leaving `files` empty.
  const fromItems = Array.from(transfer.items || [])
    .filter((item) => item.kind === "file" && item.type?.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter(Boolean);
  if (fromItems.length) return fromItems;

  return Array.from(transfer.files || []).filter((file) => file.type?.startsWith("image/"));
};

// A placeholder that survives the wait for the disk write, and that the user
// can see is doing something. Made unique so concurrent pastes don't collide,
// and matched back by the token alone — the surrounding text may have moved.
let placeholderSeq = 0;
const nextToken = () => `marky-saving-${Date.now().toString(36)}-${(placeholderSeq += 1)}`;

const replaceToken = (view, token, replacement) => {
  const doc = view.state.doc.toString();
  const at = doc.indexOf(token);
  if (at < 0) return;

  const start = doc.lastIndexOf("![", at);
  const end = doc.indexOf(")", at);
  if (start < 0 || end < 0) return;

  view.dispatch({
    changes: { from: start, to: end + 1, insert: replacement },
    selection: { anchor: start + replacement.length },
  });
};

const insertImages = async (view, files, saveImage, onError) => {
  for (const file of files) {
    const token = nextToken();
    view.dispatch(view.state.replaceSelection(`![Saving image…](${token})`));

    try {
      // Sequential on purpose: each insertion has to land after the previous
      // one, and the file names are timestamped to the second.
      const markdown = await saveImage(file);
      replaceToken(view, token, markdown || "");
    } catch (error) {
      replaceToken(view, token, "");
      onError?.(error);
    }
  }
};

/**
 * @param {object} options
 * @param {(file: File) => Promise<string>} options.saveImage
 *   Writes the file and resolves with the markdown to insert.
 * @param {(error: Error) => void} [options.onError]
 */
export const imagePaste = ({ saveImage, onError }) =>
  EditorView.domEventHandlers({
    paste(event, view) {
      if (view.state.readOnly) return false;

      // Text wins whenever the clipboard carries real text as well: copying a
      // selection from a web page puts the rendered image *and* its text on the
      // clipboard, and the user is pasting what they selected. A file copied in
      // Finder is the exception — its "text" is just the path to the very file
      // being pasted, so that still counts as an image paste.
      const text = (event.clipboardData?.getData("text/plain") || "").trim();
      if (text && !/^(file:\/\/|\/|[a-zA-Z]:[\\/])\S*$/.test(text)) return false;

      const files = imageFilesFrom(event.clipboardData);
      if (!files.length) return false;

      event.preventDefault();
      insertImages(view, files, saveImage, onError);
      return true;
    },

    drop(event, view) {
      if (view.state.readOnly) return false;

      const files = imageFilesFrom(event.dataTransfer);
      if (!files.length) return false;

      event.preventDefault();
      // Drop where the pointer is, not where the cursor happened to be.
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos != null) view.dispatch({ selection: { anchor: pos } });
      insertImages(view, files, saveImage, onError);
      return true;
    },
  });
