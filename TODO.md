# Marky TODO (Audit-Based Roadmap)

Last reviewed: 2026-05-11
This file is a forward-looking roadmap based on the current codebase state (not a historical changelog).
It separates already-shipped features from the next recommended work.
Latest validation: `pnpm lint` and `pnpm build` pass. Build warning: main app bundle is large and should be split.

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

## P0: Trust, polish, and accessibility (highest impact)

- [x] Note history snapshots and restore UI
- [x] Backup restore (import workspace ZIP back into a folder)
- [x] Crash-safe recovery for unsaved edits (draft/session recovery)
- [x] Conflict handling for external file changes while note has unsaved edits
- [x] Clearer file-operation error messages (permissions, missing files, name conflicts)
- [ ] Replace remaining native `window.confirm` prompts with shared in-app `ConfirmDialog`
  - Value: keeps destructive flows consistent, styled, keyboard-accessible, and less jarring.
  - Depends on: wiring existing `ConfirmDialog` into Settings backup restore, Tag Manager, Template Modal, and Scheduled Notes Manager.
- [ ] Add note history diff viewer before restore
  - Value: users can understand exactly what changed before replacing current content.
  - Depends on: existing note history snapshots and a lightweight text/markdown diff implementation.
- [ ] Improve conflict recovery with side-by-side compare
  - Value: external-edit conflicts become safer than a binary "load disk" / "overwrite disk" choice.
  - Depends on: existing conflict banner and note snapshot/draft data.
- [ ] Complete broader screen reader audit across settings/sidebar/editor flows
  - Value: makes the app usable with assistive tech beyond modal focus traps.
  - Depends on: auditing ARIA labels, tree semantics, dialog labels, command/search result announcements, and editor focus behavior.
- [ ] Fix toolbar formatting shortcuts with CodeMirror focus
  - Value: formatting commands work reliably while typing in the editor.
  - Depends on: moving shortcut handling into CodeMirror keymaps or checking the focused CodeMirror content DOM instead of the wrapper.

Why first:

- These improve trust, consistency, and accessibility, which matter more than adding broad new product areas.

## P1: Workspace intelligence and organization upgrades

- [x] Search filters (title/content/tags/path)
- [x] Case-sensitive and exact-match toggles in search
- [x] Regex search option (advanced mode)
- [x] Search result grouping by note/path
- [x] Saved searches / recent searches
- [x] Tag manager UI (rename/merge/delete tags across notes)
- [x] Tag autocomplete while typing `#tags`
- [x] Tag panel counts
- [x] Tag panel sort modes (A-Z / frequency / recent)
- [ ] Workspace dashboard / start page
  - Value: gives users a useful home when no note is selected.
  - Depends on: existing recent notes, pinned notes, tags, graph/backlink data, templates, and scheduled notes.
- [ ] Workspace statistics dashboard
  - Value: helps users understand vault growth, top tags, broken links, orphan notes, word count, and activity.
  - Depends on: existing item metadata, tag extraction, wiki-link extraction, and backlinks computation.
- [ ] Broken-link inbox for unresolved `[[wiki links]]`
  - Value: turns missing links into an actionable organization queue.
  - Depends on: existing wiki-link parsing and create-from-broken-link flow.
- [ ] Saved workspace views
  - Value: lets users quickly reopen filtered contexts like "Writing", "Projects", "Todos", "Untagged", or "Recently edited".
  - Depends on: existing search filters, tag filters, and sidebar sorting.
- [ ] Favorite folders and richer sidebar organization
  - Value: improves navigation in large workspaces without changing the local-first file model.
  - Depends on: workspace-specific settings profiles and sidebar tree metadata.

Why next:

- Search, tags, backlinks, recent notes, and graph data already exist, so these are high leverage improvements.

## P2: Editing workflow polish

- [x] True autosave setting (configurable debounce) with visible status
- [x] Double-click to rename note/folder in sidebar
- [x] Better drag-and-drop feedback (drop targets, insertion markers)
- [x] Sidebar keyboard navigation (arrows)
- [x] Sidebar keyboard actions (rename, delete, move)
- [x] Preview scroll sync with editor (basic line/heading sync)
- [x] Typewriter mode in Focus Mode
- [x] Better empty states (no notes, no results, no tags)
- [ ] Daily notes / calendar workflow
  - Value: gives scheduled notes and templates a familiar note-taking entry point.
  - Depends on: template creation, scheduled note infrastructure, and date-based naming helpers.
