# Marky - Feature Roadmap & Improvements

This document tracks potential features and improvements for Marky based on codebase analysis.

> **Current Status**: 25+ components, CodeMirror 6 editor, full markdown extensions, fully functional markdown note-taking app

---

## 🎯 High-Impact Features (Build on Existing Infrastructure)

### 1. ⭐ Activate File Watcher System
**Priority**: HIGH | **Difficulty**: Easy | **Status**: ✅ Completed

Infrastructure already exists in `fileSystem.js`!

**Features**:
- [x] Auto-reload notes when changed externally (other editors, git pulls)
- [x] Real-time sync across multiple windows
- [x] Visual indicator when files change (success notification)
- [x] Wire up `watchFolder()` and `stopWatching()` to workspace loading

**Implementation Notes**:
- Functions exist: `watchFolder()`, `stopWatching()` in fileSystem.js
- Connected to workspace loading lifecycle via `useFileWatcher` hook in src/hooks/useFileWatcher.js
- Added file change event handlers that refresh workspace from disk
- Debounced refresh (300ms) to handle rapid changes (git operations)
- Shows "Workspace synced" notification on successful refresh
- Automatically starts watching when a folder is loaded
- Stops watching when component unmounts or folder changes

---

### 2. ⭐ Full-Text Search
**Priority**: HIGH | **Difficulty**: Medium | **Status**: ✅ Completed

Fuzzy search across note names and content with keyboard shortcut.

**Features**:
- [x] Search note content with highlighted results
- [x] Search results preview (show matching lines)
- [x] Fuzzy matching with Fuse.js
- [x] Keyboard shortcut (Cmd/Ctrl+Shift+F)
- [x] Keyboard navigation (Arrow keys, Enter)
- [x] Match score indicator
- [ ] Regular expression support (deferred)
- [ ] Search within tags (deferred)
- [ ] Search history (deferred)
- [ ] Case-sensitive toggle (deferred)

**Implementation Notes**:
- Implemented with Fuse.js for fuzzy search
- SearchModal component with keyboard navigation
- Highlights matching text in titles and shows content preview
- Match score visualization (0-100% relevance)
- Accessible via Cmd/Ctrl+Shift+F keyboard shortcut

---

### 3. Enhanced Backlinks UI
**Priority**: MEDIUM | **Difficulty**: Easy | **Status**: ✅ Completed

Store already computes backlinks, but they're not prominently displayed.

**Features**:
- [x] Dedicated backlinks panel in sidebar (placeholder exists)
- [x] Show backlinks count badge on notes
- [x] Click to navigate to backlink source
- [x] Preview backlink context (surrounding text)
- [ ] Backlinks graph view (deferred)

**Implementation Notes**:
- Data already computed in `notesStore.js`
- Created BacklinkItem component in src/components/Sidebar/BacklinkItem.jsx
- Added collapsible backlinks section in Sidebar with count badge
- Shows context preview for each backlink
- Purple backlink count badge displayed on notes in tree
- Click on backlink navigates to source note

---

### 4. Note History/Version Control
**Priority**: MEDIUM | **Difficulty**: Hard | **Status**: ⏳ Pending

**Features**:
- [ ] Automatic snapshots on save (store in `.marky/history/`)
- [ ] Timeline view to restore previous versions
- [ ] Diff viewer to compare versions
- [ ] Integrate with git if repository detected
- [ ] Configurable retention policy (keep last N versions)

**Implementation Notes**:
- Create `.marky/history/` directory structure
- Store snapshots with timestamp
- Build diff viewer with react-diff-viewer or similar
- Consider git integration via Tauri shell commands

---

## 🎨 UX Improvements

### 5. Better Visual Feedback
**Priority**: HIGH | **Difficulty**: Easy | **Status**: 🔄 Partially Complete

**Features**:
- [x] Confirmation dialogs for destructive actions (delete folder with notes)
- [x] Loading states during folder scanning (spinner with progress indicator)
- [x] Progress indicator for large imports (current/total count with phase info)
- [ ] Better drag-and-drop visual feedback (ghost element, drop zones)
- [ ] Success/error animations
- [x] Undo/redo actions (via CodeMirror 6 built-in history)

**Implementation Notes**:
- ConfirmDialog.jsx extended for delete operations
- Loading progress with `{ current, total, phase }` in notesStore
- Undo/redo provided by CodeMirror 6 editor history
- Remaining: drag-and-drop polish, animations

