//! Serving HTML documents to their sandboxed frames, and opening links.
//!
//! An HTML document is shown in an iframe sandboxed without
//! `allow-same-origin`, its content given as `srcdoc`. Relative resources
//! (an image, a stylesheet, a script beside the file) resolve against a
//! `<base>` on this `marky-doc` scheme, which serves files from the folders the
//! app registered as document roots — the open vault, and the folder of a
//! loose document opened from elsewhere — and nothing else.
//!
//! It exists because the alternative, the `asset` protocol, is scoped to `**`
//! for note images, so a document resolving through it could load any file on
//! the disk. Here a root is named by a random per-session key rather than its
//! path, every path is canonicalised (so neither `..` nor a symlink leads out
//! of the root), and responses carry no CORS headers: a document can show a
//! file from its vault but its script cannot read one.
//!
//! An HTML (or SVG) file fetched over this scheme is a page in its own right,
//! so it is served with a sandboxing CSP header: if anything ever navigates a
//! frame to it, it is still an opaque origin under the same limits as the
//! preview.

use std::collections::hash_map::RandomState;
use std::collections::HashMap;
use std::hash::{BuildHasher, Hasher};
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::http::{header, Request, Response, StatusCode};

pub const SCHEME: &str = "marky-doc";

/// The policy an HTML response from this scheme is held to. Mirrors the
/// preview policy in `src/utils/htmlFrame.js` (`contentSecurityPolicy`).
const PAGE_POLICY: &str = "sandbox allow-scripts; \
default-src https: data: blob: http://localhost:* http://127.0.0.1:* marky-doc://localhost http://marky-doc.localhost; \
script-src https: data: blob: http://localhost:* http://127.0.0.1:* marky-doc://localhost http://marky-doc.localhost 'unsafe-inline' 'unsafe-eval'; \
style-src https: data: blob: http://localhost:* http://127.0.0.1:* marky-doc://localhost http://marky-doc.localhost 'unsafe-inline'; \
object-src 'none'; form-action 'none'; \
frame-src https: marky-doc://localhost http://marky-doc.localhost; \
child-src https: marky-doc://localhost http://marky-doc.localhost";

#[derive(Default)]
pub struct DocumentRoots {
    roots: Mutex<HashMap<String, PathBuf>>,
}

impl DocumentRoots {
    /// The key for `root`, registering it on first use.
    pub fn register(&self, root: &Path) -> Result<String, String> {
        let canonical = root
            .canonicalize()
            .map_err(|e| format!("Document root is not available: {}", e))?;
        if !canonical.is_dir() {
            return Err("Document root is not a folder".to_string());
        }
        let mut roots = self.roots.lock().map_err(|_| "Document roots lock poisoned")?;
        if let Some((key, _)) = roots.iter().find(|(_, path)| **path == canonical) {
            return Ok(key.clone());
        }
        let key = random_key();
        roots.insert(key.clone(), canonical);
        Ok(key)
    }

    fn root(&self, key: &str) -> Option<PathBuf> {
        self.roots.lock().ok()?.get(key).cloned()
    }
}

/// 128 bits from the OS-seeded SipHash keys `RandomState` draws per instance.
/// A document only ever learns its own root's key (from its base URL), so the
/// key needs to be unguessable, not cryptographically perfect.
fn random_key() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mut out = String::with_capacity(32);
    for salt in 0..2u64 {
        let mut hasher = RandomState::new().build_hasher();
        hasher.write_u128(nanos);
        hasher.write_u64(salt);
        out.push_str(&format!("{:016x}", hasher.finish()));
    }
    out
}

