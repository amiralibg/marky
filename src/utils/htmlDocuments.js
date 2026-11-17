/**
 * The app side of showing an HTML document: where its frame's relative URLs
 * resolve (Marky's `marky-doc` scheme, see src-tauri/src/documents.rs), and
 * what a link clicked inside it may do.
 */
import { invoke } from "@tauri-apps/api/core";
import { detectPlatform } from "./platform";
import { documentBaseHref, pathFromDocumentUrl } from "./htmlFrame";
import { isDocumentPath } from "./documentKind";

const SCHEME = "marky-doc";

/**
 * The scheme's origin as the webview spells it. WebView2 (Windows) only
 * routes custom schemes through `http://<scheme>.localhost`.
 */
export const documentOrigin = () =>
  detectPlatform() === "windows" ? `http://${SCHEME}.localhost` : `${SCHEME}://localhost`;

const normalize = (path) => (path ? String(path).replace(/\\/g, "/").replace(/\/+$/, "") : "");

const parentDir = (filePath) => {
  const normalized = normalize(filePath);
  const cut = normalized.lastIndexOf("/");
  return cut > 0 ? normalized.slice(0, cut) : "";
};

/**
 * The folder a document's relative URLs may reach: the vault when the file is
 * inside it, otherwise the file's own folder.
 */
export const documentRootFor = (filePath, vaultRoot) => {
  const file = normalize(filePath);
  const vault = normalize(vaultRoot);
  if (vault && file.startsWith(`${vault}/`)) return vault;
  return parentDir(file);
};

const rootKeys = new Map();

/** The scheme key for `rootPath`, registered with the Rust side once per session. */
export const documentRootKey = (rootPath) => {
  const root = normalize(rootPath);
  if (!root) return Promise.resolve(null);
  if (!rootKeys.has(root)) {
    rootKeys.set(
      root,
      invoke("register_document_root", { path: root }).catch((error) => {
        rootKeys.delete(root);
        console.warn("Could not register document root:", error);
        return null;
      })
    );
  }
  return rootKeys.get(root);
};

/**
 * Everything a frame needs to resolve URLs for the document at `filePath`:
 * `{ origin, rootKey, rootPath, baseHref }`, or null outside the app (tests,
 * a plain browser preview) — the frame then renders without a base.
 */
export const resolveDocumentLocation = async (filePath, vaultRoot) => {
  if (!filePath) return null;
  const rootPath = documentRootFor(filePath, vaultRoot);
  const rootKey = await documentRootKey(rootPath);
  if (!rootKey) return null;
  const origin = documentOrigin();
  const dir = parentDir(filePath);
  const relativeDir = dir.length > rootPath.length ? dir.slice(rootPath.length + 1) : "";
  return { origin, rootKey, rootPath, baseHref: documentBaseHref(origin, rootKey, relativeDir) };
};

const EXTERNAL = /^(https?:|mailto:)/i;

/**
 * Decide what a link clicked in a document frame does.
 * @returns {{ action: "external", url: string } | { action: "document", path: string } | { action: "ignore", reason: string }}
 */
export const classifyFrameLink = (href, location) => {
  if (typeof href !== "string" || href.length === 0 || href.length > 4096) {
    return { action: "ignore", reason: "invalid" };
  }
  let url;
  try {
    url = new URL(href);
  } catch {
    return { action: "ignore", reason: "invalid" };
  }
  if (EXTERNAL.test(url.protocol)) {
    // A Windows document-scheme URL is http too; it is not external.
    if (!location || !href.startsWith(`${location.origin}/`)) {
      return { action: "external", url: url.toString() };
    }
  }
  if (location) {
    const path = pathFromDocumentUrl(href, location.origin, location.rootKey, location.rootPath);
    if (path) {
      return isDocumentPath(path)
        ? { action: "document", path }
        : { action: "ignore", reason: "not-a-document" };
    }
  }
  return { action: "ignore", reason: "unsupported" };
};

export const openExternalUrl = (url) => invoke("open_external_url", { url });

export const openDocumentInBrowser = (path) => invoke("open_document_in_browser", { path });