---

### 6. Advanced Editor Features
**Priority**: HIGH | **Difficulty**: Hard | **Status**: ✅ Completed

Upgraded from textarea to CodeMirror 6 professional editor.

**Features**:
- [x] Integrate CodeMirror 6
- [x] Line numbers with active line gutter
- [x] Syntax highlighting for markdown (headers, links, code, emphasis)
- [x] Bracket matching and auto-closing
- [x] Auto-indent for markdown
- [x] Find within note (in-editor search with highlighting)
- [x] Undo/redo history
- [x] Code folding
- [x] Unsaved changes tracking with visual indicator
- [x] Manual save with Cmd/Ctrl+S
- [x] Status bar with word/character count and reading time
- [x] Find & replace (CodeMirror built-in search panel)
- [ ] Multiple cursors (built-in, needs keybindings)
- [x] Vim keybindings mode (via @replit/codemirror-vim, toggle in Settings)
- [ ] Emacs keybindings mode (future)
- [ ] Spell checker (future)
- [ ] Minimap (future)

**Implementation Notes**:
- ✅ CodeMirror 6 integrated in src/components/editor/
- ✅ Custom dark theme matching Marky's palette (theme.js)
- ✅ CodeMirrorEditor.jsx wrapper component
- ✅ Extensions configured (markdown, line numbers, bracket matching, folding)
- ✅ All existing features preserved (toolbar, search, split view, save)
- ✅ In-editor search with text highlighting
- ✅ Unsaved changes indicator (dot in title bar)
- ✅ Status bar shows word count, character count, reading time
- ✅ Toolbar integration via CodeMirror transactions API
- ✅ Find & replace via CodeMirror search panel
- ✅ Vim mode toggle in EditorSettings.jsx with quick reference card
- Foundation ready for Emacs mode and other advanced features

---

### 7. Improved Graph Visualization
**Priority**: MEDIUM | **Difficulty**: Medium | **Status**: ✅ Completed

Force-directed graph with interactive features, no external dependency.

**Features**:
- [x] Force-directed layout (custom algorithm, no d3 dependency)
- [x] Filter by connection status (All / Connected / Orphaned)
- [x] Node size based on backlinks count
- [x] Click node to open note
- [x] Zoom to fit / reset view controls
- [ ] Export graph as image (PNG/SVG) (deferred)
- [ ] 3D graph view option (deferred)
- [x] Show orphaned notes (filter + stats)

**Implementation Notes**:
- ✅ Custom force-directed layout in GraphModal.jsx (repulsion, spring, gravity, damping)
- ✅ 200-iteration simulation with cooling for stable layouts
- ✅ Hover highlighting with neighbor/edge dimming
- ✅ Node info tooltip (outgoing/incoming link counts)
- ✅ Backlink count badges on nodes
- ✅ Stats display (notes, connections, orphaned count)
- ✅ Theme-aware coloring using CSS variables
- ✅ SVG-based rendering with glow effects
- Remaining: image export, 3D view

---

### 8. Table of Contents
**Priority**: MEDIUM | **Difficulty**: Easy | **Status**: ✅ Completed

**Features**:
- [x] Auto-generate TOC from markdown headers
- [x] Collapsible TOC panel with header count badge
- [x] Click to scroll to section
- [x] Active section highlighting with accent color
- [x] Show heading levels (h1-h6) with indented hierarchy
- [ ] Copy link to heading (deferred)

**Implementation Notes**:
- Created TableOfContents.jsx component in src/components/TableOfContents.jsx
- Parses both ATX-style (`# Header`) and Setext-style headers
- Uses slugify.js (src/utils/slugify.js) for heading IDs
- Smooth scrolling to sections with left border active indicator
- Collapsible panel with header count badge

---

## 📋 Content Management

### 9. Enhanced Tag System
**Priority**: MEDIUM | **Difficulty**: Medium | **Status**: ⏳ Pending

Tags are extracted but not managed.

**Features**:
- [ ] Tag manager UI (rename, merge, delete tags)
- [ ] Tag hierarchy with `/` (e.g., `#project/frontend`)
- [ ] Tag cloud visualization
- [ ] Bulk tag operations
- [ ] Tag suggestions while typing
- [ ] Tag colors/icons
- [ ] Most used tags widget

