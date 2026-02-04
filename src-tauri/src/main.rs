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
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter, Manager, State,
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
    _watcher: Arc<Mutex<Option<notify_debouncer_full::Debouncer<notify::RecommendedWatcher, notify_debouncer_full::FileIdMap>>>>,
}

fn ensure_valid_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Name cannot be empty".to_string());
    }

    if name.contains(['/', '\\']) {
        return Err("Name cannot contain path separators".to_string());
    }

    if name
        .chars()
        .any(|c| matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*'))
    {
        return Err("Name contains invalid characters".to_string());
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
fn copy_entries_to_folder(source_paths: Vec<String>, dest_folder_path: String) -> Result<Vec<String>, String> {
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
            fs::copy(&source, &target)
                .map_err(|e| format!("Failed to copy file: {}", e))?;
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
        .manage(WatcherState {
            _watcher: Arc::new(Mutex::new(None)),
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .menu(|app| {
            let menu = Menu::default(app)?;

            let new_note = MenuItem::with_id(
                app,
                "menu://new-note",
                "New Note",
                true,
                Some("CmdOrCtrl+N"),
            )?;
            let new_folder =
                MenuItem::with_id(app, "menu://new-folder", "New Folder", true, None::<&str>)?;
            let open_file = MenuItem::with_id(
                app,
                "menu://open-file",
                "Open File...",
                true,
                Some("CmdOrCtrl+O"),
            )?;
            let open_folder = MenuItem::with_id(
                app,
                "menu://open-folder",
                "Open Folder...",
                true,
                None::<&str>,
            )?;
            let save_note =
                MenuItem::with_id(app, "menu://save-note", "Save", true, Some("CmdOrCtrl+S"))?;
            let close_note =
                MenuItem::with_id(app, "menu://close-note", "Close Note", true, Some("CmdOrCtrl+W"))?;
            let separator_one = PredefinedMenuItem::separator(app)?;
            let separator_two = PredefinedMenuItem::separator(app)?;
            let separator_three = PredefinedMenuItem::separator(app)?;

            let workspace = Submenu::with_items(
                app,
                "Workspace",
                true,
                &[
                    &new_note,
                    &new_folder,
                    &separator_one,
                    &open_file,
                    &open_folder,
                    &separator_two,
                    &save_note,
                    &close_note,
                    &separator_three,
                ],
            )?;

            menu.append(&workspace)?;
            Ok(menu)
        })
        .on_menu_event(|app, event| {
            let event_id = event.id().as_ref();
            
            // Handle recent note clicks
            if event_id.starts_with("recent://") {
                let path = event_id.strip_prefix("recent://").unwrap_or("");
                let _ = app.emit("open-recent-note", path.to_string());
                return;
            }
            
            // Handle regular menu items
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
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}