- [ ] Note properties / frontmatter panel
  - Value: makes YAML metadata, aliases, status, type, and tags editable without raw syntax.
  - Depends on: frontmatter parsing/writing and metadata refresh after edits.
- [ ] Attachment manager for dropped files/images
  - Value: helps users insert, find, and clean up local attachments.
  - Depends on: existing external file drop/copy behavior and workspace scan data.
- [x] Sidebar density controls (compact/comfortable/spacious) and optional metadata display
  - Value: improves comfort on small screens and large vaults.
  - Depends on: sidebar settings persistence and tree row rendering cleanup.
- [x] Command palette context actions
  - Value: makes common tasks faster from keyboard, e.g. rename current note, copy path, copy wiki link, pin note, and open templates in the current folder.
  - Depends on: current command palette plus current-note/sidebar selection state.

## P3: Export and portability

- [x] Native PDF export (real PDF generation, not print-HTML workaround)
- [x] Batch export (selected notes / whole folder)
- [x] Restore/export settings-only JSON
- [x] Graph export as PNG/SVG — _doable without new packages via Canvas/SVG DOM serialisation; a library like `html-to-image` would make it significantly cleaner_
- [x] Import/export custom templates collection
- [ ] Auto-update via Tauri updater and GitHub Releases
  - Value: users can install app updates in-place instead of downloading every release manually.
  - Depends on: updater signing key, GitHub release/update JSON hosting, release workflow, and production code-signing decisions.
  - UX: show update availability outside Settings with a persistent toast/sidebar prompt, then show download/install progress in the same surface.

## P4: Workspace and scale

- [x] Multi-workspace switcher (recent workspaces list)
- [x] Workspace-specific settings profiles
- [x] Open recent workspace on startup (optional)
- [x] Performance pass for very large vaults (incremental indexing / memoized selectors)
- [x] Virtualized sidebar tree for large note collections
- [ ] Add Vite/Rollup manual chunks for large dependencies and routes
  - Value: reduces startup payload and improves perceived load time.
  - Depends on: splitting CodeMirror, settings, graph, export/PDF, mermaid, and markdown tooling into separate chunks where practical.
- [ ] Lazy-load heavy modals and feature panels
  - Value: keeps the editor-focused startup path lighter.
  - Depends on: React lazy/Suspense boundaries for graph, search, settings subpanels, export, history, and batch export.
- [ ] Consolidate file watcher logic into one hook
  - Value: reduces duplicate sync logic and makes watcher behavior easier to test.
  - Depends on: moving active Sidebar watcher behavior into `useFileWatcher` or removing unused watcher code.
- [ ] Remove production console noise from file watcher events
  - Value: keeps release logs clean while preserving debug visibility in development.
  - Depends on: wrapping watcher logs in a dev/debug guard.

## P5: Developer quality / maintainability

- [ ] Test setup (Vitest + React Testing Library)
- [ ] Core store tests (notesStore actions, scheduling logic, backlinks/tags parsing)
- [ ] Tauri integration smoke tests for file operations
- [ ] Incremental TypeScript migration (stores + utils first)
- [ ] Lint/format consistency and CI pipeline
- [ ] Split oversized components/stores into focused modules
  - Value: improves reviewability and lowers risk when changing core app flows.
  - Depends on: extracting Sidebar drag/drop/search/tree sections, MarkdownEditor preview/autosave/history logic, and notesStore helper domains.
- [ ] Add first CI workflow for lint, build, and tests
  - Value: prevents regressions before release packaging.
  - Depends on: test setup and stable package-manager cache configuration.

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
- [ ] Toolbar formatting shortcuts do not rely on textarea focus assumptions
- [ ] Shared confirm dialogs replace all remaining native browser prompts
- [ ] Conflict banner offers compare/diff before resolving
- [ ] Dev-only watcher logs do not appear in production builds

## Nice-to-Have / Future Exploration

- [ ] Emacs keybindings mode
- [ ] Encryption for selected notes (careful design required)
- [ ] Plugin/extension API (after core app stabilizes)
- [ ] Optional cloud sync (only after conflict/history model is robust)
- [ ] AI features (summaries, suggestions), only after core local-first workflows feel complete

## Not Prioritized Right Now

- [ ] Cloud sync
- [ ] Plugin marketplace
- [ ] Broad AI assistant features

Reason:

- The product still has higher-value local-first reliability, accessibility, performance, and workflow improvements to finish first.

## Notes for Future TODO Updates

- When adding a feature here, include one line on user value and one line on dependencies.
- Keep shipped features in the audit section and avoid turning this file into a changelog.
- If a feature is partially implemented, split it into shipped vs missing sub-items.