fn percent_decode(segment: &str) -> Option<String> {
    let bytes = segment.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = segment.get(i + 1..i + 3)?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// The file a request path (`/<key>/<segment>/…`) names inside `root`, or
/// `None` when it is malformed or would leave the root. `root` must already
/// be canonical.
pub fn resolve_in_root(root: &Path, segments: &[&str]) -> Option<PathBuf> {
    let mut path = root.to_path_buf();
    for raw in segments {
        if raw.is_empty() {
            continue;
        }
        let segment = percent_decode(raw)?;
        if segment.is_empty()
            || segment.contains('/')
            || segment.contains('\\')
            || segment.contains('\0')
        {
            return None;
        }
        let component = Path::new(&segment);
        let mut parts = component.components();
        match (parts.next(), parts.next()) {
            (Some(Component::Normal(_)), None) => path.push(&segment),
            _ => return None,
        }
    }
    // Canonicalising resolves symlinks, so a link inside the vault that points
    // outside it is caught here too.
    let canonical = path.canonicalize().ok()?;
    if !canonical.starts_with(root) || !canonical.is_file() {
        return None;
    }
    Some(canonical)
}

fn mime_for(path: &Path) -> &'static str {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        "bmp" => "image/bmp",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "txt" | "md" | "markdown" => "text/plain; charset=utf-8",
        "csv" => "text/csv; charset=utf-8",
        "xml" => "application/xml",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
}

fn plain(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain")
        .body(Vec::new())
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

/// Answer one request on the document scheme.
pub fn respond(roots: &DocumentRoots, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    if request.method() != tauri::http::Method::GET && request.method() != tauri::http::Method::HEAD
    {
        return plain(StatusCode::METHOD_NOT_ALLOWED);
    }
    let path = request.uri().path();
    let mut segments = path.split('/').filter(|s| !s.is_empty());
    let Some(key) = segments.next() else {
        return plain(StatusCode::NOT_FOUND);
    };
    let Some(root) = roots.root(key) else {
        return plain(StatusCode::NOT_FOUND);
    };
    let rest: Vec<&str> = segments.collect();
    let Some(file) = resolve_in_root(&root, &rest) else {
        return plain(StatusCode::NOT_FOUND);
    };
    let Ok(bytes) = std::fs::read(&file) else {
        return plain(StatusCode::NOT_FOUND);
    };
    let mime = mime_for(&file);
    let mut builder = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header("X-Content-Type-Options", "nosniff")
        // Reload must show the file as it is now.
        .header(header::CACHE_CONTROL, "no-store");
    if mime.starts_with("text/html") || mime == "image/svg+xml" {
        builder = builder.header("Content-Security-Policy", PAGE_POLICY);
    }
    let body = if request.method() == tauri::http::Method::HEAD {
        Vec::new()
    } else {
        bytes
    };
    builder
        .body(body)
        .unwrap_or_else(|_| plain(StatusCode::INTERNAL_SERVER_ERROR))
}

/// A URL the system may be asked to open: http, https or mailto, re-serialised
/// from its parsed form so nothing odd reaches the opener.
pub fn sanitize_external_url(raw: &str) -> Result<String, String> {
    let url = tauri::Url::parse(raw.trim()).map_err(|_| "Not a valid link".to_string())?;
    match url.scheme() {
        "http" | "https" => {
            if url.host_str().unwrap_or("").is_empty() {
                return Err("Not a valid link".to_string());
            }
            Ok(url.to_string())
        }
        "mailto" => Ok(url.to_string()),
        _ => Err("Only web and mail links open outside Marky".to_string()),
    }
}

fn spawn_opener(target: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut c = Command::new("open");
        c.arg(target);
        c
    };
    #[cfg(target_os = "windows")]
    let mut command = {
        // No shell in between, so nothing in the target is interpreted.
        let mut c = Command::new("rundll32");
        c.args(["url.dll,FileProtocolHandler", target]);
        c
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut c = Command::new("xdg-open");
        c.arg(target);
        c
    };
    command
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not open: {}", e))
}

/// Open a web or mail link in the system's default handler.
#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    let safe = sanitize_external_url(&url)?;
    spawn_opener(&safe)
}

/// Open an HTML document from disk in the system browser (the default handler
/// for `.html`). Only existing `.html` / `.htm` files.
#[tauri::command]
pub fn open_document_in_browser(path: String) -> Result<(), String> {
    let file = PathBuf::from(&path);
    let is_html = file
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("html") || e.eq_ignore_ascii_case("htm"));
    if !is_html || !file.is_absolute() || !file.is_file() {
        return Err("Only HTML documents open in the browser".to_string());
    }
    let canonical = file
        .canonicalize()
        .map_err(|e| format!("Could not open: {}", e))?;
    let url = tauri::Url::from_file_path(&canonical).map_err(|_| "Could not open".to_string())?;
    spawn_opener(url.as_str())
}

