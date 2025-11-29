# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Marky is a **cross-platform desktop application** for markdown note-taking built with Tauri and React. It's an **offline-first** app focused on creating and editing markdown files directly on the file system. Features include:

- **File System First**: Open and edit actual `.md` files on your computer
- **Folder Support**: Import entire folders with nested structure preserved
- **Drag & Drop**: Reorganize files and folders in the sidebar (moves actual files in file system)
- **Split-Pane Editor**: Live markdown preview alongside editing
- **Cross-Platform**: Works on macOS, Windows, and Linux with native title bar
- **Workspace Persistence**: Your loaded files and folders are remembered between sessions
- **Onboarding**: Helpful modal on first launch to guide users

## Development Commands

**Start Tauri development (desktop app):**
```bash
pnpm tauri:dev
```

**Build Tauri app for production:**
```bash
pnpm tauri:build
```

**Lint code:**
```bash
pnpm lint
```

## Architecture

### Desktop Application Structure

Marky is a pure desktop application built with:
- **Frontend**: React (no routing, single-window app)
- **Backend**: Tauri (Rust)
- **State**: Zustand (in-memory only, no localStorage)
- **Styling**: Tailwind CSS with dark theme

### State Management

The app uses **Zustand** for in-memory state management in [src/store/notesStore.js](src/store/notesStore.js):

- **Folder hierarchy**: Supports nested folders with tree structure
- **Items array**: Contains both folders (`type: 'folder'`) and notes (`type: 'note'`)
- **File tracking**: Notes can have associated `filePath` for saved .md files
- **Expansion state**: Tracks which folders are expanded/collapsed

**Key store methods:**
- `createFolder(parentId)` - Create new folder
- `createNote(parentId)` - Create new note in folder
- `loadNoteFromFile(fileData, parentId)` - Import .md file
- `deleteItem(itemId)` - Delete folder/note (cascades to children)
- `renameItem(itemId, newName)` - Rename folder/note
- `moveItem(itemId, newParentId)` - Move item to different folder
- `toggleFolder(folderId)` - Expand/collapse folder

### Component Architecture

**Core Components:**

1. **App** ([src/App.jsx](src/App.jsx))
   - Main application container
   - Single-window layout with sidebar and editor
   - No routing - pure desktop app structure

2. **Sidebar** ([src/components/Sidebar.jsx](src/components/Sidebar.jsx))
   - Native tree view with folder hierarchy
   - Drag-free folder/note organization
   - Context menu for actions (right-click)
   - Inline renaming support
   - File operations toolbar (New, Open, Save)

3. **MarkdownEditor** ([src/components/MarkdownEditor.jsx](src/components/MarkdownEditor.jsx))
   - Three view modes: Editor only, Preview only, Split view
   - Live markdown rendering with `marked` library
   - Integrated formatting toolbar
   - Shows current note name and file path in title bar

4. **Toolbar** ([src/components/Toolbar.jsx](src/components/Toolbar.jsx))
   - Markdown formatting buttons (Bold, Italic, Headers, etc.)
   - Calls `insertMarkdown()` to wrap selected text
   - Native button styling (VS Code-inspired)

### Desktop Features

**File System Integration** ([src/utils/fileSystem.js](src/utils/fileSystem.js)):
- `openMarkdownFile()` - Native file picker for opening single .md file
- `openFolder()` - Native folder picker, scans for all markdown files recursively
- `saveMarkdownFile(content, path)` - Save note to disk
- `readMarkdownFile(path)` - Read file content (lazy loading)
- `isTauriApp()` - Detect if running in Tauri environment

**Important**: Tauri v2 dialog API returns string paths directly, not objects

**Keyboard Shortcuts** (implemented in Sidebar):
- `Ctrl/Cmd + N` - New note
- `Ctrl/Cmd + O` - Open file
- `Ctrl/Cmd + S` - Save file
- `Ctrl/Cmd + Shift + S` - Save as

**Context Menu**:
- Right-click folders: New Note, New Folder, Delete
- Right-click notes: Delete

### Styling System

The app uses **Tailwind CSS** with a VS Code-inspired dark theme defined in [src/index.css](src/index.css):

**Color Palette** (VS Code Dark Theme):
- Background: `#1e1e1e` (editor)
- Sidebar: `#252526`
- Titlebar: `#2d2d30`
- Borders: `#3c3c3c`, `#454545`
- Text: `#d4d4d4` (primary), `#cccccc` (secondary), `#858585` (muted)
- Accent: `#007acc` (blue)

**Design Principles**:
- Native desktop look and feel
- No web gradients or glassmorphism
- Subtle borders and backgrounds
- Consistent spacing and typography
- Dark theme throughout

## Key Technical Details

**Markdown Rendering:**
- Uses `marked` library for markdown-to-HTML conversion
- Preview rendered with `dangerouslySetInnerHTML`
- Custom dark theme styling in [src/components/MarkdownPreview.css](src/components/MarkdownPreview.css)

**Folder Management:**
- Tree structure with recursive rendering
- Folders expand/collapse on click
- Items sorted: folders first, then alphabetically
- Visual indicators for folder state (chevron rotation)
- Drag-and-drop to move files between folders (moves actual files in file system)

**File Path Tracking:**
- Notes store absolute file paths when saved
- Green checkmark indicator for saved notes
- Auto-saves use existing path, Save As prompts for new path

**Context Menu:**
- Native-feeling right-click menu
- Position follows cursor
- Click outside to dismiss
- Actions specific to item type

**Persistence:**
- Uses Zustand persist middleware to save workspace to localStorage
- All loaded files, folders, and their structure are automatically saved
- Workspace persists between app sessions

## Tauri Configuration

Tauri configuration is located in [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json):

- **Window settings**: Default size 1200x800, minimum 800x600
- **Plugins enabled**: `dialog` (file pickers), `fs` (file system access)
- **Build configuration**: Uses Vite for frontend bundling
- **Icons**: Place app icons in [src-tauri/icons/](src-tauri/icons/) directory

Required icon formats:
- `32x32.png`, `128x128.png`, `128x128@2x.png`
- `icon.icns` (macOS)
- `icon.ico` (Windows)

## Package Manager

This project uses **pnpm**. Always use `pnpm` commands instead of npm or yarn.

## Building for Production

**Prerequisites:**
1. Install Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
2. Install pnpm dependencies: `pnpm install`

**Build installers:**
```bash
pnpm tauri:build
```

This creates platform-specific installers in `src-tauri/target/release/bundle/`:
- **macOS**: `.dmg` and `.app`
- **Windows**: `.msi` and `.exe`
- **Linux**: `.deb`, `.AppImage`

## Important Notes

- This is a **pure desktop application** - no web browser compatibility
- **Offline-first**: All operations work without internet
- **File system native**: Edits save directly to `.md` files on disk
- No React Router - single-window app design
- No localStorage - files are the source of truth
- All file operations use native Tauri APIs
- UI follows desktop app conventions (context menus, tree views, drag-drop)

## Known Issues & Solutions

**Tauri Dialog API (v2):**
- `open()` and `save()` return **string paths directly**, not `{path: string}` objects
- Always handle both formats: `typeof selected === 'string' ? selected : selected.path`

**Folder Loading:**
- Rust backend scans recursively and returns flat array
- Frontend builds tree by matching path prefixes
- Parent folders must be created before children (sorted in order)

## Future Enhancements

- Consider **shadcn/ui** for polished components while maintaining unique design
- File watchers to auto-reload when files change externally
- Search across all loaded files
- Git integration for version control
