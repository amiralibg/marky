# Marky TODO (Audit-Based Roadmap)

Last reviewed: 2026-02-26

This file is a forward-looking roadmap based on the current codebase state (not a historical changelog).
It separates already-shipped features from the next recommended work.

## Current Feature Audit (Confirmed in Code)

### Core app and workspace
- [x] Local-first workspace folder open/load (Tauri file system)
- [x] Folder + note tree with nested folders
- [x] Multi-tab note editing
- [x] Create, rename, delete, move notes/folders
- [x] Drag-and-drop reorganization in sidebar
- [x] Undo last delete (trash-like restore for recent delete action)
- [x] File watcher sync for external changes (debounced refresh)
- [x] Notifications/toasts for actions and errors
- [x] Onboarding + workspace-required modal flows

### Editor and preview
- [x] CodeMirror 6 markdown editor
- [x] Split / editor-only / preview-only modes
- [x] Save with keyboard shortcut and unsaved-change tracking
- [x] In-editor find/replace (CodeMirror search)
- [x] Vim mode toggle
- [x] Word/character/read-time status feedback
- [x] Wiki links (`[[Note]]` and alias support)
- [x] Create note from broken wiki link flow
- [x] Markdown preview with syntax highlighting
- [x] Mermaid rendering (lazy-loaded)
- [x] KaTeX math support
- [x] Footnotes support
- [x] Table of contents panel
- [x] Automatic BiDi/RTL handling in editor and preview

### Navigation and discovery
- [x] Global search modal (Fuse.js; title + content)
- [x] Command palette (notes + commands)
- [x] Backlinks computation and sidebar UI
- [x] Graph view modal (interactive force-directed graph)
- [x] Recent notes section
- [x] Pinned notes support
- [x] Tag extraction and sidebar tag filtering
- [x] Sidebar search and sort options

### Templates, scheduling, export
- [x] Built-in templates + custom templates
- [x] Scheduled note creation (daily/weekly/monthly)
- [x] Scheduled notes management in Settings
- [x] Per-note export modal (Markdown / HTML / print-friendly HTML for PDF workflow / copy HTML)
- [x] Workspace backup export to ZIP (with settings + manifest)

### Settings and customization
- [x] Multiple themes (dark/light variants)
- [x] Accent color customization
- [x] Keyboard shortcuts customization
- [x] Keyboard shortcuts modal/help UI
- [x] Focus mode (distraction-free writing)

## Recommended Roadmap (What We Should Build Next)

## P0: Data safety and trust (highest impact)
- [ ] Note history snapshots and restore UI
- [ ] Backup restore (import workspace ZIP back into a folder)
- [ ] Crash-safe recovery for unsaved edits (draft/session recovery)
- [ ] Conflict handling for external file changes while note has unsaved edits
- [ ] Clearer file-operation error messages (permissions, missing files, name conflicts)

Why first:
- These improve trust and reduce risk of data loss, which matters more than adding new UI features.

## P1: Search and organization upgrades (build on existing infrastructure)
- [ ] Search filters (title/content/tags/path)
- [ ] Case-sensitive and exact-match toggles in search
- [ ] Regex search option (advanced mode)
- [ ] Search result grouping by note/path
- [ ] Saved searches / recent searches
- [ ] Tag manager UI (rename/merge/delete tags across notes)
- [ ] Tag autocomplete while typing `#tags`
- [ ] Tag panel counts + sort modes (A-Z / frequency / recent)

Why next:
- Tag extraction/filtering and Fuse search already exist, so these are high leverage improvements.

## P2: Editing workflow polish
- [ ] True autosave setting (configurable debounce) with visible status
- [ ] Double-click to rename note/folder in sidebar
- [ ] Better drag-and-drop feedback (drop targets, insertion markers)
- [ ] Sidebar keyboard navigation (arrows, rename, delete, move)
- [ ] Preview scroll sync with editor (basic line/heading sync)
- [ ] Typewriter mode in Focus Mode
- [ ] Better empty states (no notes, no results, no tags)

## P3: Export and portability
- [ ] Native PDF export (real PDF generation, not print-HTML workaround)
- [ ] Batch export (selected notes / whole folder)
- [ ] Restore/export settings-only JSON
- [ ] Graph export as PNG/SVG
- [ ] Import/export custom templates collection

## P4: Workspace and scale
- [ ] Multi-workspace switcher (recent workspaces list)
- [ ] Workspace-specific settings profiles
- [ ] Open recent workspace on startup (optional)
- [ ] Performance pass for very large vaults (incremental indexing / memoized selectors)
- [ ] Virtualized sidebar tree for large note collections

## P5: Developer quality / maintainability
- [ ] Test setup (Vitest + React Testing Library)
- [ ] Core store tests (notesStore actions, scheduling logic, backlinks/tags parsing)
- [ ] Tauri integration smoke tests for file operations
- [ ] Incremental TypeScript migration (stores + utils first)
- [ ] Lint/format consistency and CI pipeline

## Bugs and UX Polish (Keep Updated)
- [ ] Drag/drop edge cases (nested drops, root drops, external file drop feedback)
- [ ] Long file names truncation + tooltip consistency
- [ ] Special character / unicode filename edge cases on rename/move
- [ ] Theme switch flicker/performance polish
- [ ] Accessibility pass: focus visibility, ARIA labels, modal trap checks
- [ ] Reduce noisy success toasts for frequent file watcher sync events (optional throttle)

## Nice-to-Have / Future Exploration
- [ ] Note version diff viewer
- [ ] Emacs keybindings mode
- [ ] Workspace statistics dashboard (local only)
- [ ] Encryption for selected notes (careful design required)
- [ ] Plugin/extension API (after core app stabilizes)
- [ ] Optional cloud sync (only after conflict/history model is robust)

## Not Prioritized Right Now
- [ ] Mobile app
- [ ] Collaboration / multi-user editing
- [ ] AI features (summaries, suggestions)

Reason:
- The product still has higher-value local-first reliability and workflow improvements to finish first.

## Notes for Future TODO Updates
- When adding a feature here, include one line on user value and one line on dependencies.
- Keep shipped features in the audit section and avoid turning this file into a changelog.
- If a feature is partially implemented, split it into shipped vs missing sub-items.