**Implementation Notes**:
- Add TagManager.jsx component
- Create tag hierarchy parser
- Add tag autocomplete in editor
- Store tag metadata in settings

---

### 10. Note Templates Enhancement
**Priority**: LOW | **Difficulty**: Medium | **Status**: ⏳ Pending

**Features**:
- [ ] Template variables: `{{date}}`, `{{time}}`, `{{title}}`
- [ ] Template preview before creation
- [ ] Import/export template collections
- [ ] Template categories
- [ ] Community template marketplace (future)

**Implementation Notes**:
- Add template variable parser
- Extend TemplateModal.jsx
- Create template exchange format (JSON)

---

### 11. Note Linking Improvements
**Priority**: HIGH | **Difficulty**: Medium | **Status**: ✅ Mostly Complete

**Features**:
- [x] Alias support: `[[Note Name|Display Text]]`
- [x] Link existence checking (broken links styled differently)
- [x] Autocomplete for `[[` wiki links (show existing notes)
- [x] Create note from broken link (one-click modal)
- [ ] Block references: `[[Note#heading]]`
- [ ] Embed notes: `![[Note]]`
- [ ] Link previews on hover

**Implementation Notes**:
- ✅ Alias support implemented in wikiLinkExtension (MarkdownEditor.jsx)
- ✅ Link existence checking via findNoteByLinkTarget in notesStore
- ✅ Broken links styled with red color, working links with accent color
- ✅ Wiki link autocomplete in src/components/editor/wikiLinkAutocomplete.js (triggers on `[[`)
- ✅ CreateNoteModal.jsx for creating notes from broken links
- Remaining: block references, note embedding, link hover previews

---

## 💾 Export & Backup

### 12. Workspace Backup
**Priority**: MEDIUM | **Difficulty**: Medium | **Status**: ✅ Completed

**Features**:
- [x] Export entire workspace as `.zip`
- [x] Include structure, metadata, settings
- [ ] Scheduled auto-backups (deferred)
- [ ] Restore from backup (deferred)
- [ ] Backup to external location (deferred)
- [ ] Cloud backup integration (optional, deferred)

**Implementation Notes**:
- ✅ JSZip library integrated for zip creation
- ✅ src/utils/backup.js with `exportWorkspaceAsZip()` function
- ✅ Preserves folder structure with relative paths
- ✅ Includes `.marky-settings.json` (theme, accent, vim mode)
- ✅ Includes `.marky-manifest.json` (export date, note/folder count, version)
- ✅ Export button in Settings page (Backup section)
- ✅ "Backup Workspace" command in Command Palette
- ✅ Native save dialog for choosing export location
- Remaining: auto-backups, restore from backup, cloud integration

---

### 13. Enhanced Export Options
**Priority**: LOW | **Difficulty**: Medium | **Status**: ⏳ Pending

**Features**:
- [ ] Export multiple notes at once
- [ ] Export folder as single document
- [ ] DOCX export (via Pandoc or library)
- [ ] Confluence/Notion format export
- [ ] Email note as HTML
- [ ] Print stylesheet optimization

**Implementation Notes**:
- Extend ExportModal.jsx
- Consider Pandoc integration via Tauri
- Add batch export UI
- Create export templates

---

## ⚡ Performance & Quality of Life

### 14. Performance Optimizations
**Priority**: MEDIUM | **Difficulty**: Medium | **Status**: 🔄 Partially Complete

