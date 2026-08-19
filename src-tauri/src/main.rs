// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use notify_debouncer_full::{
    new_debouncer,
    notify::{RecursiveMode, Watcher},
    DebounceEventResult,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
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
}

struct WatcherState {
    _watcher: Arc<
        Mutex<
            Option<
                notify_debouncer_full::Debouncer<
                    notify::RecommendedWatcher,
                    notify_debouncer_full::FileIdMap,
                >,
            >,
        >,
    >,
}

// Files the OS asked us to open (via "Open with Marky" / double-click) before the
// frontend was ready to receive them. The UI drains this on startup.
struct PendingOpen(Arc<Mutex<Vec<String>>>);

/// True for the file types Marky can open (keep in sync with tauri.conf.json fileAssociations).
fn is_supported_file(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            matches!(
                ext.to_lowercase().as_str(),
                "md" | "markdown" | "mdx" | "txt" | "text"
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

/// True for the extensions Marky treats as notes.
fn is_note_extension(path: &Path) -> bool {
    path.extension()
        .is_some_and(|ext| ext == "md" || ext == "markdown" || ext == "txt")
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
    app: tauri::AppHandle,
    watcher_state: State<WatcherState>,
) -> Result<(), String> {
    let path = PathBuf::from(&folder_path);

    if !path.exists() || !path.is_dir() {
        return Err("Invalid folder path".to_string());
    }

    let app_clone = app.clone();

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

                            if path.is_dir()
                                || path.extension().is_some_and(|ext| {
                                    ext == "md" || ext == "markdown" || ext == "txt"
                                })
                            {
                                let event_type = match event.kind {
                                    notify::EventKind::Create(_) => "create",
                                    notify::EventKind::Modify(_) => "modify",
                                    notify::EventKind::Remove(_) => "remove",
                                    _ => "other",
                                };

                                let change_event = FileChangeEvent {
                                    event_type: event_type.to_string(),
                                    path: path.to_string_lossy().to_string(),
                                };

                                let _ = app_clone.emit("file-change", change_event);
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

    let mut watcher_guard = watcher_state
        ._watcher
        .lock()
        .map_err(|e| format!("Failed to lock watcher state: {}", e))?;
    *watcher_guard = Some(debouncer);

    Ok(())
}

#[tauri::command]
fn stop_watching(watcher_state: State<WatcherState>) -> Result<(), String> {
    let mut watcher_guard = watcher_state
        ._watcher
        .lock()
        .map_err(|e| format!("Failed to lock watcher state: {}", e))?;
    *watcher_guard = None;
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

/// Windows opened after startup (a note in its own window) inherit the app menu
/// too, and the frontend cannot reach `remove_menu` — the JS API doesn't expose
/// it. Each window asks for this once as it boots.
#[tauri::command]
fn remove_window_menu(window: tauri::WebviewWindow) {
    remove_native_menu(&window);
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(WatcherState {
            _watcher: Arc::new(Mutex::new(None)),
        })
        .manage(PendingOpen(Arc::new(Mutex::new(Vec::new()))))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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

            // View items — prepended before the default "Enter Full Screen"
            let toggle_sidebar = MenuItem::with_id(
                app,
                "menu://toggle-sidebar",
                "Toggle Sidebar",
                true,
                Some("CmdOrCtrl+B"),
            )?;
            let sep_v1 = PredefinedMenuItem::separator(app)?;
            let view_editor = MenuItem::with_id(
                app,
                "menu://view-editor",
                "Editor Only",
                true,
                Some("CmdOrCtrl+1"),
            )?;
            let view_split = MenuItem::with_id(
                app,
                "menu://view-split",
                "Split View",
                true,
                Some("CmdOrCtrl+2"),
            )?;
            let view_preview = MenuItem::with_id(
                app,
                "menu://view-preview",
                "Preview Only",
                true,
                Some("CmdOrCtrl+3"),
            )?;
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
                                &view_editor,
                                &view_split,
                                &view_preview,
                                &sep_v2,
                                &focus_mode,
                                &open_graph,
                                &sep_v3,
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
                    let _ = app.emit("menu://new-note", ());
                }
                "menu://new-folder" => {
                    let _ = app.emit("menu://new-folder", ());
                }
                "menu://open-file" => {
                    let _ = app.emit("menu://open-file", ());
                }
                "menu://open-folder" => {
                    let _ = app.emit("menu://open-folder", ());
                }
                "menu://save-note" => {
                    let _ = app.emit("menu://save-note", ());
                }
                "menu://close-note" => {
                    let _ = app.emit("menu://close-note", ());
                }
                "menu://export-note" => {
                    let _ = app.emit("menu://export-note", ());
                }
                "menu://backup-workspace" => {
                    let _ = app.emit("menu://backup-workspace", ());
                }
                "menu://search" => {
                    let _ = app.emit("menu://search", ());
                }
                "menu://command-palette" => {
                    let _ = app.emit("menu://command-palette", ());
                }
                "menu://toggle-sidebar" => {
                    let _ = app.emit("menu://toggle-sidebar", ());
                }
                "menu://view-editor" => {
                    let _ = app.emit("menu://view-editor", ());
                }
                "menu://view-split" => {
                    let _ = app.emit("menu://view-split", ());
                }
                "menu://view-preview" => {
                    let _ = app.emit("menu://view-preview", ());
                }
                "menu://focus-mode" => {
                    let _ = app.emit("menu://focus-mode", ());
                }
                "menu://open-graph" => {
                    let _ = app.emit("menu://open-graph", ());
                }
                "menu://open-settings" => {
                    let _ = app.emit("menu://open-settings", ());
                }
                "menu://show-shortcuts" => {
                    let _ = app.emit("menu://show-shortcuts", ());
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
            read_note_history,
            append_note_history,
            remove_note_history,
            move_note_history,
            clear_all_history,
            read_all_drafts,
            write_draft,
            remove_draft,
            clear_all_drafts
        ])
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
}