/// Register a folder as a document root and return its key. Called by the app
/// for the open vault, and for the folder of a document opened from outside it.
#[tauri::command]
pub fn register_document_root(
    roots: tauri::State<'_, DocumentRoots>,
    path: String,
) -> Result<String, String> {
    roots.register(Path::new(&path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn fixture(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "marky-doc-test-{}-{}",
            tag,
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("vault/sub")).unwrap();
        fs::write(dir.join("vault/report.html"), "<p>r</p>").unwrap();
        fs::write(dir.join("vault/sub/My Image.png"), [1u8, 2, 3]).unwrap();
        fs::write(dir.join("secret.txt"), "outside").unwrap();
        dir
    }

    fn get(roots: &DocumentRoots, uri: &str) -> Response<Vec<u8>> {
        let request = Request::builder().uri(uri).body(Vec::new()).unwrap();
        respond(roots, &request)
    }

    #[test]
    fn serves_files_inside_the_root() {
        let dir = fixture("inside");
        let roots = DocumentRoots::default();
        let key = roots.register(&dir.join("vault")).unwrap();
        let ok = get(&roots, &format!("marky-doc://localhost/{key}/sub/My%20Image.png"));
        assert_eq!(ok.status(), StatusCode::OK);
        assert_eq!(ok.body(), &vec![1u8, 2, 3]);
        assert_eq!(ok.headers()[header::CONTENT_TYPE], "image/png");
        assert!(ok.headers().get("Access-Control-Allow-Origin").is_none());
        let page = get(&roots, &format!("marky-doc://localhost/{key}/report.html"));
        assert!(page.headers()["Content-Security-Policy"]
            .to_str()
            .unwrap()
            .starts_with("sandbox allow-scripts"));
    }

    #[test]
    fn refuses_anything_outside_the_root() {
        let dir = fixture("outside");
        let roots = DocumentRoots::default();
        let key = roots.register(&dir.join("vault")).unwrap();
        for uri in [
            format!("marky-doc://localhost/{key}/../secret.txt"),
            format!("marky-doc://localhost/{key}/%2E%2E/secret.txt"),
            format!("marky-doc://localhost/{key}/sub%2F..%2F..%2Fsecret.txt"),
            format!("marky-doc://localhost/{key}/%2Fetc%2Fpasswd"),
            format!("marky-doc://localhost/{key}/sub"),
            format!("marky-doc://localhost/{key}/missing.png"),
            "marky-doc://localhost/not-a-key/report.html".to_string(),
            "marky-doc://localhost/".to_string(),
        ] {
            assert_eq!(get(&roots, &uri).status(), StatusCode::NOT_FOUND, "{uri}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_symlink_that_leaves_the_root() {
        let dir = fixture("symlink");
        std::os::unix::fs::symlink(dir.join("secret.txt"), dir.join("vault/link.txt")).unwrap();
        let roots = DocumentRoots::default();
        let key = roots.register(&dir.join("vault")).unwrap();
        let response = get(&roots, &format!("marky-doc://localhost/{key}/link.txt"));
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[test]
    fn keys_are_random_and_stable_per_root() {
        let dir = fixture("keys");
        let roots = DocumentRoots::default();
        let a = roots.register(&dir.join("vault")).unwrap();
        let b = roots.register(&dir.join("vault")).unwrap();
        let c = roots.register(&dir.join("vault/sub")).unwrap();
        assert_eq!(a, b);
        assert_ne!(a, c);
        assert_eq!(a.len(), 32);
        assert_ne!(random_key(), random_key());
    }

    #[test]
    fn only_web_and_mail_links_open_outside() {
        assert_eq!(
            sanitize_external_url(" https://example.com/a b ").unwrap(),
            "https://example.com/a%20b"
        );
        assert!(sanitize_external_url("mailto:a@example.com").is_ok());
        for bad in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "asset://localhost/x",
            "marky-doc://localhost/k/x",
            "-a Calculator",
            "",
        ] {
            assert!(sanitize_external_url(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn only_html_files_open_in_the_browser() {
        let dir = fixture("browser");
        assert!(open_document_in_browser(dir.join("secret.txt").to_string_lossy().to_string())
            .is_err());
        assert!(open_document_in_browser("relative.html".to_string()).is_err());
        assert!(open_document_in_browser(dir.join("missing.html").to_string_lossy().to_string())
            .is_err());
    }
}