**Features**:
- [ ] Virtual scrolling for large note lists (react-window)
- [x] Debounced metadata updates (1s debounce on tag/link extraction)
- [ ] Lazy load folder contents (don't scan until expanded)
- [ ] Web Workers for markdown parsing
- [x] Memoize expensive computations (debounced metadata extraction separated from instant content updates)
- [ ] Pagination for large folders
- [ ] Image lazy loading in preview

**Implementation Notes**:
- ✅ `scheduleMetadataUpdate()` in notesStore separates fast UI updates from expensive regex operations
- ✅ `pendingMetadataTimers` Map manages debounced update queue
- Remaining: virtual scrolling, Web Workers, lazy loading, pagination

---

### 15. Quick Actions & Command Palette
**Priority**: HIGH | **Difficulty**: Medium | **Status**: ✅ Completed

Add `Cmd/Ctrl+K` style command palette.

**Features**:
- [x] Quick note switcher (fuzzy search)
- [x] Quick actions (create, search, export)
- [x] Navigate to note by title
- [x] Execute keymaps from palette
- [x] Keyboard navigation (Arrow keys, Enter, Esc)
- [x] Category grouping (File Operations, Navigation, View, Tools, Help)
- [ ] Recent commands (deferred)
- [ ] Plugin commands (future)

**Implementation Notes**:
- Created CommandPalette.jsx component in src/components/CommandPalette.jsx
- Uses Fuse.js for fuzzy search across commands and notes
- Keyboard shortcut: Cmd/Ctrl+K
- Commands grouped by category with icons
- Searches both commands and notes simultaneously
- Visual feedback with selected state and keyboard hints

---

### 16. Note Metadata Panel
**Priority**: LOW | **Difficulty**: Easy | **Status**: ⏳ Pending

**Features**:
- [ ] Word count, character count
- [ ] Reading time estimate
- [ ] Creation/modification dates
- [ ] Linked notes count
- [ ] Tag list
- [ ] File size
- [ ] Note statistics dashboard

**Implementation Notes**:
- Add MetadataPanel.jsx component
- Position in sidebar or as modal
- Add to editor status bar
- Real-time updates

---

## 🔧 Technical Improvements

### 17. TypeScript Migration
**Priority**: MEDIUM | **Difficulty**: Hard | **Status**: ⏳ Pending

Convert codebase from JavaScript to TypeScript.

**Benefits**:
- [ ] Better autocomplete
- [ ] Catch bugs early
- [ ] Easier refactoring
- [ ] Self-documenting code

**Implementation Notes**:
- Migrate incrementally (start with utils/)
- Add type definitions for stores
- Use strict mode
- Document complex types

---

### 18. Testing Infrastructure
**Priority**: MEDIUM | **Difficulty**: Medium | **Status**: ⏳ Pending

**Features**:
- [ ] Vitest for unit tests
- [ ] Test critical store logic
- [ ] Test file system operations
- [ ] Component testing with React Testing Library
- [ ] E2E tests with Playwright
- [ ] CI/CD pipeline

**Implementation Notes**:
- Start with utils and store tests
- Add test scripts to package.json
- Aim for >70% code coverage
- Mock Tauri commands for testing

---

### 19. Plugin System Architecture
**Priority**: LOW | **Difficulty**: Very Hard | **Status**: ⏳ Pending

Design for extensibility.

**Features**:
- [ ] Plugin API for markdown extensions
- [ ] Custom themes via JSON/CSS
- [ ] Export format plugins
- [ ] Editor toolbar plugins
- [ ] Sidebar panel plugins
- [ ] Plugin marketplace
- [ ] Plugin manager UI

**Implementation Notes**:
- Design plugin manifest format
- Create plugin sandbox environment
- Add lifecycle hooks
- Document plugin API

---

## 🌟 Advanced Features

### 20. Markdown Extensions
**Priority**: MEDIUM | **Difficulty**: Medium | **Status**: ✅ Mostly Complete

Add support for advanced markdown features.

**Features**:
- [x] Tables (GitHub Flavored Markdown)
- [x] Footnotes (via marked-footnote)
- [x] Task lists with checkboxes `- [ ]`
- [x] Mermaid diagrams (lazy-loaded)
- [x] Math equations (KaTeX - inline and block)
- [ ] Embedded media (images, videos)
- [ ] Definition lists
- [x] Strikethrough

**Implementation Notes**:
- ✅ Extended marked.js with marked-footnote and marked-katex-extension
- ✅ Mermaid.js integrated with lazy loading for diagrams
- ✅ KaTeX for inline ($...$) and block ($$...$$) math
- ✅ Toolbar updated with Insert tab for tables, code blocks, footnotes, math, mermaid
- ✅ Preview styling updated in MarkdownPreview.css
- Remaining: embedded media support, definition lists

---

### 21. Multi-Workspace Support
**Priority**: LOW | **Difficulty**: Medium | **Status**: ⏳ Pending

**Features**:
- [ ] Switch between workspaces
- [ ] Recent workspaces list
- [ ] Workspace-specific settings
- [ ] Workspace templates
- [ ] Import/export workspace config

**Implementation Notes**:
- Add workspace switcher to TitleBar
- Store workspace list in settings
- Separate state per workspace
- Add workspace creation wizard

---

### 22. Note Encryption
**Priority**: LOW | **Difficulty**: Hard | **Status**: ⏳ Pending

**Features**:
- [ ] Encrypt sensitive notes with password
- [ ] Per-note encryption toggle
- [ ] Encrypted search (decrypt on-demand)
- [ ] Master password management
- [ ] Encryption indicator in UI

**Implementation Notes**:
- Use Web Crypto API or similar
- Store encrypted content as base64
- Add password prompt modal
- Consider security implications carefully

---

### 23. Focus Mode
**Priority**: LOW | **Difficulty**: Easy | **Status**: ✅ Completed

**Features**:
- [x] Distraction-free writing (hide sidebar, toolbar, title bar, status bar)
- [x] Centered editor with max-width for readability
- [ ] Typewriter mode (keep cursor centered) (deferred)
- [ ] Word count goals (deferred)
- [ ] Pomodoro timer integration (deferred)
- [ ] Ambient sounds (optional, deferred)

**Implementation Notes**:
- ✅ Toggle via Cmd/Ctrl+Shift+Enter keyboard shortcut
- ✅ Press Escape to exit focus mode
- ✅ Hides sidebar, title bar, toolbar, status bar, resize handle
- ✅ Editor centered with `max-w-3xl mx-auto` for comfortable reading width
- ✅ State managed in uiStore.js (`focusMode` boolean)
- ✅ "Toggle Focus Mode" command in Command Palette
- ✅ No new component needed — pure conditional CSS classes
- Remaining: typewriter mode, word count goals, pomodoro

---

### 24. Automatic BiDi / RTL Support
**Priority**: HIGH | **Difficulty**: Medium | **Status**: ✅ Completed

Zero-config, seamless per-line direction detection for RTL languages (Arabic, Hebrew, Persian, etc.).

**Features**:
- [x] Per-line BiDi detection in editor (RTL lines auto-render RTL, LTR stays LTR)
- [x] Preview auto-direction on block elements (paragraphs, headings, lists, blockquotes, table cells)
- [x] CSS logical properties throughout (border-inline-start, padding-inline-start, etc.)
- [x] Code blocks always render LTR
- [x] App shell (sidebar, title bar, toolbar) remains LTR

**Implementation Notes**:
- ✅ CodeMirror `EditorView.perLineTextDirection.of(true)` in extensions.js
- ✅ Editor theme converted to CSS logical properties (theme.js)
- ✅ `dir="auto"` on preview container and all block-level marked.js renderers
- ✅ MarkdownPreview.css converted to logical properties (13+ rules)
- ✅ Blockquote border-radius handled with `[dir="rtl"]` selector
- ✅ Task list checkboxes preserved for existing interaction code compatibility
- No manual toggle needed — fully automatic Unicode Bidi Algorithm

---

## 📊 Top 5 Recommendations (Prioritized)

Based on impact vs. effort analysis:

1. **✅ Activate File Watcher** - Infrastructure ready, huge UX win
2. **✅ Full-Text Search** - Essential for larger note collections
3. **✅ Better Editor (CodeMirror 6)** - Professional editing experience
4. **✅ Command Palette** - Fast navigation and actions
5. **✅ Enhanced Backlinks UI** - Data already computed, make it visible!

**🎉 Top 5 Complete! Second Wave Also Complete:**
1. **✅ CodeMirror 6 Integration** - Professional editor with Vim mode, find & replace
2. **✅ Note Linking Autocomplete** - `[[` autocomplete for wiki links
3. **✅ Table of Contents** - Auto-generated TOC for long notes
4. **✅ Markdown Extensions** - Tables, task lists, Mermaid, KaTeX, footnotes
5. **⭐ Workspace Backup** - Export/import workspace as .zip

**🎉 Third Wave Complete:**
1. **✅ Automatic BiDi/RTL Support** - Seamless per-line RTL detection, CSS logical properties
2. **✅ Focus Mode** - Distraction-free writing with Cmd+Shift+Enter toggle
3. **✅ Improved Graph Visualization** - Force-directed layout, filtering, hover highlighting
4. **✅ Workspace Backup** - Export as .zip with settings and metadata

**🔥 Next Priorities:**
1. **⭐ Note History/Version Control** - Snapshots, diff viewer, timeline
2. **⭐ Enhanced Tag System** - Tag manager, hierarchy, autocomplete
3. **⭐ Multi-Workspace Support** - Switch between workspaces
4. **⭐ TypeScript Migration** - Incremental type safety
5. **⭐ Testing Infrastructure** - Vitest, component tests, E2E

---

## ✅ Quick Wins (Easy Implementation)

These can be implemented quickly for immediate value:

- [x] Add confirmation dialogs for delete operations (already existed!)
- [x] Show word count in editor status bar (with character count and reading time)
- [x] Keyboard shortcut for command palette (Cmd/Ctrl+K)
- [x] Add loading indicator during folder scans (spinner with "Scanning folder..." text)
- [x] Note sorting options (name A-Z/Z-A, date newest/oldest)
- [x] Sidebar search with clear button (already existed!)
- [x] Add "Create note from link" for broken wiki links (CreateNoteModal.jsx)
- [x] Export workspace as backup zip
- [ ] Recent notes limit setting
- [ ] Double-click to rename files

---

## 📈 Analytics & Tracking

Consider adding (optional, privacy-first):

- [ ] Usage statistics (notes created, editing time)
- [ ] Most edited notes
- [ ] Writing streaks
- [ ] Local analytics dashboard
- [ ] Export statistics

---

## 🐛 Bug Fixes & Polish

Track known issues:

- [ ] Improve drag-and-drop edge cases
- [ ] Better error messages for file operations
- [ ] Handle very long note names (truncate with tooltip)
- [ ] Fix markdown preview scroll sync
- [ ] Improve theme switching performance
- [ ] Handle special characters in file names

---

## 🎨 UI/UX Polish

Small improvements for better experience:

- [ ] Smooth animations for folder expand/collapse
- [ ] Better empty states (no notes, no search results)
- [ ] Keyboard navigation for sidebar
- [ ] Context menu animations
- [ ] Better focus indicators for accessibility
- [ ] Tooltip delays optimization
- [ ] Icon consistency audit

---

## 📝 Documentation

- [ ] User guide / Help documentation
- [ ] Keyboard shortcuts reference card
- [ ] Video tutorials
- [ ] FAQ section
- [ ] Contribution guidelines
- [ ] Plugin development guide

---

## 🚀 Future Vision

Long-term ambitious features:

- [ ] Mobile app (iOS/Android)
- [ ] Cloud sync (optional, privacy-focused)
- [ ] Collaborative editing (local network)
- [ ] Web clipper browser extension
- [ ] API for third-party integrations
- [ ] CLI for automation
- [ ] AI-powered features (summarization, suggestions)

---

## ✨ Community Features

Build ecosystem:

- [ ] Template marketplace
- [ ] Theme gallery
- [ ] Plugin directory
- [ ] Community forum
- [ ] Feature voting system
- [ ] Showcase gallery

---

## 📌 Notes

**Current Codebase Stats**:
- Components: 25+ (including editor sub-components)
- Stores: 3 (notesStore, settingsStore, uiStore)
- Themes: 6 (Midnight, Charcoal, Slate, Snow, Gruvbox Dark, Gruvbox Light)
- Templates: 6 built-in + custom
- Keyboard Shortcuts: 18+ customizable

**Tech Stack**:
- Frontend: React 18, Vite, Tailwind CSS 4
- Editor: CodeMirror 6 (with Vim mode via @replit/codemirror-vim)
- State: Zustand with persist
- Backend: Tauri 2, Rust
- Markdown: marked.js + marked-footnote + marked-katex-extension
- Syntax Highlighting: highlight.js
- Diagrams: Mermaid.js
- Math: KaTeX
- Search: Fuse.js (fuzzy search)
- Backup: JSZip

**Infrastructure Ready**:
- ✅ File watcher (active, debounced)
- ✅ Scheduled notes engine
- ✅ Backlinks computation + UI
- ✅ Tag extraction
- ✅ Theme system
- ✅ Export framework
- ✅ Wiki link autocomplete
- ✅ Settings page with organized sections
- ✅ BiDi/RTL auto-detection (editor + preview)
- ✅ Focus mode (Cmd+Shift+Enter)
- ✅ Force-directed graph visualization
- ✅ Workspace backup (zip export)

---

**Last Updated**: 2026-02-04 (BiDi RTL Support, Focus Mode, Graph Visualization, Workspace Backup completed!)
**Maintained By**: Marky Development Team
