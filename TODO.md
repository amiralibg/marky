# Marky TODO (Audit-Based Roadmap)

Last reviewed: 2026-03-27
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
- [x] Note history snapshots and restore UI
- [x] Backup restore (import workspace ZIP back into a folder)
- [x] Crash-safe recovery for unsaved edits (draft/session recovery)
- [x] Conflict handling for external file changes while note has unsaved edits
- [x] Clearer file-operation error messages (permissions, missing files, name conflicts)

Why first:
- These improve trust and reduce risk of data loss, which matters more than adding new UI features.

## P1: Search and organization upgrades (build on existing infrastructure)
- [x] Search filters (title/content/tags/path)
- [x] Case-sensitive and exact-match toggles in search
- [x] Regex search option (advanced mode)
- [x] Search result grouping by note/path
- [x] Saved searches / recent searches
- [x] Tag manager UI (rename/merge/delete tags across notes)
- [x] Tag autocomplete while typing `#tags`
- [x] Tag panel counts
- [x] Tag panel sort modes (A-Z / frequency / recent)

Why next:
- Tag extraction/filtering and Fuse search already exist, so these are high leverage improvements.

## P2: Editing workflow polish
- [x] True autosave setting (configurable debounce) with visible status
- [x] Double-click to rename note/folder in sidebar
- [x] Better drag-and-drop feedback (drop targets, insertion markers)
- [x] Sidebar keyboard navigation (arrows)
- [x] Sidebar keyboard actions (rename, delete, move)
- [x] Preview scroll sync with editor (basic line/heading sync)
- [x] Typewriter mode in Focus Mode
- [x] Better empty states (no notes, no results, no tags)

## P3: Export and portability
- [x] Native PDF export (real PDF generation, not print-HTML workaround)
- [x] Batch export (selected notes / whole folder)
- [x] Restore/export settings-only JSON
- [x] Graph export as PNG/SVG — _doable without new packages via Canvas/SVG DOM serialisation; a library like `html-to-image` would make it significantly cleaner_
- [x] Import/export custom templates collection

## P4: Workspace and scale
- [x] Multi-workspace switcher (recent workspaces list)
- [x] Workspace-specific settings profiles
- [x] Open recent workspace on startup (optional)
- [x] Performance pass for very large vaults (incremental indexing / memoized selectors)
- [x] Virtualized sidebar tree for large note collections

## P5: Developer quality / maintainability
- [ ] Test setup (Vitest + React Testing Library)
- [ ] Core store tests (notesStore actions, scheduling logic, backlinks/tags parsing)
- [ ] Tauri integration smoke tests for file operations
- [ ] Incremental TypeScript migration (stores + utils first)
- [ ] Lint/format consistency and CI pipeline

## Bugs and UX Polish (Keep Updated)
- [x] External file drop feedback for workspace root/folders
- [x] Internal drag/drop edge cases (nested drops, root-drop precision, insertion-marker polish)
- [x] Long file names truncation + tooltip coverage in core note tree/views
- [x] Long file names tooltip consistency audit across secondary UI
- [x] Special character / unicode filename edge cases on rename/move
- [x] Theme switch flicker/performance polish
- [x] Accessibility basics: focus visibility in tree/navigation and key ARIA labels
- [x] Modal focus trap + dialog semantics for core modals
- [ ] Broader screen reader audit across settings/sidebar/editor flows
- [x] Reduce noisy success toasts for frequent file watcher sync events (optional throttle)

## Nice-to-Have / Future Exploration
- [ ] Replace remaining native `window.confirm` prompts with in-app dialogs for UX consistency
- [ ] Note version diff viewer
- [ ] Emacs keybindings mode
- [ ] Workspace statistics dashboard (local only)
- [ ] Encryption for selected notes (careful design required)
- [ ] Plugin/extension API (after core app stabilizes)
- [ ] Optional cloud sync (only after conflict/history model is robust)

## Not Prioritized Right Now
- [ ] AI features (summaries, suggestions)

Reason:
- The product still has higher-value local-first reliability and workflow improvements to finish first.

## Notes for Future TODO Updates
- When adding a feature here, include one line on user value and one line on dependencies.
- Keep shipped features in the audit section and avoid turning this file into a changelog.
- If a feature is partially implemented, split it into shipped vs missing sub-items.
