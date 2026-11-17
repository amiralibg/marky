// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod documents;
mod git_sync;

use notify_debouncer_full::{
    new_debouncer,
    notify::{RecursiveMode, Watcher},
    DebounceEventResult,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    Emitter, Manager, State,
};

#[derive(Debug, Serialize, Deserialize)]
struct MarkdownFile {
    name: String,
    path: String,
    is_dir: bool,
    /// Modification time in epoch milliseconds, and byte length. Together these
    /// let the frontend skip re-reading a file whose contents cannot have
    /// changed — the workspace refresh runs on every watcher event, so without
    /// this a single save re-read the entire vault.
    #[serde(default)]
    modified: u64,
    #[serde(default)]
    size: u64,
}

#[derive(Debug, Serialize, Clone)]
struct FileChangeEvent {
    event_type: String,
    path: String,
    /// The window that asked for this watch; other windows ignore the event.
    window: String,
}

/// An event that concerns one window, broadcast to all of them.
#[derive(Debug, Serialize, Clone)]
struct WindowScoped {
    /// `None` when no window is focused, which every window then acts on.
    window: Option<String>,
}

type FolderDebouncer =
    notify_debouncer_full::Debouncer<notify::RecommendedWatcher, notify_debouncer_full::FileIdMap>;

/// One watcher per window, keyed by window label.
///
/// A single slot was enough while there was only ever one vault open. Now that
/// a vault can be opened in its own window, two windows watch two different
/// folders at once, and a shared slot meant the second window's watcher evicted
/// the first — leaving the original window blind to changes on disk.
struct WatcherState {
    watchers: Arc<Mutex<HashMap<String, FolderDebouncer>>>,
}

// Files the OS asked us to open (via "Open with Marky" / double-click) before the
// frontend was ready to receive them. The UI drains this on startup.
struct PendingOpen(Arc<Mutex<Vec<String>>>);

/// Quitting is a save point, and the notes only the frontend knows about have
/// to reach disk before the process goes away.
///
/// Closing a window is already handled in JS (`useSaveLifecycle`), but quitting
/// the application is not a window event: macOS Cmd+Q, the Quit menu item, and
/// the last window closing all arrive here as `RunEvent::ExitRequested`. So the
/// exit is held, the frontend is asked to flush, and it calls `confirm_exit`
/// when it is done — with a timeout on this side so a wedged write cannot leave
/// the user with an app that refuses to quit.
#[derive(Default)]
struct ExitState {
    /// The frontend has flushed (or we gave up waiting); let the exit through.
    confirmed: AtomicBool,
    /// A flush is already in flight, so repeated Cmd+Q does not restart it.
    in_progress: AtomicBool,
    /// Windows still to report in. Quitting with two vaults open asks both to
    /// flush, and the first to answer must not take the app down while the
    /// second is still writing — so the exit waits for the count to reach zero.
    pending: AtomicUsize,
}

/// How long the frontend gets to write pending notes before the app quits anyway.
const EXIT_FLUSH_TIMEOUT: Duration = Duration::from_millis(1500);

#[tauri::command]
fn confirm_exit(app: tauri::AppHandle) {
    let exit_state = app.state::<ExitState>();

    // `fetch_sub` on an already-zero counter would wrap, so the last window out
    // is the one that hits zero and nothing after it can re-trigger the exit.
    let remaining = exit_state
        .pending
        .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |count| {
            Some(count.saturating_sub(1))
        })
        .unwrap_or(0);

    if remaining > 1 {
        return;
    }

    exit_state.confirmed.store(true, Ordering::SeqCst);
    app.exit(0);
}

/// True for the file types Marky can open (keep in sync with tauri.conf.json fileAssociations).
fn is_supported_file(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            matches!(
                ext.to_lowercase().as_str(),
                "md" | "markdown" | "mdx" | "txt" | "text" | "html" | "htm"
            )
        })
        .unwrap_or(false)
}

fn ensure_valid_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Name cannot be empty".to_string());
    }

    if name == "." || name == ".." {
        return Err("Name contains invalid characters".to_string());
    }

    if name.ends_with(' ') || name.ends_with('.') {
        return Err("Name cannot end with trailing spaces or dots".to_string());
    }

    if name.contains(['/', '\\']) {
        return Err("Name cannot contain path separators".to_string());
    }

    if name.chars().any(|c| c.is_control()) {
        return Err("Name contains invalid characters".to_string());
    }

    if name
        .chars()
        .any(|c| matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*'))
    {
        return Err("Name contains invalid characters".to_string());
    }

    let uppercase = name.to_uppercase();
    let stem = uppercase.split('.').next().unwrap_or(&uppercase);
    const RESERVED_NAMES: [&str; 22] = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if RESERVED_NAMES.contains(&stem) {
        return Err("Name is a reserved system name".to_string());
    }

    Ok(())
}

fn split_name_and_extension(name: &str) -> (String, Option<String>) {
    if let Some(idx) = name.rfind('.') {
        if idx == 0 {
            return (name.to_string(), None);
        }

        let stem = name[..idx].to_string();
        let ext = name[idx + 1..].to_string();
        return (stem, Some(ext));
    }

    (name.to_string(), None)
}

fn resolve_unique_path(
    parent: &Path,
    desired_name: &str,
    is_dir: bool,
) -> Result<(PathBuf, String), String> {
    const MAX_ATTEMPTS: usize = 500;

    let (base_stem, base_ext) = if is_dir {
        (desired_name.to_string(), None)
    } else {
        split_name_and_extension(desired_name)
    };

    for counter in 0..=MAX_ATTEMPTS {
        let candidate_name = if counter == 0 {
            desired_name.to_string()
        } else if let Some(ref ext) = base_ext {
            format!("{} {}.{}", base_stem, counter, ext)
        } else {
            format!("{} {}", base_stem, counter)
        };

        let candidate_path = parent.join(&candidate_name);

        if !candidate_path.exists() {
            return Ok((candidate_path, candidate_name));
        }
    }

    Err("Unable to find available name".to_string())
}

// ── Durable side storage: note history and unsaved drafts ──────────────────
//
// Both used to live in `localStorage`, which is capped around 5 MB in the
// WebView. Note history keeps up to 20 full copies of every note, so a modest
// vault blew the quota — and the write failure was swallowed, so version
// history silently stopped recording while still appearing to work. The draft
// cache shared that quota, which put *unsaved* work behind the same cliff.
//
// One file per note under the app data dir: a snapshot write touches only that
// note, so there is no read-modify-write race between windows and no whole-map
// rewrite on every keystroke. The note's real path is stored inside the file,
// so a hash collision is detectable rather than silently serving another note's
// history.

#[derive(Debug, Serialize, Deserialize, Clone)]
struct NoteSnapshot {
    content: String,
    #[serde(rename = "savedAt")]
    saved_at: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct NoteHistoryFile {
    path: String,
    snapshots: Vec<NoteSnapshot>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct DraftEntry {
    path: String,
    content: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
}

/// FNV-1a, written out rather than using `DefaultHasher`: these values become
/// file names, and `DefaultHasher`'s output is explicitly not guaranteed stable
/// across Rust releases. A change there would orphan every stored file.
fn path_key(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in normalized.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100_0000_01b3);
    }
    format!("{:016x}", hash)
}

fn side_store_dir(app: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?
        .join(name);
    fs::create_dir_all(&base).map_err(|e| format!("Failed to create {} dir: {}", name, e))?;
    Ok(base)
}

/// Write via a temp file + rename so a crash mid-write can't truncate an
/// existing record. `fs::write` alone can leave a half-written file behind.
fn write_atomic(target: &Path, contents: &str) -> Result<(), String> {
    let tmp = target.with_extension("tmp");
    fs::write(&tmp, contents).map_err(|e| format!("Failed to write: {}", e))?;
    fs::rename(&tmp, target).map_err(|e| format!("Failed to commit write: {}", e))
}

fn read_json_file<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

#[tauri::command]
fn read_note_history(
    app: tauri::AppHandle,
    file_path: String,
) -> Result<Vec<NoteSnapshot>, String> {
    let dir = side_store_dir(&app, "history")?;
    let target = dir.join(format!("{}.json", path_key(&file_path)));
    match read_json_file::<NoteHistoryFile>(&target) {
        // Guard against a hash collision serving another note's history.
        Some(file) if file.path == file_path => Ok(file.snapshots),
        _ => Ok(Vec::new()),
    }
}

