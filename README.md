<p align="center">
  <img src="src-tauri/icons/128x128.png" width="96" height="96" alt="Marky app icon" />
</p>

<h1 align="center">Marky</h1>

<p align="center">
  Offline-first Markdown notes with local folders, wiki links, graph navigation, and a polished desktop editor.
</p>

<p align="center">
  <a href="https://github.com/amiralibg/marky/releases/latest"><strong>Download the latest release</strong></a>
</p>

Marky is an offline-first Markdown notes app built with Tauri, React, and Rust.
It is designed for local folder-based note-taking with wiki links, graph navigation, a modern editor, and strong customization.

## Download

Download the latest desktop build from the [Marky releases page](https://github.com/amiralibg/marky/releases/latest). Installers are attached to each GitHub release after the app is built.

Current first-version target: `0.0.1`.

## Highlights

- Local-first workspace (notes are normal files in your folder)
- CodeMirror 6 editor with split/preview modes
- Wiki links (`[[Note]]`) with backlink tracking
- Interactive graph view for note connections
- Global fuzzy search across note titles and content
- Command palette for quick actions and note switching
- Templates and scheduled note creation (daily/weekly/monthly)
- Markdown extensions: Mermaid, KaTeX math, footnotes, code highlighting
- Themes, accent colors, customizable keyboard shortcuts, Vim mode
- Workspace ZIP backup export
- File watcher sync for external changes (other editors, git pulls, etc.)

## Features

### Notes and workspace

- Open a local folder as your workspace
- Nested folders and notes tree
- Multi-tab editing
- Create, rename, move, and delete notes/folders
- Drag-and-drop reorganization
- Recent notes and pinned notes
- Undo last delete

### Editor and preview

- CodeMirror 6 markdown editor
- Editor-only / split / preview-only layouts
- Unsaved changes indicator + manual save shortcut
- In-editor search and replace
- Wiki-link autocomplete and broken-link note creation flow
- Table of contents panel for headings
- Focus mode (distraction-free writing)
- Automatic BiDi/RTL rendering for mixed-language notes

### Discovery and navigation

- Global search modal (Fuse.js fuzzy search)
- Command palette (`Cmd/Ctrl+K`)
- Backlinks panel with context previews
- Interactive graph modal (force-directed)
- Sidebar search, sorting, and tag filtering

### Templates, scheduling, export

- Built-in templates and custom templates
- Scheduled note generation (daily/weekly/monthly)
- Scheduled notes management UI in Settings
- Export note as Markdown or HTML
- Print-friendly HTML export for PDF workflow
- Copy rendered HTML to clipboard
- Export workspace backup as ZIP (with metadata/settings)

## Tech Stack

- Frontend: React 18 + Vite
- Desktop runtime: Tauri 2 (Rust backend)
- State: Zustand
- Editor: CodeMirror 6 (+ Vim mode via `@replit/codemirror-vim`)
- Markdown rendering: `marked` + extensions
- Search: Fuse.js
- Diagrams: Mermaid
- Math: KaTeX
- Archive export: JSZip

## Getting Started

### Prerequisites

- Node.js (latest LTS recommended)
- Rust toolchain ([rustup](https://rustup.rs/))
- `pnpm`

### Install

```bash
pnpm install
```

### Run (desktop app)

```bash
pnpm tauri:dev
```

### Run frontend only (optional)

```bash
pnpm dev
```

## Build

Build a production desktop app:

```bash
pnpm tauri:build
```

Typical outputs are generated under `src-tauri/target/release/bundle/` (platform-specific subfolders such as `dmg`, `msi`, `deb`, etc.).

Common release artifacts:

- macOS: `src-tauri/target/release/bundle/dmg/*.dmg`
- Windows: `src-tauri/target/release/bundle/msi/*.msi`
- Linux: `src-tauri/target/release/bundle/deb/*.deb` and/or `src-tauri/target/release/bundle/appimage/*.AppImage`

## Release

Before publishing a release, make sure the app version is the same in:

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

The release workflow builds macOS, Windows, and Linux installers automatically and uploads them to a GitHub Release.

### Automatic release from a tag

Use this when the code is ready and committed:

```bash
git status
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
git commit -m "chore: release v0.0.2"
git tag v0.0.2
git push origin main --tags
```

When the `v0.0.2` tag is pushed, `.github/workflows/release.yml` runs on GitHub Actions and creates the GitHub Release for that tag.

### Automatic release from the GitHub UI

Use this if you want to release the current commit without creating a local tag:

1. Open the repository on GitHub.
2. Go to **Actions** -> **Release** -> **Run workflow**.
3. Enter a tag such as `v0.0.2`.
4. Choose whether it is a prerelease.
5. Run the workflow.

The workflow uses `GITHUB_TOKEN`, so no custom token is required for normal GitHub Releases.

### Local build only

Use this only when you want to test installers locally:

```bash
pnpm install
pnpm tauri:build
```

## Keyboard Shortcuts (defaults)

- `Cmd/Ctrl+K`: Command palette
- `Cmd/Ctrl+Shift+F`: Search all notes
- `Cmd/Ctrl+N`: New note
- `Cmd/Ctrl+Shift+N`: New folder
- `Cmd/Ctrl+S`: Save note
- `Cmd/Ctrl+B`: Toggle sidebar
- `Cmd/Ctrl+W`: Close tab
- `Cmd/Ctrl+1/2/3`: Editor / Split / Preview views

Shortcuts are customizable in Settings.

## Project Structure

- `/src` - React UI, stores, editor, components
- `/src-tauri` - Rust/Tauri backend and desktop config

## Roadmap

See `/Users/amiralibg/Programming/Git/marky/TODO.md` for the current audit-based roadmap and prioritized next work.

## License

MIT. See `/Users/amiralibg/Programming/Git/marky/LICENSE`.
