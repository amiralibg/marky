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
    Emitter, State,
};

#[derive(Debug, Serialize, Deserialize)]
struct MarkdownFile {
    name: String,
    path: String,
    is_dir: bool,
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

#[tauri::command]
fn scan_folder_for_markdown(folder_path: String) -> Result<Vec<MarkdownFile>, String> {
    let path = PathBuf::from(&folder_path);

    if !path.exists() {
        return Err("Folder does not exist".to_string());
    }

    if !path.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let mut markdown_files = Vec::new();

    fn scan_directory(dir: &PathBuf, files: &mut Vec<MarkdownFile>) -> Result<(), String> {
        let entries = fs::read_dir(dir).map_err(|e| format!("Failed to read directory: {}", e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();

            if file_name.starts_with('.') {
                continue;
            }

            if path.is_dir() {
                files.push(MarkdownFile {
                    name: file_name,
                    path: path.to_string_lossy().to_string(),
                    is_dir: true,
                });

                scan_directory(&path, files)?;
            } else if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext == "md" || ext == "markdown" || ext == "txt" {
                        files.push(MarkdownFile {
                            name: file_name,
                            path: path.to_string_lossy().to_string(),
                            is_dir: false,
                        });
                    }
                }
            }
        }

        Ok(())
    }

    scan_directory(&path, &mut markdown_files)?;

    Ok(markdown_files)
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
                                || path.extension().map_or(false, |ext| {
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
                            } else {
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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(WatcherState {
            _watcher: Arc::new(Mutex::new(None)),
        })
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
            open_recent_note
        ])
        .setup(|_app| {
            #[cfg(not(target_os = "macos"))]
            {
                let window = _app.get_webview_window("main").unwrap();
                let _ = window.set_decorations(false);
            }

            #[cfg(debug_assertions)]
            {
                let window = _app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