#[tauri::command]
fn append_note_history(
    app: tauri::AppHandle,
    file_path: String,
    content: String,
    saved_at: String,
    max_snapshots: usize,
) -> Result<(), String> {
    let dir = side_store_dir(&app, "history")?;
    let target = dir.join(format!("{}.json", path_key(&file_path)));

    let mut snapshots = match read_json_file::<NoteHistoryFile>(&target) {
        Some(file) if file.path == file_path => file.snapshots,
        _ => Vec::new(),
    };
    snapshots.insert(0, NoteSnapshot { content, saved_at });
    snapshots.truncate(max_snapshots.max(1));

    let payload = NoteHistoryFile {
        path: file_path,
        snapshots,
    };
    write_atomic(
        &target,
        &serde_json::to_string(&payload).map_err(|e| e.to_string())?,
    )
}

#[tauri::command]
fn remove_note_history(app: tauri::AppHandle, file_path: String) -> Result<(), String> {
    let dir = side_store_dir(&app, "history")?;
    let target = dir.join(format!("{}.json", path_key(&file_path)));
    if target.exists() {
        fs::remove_file(&target).map_err(|e| format!("Failed to remove history: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn move_note_history(
    app: tauri::AppHandle,
    old_path: String,
    new_path: String,
) -> Result<(), String> {
    let dir = side_store_dir(&app, "history")?;
    let source = dir.join(format!("{}.json", path_key(&old_path)));
    let snapshots = match read_json_file::<NoteHistoryFile>(&source) {
        Some(file) if file.path == old_path => file.snapshots,
        _ => return Ok(()),
    };

    let payload = NoteHistoryFile {
        path: new_path.clone(),
        snapshots,
    };
    write_atomic(
        &dir.join(format!("{}.json", path_key(&new_path))),
        &serde_json::to_string(&payload).map_err(|e| e.to_string())?,
    )?;
    let _ = fs::remove_file(&source);
    Ok(())
}

#[tauri::command]
fn clear_all_history(app: tauri::AppHandle) -> Result<(), String> {
    let dir = side_store_dir(&app, "history")?;
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                let _ = fs::remove_file(&path);
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn read_all_drafts(app: tauri::AppHandle) -> Result<Vec<DraftEntry>, String> {
    let dir = side_store_dir(&app, "drafts")?;
    let mut drafts = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| format!("Failed to read drafts: {}", e))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        if let Some(draft) = read_json_file::<DraftEntry>(&path) {
            drafts.push(draft);
        }
    }
    Ok(drafts)
}

#[tauri::command]
fn write_draft(
    app: tauri::AppHandle,
    file_path: String,
    content: String,
    updated_at: String,
) -> Result<(), String> {
    let dir = side_store_dir(&app, "drafts")?;
    let payload = DraftEntry {
        path: file_path.clone(),
        content,
        updated_at,
    };
    write_atomic(
        &dir.join(format!("{}.json", path_key(&file_path))),
        &serde_json::to_string(&payload).map_err(|e| e.to_string())?,
    )
}

#[tauri::command]
fn remove_draft(app: tauri::AppHandle, file_path: String) -> Result<(), String> {
    let dir = side_store_dir(&app, "drafts")?;
    let target = dir.join(format!("{}.json", path_key(&file_path)));
    if target.exists() {
        fs::remove_file(&target).map_err(|e| format!("Failed to remove draft: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn clear_all_drafts(app: tauri::AppHandle) -> Result<(), String> {
    let dir = side_store_dir(&app, "drafts")?;
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                let _ = fs::remove_file(&path);
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn create_folder(parent_folder_path: String, folder_name: String) -> Result<String, String> {
    ensure_valid_name(&folder_name)?;

    let parent = PathBuf::from(&parent_folder_path);
    if !parent.exists() || !parent.is_dir() {
        return Err("Parent folder does not exist".to_string());
    }

    let (target, _) = resolve_unique_path(&parent, &folder_name, true)?;

    fs::create_dir(&target).map_err(|e| format!("Failed to create folder: {}", e))?;

    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn create_markdown_file(
    parent_folder_path: String,
    file_name: String,
    content: Option<String>,
) -> Result<String, String> {
    ensure_valid_name(&file_name)?;

    let parent = PathBuf::from(&parent_folder_path);
    if !parent.exists() || !parent.is_dir() {
        return Err("Parent folder does not exist".to_string());
    }

    let (target, _) = resolve_unique_path(&parent, &file_name, false)?;

    fs::write(&target, content.unwrap_or_default())
        .map_err(|e| format!("Failed to create file: {}", e))?;

    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn rename_entry(source_path: String, new_name: String) -> Result<String, String> {
    ensure_valid_name(&new_name)?;

    let source = PathBuf::from(&source_path);
    if !source.exists() {
        return Err("Source path does not exist".to_string());
    }

    let current_name = source
        .file_name()
        .ok_or("Invalid source name")?
        .to_string_lossy()
        .to_string();

    if current_name == new_name {
        return Ok(source.to_string_lossy().to_string());
    }

    let parent = source.parent().ok_or("Cannot determine parent directory")?;
    let is_dir = source.is_dir();
    let (target, _) = resolve_unique_path(parent, &new_name, is_dir)?;

    if target == source {
        return Ok(source.to_string_lossy().to_string());
    }

    fs::rename(&source, &target).map_err(|e| format!("Failed to rename entry: {}", e))?;

    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn delete_entry(target_path: String) -> Result<(), String> {
    let path = PathBuf::from(&target_path);

    if !path.exists() {
        return Err("Path does not exist".to_string());
    }

    if path.is_dir() {
        fs::remove_dir_all(&path).map_err(|e| format!("Failed to delete folder: {}", e))?;
    } else {
        fs::remove_file(&path).map_err(|e| format!("Failed to delete file: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
fn move_entry(source_path: String, dest_folder_path: String) -> Result<String, String> {
    let source = PathBuf::from(&source_path);
    let dest_folder = PathBuf::from(&dest_folder_path);

    if !source.exists() {
        return Err("Source path does not exist".to_string());
    }

    if !dest_folder.exists() || !dest_folder.is_dir() {
        return Err("Destination folder does not exist".to_string());
    }

    if let Some(current_parent) = source.parent() {
        if current_parent == dest_folder {
            return Ok(source.to_string_lossy().to_string());
        }
    }

    if source.is_dir() && dest_folder.starts_with(&source) {
        return Err("Cannot move a folder into itself".to_string());
    }

    let file_name = source
        .file_name()
        .ok_or("Invalid source name")?
        .to_string_lossy()
        .to_string();
    let is_dir = source.is_dir();
    let (target, _) = resolve_unique_path(&dest_folder, &file_name, is_dir)?;

    if source.is_dir() && target.starts_with(&source) {
        return Err("Cannot move a folder into itself".to_string());
    }

    fs::rename(&source, &target).map_err(|e| format!("Failed to move entry: {}", e))?;

    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn copy_entries_to_folder(
    source_paths: Vec<String>,
    dest_folder_path: String,
) -> Result<Vec<String>, String> {
    let dest_folder = PathBuf::from(&dest_folder_path);

    if !dest_folder.exists() || !dest_folder.is_dir() {
        return Err("Destination folder does not exist".to_string());
    }

    let mut new_paths = Vec::new();

    for source_path in source_paths {
        let source = PathBuf::from(&source_path);

        if !source.exists() {
            continue; // Skip non-existent sources
        }

        let file_name = source
            .file_name()
            .ok_or("Invalid source name")?
            .to_string_lossy()
            .to_string();

        let is_dir = source.is_dir();
        let (target, _) = resolve_unique_path(&dest_folder, &file_name, is_dir)?;

        // Copy directory or file
        if is_dir {
            copy_dir_all(&source, &target)
                .map_err(|e| format!("Failed to copy directory: {}", e))?;
        } else {
            fs::copy(&source, &target).map_err(|e| format!("Failed to copy file: {}", e))?;
        }

        new_paths.push(target.to_string_lossy().to_string());
    }

    Ok(new_paths)
}

// Helper function to recursively copy directories
fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;

    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if file_type.is_dir() {
            copy_dir_all(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }

    Ok(())
}

/// Folders never worth scanning for notes, regardless of `.gitignore`.
///
/// Deliberately short. Names like `build` and `dist` are plausible folder names
/// in someone's notes, so they are left to `.gitignore` and the user's own list
/// rather than guessed at here. `node_modules` is the pathological case — point
/// a workspace at a JS project and it used to pull in every bundled README.
const ALWAYS_IGNORED: [&str; 2] = ["node_modules", ".git"];

/// True for the extensions Marky treats as documents in a vault: markdown notes
/// and HTML documents. The scan, the bulk read and the watcher all ask this one
/// function, so a file the tree shows is always a file whose changes are seen.
///
/// Markdown keeps its historical case-sensitive match (a `NOTES.MD` was never
/// picked up and changing that would surprise existing vaults); HTML matches
/// any case because exporters routinely write `.HTML` / `.HTM`.
fn is_note_extension(path: &Path) -> bool {
    path.extension().is_some_and(|ext| {
        ext == "md"
            || ext == "markdown"
            || ext == "txt"
            || ext.eq_ignore_ascii_case("html")
            || ext.eq_ignore_ascii_case("htm")
    })
}

/// Epoch-millis mtime and byte length, or `(0, 0)` when the platform won't say.
/// Zero means "unknown", which callers must treat as "assume changed".
fn file_stats(entry: &ignore::DirEntry) -> (u64, u64) {
    entry
        .metadata()
        .map(|meta| {
            let millis = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            (millis, meta.len())
        })
        .unwrap_or((0, 0))
}

/// A walker that honours `.gitignore`, `.ignore`, git's global excludes, the
/// built-in deny list and the caller's own patterns.
///
/// `require_git(false)`: a notes folder is usually not a git repo, and a
/// `.gitignore` sitting in one should still be honoured. Hidden entries stay
/// skipped, matching the original dotfile behaviour.
fn build_walker(
    root: &Path,
    ignore_patterns: Option<Vec<String>>,
) -> Result<ignore::WalkBuilder, String> {
    // `!pattern` in an override means "ignore this". With only negated patterns
    // present, anything that matches nothing is still included — adding a single
    // non-negated pattern would flip the matcher to allow-list mode and hide the
    // whole vault.
    let mut overrides = ignore::overrides::OverrideBuilder::new(root);
    for name in ALWAYS_IGNORED {
        overrides
            .add(&format!("!{}", name))
            .map_err(|e| format!("Invalid built-in ignore pattern: {}", e))?;
        overrides
            .add(&format!("!{}/**", name))
            .map_err(|e| format!("Invalid built-in ignore pattern: {}", e))?;
    }
    for pattern in ignore_patterns.unwrap_or_default() {
        let trimmed = pattern.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        // A bad user pattern shouldn't fail the whole scan — skip it and carry on.
        let _ = overrides.add(&format!("!{}", trimmed));
    }
    let overrides = overrides
        .build()
        .map_err(|e| format!("Failed to build ignore rules: {}", e))?;

    let mut builder = ignore::WalkBuilder::new(root);
    builder
        .hidden(true)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .require_git(false)
        .overrides(overrides)
        .follow_links(false);
    Ok(builder)
}

#[tauri::command]
fn scan_folder_for_markdown(
    folder_path: String,
    ignore_patterns: Option<Vec<String>>,
) -> Result<Vec<MarkdownFile>, String> {
    let path = PathBuf::from(&folder_path);

    if !path.exists() {
        return Err("Folder does not exist".to_string());
    }

    if !path.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let mut markdown_files = Vec::new();
    let walker = build_walker(&path, ignore_patterns)?.build();

    for entry in walker {
        // An unreadable subdirectory (permissions, a broken link) skips that
        // entry rather than failing the load of the entire vault.
        let Ok(entry) = entry else { continue };

        // Depth 0 is the workspace root itself; the caller adds that separately.
        if entry.depth() == 0 {
            continue;
        }

        let entry_path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);

        if is_dir {
            markdown_files.push(MarkdownFile {
                name: file_name,
                path: entry_path.to_string_lossy().to_string(),
                is_dir: true,
                modified: 0,
                size: 0,
            });
        } else if is_note_extension(entry_path) {
            let (modified, size) = file_stats(&entry);
            markdown_files.push(MarkdownFile {
                name: file_name,
                path: entry_path.to_string_lossy().to_string(),
                is_dir: false,
                modified,
                size,
            });
        }
    }

    Ok(markdown_files)
}

/// The media files a vault's notes can embed.
///
/// Kept separate from the note scan because it answers a different question:
/// notes are loaded to be edited, these are indexed only so an image reference
/// can be turned into a path. Media-only by design — walking a vault's every
/// file to resolve `![[diagram.png]]` would cost more than it buys.
const MEDIA_EXTENSIONS: [&str; 19] = [
    "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif", "apng", "pdf", "mp4", "webm",
    "mov", "mp3", "wav", "ogg", "m4a", "flac",
];

fn is_media_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| {
            let lowered = ext.to_ascii_lowercase();
            MEDIA_EXTENSIONS.contains(&lowered.as_str())
        })
}

#[derive(Debug, Serialize)]
struct AttachmentFile {
    name: String,
    path: String,
}

/// Index the media files in a workspace so image references can be resolved.
///
/// An imported Obsidian vault writes its images as `![[shot.png]]` — a bare
/// name with no path — and as paths relative to either the note or the vault
/// root. Only the first of those can be resolved without knowing what is
/// actually on disk, which is what this list provides.
#[tauri::command]
fn scan_workspace_attachments(
    folder_path: String,
    ignore_patterns: Option<Vec<String>>,
) -> Result<Vec<AttachmentFile>, String> {
    let path = PathBuf::from(&folder_path);

    if !path.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let mut attachments = Vec::new();
    let walker = build_walker(&path, ignore_patterns)?.build();

    for entry in walker {
        let Ok(entry) = entry else { continue };
        if entry.depth() == 0 {
            continue;
        }
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let entry_path = entry.path();
        if !is_media_extension(entry_path) {
            continue;
        }
        attachments.push(AttachmentFile {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry_path.to_string_lossy().to_string(),
        });
    }

    Ok(attachments)
}

/// A file the caller already holds content for, with the stats it was read at.
#[derive(Debug, Deserialize)]
struct KnownFile {
    path: String,
    modified: u64,
    size: u64,
}

#[derive(Debug, Serialize)]
struct WorkspaceFile {
    name: String,
    path: String,
    is_dir: bool,
    modified: u64,
    size: u64,
    /// `None` means "unchanged since you last read it — reuse what you have".
    content: Option<String>,
}

/// Walk the workspace and return its notes *with their contents* in one call.
///
/// This replaces a walk followed by one `readTextFile` IPC round-trip per note.
/// On a vault of any size that per-file chatter, not the file IO, dominated the
/// load — a thousand notes meant a thousand round-trips, each serialising a
/// whole file through the bridge. Here the walk and the reads happen together
/// on the walker's thread pool and cross the bridge once.
///
/// `known` carries the stats the caller already has content for; those files are
/// returned with `content: None` so an incremental refresh re-reads only what
/// actually changed. A `0` stat means the platform gave us no metadata, which is
/// always treated as "changed".
#[tauri::command]
fn read_workspace_files(
    folder_path: String,
    ignore_patterns: Option<Vec<String>>,
    known: Option<Vec<KnownFile>>,
) -> Result<Vec<WorkspaceFile>, String> {
    let path = PathBuf::from(&folder_path);

    if !path.exists() {
        return Err("Folder does not exist".to_string());
    }
    if !path.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let known: std::collections::HashMap<String, (u64, u64)> = known
        .unwrap_or_default()
        .into_iter()
        .filter(|k| k.modified != 0 && k.size != 0)
        .map(|k| (k.path.replace('\\', "/"), (k.modified, k.size)))
        .collect();

    let collected = Arc::new(Mutex::new(Vec::new()));

    build_walker(&path, ignore_patterns)?
        .build_parallel()
        .run(|| {
            let collected = Arc::clone(&collected);
            let known = &known;
            Box::new(move |entry| {
                let Ok(entry) = entry else {
                    return ignore::WalkState::Continue;
                };
                if entry.depth() == 0 {
                    return ignore::WalkState::Continue;
                }

                let entry_path = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();
                let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
                let path_string = entry_path.to_string_lossy().to_string();

                let file = if is_dir {
                    WorkspaceFile {
                        name,
                        path: path_string,
                        is_dir: true,
                        modified: 0,
                        size: 0,
                        content: None,
                    }
                } else if is_note_extension(entry_path) {
                    let (modified, size) = file_stats(&entry);
                    let unchanged = known
                        .get(&path_string.replace('\\', "/"))
                        .is_some_and(|(m, s)| *m == modified && *s == size)
                        && modified != 0
                        && size != 0;

                    WorkspaceFile {
                        name,
                        path: path_string,
                        is_dir: false,
                        modified,
                        size,
                        // A file that fails to read comes back as empty rather
                        // than failing the whole load, matching the previous
                        // per-file behaviour.
                        content: if unchanged {
                            None
                        } else {
                            Some(fs::read_to_string(entry_path).unwrap_or_default())
                        },
                    }
                } else {
                    return ignore::WalkState::Continue;
                };

                if let Ok(mut out) = collected.lock() {
                    out.push(file);
                }
                ignore::WalkState::Continue
            })
        });

    let files = Arc::try_unwrap(collected)
        .map_err(|_| "Walker outlived the collector".to_string())?
        .into_inner()
        .map_err(|e| format!("Failed to collect scan results: {}", e))?;

    Ok(files)
}

#[tauri::command]
fn watch_folder(
    folder_path: String,
    window: tauri::WebviewWindow,
    watcher_state: State<WatcherState>,
) -> Result<(), String> {
    let path = PathBuf::from(&folder_path);

    if !path.exists() || !path.is_dir() {
        return Err("Invalid folder path".to_string());
    }

    let label = window.label().to_string();
    let owner = label.clone();
    let app = window.app_handle().clone();

    let mut debouncer = new_debouncer(
        Duration::from_millis(500),
        None,
        move |result: DebounceEventResult| match result {
            Ok(events) => {
                for event in events {
                    for path in &event.paths {
                        if let Some(file_name) = path.file_name() {
                            let name = file_name.to_string_lossy();
                            if name.starts_with('.') {
                                continue;
                            }

                            if path.is_dir() || is_note_extension(path) {
                                let event_type = match event.kind {
                                    notify::EventKind::Create(_) => "create",
                                    notify::EventKind::Modify(_) => "modify",
                                    notify::EventKind::Remove(_) => "remove",
                                    _ => "other",
                                };

                                let change_event = FileChangeEvent {
                                    event_type: event_type.to_string(),
                                    path: path.to_string_lossy().to_string(),
                                    window: owner.clone(),
                                };

                                // Named for the window that asked for this
                                // watch, so a change in one vault does not make
                                // every other open vault rescan itself. Sent as
                                // a broadcast for the same reason menu actions
                                // are — see `emit_to_focused`.
                                let _ = app.emit("file-change", change_event);
                            }
                        }
                    }
                }
            }
            Err(errors) => {
                eprintln!("❌ Watch error: {:?}", errors);
            }
        },
    )
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    debouncer
        .watcher()
        .watch(&path, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch folder: {}", e))?;

    let mut watchers = watcher_state
        .watchers
        .lock()
        .map_err(|e| format!("Failed to lock watcher state: {}", e))?;
    watchers.insert(label, debouncer);

    Ok(())
}

#[tauri::command]
fn stop_watching(
    window: tauri::WebviewWindow,
    watcher_state: State<WatcherState>,
) -> Result<(), String> {
    let mut watchers = watcher_state
        .watchers
        .lock()
        .map_err(|e| format!("Failed to lock watcher state: {}", e))?;
    watchers.remove(window.label());
    Ok(())
}

// NEW: Command to show the main window
#[tauri::command]
async fn show_main_window(window: tauri::Window) {
    let _ = window.show();
}

#[derive(Debug, Deserialize)]
struct RecentNoteInfo {
    _name: String,
    _path: String,
}

#[tauri::command]
async fn update_dock_menu(
    _app: tauri::AppHandle,
    _recent_notes: Vec<RecentNoteInfo>,
) -> Result<(), String> {
    // Note: Tauri v2 doesn't have direct dock menu support yet
    // This is a placeholder for future implementation or use of native APIs
    // For now, we'll just log the recent notes

    // You could integrate with macOS native APIs here using objc crate if needed
    // For this MVP, we'll rely on the sidebar UI for recent notes

    Ok(())
}

#[tauri::command]
async fn open_recent_note(path: String, app: tauri::AppHandle) -> Result<(), String> {
    app.emit("open-recent-note", path)
        .map_err(|e| format!("Failed to emit event: {}", e))?;
    Ok(())
}

// Drain any files the OS queued for us before the UI was ready (see PendingOpen).
#[tauri::command]
fn take_pending_open_paths(state: State<PendingOpen>) -> Vec<String> {
    let mut guard = state.0.lock().unwrap_or_else(|e| e.into_inner());
    std::mem::take(&mut *guard)
}

/// Remove the native menu bar from a window on GTK.
///
/// macOS puts the app menu in the system bar and Windows draws it in the frame
/// we already removed, but GTK packs a `GtkMenuBar` *inside* the window, above
/// the webview — so on Linux the app otherwise renders a stray
/// "Edit / Window / Help" strip sitting on top of Marky's own title bar.
///
/// `hide_menu` is not sufficient here: when the initially hidden window is
/// shown, GTK's `show_all` makes the menu widget visible again. Removing it
/// keeps the custom title bar stable through startup and later hide/show cycles.
fn remove_native_menu<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    if cfg!(target_os = "linux") {
        if let Err(error) = window.remove_menu() {
            eprintln!(
                "Failed to remove native menu from {}: {error}",
                window.label()
            );
        }
    }
}

/// Send a menu action to the window the user is actually looking at.
///
/// Menu events went out app-wide, which was harmless while one full app window
/// was the only thing that listened. With a vault open per window, a broadcast
/// "New note" would create one in every vault at once, so the action follows
/// focus. Nothing focused (every window minimised) falls back to a broadcast,
/// which is the old behaviour and still right for a single window.
fn emit_to_focused(app: &tauri::AppHandle, event: &str) {
    // `Manager::get_focused_window` is behind Tauri's `unstable` feature, so
    // the focused window is found by asking each one.
    let focused = app
        .webview_windows()
        .into_iter()
        .find(|(_, window)| window.is_focused().unwrap_or(false))
        .map(|(label, _)| label);

    // Broadcast, with the intended window named in the payload, rather than
    // `emit_to`. An addressed emit only reaches listeners that registered under
    // that same label, and the ordinary `listen(event, handler)` registers for
    // the `Any` target, which Tauri does not count as a match — so an addressed
    // menu action can silently arrive nowhere. Delivery is the framework's job;
    // deciding whose event it is stays in the frontend, where it is testable.
    let _ = app.emit(event, WindowScoped { window: focused });
}

/// Windows opened after startup (a note in its own window) inherit the app menu
/// too, and the frontend cannot reach `remove_menu` — the JS API doesn't expose
/// it. Each window asks for this once as it boots.
#[tauri::command]
fn remove_window_menu(window: tauri::WebviewWindow) {
    remove_native_menu(&window);
}

/// How a window looks before its page has painted anything: whether the
/// translucent material is on, the scheme it follows, and the desk colour
/// painted behind the webview when it is off. Written by
/// `set_window_translucency` to the app config directory, read when a window
/// first loads (see `dress_window`), so the first frame a window ever shows is
/// already right — blurred, or opaque in the theme's desk colour — instead of
/// the desktop showing through sharp until the page has read its settings.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
struct WindowAppearance {
    #[serde(default)]
    translucent: bool,
    #[serde(default)]
    dark: bool,
    /// `#rrggbb`. The Vault light desk on a fresh install, which is the theme
    /// a fresh install opens in.
    #[serde(default = "default_desk_colour")]
    background: String,
}

fn default_desk_colour() -> String {
    "#ecebf1".to_string()
}

impl Default for WindowAppearance {
    fn default() -> Self {
        Self {
            translucent: false,
            dark: false,
            background: default_desk_colour(),
        }
    }
}

const APPEARANCE_FILE: &str = "window-appearance.json";

/// A window that has not shown itself this long after its page started
/// loading is shown anyway, so a frontend that fails to boot can never leave
/// the app invisible. The frontend normally shows its window within a few
/// hundred milliseconds (see src/utils/windowStartup.js).
const REVEAL_FALLBACK: Duration = Duration::from_secs(3);

#[derive(Default)]
struct AppearanceState {
    /// The remembered appearance, loaded from disk on first use.
    current: Mutex<Option<WindowAppearance>>,
    /// Windows already dressed for their first load (a reload keeps its
    /// material and is not dressed again).
    dressed: Mutex<std::collections::HashSet<String>>,
    /// The material each window has on now, so a repeat request is a no-op
    /// rather than a flicker of clear-and-reapply.
    applied: Mutex<HashMap<String, (bool, bool)>>,
}

fn appearance_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join(APPEARANCE_FILE))
}

fn current_appearance(app: &tauri::AppHandle) -> WindowAppearance {
    let state = app.state::<AppearanceState>();
    let mut current = match state.current.lock() {
        Ok(guard) => guard,
        Err(_) => return WindowAppearance::default(),
    };
    if current.is_none() {
        let loaded = appearance_path(app)
            .and_then(|path| fs::read_to_string(path).ok())
            .and_then(|text| serde_json::from_str::<WindowAppearance>(&text).ok())
            .filter(|appearance| parse_hex_colour(&appearance.background).is_some())
            .unwrap_or_default();
        *current = Some(loaded);
    }
    current.clone().unwrap_or_default()
}

fn remember_appearance(app: &tauri::AppHandle, next: WindowAppearance) {
    let state = app.state::<AppearanceState>();
    let Ok(mut current) = state.current.lock() else {
        return;
    };
    if current.as_ref() == Some(&next) {
        return;
    }
    if let Some(path) = appearance_path(app) {
        if let Some(dir) = path.parent() {
            let _ = fs::create_dir_all(dir);
        }
        if let Ok(text) = serde_json::to_string(&next) {
            let _ = fs::write(path, text);
        }
    }
    *current = Some(next);
}

/// `#rrggbb` → an opaque colour; anything else is refused.
fn parse_hex_colour(value: &str) -> Option<tauri::window::Color> {
    let hex = value.strip_prefix('#')?;
    if hex.len() != 6 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    let n = u32::from_str_radix(hex, 16).ok()?;
    Some(tauri::window::Color(
        ((n >> 16) & 0xff) as u8,
        ((n >> 8) & 0xff) as u8,
        (n & 0xff) as u8,
        255,
    ))
}

const CLEAR: tauri::window::Color = tauri::window::Color(0, 0, 0, 0);

/// Put the material on a window, or take it off and paint the desk colour
/// behind the webview instead. Returns whether a material is now on. Must run
/// on the main thread (AppKit and DWM want window changes made there).
///
/// - macOS: NSVisualEffectView with the sidebar material. Its light or dark
///   look follows the window's appearance, so the window is pinned to the
///   page's theme while the material is on and handed back to the system after.
///   The colour goes on the window layer (WKWebView has no background of its
///   own in a transparent window).
/// - Windows: Mica on Windows 11; `apply_mica` refuses older builds, and
///   Windows 10 falls back to Acrylic (which lags while dragging on some 10
///   builds — a Windows limitation, and the reason Mica is tried first). The
///   colour goes on the webview layer, which is transparent while the
///   material is on.
/// - Linux: no material (Tauri can drive no blur there, and a see-through
///   window without blur is unreadable, so the frontend never offers the
///   setting); only the webview's colour, so GTK's default never flashes.
fn apply_window_material<R: tauri::Runtime>(
    window: &tauri::Window<R>,
    webview: &tauri::Webview<R>,
    enabled: bool,
    dark: bool,
    background: Option<tauri::window::Color>,
) -> bool {
    #[cfg(target_os = "macos")]
    {
        use window_vibrancy::{NSVisualEffectMaterial, NSVisualEffectState};
        let _ = webview;
        // Applying twice would stack two effect views; clear whatever is there.
        while let Ok(true) = window_vibrancy::clear_vibrancy(window) {}
        if !enabled {
            let _ = window.set_theme(None);
            if let Some(colour) = background {
                let _ = window.set_background_color(Some(colour));
            }
            return false;
        }
        let _ = window.set_background_color(Some(CLEAR));
        let _ = window.set_theme(Some(if dark {
            tauri::Theme::Dark
        } else {
            tauri::Theme::Light
        }));
        window_vibrancy::apply_vibrancy(
            window,
            NSVisualEffectMaterial::Sidebar,
            Some(NSVisualEffectState::FollowsWindowActiveState),
            None,
        )
        .is_ok()
    }

    #[cfg(target_os = "windows")]
    {
        let _ = window_vibrancy::clear_mica(window);
        let _ = window_vibrancy::clear_acrylic(window);
        if !enabled {
            if let Some(colour) = background {
                let _ = webview.set_background_color(Some(colour));
            }
            return false;
        }
        let _ = webview.set_background_color(Some(CLEAR));
        window_vibrancy::apply_mica(window, Some(dark))
            .or_else(|_| window_vibrancy::apply_acrylic(window, None))
            .is_ok()
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (window, enabled, dark, CLEAR);
        if let Some(colour) = background {
            let _ = webview.set_background_color(Some(colour));
        }
        false
    }
}

/// Apply a material request to one window unless it already has it. The desk
/// colour is cheap and always refreshed while the material is off (it follows
/// the theme, and shows at the edges during a live resize).
fn apply_to_window<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    window: &tauri::Window<R>,
    webview: &tauri::Webview<R>,
    enabled: bool,
    dark: bool,
    background: Option<tauri::window::Color>,
) -> bool {
    let state = app.state::<AppearanceState>();
    let label = window.label().to_string();
    let unchanged = state
        .applied
        .lock()
        .map(|applied| applied.get(&label) == Some(&(enabled, dark)))
        .unwrap_or(false);
    if unchanged {
        if !enabled {
            apply_window_material(window, webview, false, dark, background);
        }
        return enabled;
    }
    let on = apply_window_material(window, webview, enabled, dark, background);
    if let Ok(mut applied) = state.applied.lock() {
        applied.insert(label, (enabled, dark));
    }
    on
}

/// The first time a window's page starts loading — before the page can show
/// the window, which every window is created hidden for — put on the
/// remembered appearance, and arm the fallback that shows the window if the
/// page never does.
fn dress_window(webview: &tauri::Webview) {
    let window = webview.window();
    let label = window.label().to_string();
    let app = webview.app_handle().clone();
    let first_load = app
        .state::<AppearanceState>()
        .dressed
        .lock()
        .map(|mut dressed| dressed.insert(label))
        .unwrap_or(false);
    if !first_load {
        return;
    }

    let appearance = current_appearance(&app);
    let background = parse_hex_colour(&appearance.background);
    let supported = cfg!(any(target_os = "macos", target_os = "windows"));
    let (target, view, handle) = (window.clone(), webview.clone(), app.clone());
    let _ = window.run_on_main_thread(move || {
        #[cfg(target_os = "macos")]
        install_title_toolbar(&target);
        apply_to_window(
            &handle,
            &target,
            &view,
            appearance.translucent && supported,
            appearance.dark,
            background,
        );
    });

    std::thread::spawn(move || {
        std::thread::sleep(REVEAL_FALLBACK);
        if !window.is_visible().unwrap_or(true) {
            eprintln!(
                "Window {} did not show itself; showing it anyway",
                window.label()
            );
            let _ = window.show();
        }
    });
}

/// Give a macOS window an empty unified toolbar, so AppKit itself lays out the
/// traffic lights in a toolbar-height title bar.
///
/// Moving the buttons by hand (`trafficLightPosition`, which resizes the title
/// bar container and shifts each button's frame) clips the rim of every button
/// on the macOS 26 SDK: the circles come out flat on their left and right
/// edges. A window with a toolbar gets the larger, centred buttons natively,
/// the way Finder or Calculator draws them. The toolbar has no items, so the
/// page still owns the whole strip and every click in it.
#[cfg(target_os = "macos")]
fn install_title_toolbar<R: tauri::Runtime>(window: &tauri::Window<R>) {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSToolbar, NSWindow, NSWindowToolbarStyle};

    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let Ok(pointer) = window.ns_window() else {
        return;
    };
    // SAFETY: Tauri hands back the live NSWindow behind this window, and we
    // are on the main thread (checked above).
    let ns_window: &NSWindow = unsafe { &*(pointer as *const NSWindow) };
    if ns_window.toolbar().is_some() {
        return;
    }
    let toolbar = NSToolbar::new(mtm);
    ns_window.setToolbar(Some(&toolbar));
    ns_window.setToolbarStyle(NSWindowToolbarStyle::Unified);
}

/// The "Translucent window" appearance setting: a system material behind the
/// webview, so the desk (title bar + sidebar, painted part-transparent by the
/// page) shows the blurred desktop. Every macOS and Windows window is created
/// transparent so this can be switched at runtime; with it off the page paints
/// an opaque desk over the bare window. Returns whether a material is now on.
///
/// Also remembers the request, with the theme's desk colour, for the next
/// launch (see `WindowAppearance`). Called on every platform for that reason;
/// Linux never gets a material.
///
/// A plain (non-async) command, so Tauri runs it on the main thread, which is
/// where AppKit and DWM want window changes made.
#[tauri::command]
fn set_window_translucency(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    enabled: bool,
    dark: bool,
    background: Option<String>,
) -> bool {
    let supported = cfg!(any(target_os = "macos", target_os = "windows"));
    let enabled = enabled && supported;
    let colour = background.as_deref().and_then(parse_hex_colour);
    let mut remembered = current_appearance(&app);
    remembered.translucent = enabled;
    remembered.dark = dark;
    if let (Some(_), Some(hex)) = (colour, background) {
        remembered.background = hex.to_ascii_lowercase();
    }
    remember_appearance(&app, remembered);
    let webview: &tauri::Webview = window.as_ref();
    let native = webview.window();
    apply_to_window(&app, &native, webview, enabled, dark, colour)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(WatcherState {
            watchers: Arc::new(Mutex::new(HashMap::new())),
        })
        .manage(PendingOpen(Arc::new(Mutex::new(Vec::new()))))
        .manage(ExitState::default())
        .manage(documents::DocumentRoots::default())
        .manage(AppearanceState::default())
        // Every window is created hidden; its material (or opaque desk
        // colour) goes on as its page starts loading, before the page can
        // show it. See `dress_window`.
        .on_page_load(|webview, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Started {
                dress_window(webview);
            }
        })
        // HTML documents' relative resources (see documents.rs). Answered off
        // the main thread: a large image must not stall the UI.
        .register_asynchronous_uri_scheme_protocol(documents::SCHEME, |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            std::thread::spawn(move || {
                let roots = app.state::<documents::DocumentRoots>();
                responder.respond(documents::respond(&roots, &request));
            });
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .menu(|app| {
            let menu = Menu::default(app)?;

            // Build all items upfront so they can be injected into the
            // existing default submenus (File / Edit / View / Window).

            // File items — prepended before the default "Close Window"
            let new_note = MenuItem::with_id(
                app,
                "menu://new-note",
                "New Note",
                true,
                Some("CmdOrCtrl+N"),
            )?;
            let new_folder = MenuItem::with_id(
                app,
                "menu://new-folder",
                "New Folder",
                true,
                Some("CmdOrCtrl+Shift+N"),
            )?;
            // Cmd/Ctrl+N and +Shift+N are already New Note and New Folder, so the
            // window shortcut takes the next free slot rather than displacing one.
            let new_window = MenuItem::with_id(
                app,
                "menu://new-window",
                "New Window",
                true,
                Some("CmdOrCtrl+Alt+N"),
            )?;
            let sep_f1 = PredefinedMenuItem::separator(app)?;
            let open_file = MenuItem::with_id(
                app,
                "menu://open-file",
                "Open File\u{2026}",
                true,
                Some("CmdOrCtrl+O"),
            )?;
            let open_folder = MenuItem::with_id(
                app,
                "menu://open-folder",
                "Open Folder\u{2026}",
                true,
                Some("CmdOrCtrl+Shift+O"),
            )?;
            let sep_f2 = PredefinedMenuItem::separator(app)?;
            let save_note =
                MenuItem::with_id(app, "menu://save-note", "Save", true, Some("CmdOrCtrl+S"))?;
            let sep_f3 = PredefinedMenuItem::separator(app)?;
            let export_note = MenuItem::with_id(
                app,
                "menu://export-note",
                "Export Note\u{2026}",
                true,
                None::<&str>,
            )?;
            let backup_ws = MenuItem::with_id(
                app,
                "menu://backup-workspace",
                "Backup Workspace\u{2026}",
                true,
                None::<&str>,
            )?;
            let sep_f4 = PredefinedMenuItem::separator(app)?;
            // (Close Window stays as the last item from the default menu)

            // Edit extras — appended after the default Undo/Redo/Cut/Copy/Paste
            let sep_e1 = PredefinedMenuItem::separator(app)?;
            let find_in_notes = MenuItem::with_id(
                app,
                "menu://search",
                "Find in Notes\u{2026}",
                true,
                Some("CmdOrCtrl+Shift+F"),
            )?;
            let cmd_palette = MenuItem::with_id(
                app,
                "menu://command-palette",
                "Command Palette\u{2026}",
                true,
                Some("CmdOrCtrl+K"),
            )?;

            // View items — prepended before the default "Enter Full Screen".
            // The old "Editor Only / Split / Preview Only" commands are gone:
            // the editor's real modes (Source / Live / Read) live in its own
            // segmented control, and these dispatched mode ids that no longer
            // exist.
            let toggle_sidebar = MenuItem::with_id(
                app,
                "menu://toggle-sidebar",
                "Toggle Sidebar",
                true,
                Some("CmdOrCtrl+B"),
            )?;
            let sep_v1 = PredefinedMenuItem::separator(app)?;
            let sep_v2 = PredefinedMenuItem::separator(app)?;
            let focus_mode = MenuItem::with_id(
                app,
                "menu://focus-mode",
                "Focus Mode",
                true,
                Some("CmdOrCtrl+Alt+F"),
            )?;
            let open_graph =
                MenuItem::with_id(app, "menu://open-graph", "Graph View", true, None::<&str>)?;
            let sep_v3 = PredefinedMenuItem::separator(app)?;
            // Text size. "Equal" rather than "Plus": muda's accelerator parser
            // accepts EQUAL/"=" and rejects PLUS, and a rejected accelerator
            // fails menu construction at startup. It is also the key the
            // in-app keymap binds, so the two cannot drift apart.
            let font_larger = MenuItem::with_id(
                app,
                "menu://font-larger",
                "Larger Text",
                true,
                Some("CmdOrCtrl+Equal"),
            )?;
            let font_smaller = MenuItem::with_id(
                app,
                "menu://font-smaller",
                "Smaller Text",
                true,
                Some("CmdOrCtrl+-"),
            )?;
            let font_reset = MenuItem::with_id(
                app,
                "menu://font-reset",
                "Actual Size",
                true,
                Some("CmdOrCtrl+0"),
            )?;
            let sep_v4 = PredefinedMenuItem::separator(app)?;
            // (Enter Full Screen stays as the last item from the default menu)

            // Window extras — appended after default Minimize/Maximize/Close
            let sep_w1 = PredefinedMenuItem::separator(app)?;
            let open_settings = MenuItem::with_id(
                app,
                "menu://open-settings",
                "Preferences\u{2026}",
                true,
                Some("CmdOrCtrl+,"),
            )?;
            let show_shortcuts = MenuItem::with_id(
                app,
                "menu://show-shortcuts",
                "Keyboard Shortcuts\u{2026}",
                true,
                Some("CmdOrCtrl+?"),
            )?;

            // Inject into every existing default submenu by title.
            for item in menu.items()?.iter() {
                if let Some(sub) = item.as_submenu() {
                    match sub.text().as_deref().unwrap_or("") {
                        "File" => {
                            // Prepend Marky items so they sit above "Close Window"
                            sub.prepend_items(&[
                                &new_note,
                                &new_folder,
                                &new_window,
                                &sep_f1,
                                &open_file,
                                &open_folder,
                                &sep_f2,
                                &save_note,
                                &sep_f3,
                                &export_note,
                                &backup_ws,
                                &sep_f4,
                            ])?;
                        }
                        "Edit" => {
                            sub.append_items(&[
                                &sep_e1 as &dyn tauri::menu::IsMenuItem<_>,
                                &find_in_notes,
                                &cmd_palette,
                            ])?;
                        }
                        "View" => {
                            // Prepend Marky items so "Enter Full Screen" stays last
                            sub.prepend_items(&[
                                &toggle_sidebar,
                                &sep_v1,
                                &sep_v2,
                                &focus_mode,
                                &open_graph,
                                &sep_v3,
                                &font_larger,
                                &font_smaller,
                                &font_reset,
                                &sep_v4,
                            ])?;
                        }
                        "Window" => {
                            sub.append_items(&[
                                &sep_w1 as &dyn tauri::menu::IsMenuItem<_>,
                                &open_settings,
                                &show_shortcuts,
                            ])?;
                        }
                        _ => {}
                    }
                }
            }

            Ok(menu)
        })
        .on_menu_event(|app, event| {
            let event_id = event.id().as_ref();

            // recent note clicks (future use)
            if event_id.starts_with("recent://") {
                let path = event_id.strip_prefix("recent://").unwrap_or("");
                let _ = app.emit("open-recent-note", path.to_string());
                return;
            }

            match event_id {
                "menu://new-note" => {
                    emit_to_focused(app, "menu://new-note");
                }
                "menu://new-folder" => {
                    emit_to_focused(app, "menu://new-folder");
                }
                "menu://new-window" => {
                    emit_to_focused(app, "menu://new-window");
                }
                "menu://open-file" => {
                    emit_to_focused(app, "menu://open-file");
                }
                "menu://open-folder" => {
                    emit_to_focused(app, "menu://open-folder");
                }
                "menu://save-note" => {
                    emit_to_focused(app, "menu://save-note");
                }
                "menu://close-note" => {
                    emit_to_focused(app, "menu://close-note");
                }
                "menu://export-note" => {
                    emit_to_focused(app, "menu://export-note");
                }
                "menu://backup-workspace" => {
                    emit_to_focused(app, "menu://backup-workspace");
                }
                "menu://search" => {
                    emit_to_focused(app, "menu://search");
                }
                "menu://command-palette" => {
                    emit_to_focused(app, "menu://command-palette");
                }
                "menu://toggle-sidebar" => {
                    emit_to_focused(app, "menu://toggle-sidebar");
                }
                "menu://focus-mode" => {
                    emit_to_focused(app, "menu://focus-mode");
                }
                "menu://font-larger" => {
                    emit_to_focused(app, "menu://font-larger");
                }
                "menu://font-smaller" => {
                    emit_to_focused(app, "menu://font-smaller");
                }
                "menu://font-reset" => {
                    emit_to_focused(app, "menu://font-reset");
                }
                "menu://open-graph" => {
                    emit_to_focused(app, "menu://open-graph");
                }
                "menu://open-settings" => {
                    emit_to_focused(app, "menu://open-settings");
                }
                "menu://show-shortcuts" => {
                    emit_to_focused(app, "menu://show-shortcuts");
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            scan_folder_for_markdown,
            scan_workspace_attachments,
            read_workspace_files,
            create_folder,
            create_markdown_file,
            rename_entry,
            delete_entry,
            move_entry,
            copy_entries_to_folder,
            watch_folder,
            stop_watching,
            show_main_window,
            update_dock_menu,
            open_recent_note,
            take_pending_open_paths,
            remove_window_menu,
            set_window_translucency,
            read_note_history,
            append_note_history,
            remove_note_history,
            move_note_history,
            clear_all_history,
            read_all_drafts,
            write_draft,
            remove_draft,
            clear_all_drafts,
            confirm_exit,
            git_sync::git_available,
            git_sync::git_repo_status,
            git_sync::git_init_repo,
            git_sync::git_clone_repo,
            git_sync::git_test_remote,
            git_sync::git_sync,
            git_sync::git_reset_to_remote,
            documents::register_document_root,
            documents::open_external_url,
            documents::open_document_in_browser
        ])
        .on_window_event(|window, event| {
            // A closed window's watcher would otherwise sit in the map holding
            // an OS watch on a folder nobody is looking at any more.
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Ok(mut watchers) = window.state::<WatcherState>().watchers.lock() {
                    watchers.remove(window.label());
                }
                // A label can be reused (a note reopened in its own window);
                // the new window must be dressed afresh.
                let appearance = window.state::<AppearanceState>();
                if let Ok(mut dressed) = appearance.dressed.lock() {
                    dressed.remove(window.label());
                }
                if let Ok(mut applied) = appearance.applied.lock() {
                    applied.remove(window.label());
                };
            }
        })
        .setup(|app| {
            #[cfg(not(target_os = "macos"))]
            {
                let window = app.get_webview_window("main").unwrap();
                if let Err(error) = window.set_decorations(false) {
                    eprintln!("Failed to disable native window decorations: {error}");
                }
            }

            // Remove, rather than hide, because GTK's later `show_all` would
            // make a hidden menu visible again.
            for window in app.webview_windows().values() {
                remove_native_menu(window);
            }

            // Files passed on the command line — Windows/Linux "Open with" and
            // launch-by-double-click. macOS delivers these via RunEvent::Opened below.
            let launch_paths: Vec<String> = std::env::args()
                .skip(1)
                .filter(|arg| is_supported_file(arg))
                .collect();
            if !launch_paths.is_empty() {
                if let Ok(mut queued) = app.state::<PendingOpen>().0.lock() {
                    queued.extend(launch_paths.iter().cloned());
                }
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    // Give the frontend a moment to register its listener.
                    std::thread::sleep(Duration::from_millis(800));
                    for path in launch_paths {
                        let _ = handle.emit("open-path", path);
                    }
                });
            }

            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            // macOS delivers "Open with Marky" / double-clicked files as an Opened
            // run-event, both at launch and while the app is already running.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = &event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        let path = path.to_string_lossy().to_string();
                        if is_supported_file(&path) {
                            if let Ok(mut queued) = app_handle.state::<PendingOpen>().0.lock() {
                                queued.push(path.clone());
                            }
                            let _ = app_handle.emit("open-path", path);
                        }
                    }
                }
            }
            // Quit — Cmd+Q, the Quit menu item, or the last window closing.
            // Held open just long enough for the frontend to write what it has.
            if let tauri::RunEvent::ExitRequested { api, .. } = &event {
                let exit_state = app_handle.state::<ExitState>();

                // Nothing left to ask: either the flush already happened, or
                // every window is gone and there is no one to ask.
                let already_confirmed = exit_state.confirmed.load(Ordering::SeqCst);
                let no_windows = app_handle.webview_windows().is_empty();

                if !already_confirmed && !no_windows {
                    api.prevent_exit();

                    if !exit_state.in_progress.swap(true, Ordering::SeqCst) {
                        exit_state
                            .pending
                            .store(app_handle.webview_windows().len(), Ordering::SeqCst);
                        let _ = app_handle.emit("app-exit-requested", ());

                        // The frontend answers with `confirm_exit`. This is the
                        // backstop for when it cannot — a failed write, a hung
                        // network volume, a webview that never loaded.
                        let handle = app_handle.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(EXIT_FLUSH_TIMEOUT);
                            if !handle.state::<ExitState>().confirmed.load(Ordering::SeqCst) {
                                handle
                                    .state::<ExitState>()
                                    .confirmed
                                    .store(true, Ordering::SeqCst);
                                handle.exit(0);
                            }
                        });
                    }
                }
            }

            let _ = (app_handle, event);
        });
}

#[cfg(test)]
mod scan_tests {
    use super::*;
    use std::fs;

    fn touch(path: &Path) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, "# note").unwrap();
    }

    fn names(files: &[MarkdownFile]) -> Vec<String> {
        let mut out: Vec<String> = files.iter().map(|f| f.name.clone()).collect();
        out.sort();
        out
    }

    fn fixture(tag: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("marky_scan_{}", tag));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        touch(&root.join("Keep.md"));
        touch(&root.join("node_modules/pkg/README.md"));
        touch(&root.join("Archive/Old.md"));
        touch(&root.join("build/Generated.md"));
        root
    }

    #[test]
    fn skips_node_modules_but_keeps_real_notes() {
        let root = fixture("basic");
        let files = scan_folder_for_markdown(root.to_string_lossy().to_string(), None).unwrap();
        let found = names(&files);

        assert!(found.contains(&"Keep.md".to_string()));
        assert!(!found.contains(&"README.md".to_string()));
        // Nothing else is guessed at: `build/` survives without a rule.
        assert!(found.contains(&"Generated.md".to_string()));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn honors_gitignore_without_a_git_repo() {
        let root = fixture("gitignore");
        fs::write(root.join(".gitignore"), "build/\n").unwrap();

        let files = scan_folder_for_markdown(root.to_string_lossy().to_string(), None).unwrap();
        let found = names(&files);

        assert!(!found.contains(&"Generated.md".to_string()));
        assert!(found.contains(&"Keep.md".to_string()));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn applies_user_patterns() {
        let root = fixture("user");
        let files = scan_folder_for_markdown(
            root.to_string_lossy().to_string(),
            Some(vec!["Archive/".to_string()]),
        )
        .unwrap();
        let found = names(&files);

        assert!(!found.contains(&"Old.md".to_string()));
        assert!(found.contains(&"Keep.md".to_string()));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_bad_user_pattern_does_not_hide_the_vault() {
        let root = fixture("badpattern");
        let files = scan_folder_for_markdown(
            root.to_string_lossy().to_string(),
            Some(vec![
                "[".to_string(),
                "".to_string(),
                "# comment".to_string(),
            ]),
        )
        .unwrap();

        assert!(names(&files).contains(&"Keep.md".to_string()));
        let _ = fs::remove_dir_all(&root);
    }

    fn by_name<'a>(files: &'a [WorkspaceFile], name: &str) -> &'a WorkspaceFile {
        files.iter().find(|f| f.name == name).expect("file present")
    }

    #[test]
    fn bulk_read_returns_content_in_one_call() {
        let root = fixture("bulk");
        let files = read_workspace_files(root.to_string_lossy().to_string(), None, None).unwrap();

        assert_eq!(
            by_name(&files, "Keep.md").content.as_deref(),
            Some("# note")
        );
        // Same ignore rules as the plain scan.
        assert!(!files.iter().any(|f| f.name == "README.md"));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn bulk_read_skips_content_for_unchanged_files() {
        let root = fixture("known");
        let first = read_workspace_files(root.to_string_lossy().to_string(), None, None).unwrap();

        let known: Vec<KnownFile> = first
            .iter()
            .filter(|f| !f.is_dir)
            .map(|f| KnownFile {
                path: f.path.clone(),
                modified: f.modified,
                size: f.size,
            })
            .collect();

        let second =
            read_workspace_files(root.to_string_lossy().to_string(), None, Some(known)).unwrap();

        // Nothing changed on disk, so nothing is re-read.
        assert!(second
            .iter()
            .filter(|f| !f.is_dir)
            .all(|f| f.content.is_none()));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn bulk_read_returns_content_for_a_changed_file() {
        let root = fixture("changed");
        let first = read_workspace_files(root.to_string_lossy().to_string(), None, None).unwrap();

        let known: Vec<KnownFile> = first
            .iter()
            .filter(|f| !f.is_dir)
            .map(|f| KnownFile {
                path: f.path.clone(),
                modified: f.modified,
                size: f.size,
            })
            .collect();

        // Rewrite one file with a different length.
        fs::write(root.join("Keep.md"), "# note, now longer").unwrap();

        let second =
            read_workspace_files(root.to_string_lossy().to_string(), None, Some(known)).unwrap();

        assert_eq!(
            by_name(&second, "Keep.md").content.as_deref(),
            Some("# note, now longer")
        );
        assert!(by_name(&second, "Old.md").content.is_none());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn bulk_read_treats_unknown_stats_as_changed() {
        let root = fixture("zerostat");
        let known = vec![KnownFile {
            path: root.join("Keep.md").to_string_lossy().to_string(),
            modified: 0,
            size: 0,
        }];

        let files =
            read_workspace_files(root.to_string_lossy().to_string(), None, Some(known)).unwrap();

        // A `0` stat means "no metadata", never "unchanged".
        assert!(by_name(&files, "Keep.md").content.is_some());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn omits_the_root_itself() {
        let root = fixture("root");
        let files = scan_folder_for_markdown(root.to_string_lossy().to_string(), None).unwrap();
        let root_str = root.to_string_lossy().to_string();

        assert!(!files.iter().any(|f| f.path == root_str));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn html_documents_are_vault_documents() {
        assert!(is_note_extension(Path::new("/v/Report.html")));
        assert!(is_note_extension(Path::new("/v/Report.HTM")));
        assert!(is_note_extension(Path::new("/v/Note.md")));
        assert!(!is_note_extension(Path::new("/v/style.css")));
        assert!(!is_note_extension(Path::new("/v/chart.js")));
        assert!(!is_note_extension(Path::new("/v/page.xhtml")));
        assert!(!is_note_extension(Path::new("/v/html")));
    }

    #[test]
    fn html_documents_can_be_opened_with_marky() {
        assert!(is_supported_file("/tmp/Report.html"));
        assert!(is_supported_file("/tmp/Report.HTM"));
        assert!(is_supported_file("/tmp/Note.md"));
        assert!(!is_supported_file("/tmp/image.png"));
        assert!(!is_supported_file("/tmp/no-extension"));
    }

    #[test]
    fn scan_and_bulk_read_include_html_beside_notes() {
        let root = fixture("html");
        touch(&root.join("Report.html"));
        touch(&root.join("Report.md"));
        touch(&root.join("assets/style.css"));
        let scanned =
            names(&scan_folder_for_markdown(root.to_string_lossy().to_string(), None).unwrap());
        assert!(scanned.contains(&"Report.html".to_string()));
        assert!(scanned.contains(&"Report.md".to_string()));
        assert!(!scanned.contains(&"style.css".to_string()));

        let read = read_workspace_files(root.to_string_lossy().to_string(), None, None).unwrap();
        assert!(read
            .iter()
            .any(|f| f.name == "Report.html" && f.content.is_some()));
        let _ = fs::remove_dir_all(&root);
    }
}

#[cfg(test)]
mod appearance_tests {
    use super::*;

    #[test]
    fn parses_only_six_digit_hex_colours() {
        let colour = parse_hex_colour("#ecebf1").unwrap();
        assert_eq!(
            (colour.0, colour.1, colour.2, colour.3),
            (0xec, 0xeb, 0xf1, 255)
        );
        assert!(parse_hex_colour("#ECEBF1").is_some());
        for bad in ["ecebf1", "#ecebf", "#ecebf1ff", "#zzzzzz", "", "rgb(1,2,3)"] {
            assert!(parse_hex_colour(bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn a_black_desk_is_opaque_black_not_clear() {
        // The Black theme's desk is #000000. It must come back as a painted,
        // opaque colour: CLEAR (the same channels at alpha 0) is what the
        // material path uses to let the desktop show through.
        let colour = parse_hex_colour("#000000").unwrap();
        assert_eq!((colour.0, colour.1, colour.2, colour.3), (0, 0, 0, 255));
        assert_ne!(colour.3, CLEAR.3);
    }

    #[test]
    fn a_missing_or_partial_file_reads_as_the_fresh_install_look() {
        let partial: WindowAppearance = serde_json::from_str(r#"{"translucent":true}"#).unwrap();
        assert!(partial.translucent);
        assert!(!partial.dark);
        assert_eq!(partial.background, "#ecebf1");
        assert_eq!(
            WindowAppearance::default().background,
            default_desk_colour()
        );
        assert!(!WindowAppearance::default().translucent);
    }

    #[test]
    fn round_trips_through_json() {
        let appearance = WindowAppearance {
            translucent: true,
            dark: true,
            background: "#131217".to_string(),
        };
        let text = serde_json::to_string(&appearance).unwrap();
        assert_eq!(
            serde_json::from_str::<WindowAppearance>(&text).unwrap(),
            appearance
        );
    }
}
